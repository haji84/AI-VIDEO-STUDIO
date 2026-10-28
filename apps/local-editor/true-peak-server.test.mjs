/** Actual manual gain edit -> saved history -> fresh measured MP4. Generated media only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {startServer} from './server.mjs';
import {editAudioClip} from './audio-edits.mjs';
import {reviewTarget} from './qa.mjs';

const exec=promisify(execFile);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('manual gain, saved history and restart produce a new measured output without replacing prior evidence',async()=>{
const folder=await mkdtemp(join(tmpdir(),'aivs-true-peak-edit-'));
const workspace=join(folder,'data'),source=join(folder,'source.mp4');
let sourceBytes,sourceSha256;
let server,state;
const revisions=[];
async function call(path,opts={}){
 const response=await fetch(server.url+path,{...opts,headers:{
  'X-AIVS-Token':server.token,
  'X-AIVS-Revision':String(state?.session.project.revision??0),...opts.headers}});
 if(response.ok&&response.headers.get('content-type')?.startsWith('application/json')){
  const data=await response.clone().json();if(data.session)state=data;
 }
 return response;
}
async function post(path,body){
 const response=await call(path,{method:'POST',...(body===undefined?{}:{body:JSON.stringify(body)})});
 assert.equal(response.status,200,await response.clone().text());return response;
}
async function render(){
 const start=await call('/api/render',{method:'POST'});assert.equal(start.status,202,await start.clone().text());
 let job;for(let i=0;i<300;i++){
  job=await(await call('/api/job')).json();if(job.status!=='RUNNING')break;await delay(100);
 }
 assert.equal(job.status,'PASS',JSON.stringify(job));
 const report=await(await call('/api/qa')).json();
 const bytes=Buffer.from(await(await call(job.download)).arrayBuffer());
 assert.equal(sha(bytes),report.sha256);assert.equal(job.qualityStatus,report.inspection.status);
 return {job,report,bytes};
}
function properties(project){
 return {sourceRefs:project.sourceRefs,timeline:project.timeline,audioBuses:project.audioBuses,exportProfile:project.exportProfile};
}
async function inspectPCM(file){
 await exec('ffmpeg',['-v','error','-xerror','-i',file,'-f','null','-']);
 const pcm=(await exec('ffmpeg',['-v','error','-i',file,'-vn','-ac','2','-ar','48000','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:1024**2})).stdout;
 const start=7200,end=16800,n=end-start;
 assert.ok(pcm.length>=end*2*4);
 const rms=[],amplitude=[];
 for(let channel=0;channel<2;channel++){
  let sum=0,re=0,im=0;const hz=channel===0?440:12000;
  for(let sample=start;sample<end;sample++){
   const value=pcm.readFloatLE((sample*2+channel)*4),phase=2*Math.PI*hz*(sample-start)/48000;
   sum+=value*value;re+=value*Math.cos(phase);im-=value*Math.sin(phase);
  }
  rms.push(Math.sqrt(sum/n));amplitude.push(2*Math.hypot(re,im)/n);
 }
 return {windowSec:[.15,.35],frequenciesHz:[440,12000],rmsByChannel:rms,amplitudeByChannel:amplitude,wholeFileDecode:'PASS'};
}
try{
 await exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=0.5',
 '-f','lavfi','-i','aevalsrc=0.1*sin(2*PI*440*t)|1.2*sin(2*PI*12000*t+PI/4):s=48000:d=0.5',
 '-af','afade=t=in:d=0.01,afade=t=out:st=0.49:d=0.01','-c:v','libx264','-c:a','alac','-shortest',source]);
sourceBytes=await readFile(source);sourceSha256=sha(sourceBytes);
 server=await startServer({workspace,port:0});
 const imported=await call('/api/import?kind=video',{method:'POST',headers:{'X-File-Name':'generated-overshoot.mp4','Content-Length':String(sourceBytes.length)},body:sourceBytes});
 assert.equal(imported.status,200,await imported.clone().text());
 const original=structuredClone(state.session.project);revisions.push({action:'import',revision:original.revision});
 const first=await render();
 assert.deepEqual(state.session.project,original);
 const index=first.report.inspection.findings.findIndex(f=>f.code==='TRUE_PEAK_AT_OR_ABOVE_REFERENCE');assert.ok(index>=0);
 assert.equal(first.report.inspection.status,'NEEDS_REVIEW');
 assert.equal(first.report.inspection.truePeak,'MEASURED');
 assert.throws(()=>reviewTarget(first.report,original,index),/FINDING_NOT_LOCALIZED/);
 const firstOutput=join(workspace,'exports',first.job.id+'.mp4');
 const firstQAFile=join(workspace,'jobs',first.job.id,'render','technical_qa.json');
 const firstReportBytes=await readFile(firstQAFile),firstReportSha256=sha(firstReportBytes);
 const asset=JSON.parse(await readFile(join(workspace,'bindings.json'),'utf8'))[0].path;
 assert.equal(sha(await readFile(asset)),sourceSha256);
 const changed=editAudioClip(state.session.project,state.session.project.audioClips[0].id,{gainDb:-6});
 await post('/api/edit',changed);
 assert.deepEqual(properties(state.session.project),properties(original));
 assert.equal(state.session.project.audioClips[0].gainDb,-6);
 const changedClips=structuredClone(state.session.project.audioClips);
 revisions.push({action:'gain -6 dB',revision:state.session.project.revision});
 assert.throws(()=>reviewTarget(first.report,state.session.project,index),/OUTPUT_PROJECT_CHANGED/);
 assert.deepEqual(await(await call('/api/qa')).json(),first.report,'editing rewrote the previous report');
 await post('/api/undo');assert.deepEqual(state.session.project.audioClips,original.audioClips);
 revisions.push({action:'Undo',revision:state.session.project.revision});
 await post('/api/redo');assert.deepEqual(state.session.project.audioClips,changedClips);
 revisions.push({action:'Redo',revision:state.session.project.revision});
 const exported=structuredClone(state.session);
 await writeFile(join(folder,'saved-project.json'),JSON.stringify(exported));
 await server.close();server=await startServer({workspace,port:0});await call('/api/state');
 assert.deepEqual(state.session,exported,'automatic disk save/restart lost editing or history');
 assert.deepEqual(await(await call('/api/qa')).json(),first.report);
 assert.throws(()=>reviewTarget(first.report,state.session.project,index),/OUTPUT_PROJECT_CHANGED/);
 // Open the saved document through the same API used by the editor.
 await post('/api/open',JSON.parse(await readFile(join(folder,'saved-project.json'),'utf8')));
 assert.deepEqual(state.session.project.audioClips,changedClips);
 assert.deepEqual(properties(state.session.project),properties(original));
 revisions.push({action:'open saved document',revision:state.session.project.revision});
 assert.deepEqual(state.session.undo,exported.undo);assert.deepEqual(state.session.redo,exported.redo);
 const beforeRenderBytes=await readFile(join(workspace,'project.aivs.json'));
 const second=await render();
 assert.notEqual(second.job.id,first.job.id);assert.notEqual(second.report.sha256,first.report.sha256);
 assert.equal(second.report.projectRevision,state.session.project.revision);
 assert.equal(second.report.inspection.truePeak,'MEASURED');
 assert.ok(second.report.inspection.truePeakMeasurement.maximumDbTP<-1.1,JSON.stringify(second.report.inspection));
 assert.equal(second.report.inspection.status,'CHECKED_LIMITED');
 assert.equal(second.report.inspection.findings.some(f=>f.code==='TRUE_PEAK_AT_OR_ABOVE_REFERENCE'),false);
 assert.deepEqual(await readFile(join(workspace,'project.aivs.json')),beforeRenderBytes,'render rewrote editing state');
 assert.equal(sha(await readFile(firstOutput)),first.report.sha256);
 assert.equal(sha(await readFile(firstQAFile)),firstReportSha256);
 assert.deepEqual(await readFile(source),sourceBytes);assert.equal(sha(await readFile(asset)),sourceSha256);
 assert.equal(sha(Buffer.from(await(await call(first.job.download)).arrayBuffer())),first.report.sha256);
 const secondOutput=join(workspace,'exports',second.job.id+'.mp4');
 const firstPCM=await inspectPCM(firstOutput),secondPCM=await inspectPCM(secondOutput);
 const ratios=secondPCM.rmsByChannel.map((v,i)=>v/firstPCM.rmsByChannel[i]);
 for(const ratio of ratios)assert.ok(ratio>.45&&ratio<.56,`gain ratio ${ratio}`);
 for(let channel=0;channel<2;channel++){
  const ratio=secondPCM.amplitudeByChannel[channel]/firstPCM.amplitudeByChannel[channel];
  assert.ok(ratio>.45&&ratio<.56,`tone gain ratio ${ratio}`);
 }
 const phaseAfter=structuredClone(state.session);
 await server.close();server=await startServer({workspace,port:0});await call('/api/state');
 assert.deepEqual(state.session,phaseAfter);
 assert.deepEqual(await(await call('/api/qa')).json(),second.report);
 const resumed=await(await call('/api/job')).json();assert.equal(resumed.id,second.job.id);assert.equal(resumed.qualityStatus,'CHECKED_LIMITED');
 assert.equal(sha(await readFile(firstOutput)),first.report.sha256);assert.equal(sha(await readFile(firstQAFile)),firstReportSha256);
 assert.deepEqual(await readFile(source),sourceBytes);assert.equal(sha(await readFile(asset)),sourceSha256);
 console.log('true-peak manual edit synthetic evidence '+JSON.stringify({
  sourceSha256,gainDb:-6,revisions,
  before:{outputSha256:first.report.sha256,truePeakDbTP:first.report.inspection.truePeakMeasurement.maximumDbTP,qualityStatus:first.report.inspection.status,pcm:firstPCM},
  after:{outputSha256:second.report.sha256,truePeakDbTP:second.report.inspection.truePeakMeasurement.maximumDbTP,qualityStatus:second.report.inspection.status,pcm:secondPCM},
  rmsRatioByChannel:ratios,sourceAndPriorOutputUnchanged:true,savedHistoryRestored:true,
  actualGUI:'NOT_RUN',physicalDeviceAcceptance:'NOT_RUN'
 }));
}finally{if(server)await server.close();await rm(folder,{recursive:true,force:true});}
});
