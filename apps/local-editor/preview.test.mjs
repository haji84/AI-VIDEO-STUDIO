import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,rename,chmod,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {startServer} from './server.mjs';
import {applyClipEdit} from './edits.mjs';
import {EditSession,createProject} from '../../packages/project/project.mjs';
const exec=promisify(execFile),delay=ms=>new Promise(r=>setTimeout(r,ms)),hash=b=>createHash('sha256').update(b).digest('hex');
async function waitFor(check,limit=30000){const end=Date.now()+limit;do{const value=await check();if(value)return value;await delay(30);}while(Date.now()<end);throw new Error('TEST_CONDITION_TIMEOUT');}
async function fixture(options={}){
  const dir=await mkdtemp(join(tmpdir(),'aivs-preview-test-')),folder=join(dir,'data'),source=join(dir,'generated.mp4');
  await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x2050a0:s=320x180:r=24:d=2','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:v','libx264','-c:a','aac','-shortest',source]);
  const original=await readFile(source),server=await startServer({workspace:folder,port:0,previewOptions:options});let state;
  const call=async(path,opts={})=>{const r=await fetch(server.url+path,{...opts,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(state?.session.project.revision??0),...opts.headers}});if(r.ok&&r.headers.get('content-type')?.includes('json')){const data=await r.clone().json();if(data.session)state=data;}return r;};
  const imported=await call('/api/import?kind=video',{method:'POST',headers:{'X-File-Name':'generated.mp4','Content-Length':String(original.length)},body:original});assert.equal(imported.status,200,await imported.text());
  const edited=applyClipEdit(state.session.project,0,{sourceInSec:.5,durationSec:1,speed:1,caption:'ALPHA\nBETA'});
  const r=await call('/api/edit',{method:'POST',body:JSON.stringify(edited)});assert.equal(r.status,200,await r.text());
  const start=async()=>{const r=await call('/api/preview',{method:'POST',body:JSON.stringify({clipId:state.session.project.timeline[0].clipId,startSec:0})});assert.equal(r.status,202,await r.clone().text());return r.json();};
  const ready=async()=>waitFor(async()=>{const r=await call('/api/preview');assert.equal(r.status,200);const job=await r.json();return job.status!=='RUNNING'?job:null;});
  return {dir,folder,source,original,server,call,start,ready,get state(){return state;},async close(){await server.close();await rm(dir,{recursive:true,force:true});}};
}
async function protectedBytes(folder){const result={};for(const file of ['project.aivs.json','bindings.json','media.json','last-job.json','output-history.json']){try{result[file]=hash(await readFile(join(folder,file)));}catch(e){if(e.code!=='ENOENT')throw e;result[file]=null;}}return result;}
async function running(pid){try{const data=await readFile('/proc/'+pid+'/stat','utf8');return !['Z','X'].includes(data.slice(data.lastIndexOf(')')+2).split(' ')[0]);}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function hangingPython(dir){const executable=join(dir,'owned-hanging-python'),pids=join(dir,'owned-pids.json');await writeFile(executable,'#!/usr/bin/env python3\nimport os,sys,signal,subprocess,time,json\nsignal.signal(signal.SIGTERM,signal.SIG_IGN)\nc=subprocess.Popen([sys.executable,"-c","import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(300)"])\nopen('+JSON.stringify(pids)+',"w").write(json.dumps([os.getpid(),c.pid]))\ntime.sleep(300)\n');await chmod(executable,0o700);return {executable,pids};}

test('saved-cut preview is authenticated, read-only and serves the actually rendered file',async()=>{
  const f=await fixture();try{
    const before=await protectedBytes(f.folder),oldOutputs=await(await f.call('/api/outputs')).json();
    assert.equal((await fetch(f.server.url+'/api/preview')).status,403);
    const started=await f.start();assert.equal((await f.call('/api/render',{method:'POST'})).status,409);
    const ready=await f.ready();assert.equal(ready.status,'PASS',JSON.stringify(ready));assert.equal(ready.id,started.id);
    const adopted=await f.call('/api/preview/'+ready.id);assert.equal(adopted.status,200,await adopted.clone().text());const view=await adopted.json();
    assert.equal(view.report.window.durationSec,1);assert.equal(view.report.window.sourceInSec,.5);assert.equal(view.report.captionRasters[0].lineCount,2);assert.equal(view.report.wholeFileDecode,'PASS');
    const media=await f.call(view.download);assert.equal(media.status,200);const bytes=Buffer.from(await media.arrayBuffer());assert.equal(hash(bytes),view.report.outputSha256);
    const range=await f.call(view.download,{headers:{Range:'bytes=0-31'}});assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),bytes.subarray(0,32));
    assert.equal((await f.call(view.download,{headers:{Range:'bytes=999999999-'}})).status,416);
    const file=join(f.dir,'downloaded.mp4');await writeFile(file,bytes);await exec('ffmpeg',['-v','error','-xerror','-i',file,'-f','null','-']);
    assert.deepEqual(await protectedBytes(f.folder),before);assert.deepEqual(await(await f.call('/api/outputs')).json(),oldOutputs);assert.deepEqual(await readFile(f.source),f.original);
    for(const body of [{clipId:'../project.aivs.json',startSec:0},{clipId:f.state.session.project.timeline[0].clipId,startSec:-1},{clipId:f.state.session.project.timeline[0].clipId,startSec:0,output:'/tmp/arbitrary'}])assert.equal((await f.call('/api/preview',{method:'POST',body:JSON.stringify(body)})).status,400);
  }finally{await f.close();}
});

