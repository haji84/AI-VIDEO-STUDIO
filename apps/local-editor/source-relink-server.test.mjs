/** Actual loopback HTTP, generated media and two workspaces. No browser/device claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,rename,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {startServer} from './server.mjs';
import {createProject,EditSession} from '../../packages/project/project.mjs';
import {mountSourceRelink} from './source-relink-panel.mjs';
const exec=promisify(execFile),delay=ms=>new Promise(r=>setTimeout(r,ms));
const sha=b=>createHash('sha256').update(b).digest('hex');
const post=body=>({method:'POST',body:JSON.stringify(body)});
async function client(workspace){
 let server=await startServer({workspace,port:0}),state;
 const call=async(path,options={})=>{
  const response=await fetch(server.url+path,{...options,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(state?.session.project.revision??0),...options.headers}});
  if(response.ok&&response.headers.get('content-type')?.startsWith('application/json')){const data=await response.clone().json();if(data.session)state=data;}
  return response;
 };
 await call('/api/state');
 return {call,state:()=>state,server:()=>server,
  close:async()=>{if(server){await server.close();server=undefined;}},
  restart:async()=>{await server.close();server=await startServer({workspace,port:0});await call('/api/state');}};
}
async function ok(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
const media=(c,path,bytes,label)=>c.call(path,{method:'POST',headers:{'X-File-Name':encodeURIComponent(label),'Content-Length':String(bytes.length)},body:bytes});
async function fixtures(dir){
 const video=join(dir,'source.mp4'),audio=join(dir,'music.wav'),wrong=join(dir,'wrong.wav');
 await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=2',
  '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:v','libx264','-c:a','aac','-shortest',video]);
 for(const [file,frequency] of [[audio,880],[wrong,660]])await exec('ffmpeg',['-v','error','-f','lavfi','-i',`sine=frequency=${frequency}:sample_rate=48000:duration=2`,'-c:a','pcm_s16le',file]);
 return {video,audio,wrong,videoBytes:await readFile(video),audioBytes:await readFile(audio),wrongBytes:await readFile(wrong)};
}

test('saved edit and historical-only audio recover in another workspace, resume after failure and export actual MP4',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-relink-http-')),aDir=join(dir,'workspace-a'),bDir=join(dir,'workspace-b');let a,b;
 try{
  const f=await fixtures(dir);a=await client(aDir);
  await ok(await media(a,'/api/import?kind=video',f.videoBytes,'source.mp4'));
  const edited=structuredClone(a.state().session.project);edited.name='Saved recovery edit';edited.timeline[0].durationSec=1.5;edited.audioClips[0].endSec=1.5;
  await ok(await a.call('/api/edit',post(edited)));
  await ok(await media(a,'/api/import?kind=bgm',f.audioBytes,'music.wav'));
  await ok(await a.call('/api/undo',{method:'POST'}));
  const saved=structuredClone(a.state().session),savedBytes=await readFile(join(aDir,'project.aivs.json'));
  assert.equal(saved.project.sourceRefs.length,1);assert.equal(saved.redo[0].sourceRefs.length,2);assert.ok(saved.undo.length>0);
  const videoId=saved.project.sourceRefs[0].assetId,audioId=saved.redo[0].sourceRefs.find(x=>x.mediaKind==='audio').assetId;
  const oldRegistry=await readFile(join(aDir,'media.json')),oldCopies=await Promise.all(JSON.parse(oldRegistry).map(x=>readFile(join(aDir,'assets',x.file))));
  b=await client(bDir);const initial=structuredClone(b.state().session),initialBytes=await readFile(join(bDir,'project.aivs.json'));
  assert.equal((await b.call('/api/open',post(saved))).status,400);
  let plan=await ok(await b.call('/api/relink/prepare',post(saved)));
  assert.equal(plan.total,2);assert.equal(plan.available,0);assert.equal(plan.ready,false);assert.equal(plan.missing.length,2);
  plan=await ok(await media(b,'/api/relink/media?id='+plan.planId,f.videoBytes,'renamed-original.mp4'));
  assert.equal(plan.available,1);assert.equal(plan.ready,false);
  assert.equal((await b.call('/api/relink/open',post({planId:plan.planId}))).status,400,'historical-only audio is required before Open');
  const wrong=await media(b,'/api/relink/media?id='+plan.planId,f.wrongBytes,'music.wav');assert.equal(wrong.status,400);assert.match(await wrong.text(),/SOURCE_NOT_IN_PROJECT/);
  await b.call('/api/state');assert.deepEqual(b.state().session,initial);assert.deepEqual(await readFile(join(bDir,'project.aivs.json')),initialBytes);
  const retained=JSON.parse(await readFile(join(bDir,'media.json')));assert.equal(retained.length,1);assert.equal(retained[0].assetId,videoId);
  assert.equal(sha(await readFile(join(bDir,'assets',retained[0].file))),sha(f.videoBytes));
  const obsoletePlanId=plan.planId;await b.restart();assert.deepEqual(b.state().session,initial);
  assert.equal((await b.call('/api/relink/open',post({planId:obsoletePlanId}))).status,400);
  plan=await ok(await b.call('/api/relink/prepare',post(saved)));assert.equal(plan.available,1);assert.equal(plan.ready,false);
  plan=await ok(await media(b,'/api/relink/media?id='+plan.planId,f.audioBytes,'music.wav'));
  assert.equal(plan.ready,true);assert.equal(plan.available,2);assert.deepEqual(await readFile(join(bDir,'project.aivs.json')),initialBytes);
  await ok(await b.call('/api/relink/open',post({planId:plan.planId})));
  const expected=structuredClone(saved);expected.project.revision=initial.project.revision+1;assert.deepEqual(b.state().session,expected);
  assert.deepEqual(b.state().session.undo,saved.undo);assert.deepEqual(b.state().session.redo,saved.redo);
  assert.equal((await b.call('/api/relink/open',post({planId:plan.planId}))).status,400);
  await ok(await b.call('/api/redo',{method:'POST'}));assert.equal(b.state().session.project.sourceRefs[1].assetId,audioId);
  await ok(await b.call('/api/undo',{method:'POST'}));assert.equal(b.state().session.project.sourceRefs.length,1);
  await ok(await b.call('/api/redo',{method:'POST'}));
  const recovered=structuredClone(b.state().session);await b.restart();assert.deepEqual(b.state().session,recovered);
  const next=structuredClone(b.state().session.project);next.audioBuses.bgm.gainDb=-3;
  await ok(await b.call('/api/edit',post(next)));const beforeRender=await readFile(join(bDir,'project.aivs.json'));
  await ok(await b.call('/api/render',{method:'POST'}),202);let job;
  for(let i=0;i<300;i++){job=await(await b.call('/api/job')).json();if(job.status!=='RUNNING')break;await delay(100);}
  assert.equal(job.status,'PASS',JSON.stringify(job));
  const report=await ok(await b.call('/api/qa')),output=Buffer.from(await(await b.call(job.download)).arrayBuffer()),outFile=join(dir,'restored-output.mp4');
  assert.equal(sha(output),report.sha256);assert.equal(report.projectId,saved.project.projectId);assert.equal(report.projectRevision,b.state().session.project.revision);
  await writeFile(outFile,output);await exec('ffmpeg',['-v','error','-xerror','-i',outFile,'-f','null','-']);
  const decoded=await exec('ffmpeg',['-v','error','-i',outFile,'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:1024**2});
  let real=0,imaginary=0;for(let i=0;i<24000;i++){const x=decoded.stdout.readFloatLE((4800+i)*4),angle=2*Math.PI*880*i/48000;real+=x*Math.cos(angle);imaginary-=x*Math.sin(angle);}
  assert.ok(2*Math.hypot(real,imaginary)/24000>.004,'historical-only BGM must be audible after Redo and export');
  assert.deepEqual(await readFile(join(bDir,'project.aivs.json')),beforeRender);
  assert.deepEqual(await readFile(join(aDir,'project.aivs.json')),savedBytes);assert.deepEqual(await readFile(join(aDir,'media.json')),oldRegistry);
  const aEntries=JSON.parse(oldRegistry);for(let i=0;i<aEntries.length;i++)assert.deepEqual(await readFile(join(aDir,'assets',aEntries[i].file)),oldCopies[i]);
  for(const [path,bytes] of [[f.video,f.videoBytes],[f.audio,f.audioBytes],[f.wrong,f.wrongBytes]])assert.deepEqual(await readFile(path),bytes);
  const recoveredRegistry=JSON.parse(await readFile(join(bDir,'media.json')));assert.deepEqual(new Set(recoveredRegistry.map(x=>x.assetId)),new Set([videoId,audioId]));
  for(const e of recoveredRegistry)assert.equal(sha(await readFile(join(bDir,'assets',e.file))),e.source.sha256);
  assert.equal((await readdir(join(bDir,'assets'))).some(x=>x.endsWith('.tmp')),false);
  console.log('source-relink synthetic evidence '+JSON.stringify({videoSha256:sha(f.videoBytes),audioSha256:sha(f.audioBytes),wrongAudioSha256:sha(f.wrongBytes),savedSessionSha256:sha(savedBytes),previousWorkspaceSha256:sha(initialBytes),outputSha256:sha(output),outputBytes:output.length,wholeFileDecode:'PASS',historicalAudioAudible:true,originalsAndFirstWorkspaceUnchanged:true,partialFailurePreservesSession:true,restartRequiresExplicitOpen:true,physicalDeviceAcceptance:'NOT_RUN'}));
 }finally{if(a)await a.close();if(b)await b.close();await rm(dir,{recursive:true,force:true});}
});

test('old source IDs need explicit recovery and stale, forged or external requests cannot replace the current edit',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-relink-guards-'));let c;
 try{
  const f=await fixtures(dir);c=await client(join(dir,'data'));
  const script=await fetch(c.server().url+'/source-relink-panel.mjs');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);
  const served=await import('data:text/javascript;base64,'+Buffer.from(await script.text()).toString('base64'));assert.equal(typeof served.mountSourceRelink,'function');
  await ok(await media(c,'/api/import?kind=video',f.videoBytes,'source.mp4'));
  const saved=structuredClone(c.state().session),oldId=saved.project.sourceRefs[0].assetId,newId='asset_'+'1'.repeat(32);
  for(const p of [saved.project,...saved.undo,...saved.redo]){
   for(const s of p.sourceRefs)if(s.assetId===oldId)s.assetId=newId;
   for(const clip of p.timeline)if(clip.sourceId===oldId)clip.sourceId=newId;
   for(const clip of p.audioClips)if(clip.assetId===oldId)clip.assetId=newId;
  }
  assert.equal((await c.call('/api/open',post(saved))).status,400,'normal import gave identical bytes a different source ID');
  let plan=await ok(await c.call('/api/relink/prepare',post(saved)));assert.equal(plan.ready,true,'explicit recovery may verify and reuse those bytes');
  assert.equal((await fetch(c.server().url+'/api/relink/prepare',post(saved))).status,403);
  assert.equal((await c.call('/api/relink/prepare',{...post(saved),headers:{Origin:'https://example.invalid'}})).status,403);
  assert.equal((await c.call('/api/relink/open',post({planId:'f'.repeat(32)}))).status,400);
  const edited=structuredClone(c.state().session.project);edited.name='newer tab edit';await ok(await c.call('/api/edit',post(edited)));
  const newer=structuredClone(c.state().session);
  assert.equal((await c.call('/api/relink/open',post({planId:plan.planId}))).status,409);
  assert.equal((await media(c,'/api/relink/media?id='+plan.planId,f.videoBytes,'source.mp4')).status,409);assert.deepEqual(c.state().session,newer);
  plan=await ok(await c.call('/api/relink/prepare',post(saved)));
  const other=JSON.parse(new EditSession(createProject({projectId:'project_other'})).serialize());await ok(await c.call('/api/open',post(other)));
  assert.equal((await c.call('/api/relink/open',post({planId:plan.planId}))).status,409);assert.equal(c.state().session.project.projectId,'project_other');
  const newerPlan=await ok(await c.call('/api/relink/prepare',post(saved)));assert.equal(newerPlan.ready,true);
  await ok(await c.call('/api/relink/cancel',post({planId:newerPlan.planId})));
  assert.equal((await c.call('/api/relink/open',post({planId:newerPlan.planId}))).status,400);assert.equal(c.state().session.project.projectId,'project_other');
 }finally{if(c)await c.close();await rm(dir,{recursive:true,force:true});}
});

test('a failed final disk commit keeps the current session and retained verified media usable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-relink-write-')),workspace=join(dir,'data');let c;
 try{
  const f=await fixtures(dir);c=await client(workspace);await ok(await media(c,'/api/import?kind=video',f.videoBytes,'source.mp4'));
  const candidate=structuredClone(c.state().session);candidate.project.name='Pending replacement';
  const before=structuredClone(c.state().session),projectFile=join(workspace,'project.aivs.json'),backup=projectFile+'.test-backup',beforeBytes=await readFile(projectFile);
  const plan=await ok(await c.call('/api/relink/prepare',post(candidate)));assert.equal(plan.ready,true);
  // Filesystem fault injection: an unreplaceable directory at the destination.
  await rename(projectFile,backup);await mkdir(projectFile);
  assert.equal((await c.call('/api/relink/open',post({planId:plan.planId}))).status,400);
  await c.call('/api/state');assert.deepEqual(c.state().session,before);assert.deepEqual(await readFile(backup),beforeBytes);
  await rm(projectFile,{recursive:true});await rename(backup,projectFile);await c.restart();assert.deepEqual(c.state().session,before);
  const retried=await ok(await c.call('/api/relink/prepare',post(candidate)));assert.equal(retried.ready,true);
  await ok(await c.call('/api/relink/open',post({planId:retried.planId})));assert.equal(c.state().session.project.name,'Pending replacement');
 }finally{if(c)await c.close();await rm(dir,{recursive:true,force:true});}
});

test('API-created video and BGM roles of the same MP4 recover once, but audio-only bytes cannot become video',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-relink-roles-'));let a,b;
 try{
  const f=await fixtures(dir);a=await client(join(dir,'a'));b=await client(join(dir,'b'));
  await ok(await media(a,'/api/import?kind=video',f.videoBytes,'source.mp4'));
  await ok(await media(a,'/api/import?kind=bgm',f.videoBytes,'same-source.mp4'));
  const saved=structuredClone(a.state().session);assert.deepEqual(saved.project.sourceRefs.map(x=>x.mediaKind),['video','audio']);
  assert.equal(saved.project.sourceRefs[0].sha256,saved.project.sourceRefs[1].sha256);
  let plan=await ok(await b.call('/api/relink/prepare',post(saved)));
  plan=await ok(await media(b,'/api/relink/media?id='+plan.planId,f.videoBytes,'selected.mp4'));assert.equal(plan.ready,true);assert.equal(plan.available,2);
  const registry=JSON.parse(await readFile(join(dir,'b','media.json')));assert.equal(new Set(registry.map(x=>x.file)).size,1);
  await ok(await b.call('/api/relink/open',post({planId:plan.planId})));
  assert.deepEqual(b.state().session.project.sourceRefs,saved.project.sourceRefs);assert.deepEqual(b.state().session.project.audioClips,saved.project.audioClips);
  await ok(await media(a,'/api/import?kind=bgm',f.audioBytes,'audio-only.wav'));
  const actualAudio=a.state().session.project.sourceRefs.at(-1),before=structuredClone(a.state().session);
  const falseVideo={...actualAudio,assetId:'asset_'+'f'.repeat(32),mediaKind:'video'};
  const invalid=JSON.parse(new EditSession(createProject({projectId:'project_false_video',sourceRefs:[falseVideo]})).serialize());
  const rejected=await a.call('/api/relink/prepare',post(invalid));assert.equal(rejected.status,400);assert.match(await rejected.text(),/SOURCE_METADATA_MISMATCH/);
  await a.call('/api/state');assert.deepEqual(a.state().session,before);assert.deepEqual(await readFile(f.audio),f.audioBytes);
 }finally{if(a)await a.close();if(b)await b.close();await rm(dir,{recursive:true,force:true});}
});

test('Cancel cannot hide a final Open already committed by the real server while its UI response is delayed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-relink-open-response-')),oldDocument=globalThis.document;
 let c,pending,committed,release;const committedPromise=new Promise(r=>{committed=r;}),released=new Promise(r=>{release=r;});
 class Element{
  children=[];textContent='';value='';disabled=false;hidden=false;files=[];
  append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}setAttribute(name,value){this[name]=value;}
 }
 function find(root,id){if(root.id===id)return root;for(const child of root.children){const result=find(child,id);if(result)return result;}}
 try{
  c=await client(join(dir,'data'));let displayed=structuredClone(c.state());const priorId=displayed.session.project.projectId,shown=[],notices=[],calls=[];
  const candidate=JSON.parse(new EditSession(createProject({projectId:'project_committed_open'})).serialize()),body=JSON.stringify(candidate);
  globalThis.document={createElement:()=>new Element()};const container=new Element(),fileInput=new Element();
  mountSourceRelink({container,fileInput,current:()=>displayed,notice:x=>notices.push(x),onOpen:state=>{displayed=state;shown.push(state);},request:async(path,options)=>{
   calls.push(path);const data=await ok(await c.call(path,options));if(path==='/api/relink/open'){committed();await released;}return data;
  }});
  fileInput.files=[{name:'saved.json',size:Buffer.byteLength(body),text:async()=>body}];await fileInput.onchange();
  pending=find(container,'source-relink-open').onclick();await committedPromise;
  assert.equal(c.state().session.project.projectId,'project_committed_open');assert.equal(displayed.session.project.projectId,priorId);
  const cancel=find(container,'source-relink-cancel');assert.equal(cancel.disabled,true,'committed Open must not advertise cancellation');
  await cancel.onclick();assert.equal(calls.includes('/api/relink/cancel'),false);assert.equal(notices.some(x=>x.includes('キャンセルしました')),false);
  release();await pending;pending=undefined;
  assert.equal(shown.length,1);assert.equal(displayed.session.project.projectId,'project_committed_open');assert.equal(container.hidden,true);
  assert.equal((await ok(await c.call('/api/state'))).session.project.projectId,displayed.session.project.projectId);
 }finally{release();if(pending)await pending;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(c)await c.close();await rm(dir,{recursive:true,force:true});}
});
