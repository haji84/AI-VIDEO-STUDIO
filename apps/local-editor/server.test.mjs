import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import * as app from './server.mjs';
const exec=promisify(execFile);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('exports actual local application starter',()=>assert.equal(typeof app.startServer,'function'));
test('private editing state cannot be written into the public source checkout',async()=>{
  const dir=resolve(dirname(fileURLToPath(import.meta.url)),'../..','workspace-test-'+randomUUID());
  try{await assert.rejects(async()=>{const s=await app.startServer({workspace:dir,port:0});await s.close();},/WORKSPACE_MUST_BE_OUTSIDE_SOURCE/);}
  finally{await rm(dir,{recursive:true,force:true});}
});
test('local import/edit/history/restart/render is usable and protected',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'aivs-editor-'));let server;
  try{
    const source=join(dir,'synthetic.mp4');
    await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=320x180:r=30:d=2',
      '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:v','libx264','-c:a','aac','-shortest',source]);
    const bytes=await readFile(source);server=await app.startServer({workspace:join(dir,'data'),port:0});
    await assert.rejects(async()=>{const duplicate=await app.startServer({workspace:join(dir,'data'),port:0});await duplicate.close();},/WORKSPACE_IN_USE/);
    let state={session:{project:{revision:0}}};
    const request=async(path,opts={})=>{const r=await fetch(server.url+path,{...opts,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(state.session.project.revision),...opts.headers}});
      if(r.ok&&r.headers.get('content-type')?.startsWith('application/json')){const d=await r.clone().json();if(d.session)state=d;}return r;};
    assert.equal((await fetch(server.url+'/api/state')).status,403);
    assert.equal((await fetch(server.url+'/api/qa')).status,403);
    assert.equal((await request('/api/qa')).status,404);
    assert.equal((await request('/api/state',{headers:{Origin:'https://example.invalid'}})).status,403);
    const result=await request('/api/import?kind=video',{method:'POST',headers:{'X-File-Name':'synthetic.mp4','Content-Length':String(bytes.length)},body:bytes});
    assert.equal(result.status,200,await result.clone().text());
    state=await result.json();assert.equal(state.session.project.timeline.length,1);
    const project=state.session.project;project.name='Local saved edit';project.timeline[0].durationSec=1;
    project.timeline[0].effects=[{effectId:'effect_caption',version:1,type:'caption',startSec:0,endSec:1,parameters:{text:'SYNTHETIC'},keyframes:[]}];
    project.audioClips[0].endSec=1;
    assert.equal((await request('/api/edit',{method:'POST',body:JSON.stringify(project)})).status,200);
    const stale=structuredClone(project);stale.exportProfile='fullhd';
    const conflict=await request('/api/edit',{method:'POST',body:JSON.stringify(stale)});
    assert.equal(conflict.status,409);assert.match(await conflict.text(),/REVISION_CONFLICT/);
    assert.equal((await(await request('/api/state')).json()).session.project.name,'Local saved edit');
    assert.equal((await request('/api/undo',{method:'POST',headers:{'X-AIVS-Revision':String(project.revision)}})).status,409);
    await request('/api/undo',{method:'POST'});state=await(await request('/api/state')).json();
    assert.equal(state.session.project.timeline[0].durationSec,2);
    await request('/api/redo',{method:'POST'});
    const bgm=join(dir,'synthetic-bgm.wav');
    await exec('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=0.4','-c:a','pcm_s16le',bgm]);
    const music=await readFile(bgm);
    assert.equal((await request('/api/import?kind=bgm',{method:'POST',headers:{'X-File-Name':'synthetic-bgm.wav','Content-Length':String(music.length)},body:music})).status,200);
    const mixEdit=structuredClone(state.session.project);mixEdit.audioBuses.bgm.gainDb=-6;
    assert.equal((await request('/api/edit',{method:'POST',body:JSON.stringify(mixEdit)})).status,200);
    const asset=project.sourceRefs[0].assetId;
    const media=await request('/media/'+asset+'?token='+server.token,{headers:{Range:'bytes=0-31'}});
    assert.equal(media.status,206);assert.deepEqual(Buffer.from(await media.arrayBuffer()),bytes.subarray(0,32));
    assert.equal((await request('/media/not_a_source?token='+server.token)).status,404);
    await server.close();server=await app.startServer({workspace:join(dir,'data'),port:0});
    const call=(path,opts={})=>fetch(server.url+path,{...opts,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(state.session.project.revision),...opts.headers}});
    state=await(await call('/api/state')).json();assert.equal(state.session.project.name,'Local saved edit');
    assert.equal(state.session.project.timeline[0].durationSec,1);
    const tampered=structuredClone(state.session.project);tampered.sourceRefs[0].sha256='0'.repeat(64);
    assert.equal((await call('/api/edit',{method:'POST',body:JSON.stringify(tampered)})).status,400);
    const started=await call('/api/render',{method:'POST'});assert.equal(started.status,202,await started.clone().text());
    let job;
    for(let i=0;i<300;i++){job=await(await call('/api/job')).json();if(job.status!=='RUNNING')break;await delay(100);}
    assert.equal(job.status,'PASS',JSON.stringify(job));
    const out=await call(job.download+'?token='+server.token);assert.equal(out.status,200);
    const file=join(dir,'output.mp4');await writeFile(file,Buffer.from(await out.arrayBuffer()));
    const inspected=await call('/api/qa');assert.equal(inspected.status,200);
    const report=await inspected.json();
    assert.equal(report.inspection.status,'CHECKED_LIMITED');
    assert.equal(job.qualityStatus,report.inspection.status);
    assert.equal(report.sha256,createHash('sha256').update(await readFile(file)).digest('hex'));
    assert.equal(report.projectRevision,state.session.project.revision);
    assert.ok(!JSON.stringify(report).includes(dir),'portable report contains private workspace paths');
    await exec('ffmpeg',['-v','error','-xerror','-i',file,'-f','null','-']);
    const decoded=await exec('ffmpeg',['-v','error','-i',file,'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:1024**2});
    let real=0,imaginary=0;const sampleCount=24000;
    for(let i=0;i<sampleCount;i++){const x=decoded.stdout.readFloatLE((4800+i)*4),phase=2*Math.PI*660*i/48000;real+=x*Math.cos(phase);imaginary-=x*Math.sin(phase);}
    assert.ok(2*Math.hypot(real,imaginary)/sampleCount>.004,'Imported BGM absent from downloaded MP4');
    assert.deepEqual(await readFile(source),bytes);
    await server.close();server=await app.startServer({workspace:join(dir,'data'),port:0});
    const restored=await(await fetch(server.url+'/api/job',{headers:{'X-AIVS-Token':server.token}})).json();
    assert.equal(restored.status,'PASS');
    assert.equal(restored.qualityStatus,'CHECKED_LIMITED');
    const restoredQA=await(await fetch(server.url+'/api/qa',{headers:{'X-AIVS-Token':server.token}})).json();
    assert.deepEqual(restoredQA,report);
    assert.equal((await fetch(server.url+restored.download+'?token='+server.token)).status,200);
    await server.close();server=undefined;
    const oldReport={...report};delete oldReport.inspection;
    await writeFile(join(dir,'data','jobs',job.id,'render','technical_qa.json'),JSON.stringify(oldReport));
    server=await app.startServer({workspace:join(dir,'data'),port:0});
    const legacyJob=await(await fetch(server.url+'/api/job',{headers:{'X-AIVS-Token':server.token}})).json();
    assert.equal(legacyJob.qualityStatus,'NOT_INSPECTED');
  }finally{if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});