test('ready previews reject changed source or changed project before adoption and media serving',async()=>{
  const f=await fixture();try{
    const {id}=await f.start();assert.equal((await f.ready()).status,'PASS');
    const bindings=JSON.parse(await readFile(join(f.folder,'bindings.json'))),asset=bindings[0].path,bytes=await readFile(asset);
    await writeFile(asset,Buffer.from('replaced synthetic media'));
    for(const route of ['/api/preview/'+id,'/previews/'+id]){const r=await f.call(route);assert.equal(r.status,409,await r.clone().text());assert.match(await r.text(),/SOURCE_CHANGED/);}
    await writeFile(asset,bytes);
    const p=structuredClone(f.state.session.project);p.name='new revision';assert.equal((await f.call('/api/edit',{method:'POST',body:JSON.stringify(p)})).status,200);
    const stale=await f.call('/previews/'+id);assert.equal(stale.status,409);assert.match(await stale.text(),/STALE/);
  }finally{await f.close();}
});

test('absolute deadline kills the owned worker and descendant and releases the editor',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'aivs-preview-hang-')),hung=await hangingPython(dir);let f;
  try{f=await fixture({python:hung.executable,budgetMs:700});const began=Date.now();await f.start();await waitFor(async()=>{try{return JSON.parse(await readFile(hung.pids));}catch{return false;}},2500);
    const job=await f.ready();assert.equal(job.status,'FAIL');assert.match(job.error,/TIMEOUT/);assert.ok(Date.now()-began<3500);
    for(const pid of JSON.parse(await readFile(hung.pids)))assert.equal(await running(pid),false,'owned process survived timeout');
    const p=structuredClone(f.state.session.project);p.name='unlocked after timeout';assert.equal((await f.call('/api/edit',{method:'POST',body:JSON.stringify(p)})).status,200);
  }finally{if(f)await f.close();await rm(dir,{recursive:true,force:true});}
});

