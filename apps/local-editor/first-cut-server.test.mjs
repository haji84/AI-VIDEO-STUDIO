/** Actual loopback -> signal worker -> MP4. Does not execute browser UI. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {startServer} from './server.mjs';
import {applyClipEdit} from './edits.mjs';
const exec=promisify(execFile),root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),delay=ms=>new Promise(r=>setTimeout(r,ms));
test('first-cut preview persists; explicit apply preserves four buses and actual selected footage/audio',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-firstcut-http-'));let server,state;
 try{
  await exec('python',['-c','from engine.test_saved_first_cut import make_media; from pathlib import Path; import sys; make_media(Path(sys.argv[1]))',join(dir,'media')],{cwd:root});
  await exec('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=880:sample_rate=16000:duration=4',join(dir,'tone.wav')]);
  server=await startServer({workspace:join(dir,'data'),port:0});
  const call=async(path,opts={})=>{const r=await fetch(server.url+path,{...opts,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(state?.session.project.revision??0),...opts.headers}});
    if(r.ok&&r.headers.get('content-type')?.startsWith('application/json')){const data=await r.clone().json();if(data.session)state=data;}return r;};
  const post=(path,body)=>call(path,{method:'POST',...(body?{body:JSON.stringify(body)}:{})});
  const wait=async path=>{let j;for(let i=0;i<300;i++){j=await(await call(path)).json();if(j.status!=='RUNNING')return j;await delay(100);}assert.fail('bounded worker timed out');};
  const first=await call('/api/first-cut');assert.equal(first.status,200,await first.clone().text());assert.equal((await fetch(server.url+'/api/first-cut')).status,403);
  for(const name of ['master','clear','unverified']){const bytes=await readFile(join(dir,'media',name+'.mp4'));assert.equal((await call('/api/import?kind=video',{method:'POST',headers:{'X-File-Name':name+'.mp4','Content-Length':String(bytes.length)},body:bytes})).status,200);}
  for(const kind of ['bgm','narration','sfx']){const bytes=await readFile(join(dir,'tone.wav'));assert.equal((await call('/api/import?kind='+kind,{method:'POST',headers:{'X-File-Name':'tone.wav','Content-Length':String(bytes.length)},body:bytes})).status,200);}
  const edit=structuredClone(state.session.project);edit.sourceRefs[1].syncStatus='verified';for(const c of edit.audioClips)if(c.bus!=='source')c.gainDb=-24;await post('/api/edit',edit);
  const before=structuredClone(state.session.project);assert.equal((await post('/api/first-cut',{mode:'training'})).status,202);
  assert.equal((await post('/api/render')).status,409);assert.equal((await post('/api/sync',{masterId:before.sourceRefs[0].assetId,targetId:before.sourceRefs[2].assetId})).status,409);
  let j=await wait('/api/first-cut');assert.equal(j.status,'PASS',JSON.stringify(j));assert.equal(j.report.proposal.timeline[0].sourceId,before.sourceRefs[1].assetId);
  assert.deepEqual(j.report.proposal.evidence.blockedCameraIds,[before.sourceRefs[2].assetId]);assert.deepEqual((await(await call('/api/state')).json()).session.project,before);
  assert.equal((await post('/api/first-cut/apply',{analysisId:j.id,confirmed:false})).status,400);
  await server.close();server=await startServer({workspace:join(dir,'data'),port:0});assert.deepEqual((await(await call('/api/first-cut')).json()).report,j.report);
  // Evidence is rejected when selected bytes change between analysis and apply.
  const registry=JSON.parse(await readFile(join(dir,'data','media.json'))),entry=registry.find(e=>e.assetId===before.sourceRefs[1].assetId),source=join(dir,'data','assets',entry.file),original=await readFile(source);
  await writeFile(source,Buffer.from('changed'));assert.equal((await post('/api/first-cut/apply',{analysisId:j.id,confirmed:true})).status,400);await writeFile(source,original);
  assert.equal((await post('/api/first-cut/apply',{analysisId:j.id,confirmed:true})).status,200);const applied=structuredClone(state.session.project);
  assert.deepEqual(applied.audioClips,before.audioClips);assert.deepEqual(applied.audioBuses,before.audioBuses);assert.equal(applied.timeline[0].sourceId,before.sourceRefs[1].assetId);
  assert.equal((await post('/api/first-cut/apply',{analysisId:j.id,confirmed:true})).status,400);
  await post('/api/undo');assert.deepEqual(state.session.project.timeline,before.timeline);await post('/api/redo');assert.deepEqual(state.session.project.timeline,applied.timeline);
  await server.close();server=await startServer({workspace:join(dir,'data'),port:0});state=await(await call('/api/state')).json();assert.deepEqual(state.session.project.timeline,applied.timeline);assert.equal(state.firstCut.stale,true);
  const manual=applyClipEdit(state.session.project,0,{caption:'FIRST CUT REVIEWED'});assert.equal((await post('/api/edit',manual)).status,200);assert.deepEqual(state.session.project.audioClips,before.audioClips);assert.equal(state.session.project.timeline[0].effects[0].parameters.text,'FIRST CUT REVIEWED');
  assert.equal((await post('/api/render')).status,202);const job=await wait('/api/job');assert.equal(job.status,'PASS',JSON.stringify(job));
  const output=join(dir,'out.mp4');await writeFile(output,Buffer.from(await(await call(job.download)).arrayBuffer()));await exec('ffmpeg',['-v','error','-xerror','-i',output,'-f','null','-']);
  const image=(await exec('ffmpeg',['-v','error','-ss','1','-i',output,'-frames:v','1','-vf','scale=32:18','-f','rawvideo','-pix_fmt','gray','pipe:1'],{encoding:'buffer'})).stdout;
  const mean=[...image].reduce((a,b)=>a+b,0)/image.length,contrast=Math.sqrt([...image].reduce((a,b)=>a+(b-mean)**2,0)/image.length);assert.ok(contrast>20,'proposal-selected clear camera absent');
  const pcm=(await exec('ffmpeg',['-v','error','-i',output,'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:256*1024})).stdout;
  const amplitude=f=>{let sin=0,cos=0;for(let i=0;i<pcm.length/4;i++){const v=pcm.readFloatLE(4*i),t=2*Math.PI*f*i/8000;sin+=v*Math.sin(t);cos+=v*Math.cos(t);}return 2*Math.hypot(sin,cos)/(pcm.length/4);};
  assert.ok(amplitude(440)>.04,'owned master audio lost');assert.ok(amplitude(440)>amplitude(660)*5,'camera audio replaced owned soundtrack');assert.ok(amplitude(880)>.005,'extra buses absent');
  const qa=await(await call('/api/qa')).json();console.log('first-cut synthetic evidence '+JSON.stringify({sourceHashes:before.sourceRefs.map(s=>s.sha256),cuts:applied.timeline.length,selectedSourceId:applied.timeline[0].sourceId,blockedCameras:j.report.proposal.evidence.blockedCameraIds.length,contrast,master440:amplitude(440),camera660:amplitude(660),buses880:amplitude(880),outputSha256:qa.sha256,inspection:qa.inspection.status}));
  await server.close();server=undefined;const reportFile=join(dir,'data','first-cut',j.id,'report.json');await writeFile(reportFile,'{}');
  server=await startServer({workspace:join(dir,'data'),port:0});assert.equal((await(await call('/api/first-cut')).json()).status,'FAIL');await server.close();server=undefined;
  await writeFile(join(dir,'data','last-first-cut.json'),JSON.stringify({status:'RUNNING'}));server=await startServer({workspace:join(dir,'data'),port:0});assert.equal((await(await call('/api/first-cut')).json()).status,'INTERRUPTED');
 }finally{if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});

test('missing persisted analysis report is a visible failure',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-firstcut-missing-'));let server;
 try{server=await startServer({workspace:join(dir,'data'),port:0});await server.close();server=undefined;
  await writeFile(join(dir,'data','last-first-cut.json'),JSON.stringify({id:'a'.repeat(32),status:'PASS',reportSha256:'a'.repeat(64)}));
  server=await startServer({workspace:join(dir,'data'),port:0});const j=await(await fetch(server.url+'/api/first-cut',{headers:{'X-AIVS-Token':server.token}})).json();assert.equal(j.status,'FAIL');
 }finally{if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});
