/** Actual synthetic freeze warning -> saved review -> manual re-edit -> new MP4. */
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {startServer} from './server.mjs';import {reviewTarget} from './qa.mjs';import {applyClipEdit} from './edits.mjs';
const exec=promisify(execFile),delay=ms=>new Promise(r=>setTimeout(r,ms));
test('freeze warning persists and navigates exact saved clip; manual re-edit exports a fresh checked MP4',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-freeze-http-'));let server,state;
 try{
  const source=join(dir,'still.mp4');await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=4','-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-c:a','aac','-shortest',source]);const bytes=await readFile(source);
  server=await startServer({workspace:join(dir,'data'),port:0});
  const call=async(path,opts={})=>{const r=await fetch(server.url+path,{...opts,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(state?.session.project.revision??0),...opts.headers}});if(r.ok&&r.headers.get('content-type')?.startsWith('application/json')){const d=await r.clone().json();if(d.session)state=d;}return r;};
  const r=await call('/api/import?kind=video',{method:'POST',headers:{'X-File-Name':'still.mp4','Content-Length':String(bytes.length)},body:bytes});assert.equal(r.status,200);const original=structuredClone(state.session.project);
  async function render(){assert.equal((await call('/api/render',{method:'POST'})).status,202);let j;for(let i=0;i<300;i++){j=await(await call('/api/job')).json();if(j.status!=='RUNNING')break;await delay(100);}assert.equal(j.status,'PASS',JSON.stringify(j));return j;}
  const first=await render(),qa=await(await call('/api/qa')).json(),index=qa.inspection.findings.findIndex(f=>f.code==='STATIC_OR_FREEZE_INTERVAL');assert.ok(index>=0);assert.equal(first.qualityStatus,'NEEDS_REVIEW');assert.equal(qa.inspection.cadence.status,'CONSTANT_INTERVALS');assert.deepEqual(state.session.project,original,'inspection mutated editing choices');
  const target=reviewTarget(qa,state.session.project,index);assert.equal(target.clipIndex,0);assert.ok(target.sourceSec>=0&&target.sourceSec<.05);
  await server.close();server=await startServer({workspace:join(dir,'data'),port:0});assert.deepEqual(await(await call('/api/qa')).json(),qa);
  const next=applyClipEdit(state.session.project,target.clipIndex,{durationSec:.8});assert.equal((await call('/api/edit',{method:'POST',body:JSON.stringify(next)})).status,200);assert.throws(()=>reviewTarget(qa,state.session.project,index),/OUTPUT_PROJECT_CHANGED/);
  const second=await render(),fresh=await(await call('/api/qa')).json();assert.notEqual(second.id,first.id);assert.equal(fresh.inspection.status,'CHECKED_LIMITED');assert.deepEqual(fresh.inspection.findings,[]);assert.equal(fresh.projectRevision,state.session.project.revision);
  const file=join(dir,'short.mp4');await writeFile(file,Buffer.from(await(await call(second.download)).arrayBuffer()));await exec('ffmpeg',['-v','error','-xerror','-i',file,'-f','null','-']);assert.deepEqual(await readFile(source),bytes);
  console.log('freeze synthetic evidence '+JSON.stringify({inputSha256:original.sourceRefs[0].sha256,originalOutputSha256:qa.sha256,freeze:qa.inspection.findings[index],cadence:qa.inspection.cadence,newOutputSha256:fresh.sha256,newDurationSec:fresh.duration_seconds}));
 }finally{if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});
