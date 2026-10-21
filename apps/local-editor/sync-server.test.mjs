/** Real loopback/worker/media test. No physical-browser result is implied. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {startServer} from './server.mjs';
import {cameraSourceIn} from './edits.mjs';
const exec=promisify(execFile),root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),delay=ms=>new Promise(r=>setTimeout(r,ms));
test('candidate remains read-only over restart; explicit current confirmation enables real camera output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-sync-http-'));let server;
 try{
  await exec('python',['-c','from engine.test_saved_sync import make_media; from pathlib import Path; import sys; make_media(Path(sys.argv[1]))',join(dir,'media')],{cwd:root});
  server=await startServer({workspace:join(dir,'data'),port:0});let state;
  const call=async(path,opts={})=>{const r=await fetch(server.url+path,{...opts,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(state?.session.project.revision??0),...opts.headers}});
    if(r.ok&&r.headers.get('content-type')?.startsWith('application/json')){const data=await r.clone().json();if(data.session)state=data;}return r;};
  assert.equal((await fetch(server.url+'/api/sync')).status,403);
  for(const name of ['master','target','silent']){const bytes=await readFile(join(dir,'media',name+'.mp4'));
    const r=await call('/api/import?kind=video',{method:'POST',headers:{'X-File-Name':name+'.mp4','Content-Length':String(bytes.length)},body:bytes});assert.equal(r.status,200,await r.clone().text());}
  const p=structuredClone(state.session.project);p.timeline[0].sourceInSec=5;p.timeline[0].durationSec=2;p.audioClips[0].trimInSec=5;p.audioClips[0].endSec=2;
  await call('/api/edit',{method:'POST',body:JSON.stringify(p)});
  const [master,target,silent]=state.session.project.sourceRefs,before=structuredClone(state.session.project);
  const start=await call('/api/sync',{method:'POST',body:JSON.stringify({masterId:master.assetId,targetId:target.assetId})});assert.equal(start.status,202,await start.clone().text());
  let job;for(let i=0;i<300;i++){job=await(await call('/api/sync')).json();if(job.status!=='RUNNING')break;await delay(100);}
  assert.equal(job.status,'PASS',JSON.stringify(job));assert.equal(job.report.status,'CANDIDATE');assert.ok(Math.abs(job.report.candidateOffsetSec-2)<.21);
  assert.deepEqual((await(await call('/api/state')).json()).session.project,before);
  assert.equal((await call('/api/sync/apply',{method:'POST',body:JSON.stringify({analysisId:job.id,confirmed:false})})).status,400);
  await server.close();server=await startServer({workspace:join(dir,'data'),port:0});
  assert.deepEqual((await(await call('/api/sync')).json()).report,job.report);
  assert.equal((await call('/api/sync/apply',{method:'POST',body:JSON.stringify({analysisId:job.id,confirmed:true})})).status,200);
  assert.equal(state.session.project.sourceRefs[1].syncStatus,'verified');assert.ok(Math.abs(state.session.project.sourceRefs[1].offsetSec-2)<.21);
  assert.deepEqual(state.session.project.audioClips,before.audioClips);assert.deepEqual(state.session.project.timeline,before.timeline);
  assert.equal((await call('/api/sync/apply',{method:'POST',body:JSON.stringify({analysisId:job.id,confirmed:true})})).status,400);
  // Use the confirmed shared clock while preserving deliberate master soundtrack.
  const edit=structuredClone(state.session.project),cameraTime=cameraSourceIn(edit,0,target.assetId);assert.equal(cameraTime,3);edit.timeline[0].sourceId=target.assetId;edit.timeline[0].sourceInSec=cameraTime;
  await call('/api/edit',{method:'POST',body:JSON.stringify(edit)});
  assert.equal((await call('/api/render',{method:'POST'})).status,202);let render;
  for(let i=0;i<300;i++){render=await(await call('/api/job')).json();if(render.status!=='RUNNING')break;await delay(100);}
  assert.equal(render.status,'PASS',JSON.stringify(render));const output=join(dir,'out.mp4');await writeFile(output,Buffer.from(await(await call(render.download+'?token='+server.token)).arrayBuffer()));
  await exec('ffmpeg',['-v','error','-xerror','-i',output,'-f','null','-']);
  const pcm=(await exec('ffmpeg',['-v','error','-i',output,'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:256*1024})).stdout;
  let power=0;for(let i=0;i<pcm.length;i+=4)power+=pcm.readFloatLE(i)**2;assert.ok(Math.sqrt(power/(pcm.length/4))>.005,'selected original audio missing');
  const qa=await(await call('/api/qa')).json();console.log('sync synthetic evidence '+JSON.stringify({masterSha256:master.sha256,targetSha256:target.sha256,candidateOffsetSec:job.report.candidateOffsetSec,confidence:job.report.confidence,uniqueness:job.report.uniqueness,outputSha256:qa.sha256,originalAudioRms:Math.sqrt(power/(pcm.length/4))}));
  const image=(await exec('ffmpeg',['-v','error','-ss','0.5','-i',output,'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer'})).stdout;assert.ok(image[0]>image[2]+80,'confirmed red camera absent');
  assert.equal((await call('/api/sync',{method:'POST',body:JSON.stringify({masterId:master.assetId,targetId:silent.assetId})})).status,202);
  for(let i=0;i<300;i++){job=await(await call('/api/sync')).json();if(job.status!=='RUNNING')break;await delay(100);}
  assert.equal(job.status,'PASS');assert.equal(job.report.status,'UNVERIFIED');assert.equal((await call('/api/sync/apply',{method:'POST',body:JSON.stringify({analysisId:job.id,confirmed:true})})).status,400);
 }finally{if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});
