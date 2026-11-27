/** Local desktop editor. Never bind a non-loopback interface or upload off-device. */
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,unlink,stat,open,realpath,statfs} from 'node:fs/promises';
import {resolve,join,dirname,extname,sep,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {createProject,EditSession,buildRenderPlan} from '../../packages/project/project.mjs';
import {firstCutModes} from '../../packages/project/first-cut.mjs';
import {hashFile,saveSession,loadSession,verifyBindings,readLocalJson} from '../../packages/project/local-store.mjs';
import {createSyncManager} from './sync-job.mjs';
import {createFirstCutManager} from './first-cut-job.mjs';
import {createOutputHistory,captureOutputReceipt,readLastOutputJob} from './output-history.mjs';
import {createSourceRelinkManager} from './source-relink.mjs';
import {createPreviewManager} from './preview-job.mjs';
import {createPendingImports} from './pending-imports.mjs';
import {createResumableImport} from './resumable-import.mjs';
import {createGooglePhotosImport} from './google-photos.mjs';
import {createSystemBrowserOpener} from './system-browser.mjs';
const exec=promisify(execFile),HERE=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(HERE,'../..');
const openSystemBrowser=createSystemBrowserOpener();
const mediaExtensions=new Set(['.mp4','.mov','.mkv','.webm','.wav','.mp3','.m4a','.aac','.flac','.ogg']);
const maxImportBytes=16*1024**3, importDiskReserve=600*1024**2;
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
const exists=async file=>{try{await stat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
async function atomicJson(file,object){
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{const handle=await open(tmp,'wx',0o600);try{await handle.writeFile(JSON.stringify(object));await handle.sync();}finally{await handle.close();}await rename(tmp,file);}
  finally{await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function jsonBody(req){let bytes=0,parts=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024**2)fail('編集データが大きすぎます',413);parts.push(chunk);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{fail('編集データを読み込めません');}}
async function probe(file){
  const python=process.env.AIVS_PYTHON||(process.platform==='win32'?'python':'python3');
  let tools;
  try{tools=JSON.parse((await exec(python,['-m','engine.media_tools','--resolve'],{cwd:ROOT,timeout:15000,maxBuffer:64*1024})).stdout);}
  catch(error){let detail;try{detail=JSON.parse(error.stderr).error;}catch{}
    fail(typeof detail==='string'&&detail.startsWith('FFMPEG_TOOLCHAIN_')?detail:'MEDIA_TOOL_RESOLVE_FAILED: Python の起動設定を確認してください');}
  if(!tools||typeof tools.ffprobe!=='string')fail('MEDIA_TOOL_RESOLVE_FAILED');
  let stdout;
  try{({stdout}=await exec(tools.ffprobe,['-v','error','-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm,wav,mp3,aac,flac,ogg','-show_format','-show_streams','-of','json',file],{timeout:120000,maxBuffer:1024**2}));}
  catch(error){fail(error.code==='ENOENT'?'FFPROBE_START_FAILED: 検出した実行ファイルを起動できません。起動設定を確認してください':'FFPROBE_PROCESS_FAILED: 動画検査に失敗しました。素材と実行環境を確認してください');}
  if(typeof stdout!=='string'||!stdout.trim())fail('FFPROBE_JSON_EMPTY: 動画検査の応答が空です');
  let m;try{m=JSON.parse(stdout);}catch{fail('FFPROBE_JSON_INVALID: 動画検査の応答を読み取れません');}
  if(!m||typeof m!=='object'||Array.isArray(m)||!m.format||typeof m.format!=='object'||!Array.isArray(m.streams)||m.streams.some(s=>!s||typeof s!=='object'||Array.isArray(s)))fail('FFPROBE_JSON_SCHEMA: 動画検査の応答形式が不正です');
  const duration=Number(m.format.duration);
  if(!Number.isFinite(duration)||duration<=0||duration>14400)fail('この素材の長さには対応していません');
  return {durationSec:duration,hasAudio:m.streams.some(s=>s.codec_type==='audio'),hasVideo:m.streams.some(s=>s.codec_type==='video')};
}

export async function startServer({workspace,port=8765,previewOptions={},googlePhotosOptions={}}={}){
  if(!workspace)fail('保存フォルダを --workspace で指定してください');
  const requested=resolve(workspace);
  let ancestor=requested;while(!await exists(ancestor))ancestor=dirname(ancestor);
  const canonical=resolve(await realpath(ancestor),relative(ancestor,requested)),sourceRoot=await realpath(ROOT);
  const rel=relative(sourceRoot,canonical);
  if(rel===''||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)))fail('WORKSPACE_MUST_BE_OUTSIDE_SOURCE: 素材と編集データはリポジトリ外の専用フォルダへ保存してください');
  const marker=join(canonical,'.aivs-local-editor');
  if(await exists(canonical)){if(!await exists(marker))fail('専用の新しい保存フォルダを指定してください');}
  else{await mkdir(canonical,{recursive:true});await writeFile(marker,'AI VIDEO STUDIO local workspace v1\n',{flag:'wx',mode:0o600});}
  // Output checks require a canonical root, including on macOS where /var is an alias.
  const folder=await realpath(canonical);
  const lockFile=join(folder,'.editor.lock'),lockToken=randomUUID();
  try{await writeFile(lockFile,lockToken,{flag:'wx',mode:0o600});}
  catch(e){if(e.code==='EEXIST')fail('WORKSPACE_IN_USE: この保存先は使用中です。異常終了後はアプリ終了を確認して .editor.lock を削除してください');throw e;}
  try{
  const assets=join(folder,'assets');await mkdir(assets,{recursive:true});
  const pendingImports=await createPendingImports({folder,assets,atomicJson});
  const googlePhotos=await createGooglePhotosImport({clientFile:process.env.AIVS_GOOGLE_PHOTOS_CLIENT_FILE,
    openExternal:openSystemBrowser,
    ...googlePhotosOptions});
  const projectFile=join(folder,'project.aivs.json'),registryFile=join(folder,'media.json'),bindingFile=join(folder,'bindings.json');
  let registry=new Map();
  if(await exists(registryFile)){
    const entries=JSON.parse(await readLocalJson(registryFile));if(!Array.isArray(entries)||entries.length>100)fail('素材一覧が不正です');
    for(const entry of entries){
      if(!/^asset_[a-f0-9]{32}$/.test(entry.assetId)||typeof entry.file!=='string'||
        !/^asset_[a-f0-9]{32}\.[a-z0-9]+$/.test(entry.file)||!mediaExtensions.has(extname(entry.file)))fail('素材参照が不正です');
      const local=await realpath(join(assets,entry.file));if(!local.startsWith(await realpath(assets)+sep))fail('保存範囲外の素材です');
      if(registry.has(entry.assetId))fail('素材IDが重複しています');registry.set(entry.assetId,{...entry,path:local});
    }
  }
  let session=await exists(projectFile)?await loadSession(projectFile):new EditSession(createProject({projectId:'project_'+randomUUID().replaceAll('-','')}));
  let projectOpenCount=0;
  const photosProjectKey=()=>`${projectOpenCount}:${session.current.projectId}`;
  const bindings=()=>session.current.sourceRefs.map(s=>({assetId:s.assetId,path:registry.get(s.assetId)?.path}));
  const checkIdentity=p=>{for(const s of p.sourceRefs){const known=registry.get(s.assetId)?.source;
    if(!known||['assetId','sha256','mediaKind','durationSec','hasAudio'].some(k=>s[k]!==known[k]))fail('素材情報の変更はできません。素材を再リンクしてください');}};
  checkIdentity(session.current);if(session.current.sourceRefs.length)await verifyBindings(session.current,bindings());
  async function persist(){
    checkIdentity(session.current);
    await atomicJson(registryFile,[...registry.values()].map(({path,...rest})=>rest));
    await atomicJson(bindingFile,bindings());
    await saveSession(projectFile,session,{protectedPaths:[...registry.values()].map(s=>s.path)});
  }
  await persist();
  async function availableImportBytes(){
    const disk=await statfs(folder);
    return Number(disk.bavail)*Number(disk.bsize)-importDiskReserve;
  }
  const resumableImport=await createResumableImport({folder,assets,atomicJson,maxImportBytes,
    getProjectId:()=>session.current.projectId, handedOff:id=>Boolean(pendingImports.get(id)||registry.has(id)),
    requireImportSpace,availableImportBytes});
  const remainingImports=()=>100-registry.size-pendingImports.size()-Number(resumableImport.active());
  function requireImportSpace(){
    if(remainingImports()<=0)fail('素材数の上限は100本です（検査待ちを含む）');
  }
  async function recordImport({kind,label,extension,body,length}){
    requireImportSpace();
    if(!mediaExtensions.has(extension))fail('MP4/MOVなどへ変換した素材を選んでください');
    const declared=length===null?null:Number(length);
    if(declared!==null&&(!Number.isSafeInteger(declared)||declared<=0||declared>maxImportBytes)){
      fail('素材のサイズに対応していません',413);
    }
    const available=await availableImportBytes();
    if(available<=0||(declared!==null&&declared>available))fail('保存先の空き容量が不足しています');
    const uploadId='asset_'+randomUUID().replaceAll('-',''),file=uploadId+extension,staged=join(assets,file)+'.tmp';
    let received=0,created=false,recorded=false;
    try{
      const handle=await open(staged,'wx',0o600);created=true;
      try{
        for await(const chunk of body){
          received+=chunk.byteLength;
          if(declared!==null&&received>declared)fail('素材サイズが一致しません');
          if(received>maxImportBytes)fail('素材のサイズに対応していません',413);
          if(received>available)fail('保存先の空き容量が不足しています');
          let offset=0;
          while(offset<chunk.byteLength){
            const {bytesWritten}=await handle.write(chunk,offset,chunk.byteLength-offset,null);
            if(bytesWritten===0)fail('素材の一部を保存できませんでした');
            offset+=bytesWritten;
          }
        }
        await handle.sync();
      }finally{await handle.close();}
      if(!received||(declared!==null&&received!==declared))fail('素材の読み込みが中断されました');
      await pendingImports.record({uploadId,kind,label:label.slice(0,160),file,bytes:received,sha256:await hashFile(staged)});
      recorded=true;
      return uploadId;
    }finally{
      if(created&&!recorded)await unlink(staged).catch(e=>{if(e.code!=='ENOENT')throw e;});
    }
  }
  async function finishImport(uploadId){
    const verified=await pendingImports.checked(uploadId),{record}=verified,{kind}=record;
    if(kind!=='video'&&!session.current.timeline.length)fail('先に動画を追加してください');
    const info=await probe(verified.file);
    if(kind==='video'&&!info.hasVideo)fail('映像のある素材を選んでください');
    if(kind!=='video'&&!info.hasAudio)fail('音声のある素材を選んでください');
    const local=await pendingImports.materialize(verified),known=registry.get(uploadId);
    if(known&&known.source.sha256!==record.sha256)fail('IMPORT_SOURCE_CONFLICT');
    if(session.current.sourceRefs.some(source=>source.assetId===uploadId)){
      if(!known)fail('IMPORT_SOURCE_CONFLICT');await pendingImports.forget(uploadId);return;
    }
    const p=session.current,source={assetId:uploadId,sha256:record.sha256,mediaKind:kind==='video'?'video':'audio',
      durationSec:info.durationSec,hasAudio:info.hasAudio,offsetSec:0,driftPpm:0,syncStatus:p.sourceRefs.length===0?'master':'unverified'};
    registry.set(uploadId,{assetId:uploadId,file:record.file,path:local,label:record.label,source});
    try{await transaction(()=>{
      p.sourceRefs.push(source);
      if(kind==='video'&&!p.timeline.length){const clipId='clip_'+randomUUID().replaceAll('-','');p.timeline.push({clipId,sourceId:uploadId,sourceInSec:0,durationSec:info.durationSec,startSec:0,speed:1,layout:'single',effects:[]});
        if(info.hasAudio)p.audioClips.push({id:'audio_'+clipId,assetId:uploadId,bus:'source',startSec:0,endSec:info.durationSec,trimInSec:0,speed:1,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0});
      }else if(kind!=='video'){
        const end=buildRenderPlan(p).durationSec;
        p.audioClips.push({id:'audio_'+kind+'_'+randomUUID().replaceAll('-',''),assetId:uploadId,bus:kind,startSec:0,endSec:kind==='bgm'?end:Math.min(end,info.durationSec),trimInSec:0,speed:1,gainDb:kind==='bgm'?-19:0,loop:kind==='bgm',fadeInSec:0,fadeOutSec:0});
      }
      session.apply(p);
    });}catch(error){if(known)registry.set(uploadId,known);else registry.delete(uploadId);throw error;}
    await pendingImports.forget(uploadId);
  }
  const token=randomBytes(32).toString('hex'),nonce=randomBytes(24).toString('hex');
  let mutation=false,closing=false,mutationDone=Promise.resolve(),closePromise,job={status:'NOT_RUN'},jobPromise=Promise.resolve();
  const jobFile=join(folder,'last-job.json'),history=await createOutputHistory({folder,atomicJson});let latestReceipt;
  async function rememberOutput(receipt){try{await history.record(receipt);return undefined;}catch{return '完成動画の履歴を保存できませんでした。最新の出力記録は保持しています。';}}
  async function checkedOutput(id){
    try{return await history.open(id,{fallbackReceipt:latestReceipt});}
    catch(error){fail('完成動画と検査記録を確認できません: '+error.message,error.message==='OUTPUT_NOT_FOUND'?404:error.message==='INVALID_OUTPUT_ID'?400:409);}
  }
  if(await exists(jobFile)){try{
    const previous=await readLastOutputJob(folder);
    if(previous.status==='PASS'&&/^[a-f0-9]{32}$/.test(previous.id)){
      const receipt=previous.outputReceipt??history.receipt(previous.id)??await captureOutputReceipt({folder,id:previous.id,outputSha256:previous.sha256,createdAt:null,origin:'LEGACY_LATEST'});
      if(receipt.id!==previous.id||receipt.outputSha256!==previous.sha256)throw new Error('OUTPUT_RECEIPT_MISMATCH');
      const checked=await history.open(previous.id,{fallbackReceipt:receipt});await checked.handle.close();latestReceipt=receipt;
      const historyWarning=await rememberOutput(receipt);
      job={id:previous.id,status:'PASS',download:'/exports/'+previous.id,qualityStatus:checked.qualityStatus,...(historyWarning?{historyWarning}:{})};
    }else if(previous.status==='RUNNING')job={status:'INTERRUPTED',error:'前の書き出しは中断されました。もう一度作成してください'};
    else if(previous.status==='FAIL')job={status:'FAIL',error:'前の書き出しは失敗しました。編集内容から再作成できます'};
  }catch{job={status:'FAIL',error:'前の出力を確認できません。編集内容から再作成できます'};}}
  const syncManager=await createSyncManager({folder,root:ROOT,getSession:()=>session,getBindings:bindings,atomicJson});
  const firstCutManager=await createFirstCutManager({folder,root:ROOT,getSession:()=>session,getBindings:bindings,atomicJson});
  const previewManager=await createPreviewManager({...previewOptions,folder,root:ROOT,getSession:()=>session,getBindings:bindings});
  let photosAutomation;
  function beginMutation(){
    if(closing||mutation||job.status==='RUNNING'||syncManager.busy()||firstCutManager.busy()||previewManager.busy())return;
    mutation=true;
    let release;
    mutationDone=new Promise(done=>{release=done;});
    return ()=>{mutation=false;release();};
  }
  async function receiveGoogleVideo(input){
    const uploadId=await recordImport({kind:'video',...input});
    try{await finishImport(uploadId);return 'imported';}catch{return 'pending';}
  }
  function startGoogleAutomation(projectKey,mode){
    const run={projectKey,status:'WAITING'};
    const isCurrent=()=>!closing&&photosProjectKey()===projectKey;
    photosAutomation=run;
    run.done=(async()=>{
      try{
        await googlePhotos.importWhenSelected(projectKey,isCurrent,async(importPicked,signal,expiresAt)=>{
          run.status='WAITING_FOR_EDITOR';
          let finish;
          while(!finish){
            if(signal.aborted||closing)return;
            if(!isCurrent())fail('編集中のプロジェクトが変わりました。Google フォトから選び直してください。');
            if(Date.now()>=expiresAt)fail('Google フォトの選択時間が過ぎました。動画を選び直してください。');
            finish=beginMutation();
            if(!finish)await delay(500,undefined,{signal});
          }
          try{
            run.status='IMPORTING';
            requireImportSpace();
            const before=new Set(session.current.sourceRefs.map(source=>source.assetId));
            run.report=await importPicked(receiveGoogleVideo);
            if(!run.report.imported||signal.aborted||closing)return;
            const hasNewEligibleVideo=session.current.sourceRefs.some(source=>source.mediaKind==='video'
              && !before.has(source.assetId)&&['master','verified'].includes(source.syncStatus));
            if(!hasNewEligibleVideo){run.report.draft='SYNC_REQUIRED';return;}
            run.status='STARTING_DRAFT';
            try{await firstCutManager.start({mode});run.report.draft='STARTED';}
            catch{run.report.draft='UNAVAILABLE';}
          }finally{finish();}
        });
        run.status='DONE';
      }catch(error){
        run.status='FAIL';
        run.error=error.status?error.message:'Google フォトから自動で取り込めませんでした。';
      }
    })();
  }
  const html=(await readFile(join(HERE,'index.html'),'utf8')).replaceAll('__TOKEN__',token).replaceAll('__NONCE__',nonce);
  function state(){
    const run=photosAutomation?.projectKey===photosProjectKey()?photosAutomation:undefined;
    const googleState={...googlePhotos.state(photosProjectKey()),...(run?{status:run.status,error:run.error}:{})};
    return {session:JSON.parse(session.serialize()),sources:session.current.sourceRefs.map(s=>({assetId:s.assetId,label:registry.get(s.assetId).label,mediaKind:s.mediaKind})),pendingImports:pendingImports.views(),resumableImport:resumableImport.view(),googlePhotos:googleState,
      ...(run?.report?{googleImport:run.report}:{}),job,sync:syncManager.state(),firstCut:firstCutManager.state(),preview:previewManager.state()};
  }
  async function transaction(change){const previous=session.serialize();try{await change();await persist();}catch(e){session=EditSession.open(previous);throw e;}}
  const relink=await createSourceRelinkManager({folder,getSession:()=>session,getRegistry:()=>registry,probe,
    commitRegistry:async next=>{await atomicJson(registryFile,[...next.values()].map(({path,...rest})=>rest));registry=next;},
    commitSession:async candidate=>{
      const document=JSON.parse(candidate.serialize());document.project.revision=session.current.revision+1;
      const opened=EditSession.open(JSON.stringify(document));await transaction(()=>{session=opened;});projectOpenCount++;return state();
    }});
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const authorized=value=>{if(typeof value!=='string'||value.length!==token.length)return false;return timingSafeEqual(Buffer.from(value),Buffer.from(token));};
  async function stream(res,req,path,type,checked){
    const size=checked?.size??(await stat(path)).size;let start=0,end=size-1,status=200,input;
    try{
    if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if(!match||Number(match[1])>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
      start=Number(match[1]);end=match[2]?Math.min(size-1,Number(match[2])):size-1;
      if(end<start){res.writeHead(416);res.end();return;}status=206;
    }
    res.writeHead(status,{'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store',...(status===206?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
    input=checked?checked.handle.createReadStream({start,end,autoClose:true}):createReadStream(path,{start,end});input.on('error',()=>res.destroy());res.on('close',()=>input.destroy());input.pipe(res);
    }finally{if(checked&&!input)await checked.handle.close();}
  }
  const server=http.createServer(async(req,res)=>{
    let canReadState=false;
    try{
      if(closing)fail('EDITOR_CLOSING: 終了処理中です',503);
      const address=server.address(),host=`127.0.0.1:${address.port}`,origin=`http://${host}`;
      if(req.headers.host!==host||(req.headers.origin&&req.headers.origin!==origin))fail('外部ページからのアクセスは許可されていません',403);
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`);
      const url=new URL(req.url,origin),path=url.pathname;
      if(req.method==='GET'&&path==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return;}
      if(req.method==='GET'&&path==='/google-photos/oauth'){
        try{
          const projectKey=photosProjectKey();
          const {pickerUrl,draftMode}=await googlePhotos.authorize(url.searchParams,projectKey);
          res.writeHead(303,{'Location':pickerUrl,'Cache-Control':'no-store'});res.end();
          if(draftMode&&!closing)startGoogleAutomation(projectKey,draftMode);
        }catch(error){
          res.writeHead(error.status??502,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
          res.end(error.status?error.message:'Google フォトに接続できませんでした。編集画面からやり直してください。');
        }
        return;
      }
      const modules={'/video-upload.mjs':join(HERE,'video-upload.mjs'),'/editor-edits.mjs':join(HERE,'edits.mjs'),'/editor-qa.mjs':join(HERE,'qa.mjs'),
        '/output-history-panel.mjs':join(HERE,'output-history-panel.mjs'),
        '/source-relink-panel.mjs':join(HERE,'source-relink-panel.mjs'),
        '/preview-panel.mjs':join(HERE,'preview-panel.mjs'),
        '/audio-panel.mjs':join(HERE,'audio-panel.mjs'),'/audio-edits.mjs':join(HERE,'audio-edits.mjs'),
        '/first-cut-panel.mjs':join(HERE,'first-cut-panel.mjs'),
        '/packages/project/first-cut.mjs':join(ROOT,'packages/project/first-cut.mjs'),
        '/sync-panel.mjs':join(HERE,'sync-panel.mjs'),'/sync-edits.mjs':join(HERE,'sync-edits.mjs'),
        '/packages/project/sync.mjs':join(ROOT,'packages/project/sync.mjs'),
        '/packages/project/project.mjs':join(ROOT,'packages/project/project.mjs')};
      if(req.method==='GET'&&Object.hasOwn(modules,path)){
        res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
        res.end(await readFile(modules[path]));return;
      }
      if(!authorized(req.headers['x-aivs-token'])&&!authorized(url.searchParams.get('token')))fail('画面を開き直してください',403);
      canReadState=true;
      if(req.method==='GET'&&path==='/api/state'){send(res,200,state());return;}
      if(req.method==='GET'&&path==='/api/job'){send(res,200,job);return;}
      if(req.method==='GET'&&path==='/api/preview'){send(res,200,previewManager.state());return;}
      if(req.method==='GET'&&path.startsWith('/api/preview/')){send(res,200,await previewManager.adopt(path.slice('/api/preview/'.length)));return;}
      if(req.method==='GET'&&path.startsWith('/previews/')){const checked=await previewManager.open(path.slice('/previews/'.length));await stream(res,req,null,'video/mp4',checked);return;}
      if(req.method==='GET'&&path==='/api/first-cut'){send(res,200,firstCutManager.state());return;}
      if(req.method==='GET'&&path==='/api/sync'){send(res,200,syncManager.state());return;}
      if(req.method==='GET'&&path==='/api/qa'){
        if(!latestReceipt||job.id!==latestReceipt.id)fail('検査記録がありません。動画を作成してください',404);
        const checked=await checkedOutput(job.id);try{send(res,200,checked.report);}finally{await checked.handle.close();}return;
      }
      if(req.method==='GET'&&path==='/api/outputs'){send(res,200,history.list());return;}
      if(req.method==='GET'&&path.startsWith('/api/outputs/')){
        const checked=await checkedOutput(path.slice('/api/outputs/'.length));
        try{const {handle,size,...view}=checked;send(res,200,view);}finally{await checked.handle.close();}return;
      }
      if(req.method==='GET'&&path.startsWith('/media/')){const source=registry.get(path.slice(7));if(!source)fail('素材がありません',404);await stream(res,req,source.path,source.source.mediaKind==='video'?'video/mp4':'audio/wav');return;}
      if(req.method==='GET'&&path.startsWith('/exports/')){const checked=await checkedOutput(path.slice(9));await stream(res,req,null,'video/mp4',checked);return;}
      if(req.method==='POST'&&path==='/api/google-photos/cancel'){
        // Only interrupt the selection; the active import still owns the workspace until it stops.
        const run=photosAutomation;
        if(run?.projectKey===photosProjectKey()&&(run.status==='STARTING_DRAFT'||(run.status==='DONE'&&run.report?.draft==='STARTED'))){
          fail('動画の取り込みは完了し、下書き作成を開始しています。',409);
        }
        const running=run?.done;
        const finishCancellation=googlePhotos.interrupt();
        await mutationDone;await finishCancellation();await running;send(res,200,state());return;
      }
      if(req.method!=='POST'||!['/api/import','/api/import/retry','/api/import/resume/start','/api/import/resume/chunk','/api/import/resume/finish','/api/import/resume/discard','/api/google-photos/start','/api/google-photos/import','/api/edit','/api/open','/api/undo','/api/redo','/api/render','/api/preview','/api/sync','/api/sync/apply','/api/first-cut','/api/first-cut/apply','/api/relink/prepare','/api/relink/media','/api/relink/open','/api/relink/cancel'].includes(path))fail('見つかりません',404);
      const finishMutation=beginMutation();
      if(!finishMutation)fail('処理が終わるまでお待ちください',409);
      try{
        if(req.headers['x-aivs-revision']!==String(session.current.revision))fail('REVISION_CONFLICT: 別の画面で更新されています',409);
        if(path==='/api/preview'){
          send(res,202,await previewManager.start(await jsonBody(req)));return;
        }else if(path==='/api/relink/prepare'){
          send(res,200,await relink.prepare(await jsonBody(req)));return;
        }else if(path==='/api/relink/media'){
          const label=decodeURIComponent(String(req.headers['x-file-name']??'')),length=Number(req.headers['content-length']);
          send(res,200,await relink.receive(url.searchParams.get('id'),req,{label,length}));return;
        }else if(path==='/api/relink/open'||path==='/api/relink/cancel'){
          const body=await jsonBody(req);
          if(!body||Array.isArray(body)||typeof body.planId!=='string'||Object.keys(body).some(k=>k!=='planId'))fail('再接続するプロジェクトの確認形式が不正です');
          send(res,200,await (path.endsWith('/open')?relink.open(body.planId):relink.cancel(body.planId)));return;
        }else if(path==='/api/import/resume/start'){
          send(res,200,await resumableImport.start(await jsonBody(req)));return;
        }else if(path==='/api/import/resume/chunk'){
          send(res,200,await resumableImport.chunk(req,req.headers));return;
        }else if(path==='/api/import/resume/finish'||path==='/api/import/resume/discard'){
          const body=await jsonBody(req);
          if(!body||Array.isArray(body)||typeof body.uploadId!=='string'||Object.keys(body).length!==1)fail('RESUMABLE_IMPORT_INVALID_ID');
          const {uploadId}=body;
          if(path.endsWith('/discard'))await resumableImport.discard(uploadId);
          else{
            const prepared=await resumableImport.prepareFinish(uploadId);
            if(prepared)await pendingImports.record(prepared);
            if(pendingImports.get(uploadId)){
              if(registry.has(uploadId)&&session.current.sourceRefs.some(source=>source.assetId===uploadId))await pendingImports.forget(uploadId);
              else await finishImport(uploadId);
            }
          }
        }else if(path==='/api/import/retry'){
          const body=await jsonBody(req);
          if(!body||Array.isArray(body)||typeof body.uploadId!=='string'||Object.keys(body).some(k=>k!=='uploadId')||!/^asset_[a-f0-9]{32}$/.test(body.uploadId))fail('IMPORT_ID_INVALID');
          if(!pendingImports.get(body.uploadId)){
            if(!registry.has(body.uploadId)||!session.current.sourceRefs.some(s=>s.assetId===body.uploadId))fail('IMPORT_NOT_PENDING');
          }else await finishImport(body.uploadId);
        }else if(path==='/api/import'){
          const kind=url.searchParams.get('kind');if(!['video','bgm','narration','sfx'].includes(kind))fail('素材の種類が不正です');
          if(kind!=='video'&&!session.current.timeline.length)fail('先に動画を追加してください');
          const label=decodeURIComponent(String(req.headers['x-file-name']??''));
          await finishImport(await recordImport({kind,label,extension:extname(label).toLowerCase(),body:req,length:req.headers['content-length']}));
        }else if(path==='/api/google-photos/start'){
          requireImportSpace();
          const draftMode=url.searchParams.get('draftMode');
          if(draftMode!==null&&!firstCutModes.includes(draftMode))fail('自動編集の傾向を選んでください');
          const previous=photosAutomation;
          await googlePhotos.start({origin,projectKey:photosProjectKey(),maxCount:remainingImports(),draftMode});
          if(photosAutomation===previous)photosAutomation=undefined;
        }else if(path==='/api/google-photos/import'){
          requireImportSpace();
          const googleImport=await googlePhotos.importSelection(photosProjectKey(),receiveGoogleVideo);
          send(res,200,{...state(),googleImport});return;
        }else if(path==='/api/first-cut'){
          const started=await firstCutManager.start(await jsonBody(req));send(res,202,started);return;
        }else if(path==='/api/first-cut/apply'){
          const body=await jsonBody(req);if(!body||Object.keys(body).some(k=>!['analysisId','confirmed'].includes(k)))fail('編集候補の確認形式が不正です');
          const p=await firstCutManager.apply(body.analysisId,body.confirmed);await transaction(()=>session.apply(p));
        }else if(path==='/api/sync'){
          const started=await syncManager.start(await jsonBody(req));send(res,202,started);return;
        }else if(path==='/api/sync/apply'){
          const body=await jsonBody(req);if(!body||Object.keys(body).some(k=>!['analysisId','confirmed'].includes(k)))fail('同期確認の形式が不正です');
          const p=await syncManager.apply(body.analysisId,body.confirmed);await transaction(()=>session.apply(p));
        }else if(path==='/api/edit'){
          const p=await jsonBody(req);if(p.revision!==session.current.revision)fail('REVISION_CONFLICT: 別の画面で更新されています',409);checkIdentity(p);await transaction(()=>session.apply(p));
        }else if(path==='/api/open'){
          let candidate=EditSession.open(JSON.stringify(await jsonBody(req)));checkIdentity(candidate.current);
          const document=JSON.parse(candidate.serialize());document.project.revision=session.current.revision+1;
          candidate=EditSession.open(JSON.stringify(document));
          await transaction(()=>{session=candidate;});
          projectOpenCount++;
        }else if(path==='/api/undo'||path==='/api/redo'){
          await transaction(()=>path.endsWith('undo')?session.undo():session.redo());
        }else if(path==='/api/render'){
          if(!session.current.timeline.length)fail('動画を追加してください');
          const id=randomUUID().replaceAll('-',''),jobDir=join(folder,'jobs',id),output=join(folder,'exports',id+'.mp4');
          await mkdir(jobDir,{recursive:true});await saveSession(join(jobDir,'project.json'),session,{protectedPaths:[...registry.values()].map(s=>s.path)});
          await atomicJson(join(jobDir,'bindings.json'),bindings());
          job={id,status:'RUNNING'};
          await atomicJson(jobFile,job);
          const python=process.env.AIVS_PYTHON||(process.platform==='win32'?'python':'python3');
          const child=spawn(python,['-m','engine.render_saved_project','--project',join(jobDir,'project.json'),'--bindings',join(jobDir,'bindings.json'),'--workspace',join(jobDir,'render'),'--output',output],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
          let error='';child.stdout.resume();child.stderr.on('data',chunk=>{error=(error+chunk).slice(-2000);});
          jobPromise=new Promise(resolveJob=>{let done=false;const finish=async code=>{if(done)return;done=true;try{
            if(code===0){
              const receipt=await captureOutputReceipt({folder,id}),completed={id,status:'PASS',download:'/exports/'+id,qualityStatus:receipt.qualityStatus};
              await atomicJson(jobFile,{...completed,sha256:receipt.outputSha256,outputReceipt:receipt});latestReceipt=receipt;
              const historyWarning=await rememberOutput(receipt);job={...completed,...(historyWarning?{historyWarning}:{})};}
            else{job={id,status:'FAIL',error:error||'書き出しに失敗しました。実行環境を確認してください'};await atomicJson(jobFile,job);}
          }catch(e){job={id,status:'FAIL',error:'出力記録を保存できません: '+e.message};}finally{resolveJob();}};
            child.once('error',e=>{error=e.message;finish(1);});child.once('close',finish);});
          send(res,202,job);return;
        }
        send(res,200,state());
      }finally{finishMutation();}
    }catch(error){if(!res.headersSent)send(res,error.status??(error.message==='RELINK_STALE'?409:400),{error:error.message,...(canReadState?{pendingImports:pendingImports.views()}:{})});else res.destroy();}
  });
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
  return {url:`http://127.0.0.1:${server.address().port}`,token,
    close:()=>{
      if(closePromise)return closePromise;closing=true;
      const finishPhotos=googlePhotos.interrupt();
      const stopped=new Promise((done,reject)=>server.close(error=>error?reject(error):done()));server.closeAllConnections();
      closePromise=(async()=>{
        // A completed probe/import may still persist after the HTTP socket closes.
        // Keep ownership until it finishes; incomplete request bodies are aborted.
        await mutationDone;await previewManager.close();await Promise.all([finishPhotos(),photosAutomation?.done,jobPromise,syncManager.wait(),firstCutManager.wait()]);await stopped;
        if(await readFile(lockFile,'utf8')===lockToken)await unlink(lockFile);
      })();return closePromise;
    }};
  }catch(error){if(await readFile(lockFile,'utf8').catch(()=>null)===lockToken)await unlink(lockFile);throw error;}
}

export function parseLocalEditorArgs(args,browserSupported=Boolean(openSystemBrowser)){
  const options={};
  let openBrowser=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--workspace')options.workspace=args[++i];
    else if(args[i]==='--port')options.port=Number(args[++i]);
    else if(args[i]==='--open-browser'&&browserSupported)openBrowser=true;
    else if(args[i]==='--no-open-browser')openBrowser=false;
    else throw new Error('Use --workspace <local folder> [--port 8765] [--open-browser (macOS or Windows) | --no-open-browser]');
  }
  return {options,openBrowser};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const {options,openBrowser}=parseLocalEditorArgs(process.argv.slice(2));
  const app=await startServer(options);console.log(app.url);
  let shuttingDown=false;
  const shutdown=()=>{
    if(shuttingDown)return;shuttingDown=true;
    app.close().then(()=>process.exit(0)).catch(()=>{
      // Keep the parent alive if owned-child cleanup could not be confirmed.
      // Repeated TERM/INT must not bypass the same fail-closed shutdown attempt.
      console.error('LOCAL_EDITOR_SHUTDOWN_UNCONFIRMED: 終了処理を確認できません。処理が停止したか確認してください。');process.exitCode=1;
    });
  };
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  if(openBrowser)openSystemBrowser(app.url).catch(()=>console.error('ブラウザを開けませんでした。表示されたアドレスをブラウザで開いてください。'));
}
