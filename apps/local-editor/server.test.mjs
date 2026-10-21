import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
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
    await exec('ffmpeg',['-v','error','-xerror','-i',file,'-f','null','-']);
    const decoded=await exec('ffmpeg',['-v','error','-i',file,'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:1024**2});
    let real=0,imaginary=0;const sampleCount=24000;
    for(let i=0;i<sampleCount;i++){const x=decoded.stdout.readFloatLE((4800+i)*4),phase=2*Math.PI*660*i/48000;real+=x*Math.cos(phase);imaginary-=x*Math.sin(phase);}
    assert.ok(2*Math.hypot(real,imaginary)/sampleCount>.004,'Imported BGM absent from downloaded MP4');
    assert.deepEqual(await readFile(source),bytes);
    await server.close();server=await app.startServer({workspace:join(dir,'data'),port:0});
    const restored=await(await fetch(server.url+'/api/job',{headers:{'X-AIVS-Token':server.token}})).json();
    assert.equal(restored.status,'PASS');
    assert.equal((await fetch(server.url+restored.download+'?token='+server.token)).status,200);
  }finally{if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});
