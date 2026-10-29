/** Read-only Linux preview. One owned process group, one absolute deadline. */
import {constants} from 'node:fs';
import {mkdir,open,readdir,readFile,writeFile,rm,lstat,realpath} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {saveSession} from '../../packages/project/local-store.mjs';
import {EditSession} from '../../packages/project/project.mjs';

const LIMIT_MS=180000,CLEANUP_MS=2000,MAX_OUTPUT=128*1024**2,MAX_MEDIA_HANDLES=4;
const hash=b=>createHash('sha256').update(b).digest('hex');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function fail(code,status=400){const error=new Error(code);error.status=status;throw error;}
const identity=s=>Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(k=>[k,String(s[k])]));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function cleanupDeadline(promise,until){
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error('PREVIEW_CLEANUP_UNCONFIRMED');e.status=409;reject(e);},Math.max(0,until-Date.now()));})]);}
  finally{clearTimeout(timer);}
}
async function closeHandle(handle){try{await handle.close();}catch(error){if(error.code!=='EBADF')throw error;}}
function checkDeadline(record){if(record.abort.signal.aborted)throw record.abort.signal.reason;if(Date.now()>=record.deadline)fail('PREVIEW_TIMEOUT',409);}
async function bounded(promise,record){
  record.pending.add(promise);promise.then(()=>record.pending.delete(promise),()=>record.pending.delete(promise));
  checkDeadline(record);let abort;
  try{return await Promise.race([promise,new Promise((_,reject)=>{abort=()=>reject(record.abort.signal.reason);record.abort.signal.addEventListener('abort',abort,{once:true});})]);}
  finally{record.abort.signal.removeEventListener('abort',abort);}
}
async function checkedFile(path,record,{expectedHash,expectedIdentity,code,maxBytes=MAX_OUTPUT,collect=false}={}){
  let handle;
  try{
    checkDeadline(record);
    // NONBLOCK prevents a replaced FIFO from blocking open; only regular files pass.
    const opening=open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    opening.then(file=>{if(record.abort.signal.aborted)file.close().catch(()=>{});},()=>{});
    handle=await bounded(opening,record);
    const before=await bounded(handle.stat({bigint:true}),record),id=identity(before);
    if(!before.isFile()||before.size<1n||before.size>BigInt(maxBytes)||(expectedIdentity&&!same(id,expectedIdentity)))fail(code,409);
    const digest=createHash('sha256'),buffer=Buffer.alloc(64*1024),chunks=[];let position=0;
    while(position<Number(before.size)){
      const {bytesRead}=await bounded(handle.read(buffer,0,Math.min(buffer.length,Number(before.size)-position),position),record);
      if(!bytesRead)fail(code,409);digest.update(buffer.subarray(0,bytesRead));if(collect)chunks.push(Buffer.from(buffer.subarray(0,bytesRead)));position+=bytesRead;
    }
    const after=await bounded(handle.stat({bigint:true}),record),sha256=digest.digest('hex');
    if(!same(id,identity(after))||(expectedHash&&sha256!==expectedHash))fail(code,409);
    checkDeadline(record);return {handle,size:Number(before.size),identity:id,sha256,...(collect?{bytes:Buffer.concat(chunks)}:{})};
  }catch(error){if(handle)await handle.close().catch(()=>{});if(record.abort.signal.aborted)throw record.abort.signal.reason;if(error.message.startsWith('PREVIEW_'))throw error;fail(code,409);}
}
async function liveGroup(group){
  // Read only process IDs, group IDs and states. Never inspect command lines/env.
  const names=await readdir('/proc');
  for(const name of names){if(!/^\d+$/.test(name))continue;
    try{const raw=await readFile('/proc/'+name+'/stat','utf8'),fields=raw.slice(raw.lastIndexOf(')')+2).split(' ');
      if(Number(fields[2])===group&&!['Z','X'].includes(fields[0]))return true;
    }catch(error){if(!['ENOENT','ESRCH','EACCES'].includes(error.code))throw error;}
  }return false;
}
async function stopGroup(record,until=Date.now()+CLEANUP_MS){
  if(record.cleanup)return record.cleanup;
  record.cleanup=cleanupDeadline((async()=>{
    const pid=record.child?.pid;if(!pid)return;
    // detached:true creates this worker's own group. No broad process-name kills.
    const signal=name=>{try{process.kill(-pid,name);}catch(e){if(e.code!=='ESRCH')throw e;}};
    signal('SIGTERM');
    while(Date.now()<until-1000){if(!await liveGroup(pid))return;await delay(25);}
    signal('SIGKILL');
    while(Date.now()<until){if(!await liveGroup(pid))return;await delay(25);}
    if(await liveGroup(pid))fail('PREVIEW_CLEANUP_FAILED',409);
  })(),until);return record.cleanup;
}

