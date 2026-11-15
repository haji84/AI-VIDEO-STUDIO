/** Issue #37: actual import process must honor the renderer's explicit tools. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs,{mkdtemp,readFile,writeFile,copyFile,mkdir,rm,chmod,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {syncBuiltinESMExports} from 'node:module';
import {startServer} from './server.mjs';
const exec=promisify(execFile);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('a target without hard-link support finalizes a verified copy without overwriting data',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-no-hardlinks-'));let server;
 try{
  const source=join(dir,'synthetic.mp4');await exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=1','-c:v','libx264',source]);const bytes=await readFile(source);
  t.mock.method(fs,'link',async()=>{throw Object.assign(new Error('hard links unavailable'),{code:'ENOTSUP'});});
  syncBuiltinESMExports();
  server=await startServer({workspace:join(dir,'data'),port:0});
  const response=await fetch(server.url+'/api/import?kind=video',{method:'POST',body:bytes,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':'0','X-File-Name':'synthetic.mp4'}});
  assert.equal(response.status,200,await response.clone().text());const state=await response.json();assert.equal(state.pendingImports.length,0);
  const registry=JSON.parse(await readFile(join(dir,'data','media.json'),'utf8'));
  assert.deepEqual(await readFile(join(dir,'data','assets',registry[0].file)),bytes);assert.deepEqual(await readFile(source),bytes);
 }finally{if(server)await server.close();t.mock.restoreAll();syncBuiltinESMExports();await rm(dir,{recursive:true,force:true});}
});

test('shutdown holds workspace ownership until initial import and retained retry finish',{skip:process.platform==='win32'},async t=>{
 for(const scenario of ['initial','retry'])await t.test(scenario,async()=>{
  const dir=await mkdtemp(join(tmpdir(),'aivs-import-drain-'));const previous=process.env.AIVS_FFMPEG_DIR;let server,request,closing;
  const release=join(dir,'release-probe'),marker=join(dir,'probe-started');
  try{
   const source=join(dir,'synthetic.mp4');await exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=1','-c:v','libx264',source]);const bytes=await readFile(source);
   const tools=join(dir,'tools');await mkdir(tools);await copyFile(process.execPath,join(tools,'ffmpeg'));
   const python=(await exec(process.env.AIVS_PYTHON||'python3',['-c','import sys;print(sys.executable)'])).stdout.trim();
   await writeFile(join(tools,'ffprobe'),'#!'+python+'\nimport json,time\nfrom pathlib import Path\nPath('+JSON.stringify(marker)+').write_text("started")\nfor _ in range(300):\n if Path('+JSON.stringify(release)+').exists():break\n time.sleep(.01)\nprint(json.dumps({"format":{"duration":"1"},"streams":[{"codec_type":"video"}]}))\n');await chmod(join(tools,'ffprobe'),0o700);
   server=await startServer({workspace:join(dir,'data'),port:0});
   const headers={'X-AIVS-Token':server.token,'X-AIVS-Revision':'0','X-File-Name':'synthetic.mp4'};
   let id;
   if(scenario==='retry'){
    process.env.AIVS_FFMPEG_DIR=join(dir,'missing');const failure=await fetch(server.url+'/api/import?kind=video',{method:'POST',body:bytes,headers});assert.equal(failure.status,400);id=(await failure.json()).pendingImports[0].uploadId;
   }
   process.env.AIVS_FFMPEG_DIR=tools;
   request=fetch(server.url+(scenario==='retry'?'/api/import/retry':'/api/import?kind=video'),{method:'POST',headers,body:scenario==='retry'?JSON.stringify({uploadId:id}):bytes}).catch(error=>error);
   for(let i=0;i<200;i++){try{await access(marker);break;}catch{await delay(10);}}
   await access(marker);closing=server.close();await delay(30);
   await assert.doesNotReject(()=>access(join(dir,'data','.editor.lock')),'the old handler still owns the workspace');
   await writeFile(release,'continue');await closing;server=undefined;await request;
   server=await startServer({workspace:join(dir,'data'),port:0});
   const state=await(await fetch(server.url+'/api/state',{headers:{'X-AIVS-Token':server.token}})).json();assert.equal(state.sources.length,1);
   const project=state.session.project;project.name='EDIT AFTER RESTART';
   const edited=await fetch(server.url+'/api/edit',{method:'POST',body:JSON.stringify(project),headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(project.revision)}});assert.equal(edited.status,200);
   assert.equal(JSON.parse(await readFile(join(dir,'data','project.aivs.json'),'utf8')).project.name,'EDIT AFTER RESTART');
  }finally{
   await writeFile(release,'continue');if(closing)await closing.catch(()=>{});if(request)await request;if(server)await server.close().catch(()=>{});
   if(previous===undefined)delete process.env.AIVS_FFMPEG_DIR;else process.env.AIVS_FFMPEG_DIR=previous;await rm(dir,{recursive:true,force:true});
  }
 });
});

test('HTTP import resolves the configured ffprobe even when launch PATH is empty',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-tool-launch-'));
 const previous={PATH:process.env.PATH,AIVS_FFMPEG_DIR:process.env.AIVS_FFMPEG_DIR,AIVS_PYTHON:process.env.AIVS_PYTHON};let server;
 try{
  const python=process.env.AIVS_PYTHON||(process.platform==='win32'?'python':'python3');
  const {stdout}=await exec(python,['-c','import json,shutil,sys;print(json.dumps([sys.executable,shutil.which("ffprobe")]))']);
  const [interpreter,probe]=JSON.parse(stdout);assert.ok(probe);
  const source=join(dir,'synthetic.mp4');
  await exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=1','-c:v','libx264',source]);
  const bytes=await readFile(source);
  process.env.PATH='';process.env.AIVS_FFMPEG_DIR=dirname(probe);process.env.AIVS_PYTHON=interpreter;
  server=await startServer({workspace:join(dir,'data'),port:0});
  const response=await fetch(server.url+'/api/import?kind=video',{method:'POST',body:bytes,
   headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':'0','X-File-Name':'synthetic.mp4'}});
  assert.equal(response.status,200,await response.clone().text());
  const state=await response.json();assert.equal(state.sources.length,1);assert.equal(state.session.project.sourceRefs[0].hasAudio,false);
 }finally{
  if(server)await server.close();
  for(const [name,value] of Object.entries(previous)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
  await rm(dir,{recursive:true,force:true});
 }
});

test('malformed probe JSON is a bounded visible failure that preserves completed bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-bad-probe-'));const previous=process.env.AIVS_FFMPEG_DIR;let server;
 try{
  const source=join(dir,'synthetic.mp4');await exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=1','-c:v','libx264',source]);
  const bytes=await readFile(source),tools=join(dir,'tools');await mkdir(tools);
  // A real Node process prints its version for -v and exits 0, rather than JSON.
  const suffix=process.platform==='win32'?'.exe':'';
  for(const name of ['ffmpeg','ffprobe'])await copyFile(process.execPath,join(tools,name+suffix));
  process.env.AIVS_FFMPEG_DIR=tools;server=await startServer({workspace:join(dir,'data'),port:0});
  const r=await fetch(server.url+'/api/import?kind=video',{method:'POST',body:bytes,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':'0','X-File-Name':'synthetic.mp4'}});
  assert.equal(r.status,400);const failure=await r.json();assert.match(failure.error,/FFPROBE_JSON_INVALID/);assert.equal(failure.pendingImports.length,1);
  assert.ok(!failure.error.includes(dir));
 }finally{if(server)await server.close();if(previous===undefined)delete process.env.AIVS_FFMPEG_DIR;else process.env.AIVS_FFMPEG_DIR=previous;await rm(dir,{recursive:true,force:true});}
});

test('changed pending bytes and stale revisions cannot edit a project or erase the retained copy',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-pending-integrity-'));const previous=process.env.AIVS_FFMPEG_DIR;let server;
 try{
  const source=join(dir,'synthetic.mp4');await exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=1','-c:v','libx264',source]);
  const bytes=await readFile(source);process.env.AIVS_FFMPEG_DIR=join(dir,'missing');server=await startServer({workspace:join(dir,'data'),port:0});
  const call=(path,revision,options={})=>fetch(server.url+path,{...options,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(revision),...options.headers}});
  const r=await call('/api/import?kind=video',0,{method:'POST',body:bytes,headers:{'X-File-Name':'synthetic.mp4'}});assert.equal(r.status,400);
  const failure=await r.json(),id=failure.pendingImports[0].uploadId;
  const stale=await call('/api/import/retry',-1,{method:'POST',body:JSON.stringify({uploadId:id})});assert.equal(stale.status,409);
  const staged=join(dir,'data','assets',id+'.mp4.tmp'),changed=Buffer.from(bytes);changed[changed.length-1]^=1;await writeFile(staged,changed);
  if(previous===undefined)delete process.env.AIVS_FFMPEG_DIR;else process.env.AIVS_FFMPEG_DIR=previous;
  const retry=await call('/api/import/retry',0,{method:'POST',body:JSON.stringify({uploadId:id})});assert.equal(retry.status,400);assert.match((await retry.json()).error,/IMPORT_BYTES_CHANGED/);
  const state=await(await call('/api/state',0)).json();assert.equal(state.sources.length,0);assert.equal(state.session.project.revision,0);assert.equal(state.pendingImports.length,1);
  assert.deepEqual(await readFile(staged),changed);assert.deepEqual(await readFile(source),bytes);
 }finally{if(server)await server.close();if(previous===undefined)delete process.env.AIVS_FFMPEG_DIR;else process.env.AIVS_FFMPEG_DIR=previous;await rm(dir,{recursive:true,force:true});}
});

test('completed upload survives failed probe and restart; explicit retry uses retained bytes only',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-import-retry-'));
 const previous=process.env.AIVS_FFMPEG_DIR;let server;
 try{
  const source=join(dir,'synthetic.mp4');await exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=1','-c:v','libx264',source]);
  const bytes=await readFile(source),digest=createHash('sha256').update(bytes).digest('hex');
  const tools=previous||dirname((await exec(process.env.AIVS_PYTHON||'python3',['-c','import shutil;print(shutil.which("ffprobe"))'])).stdout.trim());
  process.env.AIVS_FFMPEG_DIR=join(dir,'missing-tools');
  server=await startServer({workspace:join(dir,'data'),port:0});
  const call=(path,revision,options={})=>fetch(server.url+path,{...options,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(revision),...options.headers}});
  const response=await call('/api/import?kind=video',0,{method:'POST',body:bytes,headers:{'X-File-Name':'synthetic.mp4'}});
  assert.equal(response.status,400);const failure=await response.json();assert.match(failure.error,/FFMPEG_TOOLCHAIN_INCOMPLETE/);
  let state=await(await call('/api/state',0)).json();assert.equal(state.sources.length,0);
  assert.equal(state.pendingImports?.length,1,'completed bytes must be retained, not discarded after a probe failure');
  const denied=await fetch(server.url+'/api/state');assert.equal(denied.status,403);
  assert.equal(Object.hasOwn(await denied.json(),'pendingImports'),false,'unvalidated media labels are still private');
  const pending=state.pendingImports[0];assert.equal(pending.bytes,bytes.length);
  await server.close();server=await startServer({workspace:join(dir,'data'),port:0});
  state=await(await call('/api/state',0)).json();assert.equal(state.pendingImports[0].uploadId,pending.uploadId);
  process.env.AIVS_FFMPEG_DIR=tools;
  const retry=await call('/api/import/retry',0,{method:'POST',body:JSON.stringify({uploadId:pending.uploadId})});
  assert.equal(retry.status,200,await retry.clone().text());state=await retry.json();
  assert.equal(state.pendingImports.length,0);assert.equal(state.sources.length,1);
  assert.equal(state.session.project.sourceRefs[0].sha256,digest);const revision=state.session.project.revision;
  const duplicate=await call('/api/import/retry',revision,{method:'POST',body:JSON.stringify({uploadId:pending.uploadId})});
  assert.equal(duplicate.status,200);const again=await duplicate.json();assert.equal(again.sources.length,1);assert.equal(again.session.project.revision,revision);
  assert.deepEqual(await readFile(source),bytes);
 }finally{if(server)await server.close();if(previous===undefined)delete process.env.AIVS_FFMPEG_DIR;else process.env.AIVS_FFMPEG_DIR=previous;await rm(dir,{recursive:true,force:true});}
});
