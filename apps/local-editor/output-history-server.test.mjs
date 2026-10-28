/** Actual loopback API and generated MP4s; no browser/device claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {startServer} from './server.mjs';
import {reviewTarget} from './qa.mjs';
const exec=promisify(execFile),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('two completed outputs and bound reports can be selected after restart without editing current state',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-output-history-http-')),workspace=join(dir,'data');let server,state;
 try{
  const source=join(dir,'source.mp4');
  await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=2',
   '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:v','libx264','-c:a','aac','-shortest',source]);
  const sourceBytes=await readFile(source);
  server=await startServer({workspace,port:0});
  const call=async(path,options={})=>{
   const response=await fetch(server.url+path,{...options,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(state?.session.project.revision??0),...options.headers}});
   if(response.ok&&response.headers.get('content-type')?.startsWith('application/json')){const data=await response.clone().json();if(data.session)state=data;}
   return response;
  };
  const imported=await call('/api/import?kind=video',{method:'POST',headers:{'X-File-Name':'source.mp4','Content-Length':String(sourceBytes.length)},body:sourceBytes});
  assert.equal(imported.status,200,await imported.clone().text());
  async function render(){
   assert.equal((await call('/api/render',{method:'POST'})).status,202);let job;
   for(let i=0;i<300;i++){job=await(await call('/api/job')).json();if(job.status!=='RUNNING')break;await delay(100);}
   assert.equal(job.status,'PASS',JSON.stringify(job));
   return {job,report:await(await call('/api/qa')).json(),bytes:Buffer.from(await(await call(job.download)).arrayBuffer())};
  }
  const first=await render(),firstProject=structuredClone(state.session.project);
  const edited=structuredClone(state.session.project);edited.audioClips[0].gainDb=-6;
  assert.equal((await call('/api/edit',{method:'POST',body:JSON.stringify(edited)})).status,200);
  const second=await render(),session=structuredClone(state.session);
  assert.notEqual(first.report.sha256,second.report.sha256);
  await server.close();server=undefined;server=await startServer({workspace,port:0});await call('/api/state');
  const before=await readFile(join(workspace,'project.aivs.json')),lastJob=await readFile(join(workspace,'last-job.json'));
  const response=await call('/api/outputs');assert.equal(response.status,200,await response.clone().text());
  const history=await response.json();assert.equal(history.limit,50);
  assert.deepEqual(history.entries.map(x=>x.id),[second.job.id,first.job.id]);
  for(const previous of [first,second]){
   const selected=await call('/api/outputs/'+previous.job.id);assert.equal(selected.status,200,await selected.clone().text());
   const view=await selected.json();assert.equal(view.id,previous.job.id);assert.equal(view.integrity,'CHECKED_THIS_ACCESS');
   assert.deepEqual(view.report,previous.report);
   const output=await call(view.download);assert.equal(output.status,200);assert.deepEqual(Buffer.from(await output.arrayBuffer()),previous.bytes);
   const range=await call(view.download,{headers:{Range:'bytes=0-31'}});assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),previous.bytes.subarray(0,32));
   const artifact=join(dir,previous.job.id+'.mp4');await writeFile(artifact,previous.bytes);await exec('ffmpeg',['-v','error','-xerror','-i',artifact,'-f','null','-']);
  }
  const index=first.report.inspection.findings.findIndex(f=>f.code==='STATIC_OR_FREEZE_INTERVAL');assert.ok(index>=0);
  assert.equal(reviewTarget(first.report,firstProject,index).clipIndex,0);
  assert.throws(()=>reviewTarget(first.report,state.session.project,index),/OUTPUT_PROJECT_CHANGED/);
  assert.deepEqual(state.session,session);assert.deepEqual(await readFile(join(workspace,'project.aivs.json')),before);
  assert.deepEqual(await readFile(join(workspace,'last-job.json')),lastJob);
  assert.equal((await(await call('/api/job')).json()).id,second.job.id);
  assert.deepEqual(await(await call('/api/qa')).json(),second.report);
  assert.equal((await fetch(server.url+'/api/outputs')).status,403);
  assert.equal((await fetch(server.url+'/api/outputs/'+first.job.id)).status,403);
  assert.equal((await call('/api/outputs',{headers:{Origin:'https://example.invalid'}})).status,403);
  assert.equal((await call('/api/outputs/'+'f'.repeat(32))).status,404);
  assert.equal((await call('/exports/'+'f'.repeat(32))).status,404);
  const reportPath=join(workspace,'jobs',first.job.id,'render','technical_qa.json'),originalReport=await readFile(reportPath);
  const altered=JSON.parse(originalReport);altered.inspection.status='CHECKED_LIMITED';await writeFile(reportPath,JSON.stringify(altered));
  assert.equal((await call('/api/outputs/'+first.job.id)).status,409);
  assert.equal((await call(first.job.download)).status,409,'a cached range entry must not serve a changed report');
  await writeFile(reportPath,originalReport);assert.equal((await call('/api/outputs/'+first.job.id)).status,200);
  const outputPath=join(workspace,'exports',first.job.id+'.mp4'),changedBytes=Buffer.from(first.bytes);changedBytes[changedBytes.length-1]^=1;
  await writeFile(outputPath,changedBytes);assert.equal((await call('/api/outputs/'+first.job.id)).status,409);
  assert.equal((await call(first.job.download)).status,409);
  await writeFile(outputPath,first.bytes);await unlink(reportPath);assert.equal((await call('/api/outputs/'+first.job.id)).status,409);
  assert.deepEqual(await readFile(source),sourceBytes);assert.deepEqual(await readFile(join(workspace,'exports',second.job.id+'.mp4')),second.bytes);
  // Emulate a genuine old-version workspace: only the last completed output had
  // a journal, and its older report did not contain the newer inspection section.
  await writeFile(reportPath,originalReport);await server.close();server=undefined;
  const oldLast=JSON.parse(await readFile(join(workspace,'last-job.json'),'utf8'));delete oldLast.outputReceipt;
  await writeFile(join(workspace,'last-job.json'),JSON.stringify(oldLast));await unlink(join(workspace,'output-history.json'));
  const latestReportFile=join(workspace,'jobs',second.job.id,'render','technical_qa.json');
  const legacyReport=JSON.parse(await readFile(latestReportFile,'utf8'));delete legacyReport.inspection;
  await writeFile(latestReportFile,JSON.stringify(legacyReport));server=await startServer({workspace,port:0});
  const migrated=await(await call('/api/outputs')).json();assert.equal(migrated.entries.length,1);assert.equal(migrated.entries[0].id,second.job.id);
  assert.equal(migrated.entries[0].origin,'LEGACY_LATEST');assert.equal(migrated.entries[0].createdAt,null);
  assert.equal(migrated.entries[0].qualityStatus,'NOT_INSPECTED');assert.equal((await call('/api/outputs/'+first.job.id)).status,404);
  assert.equal((await(await call('/api/outputs/'+second.job.id)).json()).report.inspection,undefined);
  assert.deepEqual(await readFile(outputPath),first.bytes);
  console.log('output-history synthetic evidence '+JSON.stringify({inputSha256:sha(sourceBytes),outputs:[first.report.sha256,second.report.sha256],wholeFileDecode:'PASS',projectAndLiveJobUnchanged:true,reportAndOutputTamperRejected:true,physicalDeviceAcceptance:'NOT_RUN'}));
 }finally{if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});

test('interrupted or failed job metadata never admits uncommitted output files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-history-interrupted-')),workspace=join(dir,'data'),id='1'.repeat(32);let server;
 try{
  server=await startServer({workspace,port:0});await server.close();server=undefined;
  await mkdir(join(workspace,'exports'));await mkdir(join(workspace,'jobs',id,'render'),{recursive:true});
  const bytes=Buffer.from('uncommitted generated fixture bytes');await writeFile(join(workspace,'exports',id+'.mp4'),bytes);
  await writeFile(join(workspace,'jobs',id,'render','technical_qa.json'),JSON.stringify({technical_ok:true,sha256:sha(bytes),projectId:'project_orphan',projectRevision:1}));
  for(const [status,expected] of [['RUNNING','INTERRUPTED'],['FAIL','FAIL']]){
   await writeFile(join(workspace,'last-job.json'),JSON.stringify({id,status,sha256:sha(bytes)}));server=await startServer({workspace,port:0});
   const call=path=>fetch(server.url+path,{headers:{'X-AIVS-Token':server.token}});
   assert.equal((await(await call('/api/job')).json()).status,expected);
   assert.deepEqual((await(await call('/api/outputs')).json()).entries,[]);
   assert.equal((await call('/api/outputs/'+id)).status,404);assert.equal((await call('/exports/'+id)).status,404);
   await server.close();server=undefined;
  }
  assert.deepEqual(await readFile(join(workspace,'exports',id+'.mp4')),bytes);
 }finally{if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});

test('history write failure preserves the completed latest job and its restart recovery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-history-recovery-')),workspace=join(dir,'data');let server,state;
 try{
  const source=join(dir,'source.mp4');await exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=0.5','-an','-c:v','libx264',source]);
  const bytes=await readFile(source);server=await startServer({workspace,port:0});
  const call=(path,options={})=>fetch(server.url+path,{...options,headers:{'X-AIVS-Token':server.token,'X-AIVS-Revision':String(state?.session.project.revision??0),...options.headers}});
  const imported=await call('/api/import?kind=video',{method:'POST',headers:{'X-File-Name':'source.mp4','Content-Length':String(bytes.length)},body:bytes});assert.equal(imported.status,200);state=await imported.json();
  await mkdir(join(workspace,'output-history.json'));
  assert.equal((await call('/api/render',{method:'POST'})).status,202);let job;
  for(let i=0;i<300;i++){job=await(await call('/api/job')).json();if(job.status!=='RUNNING')break;await delay(100);}
  assert.equal(job.status,'PASS',JSON.stringify(job));assert.match(job.historyWarning,/履歴/);
  const saved=await readFile(join(workspace,'last-job.json')),qa=await(await call('/api/qa')).json();
  assert.equal(sha(Buffer.from(await(await call(job.download)).arrayBuffer())),qa.sha256);
  await server.close();server=undefined;server=await startServer({workspace,port:0});
  const resumed=await(await call('/api/job')).json();assert.equal(resumed.status,'PASS');assert.equal(resumed.id,job.id);
  assert.deepEqual(await(await call('/api/qa')).json(),qa);assert.deepEqual(await readFile(join(workspace,'last-job.json')),saved);
  assert.equal(sha(Buffer.from(await(await call(resumed.download)).arrayBuffer())),qa.sha256);
  const history=await(await call('/api/outputs')).json();assert.equal(history.status,'UNAVAILABLE');
 }finally{if(server)await server.close();await rm(dir,{recursive:true,force:true});}
});