export async function createPreviewManager({folder,root,getSession,getBindings,python=process.env.AIVS_PYTHON||'python3',budgetMs=LIMIT_MS}={}){
  if(!Number.isInteger(budgetMs)||budgetMs<100||budgetMs>LIMIT_MS)fail('PREVIEW_BUDGET_INVALID');
  const directory=join(resolve(folder),'previews'),owned=new Set(),retiring=new Set();let active,ready,closing,closed=false,cleanupFailed=false,checks=0,queue=Promise.resolve();
  let setupError;const supported=process.platform==='linux';
  if(supported)try{
    await mkdir(directory,{recursive:true,mode:0o700});if((await lstat(directory)).isSymbolicLink()||await realpath(directory)!==directory)fail('PREVIEW_DIRECTORY_UNSAFE');
    // A forced process death is not a proven clean shutdown. Do not delete or
    // kill anything left by an unknown prior owner when the app is restarted.
    if((await readdir(directory)).length)setupError='PREVIEW_INTERRUPTED_FILES: 前の確認処理の作業データが残っています。';
  }catch{setupError='PREVIEW_DIRECTORY_UNAVAILABLE';}
  let job={status:'NOT_RUN'};
  function state(){let stale=false;if(ready)try{assertCurrent(ready);}catch{stale=true;}
    return {...job,supported:supported&&!setupError,maxWindowSec:7,...(setupError?{error:setupError}:{}),...(ready?{stale,window:ready.report.window,expiresAt:ready.deadline}:{})};}
  function assertCurrent(record){
    if(hash(getSession().serialize())!==record.sessionHash||!same(getBindings(),record.bindings))fail('PREVIEW_STALE: 保存内容が変わりました。もう一度確認してください。',409);
  }
  async function sources(record,capture=false){
    assertCurrent(record);
    const bindings=new Map(record.bindings.map(b=>[b.assetId,b.path]));
    for(const ref of record.project.sourceRefs){
      const checked=await checkedFile(bindings.get(ref.assetId),record,{expectedHash:ref.sha256,expectedIdentity:capture?undefined:record.sourceStats.get(ref.assetId),code:'PREVIEW_SOURCE_CHANGED',maxBytes:16*1024**3});
      try{if(capture)record.sourceStats.set(ref.assetId,checked.identity);}finally{await checked.handle.close();}
    }assertCurrent(record);
  }
  async function dispose(record){
    if(record.disposal)return record.disposal;
    // Clearing ready does not release ownership of descriptors or files. Keep
    // this slot through cleanup, and retain it on ambiguous/failed cleanup.
    retiring.add(record);
    const until=Date.now()+CLEANUP_MS;clearTimeout(record.timer);
    record.disposal=cleanupDeadline((async()=>{
      // A cleanup attempt is bounded; an uninterruptible kernel/filesystem
      // operation cannot be forcibly completed. Ambiguity keeps the manager busy.
      if(record.child)await stopGroup(record,until);
      // A rejected race does not cancel a filesystem operation. Confirm its
      // settlement before removing files or releasing the worker slot.
      await Promise.allSettled([...record.pending]);
      await Promise.all([...record.handles].map(closeHandle));record.handles.clear();
      if(owned.has(record.dir)){await rm(record.dir,{recursive:true,force:true});owned.delete(record.dir);}
    })(),until).then(()=>{retiring.delete(record);},error=>{cleanupFailed=true;throw error;});return record.disposal;
  }
  function abort(record,code){if(!record.abort.signal.aborted){const error=new Error(code);error.status=409;record.abort.abort(error);}}
  async function expire(record){
    abort(record,'PREVIEW_TIMEOUT');
    if(active===record){
      // Supervise cleanup independently of run(): even a stalled close/read
      // must not leave the status RUNNING without a bounded failure response.
      try{await cleanupDeadline(Promise.all([stopGroup(record),record.work]),Date.now()+CLEANUP_MS);}
      catch{cleanupFailed=true;if(job.id===record.id)job={id:record.id,status:'FAIL',error:'PREVIEW_CLEANUP_UNCONFIRMED'};}
      return;
    }
    if(ready===record){ready=undefined;job={id:record.id,status:'FAIL',error:'PREVIEW_EXPIRED: 確認動画の有効期限が切れました。もう一度確認してください。'};await dispose(record);}
  }
  function validateRequest(request){
    if(!request||Array.isArray(request)||Object.keys(request).sort().join(',')!=='clipId,startSec'||typeof request.clipId!=='string'||!Number.isFinite(request.startSec))fail('PREVIEW_REQUEST_INVALID');
    const project=getSession().current,clip=project.timeline.find(c=>c.clipId===request.clipId);
    if(!clip)fail('PREVIEW_CLIP_NOT_FOUND');
    if(clip.layout!=='single'||clip.effects.length>1)fail('PREVIEW_UNSUPPORTED_CUT');
    for(const effect of clip.effects)if(effect.type!=='caption'||effect.version!==1||effect.keyframes.length||effect.startSec!==0||Math.abs(effect.endSec-clip.durationSec/clip.speed)>1e-7||Object.keys(effect.parameters).join(',')!=='text')fail('PREVIEW_UNSUPPORTED_EFFECT');
    const duration=Math.min(7,clip.durationSec/clip.speed-request.startSec);
    if(request.startSec<0||duration*clip.speed<.2-1e-7)fail('PREVIEW_RANGE_INVALID');
    return project;
  }
  async function run(record,old){
    try{
      if(old)await dispose(old);checkDeadline(record);
      await bounded(mkdir(record.dir,{mode:0o700}).then(()=>{owned.add(record.dir);}),record);
      const protectedPaths=record.bindings.map(b=>b.path);
      await bounded(saveSession(join(record.dir,'project.json'),record.session,{protectedPaths}),record);
      await bounded(writeFile(join(record.dir,'bindings.json'),JSON.stringify(record.bindings),{flag:'wx',mode:0o600}),record);
      await bounded(writeFile(join(record.dir,'request.json'),JSON.stringify(record.request),{flag:'wx',mode:0o600}),record);
      await sources(record,true);checkDeadline(record);
      const args=['-m','engine.preview_saved_clip','--project',join(record.dir,'project.json'),'--bindings',join(record.dir,'bindings.json'),
        '--request',join(record.dir,'request.json'),'--workspace',join(record.dir,'render'),'--output',join(record.dir,'output.mp4'),'--report',join(record.dir,'report.json')];
      const child=spawn(python,args,{cwd:root,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});record.child=child;
      let errors='';child.stdout.resume();child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-2000);});
      const exited=new Promise((done,reject)=>{child.once('error',reject);child.once('exit',code=>done(code));});
      const code=await bounded(exited,record);await stopGroup(record);checkDeadline(record);
      if(code!==0)fail(errors.match(/CAPTION_[A-Z_]+/)?.[0]??'PREVIEW_RENDER_FAILED');
      const json=await checkedFile(join(record.dir,'report.json'),record,{code:'PREVIEW_REPORT_INVALID',maxBytes:4*1024**2,collect:true});
      try{record.report=JSON.parse(json.bytes.toString('utf8'));}finally{await json.handle.close();}
      const report=record.report,clip=record.project.timeline.find(c=>c.clipId===record.request.clipId),duration=Math.min(7,clip.durationSec/clip.speed-record.request.startSec);
      const expectedWindow={startSec:record.request.startSec,endSec:record.request.startSec+duration,durationSec:duration,totalSec:clip.durationSec/clip.speed,sourceInSec:clip.sourceInSec+record.request.startSec*clip.speed,sourceDurationSec:duration*clip.speed,speed:clip.speed};
      if(report.schema!=='aivs-saved-clip-preview-v1'||report.projectId!==record.project.projectId||report.projectRevision!==record.project.revision||report.clipId!==clip.clipId||
        !same(report.sourceIdentities,record.project.sourceRefs)||report.exportProfile!==record.project.exportProfile||report.wholeFileDecode!=='PASS'||!Array.isArray(report.captionRasters)||
        !/^[a-f0-9]{64}$/.test(report.outputSha256)||!Number.isSafeInteger(report.bytes)||report.bytes<1||report.bytes>MAX_OUTPUT||Object.entries(expectedWindow).some(([key,value])=>!Number.isFinite(report.window?.[key])||Math.abs(report.window[key]-value)>1e-7))fail('PREVIEW_REPORT_INVALID');
      await sources(record);
      const output=await checkedFile(join(record.dir,'output.mp4'),record,{expectedHash:report.outputSha256,code:'PREVIEW_OUTPUT_CHANGED'});
      try{if(output.size!==report.bytes)fail('PREVIEW_REPORT_INVALID');record.outputIdentity=output.identity;}finally{await output.handle.close();}
      checkDeadline(record);ready=record;job={id:record.id,status:'PASS'};
    }catch(error){
      abort(record,error.message.startsWith('PREVIEW_')?error.message:'PREVIEW_FAILED');
      try{await dispose(record);}catch{cleanupFailed=true;}
      job={id:record.id,status:'FAIL',error:cleanupFailed?'PREVIEW_CLEANUP_FAILED':record.abort.signal.reason.message};
    }finally{if(active===record)active=undefined;}
  }
  async function openResult(id){
    if(!/^[a-f0-9]{32}$/.test(id)||!ready||id!==ready.id)fail('PREVIEW_NOT_FOUND',404);
    const record=ready;
    if(record.handles.size+record.openings>=MAX_MEDIA_HANDLES)fail('PREVIEW_MEDIA_BUSY',409);
    if(checks>=2)fail('PREVIEW_BUSY',409);checks++;record.openings++;
    const previous=queue;let release;queue=new Promise(r=>{release=r;});
    try{
      await bounded(previous,record);if(ready!==record||closed)fail('PREVIEW_STALE',409);
      await sources(record);
      const checked=await checkedFile(join(record.dir,'output.mp4'),record,{expectedHash:record.report.outputSha256,expectedIdentity:record.outputIdentity,code:'PREVIEW_OUTPUT_CHANGED'});
      try{assertCurrent(record);checkDeadline(record);}catch(error){await checked.handle.close();throw error;}
      record.handles.add(checked.handle);checked.handle.once('close',()=>record.handles.delete(checked.handle));
      return {...checked,report:record.report,expiresAt:record.deadline};
    }finally{checks--;record.openings--;release();}
  }
  return {state,busy:()=>Boolean(active)||retiring.size>0||checks>0||cleanupFailed,
    async start(request){
      const began=Date.now();
      if(closed)fail('PREVIEW_CLOSED',409);if(!supported)fail('PREVIEW_PLATFORM_UNVERIFIED: この確認機能は現在Linuxで検証しています。');if(setupError)fail(setupError);
      if(active||retiring.size||checks||cleanupFailed)fail('PREVIEW_BUSY',409);
      const project=validateRequest(request),session=getSession(),serialized=session.serialize(),id=randomUUID().replaceAll('-','');
      // Snapshot remains independent even if a direct embedding later edits its session.
      const record={id,dir:join(directory,id),request:structuredClone(request),session:EditSession.open(serialized),sessionHash:hash(serialized),project:structuredClone(project),bindings:structuredClone(getBindings()),sourceStats:new Map(),handles:new Set(),pending:new Set(),openings:0,deadline:began+budgetMs,abort:new AbortController()};
      const old=ready;ready=undefined;active=record;job={id,status:'RUNNING'};
      record.timer=setTimeout(()=>{expire(record).catch(()=>{cleanupFailed=true;if(job.id===id)job={id,status:'FAIL',error:'PREVIEW_CLEANUP_FAILED'};});},Math.max(0,record.deadline-Date.now()));record.timer.unref();
      record.work=run(record,old);return state();
    },
    async adopt(id){const checked=await openResult(id);try{return {id,status:'PASS',report:structuredClone(checked.report),download:'/previews/'+id,expiresAt:checked.expiresAt};}finally{await checked.handle.close();}},
    open:openResult,
    async close(){
      if(closing)return closing;closed=true;
      const until=Date.now()+CLEANUP_MS;
      closing=(async()=>{try{await cleanupDeadline((async()=>{
        if(active){const current=active;abort(current,'PREVIEW_CLOSED');await current.work;}
        if(ready){const current=ready;ready=undefined;abort(current,'PREVIEW_CLOSED');await dispose(current);}
        await Promise.all([...retiring].map(record=>record.disposal));
        await queue;if(cleanupFailed)fail('PREVIEW_CLEANUP_UNCONFIRMED',409);
        for(const dir of [...owned]){await rm(dir,{recursive:true,force:true});owned.delete(dir);}
      })(),until);}catch{cleanupFailed=true;job={...job,status:'FAIL',error:'PREVIEW_CLEANUP_UNCONFIRMED'};fail('PREVIEW_CLEANUP_UNCONFIRMED',409);}})();return closing;
    }};
}