test('parent close cancels only its preview group and removes the workspace lock promptly',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'aivs-preview-close-')),hung=await hangingPython(dir);let f;
  try{f=await fixture({python:hung.executable});await f.start();const pids=await waitFor(async()=>{try{return JSON.parse(await readFile(hung.pids));}catch{return false;}},2500);
    const began=Date.now();await f.server.close();assert.ok(Date.now()-began<2500);for(const pid of pids)assert.equal(await running(pid),false,'owned process survived parent close');
    await assert.rejects(stat(join(f.folder,'.editor.lock')),{code:'ENOENT'});
    const reopened=await startServer({workspace:f.folder,port:0});await reopened.close();
  }finally{if(f){await f.server.close().catch(()=>{});await rm(f.dir,{recursive:true,force:true});}await rm(dir,{recursive:true,force:true});}
});

test('SIGTERM on the actual CLI closes its detached preview group before exiting',async()=>{
  const f=await fixture(),hung=await hangingPython(f.dir);let cli,pids;
  try{
    await f.server.close();
    cli=spawn(process.execPath,[resolve(import.meta.dirname,'server.mjs'),'--workspace',f.folder,'--port','0'],{env:{...process.env,AIVS_PYTHON:hung.executable},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';cli.stdout.on('data',b=>{stdout=(stdout+b).slice(-2000);});cli.stderr.on('data',b=>{stderr=(stderr+b).slice(-2000);});
    const url=await waitFor(()=>stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0],4000);
    const html=await(await fetch(url)).text(),token=html.match(/const token='([a-f0-9]{64})'/)?.[1];assert.ok(token);
    const headers={'X-AIVS-Token':token,'X-AIVS-Revision':String(f.state.session.project.revision)};
    const r=await fetch(url+'/api/preview',{method:'POST',headers,body:JSON.stringify({clipId:f.state.session.project.timeline[0].clipId,startSec:0})});assert.equal(r.status,202,await r.text());
    pids=await waitFor(async()=>{try{return JSON.parse(await readFile(hung.pids));}catch{return false;}},2500);
    const began=Date.now();cli.kill('SIGTERM');await waitFor(()=>cli.exitCode!==null||cli.signalCode!==null,3000);
    assert.ok(Date.now()-began<2500,'CLI shutdown exceeded its bounded cleanup attempt');
    for(const pid of pids)assert.equal(await running(pid),false,'detached preview survived CLI SIGTERM');
    assert.equal(cli.exitCode,0,stderr);await assert.rejects(stat(join(f.folder,'.editor.lock')),{code:'ENOENT'});
  }finally{
    if(cli&&cli.exitCode===null&&cli.signalCode===null)cli.kill('SIGKILL');
    if(pids){try{process.kill(-pids[0],'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}}
    await f.server.close().catch(()=>{});await rm(f.dir,{recursive:true,force:true});
  }
});

test('output replacement cannot substitute a different file after verified descriptor open',async()=>{
  const f=await fixture();let manager;
  try{
    // First verify the real route exists; baseline failure is the missing feature.
    const initial=await f.start();assert.equal((await f.ready()).status,'PASS');
    await writeFile(join(f.folder,'previews',initial.id,'output.mp4'),'replaced before HTTP view');
    const replaced=await f.call('/previews/'+initial.id);assert.equal(replaced.status,409);assert.match(await replaced.text(),/OUTPUT_CHANGED/);
    const {createPreviewManager}=await import('./preview-job.mjs');
    const session=EditSession.open(await readFile(join(f.folder,'project.aivs.json'),'utf8')),bindings=JSON.parse(await readFile(join(f.folder,'bindings.json')));
    const folder=join(f.dir,'direct-manager');manager=await createPreviewManager({folder,root:resolve(import.meta.dirname,'../..'),getSession:()=>session,getBindings:()=>bindings});
    const {id}=await manager.start({clipId:session.current.timeline[0].clipId,startSec:0});await waitFor(()=>manager.state().status!=='RUNNING');assert.equal(manager.state().status,'PASS',JSON.stringify(manager.state()));
    const file=join(folder,'previews',id,'output.mp4'),original=await readFile(file),checked=await manager.open(id);
    await rename(file,file+'.original');await writeFile(file,'unverified replacement');
    const chunks=[];for await(const part of checked.handle.createReadStream({start:0,autoClose:true}))chunks.push(part);assert.deepEqual(Buffer.concat(chunks),original);
    await assert.rejects(manager.open(id),/OUTPUT_CHANGED/);
  }finally{if(manager)await manager.close();await f.close();}
});

test('held preview descriptors are capped and releasing one admits a new media reader',async()=>{
  const f=await fixture();let manager;const handles=[];
  try{
    const {createPreviewManager}=await import('./preview-job.mjs');
    const session=EditSession.open(await readFile(join(f.folder,'project.aivs.json'),'utf8')),bindings=JSON.parse(await readFile(join(f.folder,'bindings.json')));
    manager=await createPreviewManager({folder:join(f.dir,'limit-manager'),root:resolve(import.meta.dirname,'../..'),getSession:()=>session,getBindings:()=>bindings});
    const {id}=await manager.start({clipId:session.current.timeline[0].clipId,startSec:0});await waitFor(()=>manager.state().status!=='RUNNING');assert.equal(manager.state().status,'PASS');
    for(let i=0;i<4;i++)handles.push((await manager.open(id)).handle);
    await assert.rejects(manager.open(id),/PREVIEW_MEDIA_BUSY/);
    await handles.shift().close();handles.push((await manager.open(id)).handle);
    for(const handle of handles.splice(0))await handle.close();
    assert.equal(manager.busy(),false);
  }finally{for(const handle of handles)await handle.close().catch(()=>{});if(manager)await manager.close();await f.close();}
});

// DOM-double behavior only. Pixel geometry/playback require the hosted browser.
class PreviewElement extends EventTarget{
  children=[];value='';textContent='';disabled=false;hidden=false;paused=true;dataset={};style={};
  constructor(tag){super();this.tagName=tag;}
  append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
  setAttribute(key,value){this[key]=String(value);}getAttribute(key){return this[key]??null;}removeAttribute(key){delete this[key];}
  pause(){this.paused=true;}load(){}async play(){this.paused=false;}
}
function findElement(root,id){if(root.id===id)return root;for(const child of root.children??[]){const found=findElement(child,id);if(found)return found;}}
function panelState(){const project=createProject({projectId:'project_preview_ui'});project.sourceRefs=[{assetId:'asset_'+'1'.repeat(32),sha256:'a'.repeat(64),mediaKind:'video',durationSec:40,hasAudio:false,offsetSec:0,driftPpm:0,syncStatus:'master'}];
  project.timeline=[0,1].map((n)=>({clipId:'clip_'+n,sourceId:project.sourceRefs[0].assetId,sourceInSec:0,durationSec:20,startSec:n*20,speed:1,layout:'single',effects:[]}));
  return {session:{project,undo:[],redo:[]},preview:{supported:true,status:'NOT_RUN'},job:{status:'NOT_RUN'},sync:{status:'NOT_RUN'},firstCut:{status:'NOT_RUN'}};
}
function panelResult(state,clipId='clip_0'){return {id:'a'.repeat(32),status:'PASS',download:'/previews/'+'a'.repeat(32),expiresAt:Date.now()+60000,report:{schema:'aivs-saved-clip-preview-v1',projectId:state.session.project.projectId,projectRevision:state.session.project.revision,clipId,sourceIdentities:state.session.project.sourceRefs,window:{startSec:2,endSec:9,durationSec:7,totalSec:20,sourceInSec:2,sourceDurationSec:7,speed:1},exportProfile:'review',width:960,height:540,fps:24,outputSha256:'b'.repeat(64),bytes:22000,wholeFileDecode:'PASS',captionRasters:[]}};}
async function withPreviewDOM(run){const oldDocument=globalThis.document,oldWindow=globalThis.window;globalThis.document={createElement:tag=>new PreviewElement(tag),createTextNode:text=>Object.assign(new PreviewElement('#text'),{textContent:text})};globalThis.window=new EventTarget();try{await run();}finally{globalThis.window.dispatchEvent(new Event('pagehide'));if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}}

test('saved-preview panel requests an explicit output-time window and leaves the saved session unchanged',()=>withPreviewDOM(async()=>{
  const {mountPreviewPanel}=await import('./preview-panel.mjs'),state=panelState(),container=new PreviewElement('section'),calls=[],before=JSON.stringify(state.session);
  const view=panelResult(state),panel=mountPreviewPanel({container,current:()=>state,selected:()=>0,mediaURL:path=>path+'?token=test-token',request:async(path,options)=>{calls.push({path,options});if(options?.method==='POST')return {id:view.id,status:'RUNNING',supported:true};if(path==='/api/preview')return {id:view.id,status:'PASS',supported:true};return view;}});
  window.addEventListener('pagehide',()=>panel.close(),{once:true});panel.show();assert.equal(calls.length,0);findElement(container,'saved-preview-start').value='2';await findElement(container,'saved-preview-render').onclick();
  const post=calls.find(c=>c.options?.method==='POST');assert.equal(post.path,'/api/preview');assert.deepEqual(JSON.parse(post.options.body),{clipId:'clip_0',startSec:2});
  const video=findElement(container,'saved-preview-video');assert.equal(video.hidden,false);assert.equal(video.muted,true);assert.ok(video.playbackRate===1||video.playbackRate===undefined);assert.match(video.src,/\/previews\/a{32}/);
  assert.match(findElement(container,'saved-preview-interval').textContent,/2.*9.*20/);assert.equal(JSON.stringify(state.session),before);
  panel.close?.();
}));

test('saved-preview panel rejects delayed adoption after clip selection or revision changes',()=>withPreviewDOM(async()=>{
  const {mountPreviewPanel}=await import('./preview-panel.mjs');
  for(const change of ['selection','revision']){
    const state=panelState(),container=new PreviewElement('section');let selected=0,resolveAdoption;
    const view=panelResult(state),panel=mountPreviewPanel({container,current:()=>state,selected:()=>selected,mediaURL:path=>path,request:async(path,options)=>{if(options?.method==='POST')return {id:view.id,status:'RUNNING',supported:true};if(path==='/api/preview')return {id:view.id,status:'PASS',supported:true};return new Promise(resolve=>{resolveAdoption=resolve;});}});
    window.addEventListener('pagehide',()=>panel.close(),{once:true});panel.show();findElement(container,'saved-preview-start').value='2';const pending=findElement(container,'saved-preview-render').onclick();await waitFor(()=>resolveAdoption,1500);
    if(change==='selection')selected=1;else state.session.project.revision++;panel.show();resolveAdoption(view);await pending;
    const video=findElement(container,'saved-preview-video');assert.equal(video.hidden,true);assert.equal(video.paused,true);assert.ok(!video.src,'stale response set a media URL');panel.close?.();
  }
}));

test('preview recovery errors explain the actual block instead of reporting an unsupported platform',()=>withPreviewDOM(async()=>{
  const {mountPreviewPanel}=await import('./preview-panel.mjs'),state=panelState(),container=new PreviewElement('section');
  state.preview={supported:false,status:'FAIL',error:'PREVIEW_INTERRUPTED_FILES: previous owned files remain'};
  const panel=mountPreviewPanel({container,current:()=>state,selected:()=>0,mediaURL:path=>path,request:()=>assert.fail('blocked preview sent a request')});
  window.addEventListener('pagehide',()=>panel.close(),{once:true});panel.show();
  assert.equal(findElement(container,'saved-preview-render').disabled,true);assert.match(findElement(container,'saved-preview-status').textContent,/作業データ/);panel.close();
}));