test('late output findings survive restart and explicit re-edit creates a checked new export',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'aivs-review-'));let server;
  try{
    const source=join(dir,'synthetic-fault.mp4');
    await exec('ffmpeg',['-v','error','-f','lavfi','-i',
      'color=c=blue:s=320x180:r=30:d=2,drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable=gte(t\\,1)',
      '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2',
      '-af',"volume=enable='gte(t,1)':volume=0",'-c:v','libx264','-c:a','aac','-shortest',source]);
    const bytes=await readFile(source);server=await app.startServer({workspace:join(dir,'data'),port:0});let state;
    const call=async(path,opts={})=>{const r=await fetch(server.url+path,{...opts,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(state?.session.project.revision??0),...opts.headers}});return r;};
    const imported=await call('/api/import?kind=video',{method:'POST',headers:{'X-File-Name':'synthetic-fault.mp4','Content-Length':String(bytes.length)},body:bytes});
    assert.equal(imported.status,200);state=await imported.json();
    async function render(){assert.equal((await call('/api/render',{method:'POST'})).status,202);let job;
      for(let i=0;i<300;i++){job=await(await call('/api/job')).json();if(job.status!=='RUNNING')break;await delay(100);}
      assert.equal(job.status,'PASS',JSON.stringify(job));return job;}
    const originalJob=await render(),qa=await(await call('/api/qa')).json();
    assert.equal(originalJob.qualityStatus,'NEEDS_REVIEW');assert.equal(qa.inspection.status,'NEEDS_REVIEW');
    for(const code of ['BLACK_INTERVAL','SILENCE_WHILE_AUDIO_SELECTED']){
      const f=qa.inspection.findings.find(f=>f.code===code);assert.ok(f,code);assert.ok(f.startSec>.9&&f.endSec>1.9);
      assert.deepEqual(f.clipIds,[state.session.project.timeline[0].clipId]);
    }
    await server.close();server=await app.startServer({workspace:join(dir,'data'),port:0});
    assert.deepEqual(await(await call('/api/qa')).json(),qa);
    const p=structuredClone(state.session.project);p.timeline[0].durationSec=.8;p.audioClips[0].endSec=.8;
    const changed=await call('/api/edit',{method:'POST',body:JSON.stringify(p)});assert.equal(changed.status,200);state=await changed.json();
    const replacement=await render(),checked=await(await call('/api/qa')).json();
    assert.notEqual(replacement.id,originalJob.id);assert.equal(checked.inspection.status,'CHECKED_LIMITED');
    assert.equal(checked.projectRevision,state.session.project.revision);assert.deepEqual(checked.inspection.findings,[]);
    assert.deepEqual(await readFile(source),bytes);
  }finally{if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});
