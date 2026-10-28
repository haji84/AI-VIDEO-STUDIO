/** Filesystem integrity and bounded history; arbitrary bytes here are not media acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile,rename,unlink,symlink,stat,utimes,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createOutputHistory,captureOutputReceipt,openRecordedOutput} from './output-history.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function atomicJson(path,value){const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(value),{flag:'wx'});await rename(temp,path);}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
async function fixture(folder,n){
 const id=n.toString(16).padStart(32,'0'),bytes=Buffer.from('output bytes '+n);
 const report={schema:'aivs-saved-project-audio-report-v1',path:'/private/ignored.mp4',technical_ok:true,sha256:sha(bytes),projectId:'project_history',projectRevision:n,
  duration_seconds:1,inspection:{schema:'aivs-output-inspection-v1',status:'CHECKED_LIMITED',findings:[]}};
 const output=join(folder,'exports',id+'.mp4'),reportFile=join(folder,'jobs',id,'render','technical_qa.json');
 await mkdir(join(folder,'exports'),{recursive:true});await mkdir(join(folder,'jobs',id,'render'),{recursive:true});await writeFile(output,bytes);await writeFile(reportFile,JSON.stringify(report));
 const receipt={id,outputSha256:sha(bytes),reportSha256:sha(await readFile(reportFile)),outputBytes:bytes.length,projectId:'project_history',projectRevision:n,qualityStatus:'CHECKED_LIMITED',createdAt:'2026-10-29T00:00:00.000Z',origin:'RENDER'};
 return {id,bytes,report,output,reportFile,receipt};
}
async function workspace(fn){const dir=await mkdtemp(join(tmpdir(),'aivs-history-files-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}

test('receipt captures output/report identities and ignores the report local path',()=>workspace(async folder=>{
 const f=await fixture(folder,1),receipt=await captureOutputReceipt({folder,id:f.id,outputSha256:f.receipt.outputSha256,createdAt:f.receipt.createdAt});
 assert.deepEqual(await captureOutputReceipt({folder,id:f.id,createdAt:f.receipt.createdAt}),f.receipt,'completed renders read their hash from the bounded report, then verify real output bytes');
 for(const outputSha256 of [undefined,null,'invalid',[f.receipt.outputSha256]]){
  await assert.rejects(()=>captureOutputReceipt({folder,id:f.id,outputSha256,origin:'LEGACY_LATEST',createdAt:null}),/INVALID_OUTPUT_RECEIPT/,'legacy migration requires an independently stored valid output hash');
 }
 assert.deepEqual(await captureOutputReceipt({folder,id:f.id,outputSha256:f.receipt.outputSha256,origin:'LEGACY_LATEST',createdAt:null}),{...f.receipt,origin:'LEGACY_LATEST',createdAt:null});
 assert.deepEqual(receipt,f.receipt);const result=await openRecordedOutput({folder,receipt});
 try{const {path,...portable}=f.report;assert.deepEqual(result.report,portable);assert.equal(result.integrity,'CHECKED_THIS_ACCESS');}finally{await result.handle.close();}
 await assert.rejects(()=>captureOutputReceipt({folder,id:f.id,outputSha256:'f'.repeat(64),createdAt:f.receipt.createdAt}),/OUTPUT_CHANGED/);
 await writeFile(f.reportFile,JSON.stringify({...f.report,sha256:[f.report.sha256]}));
 await assert.rejects(()=>captureOutputReceipt({folder,id:f.id,createdAt:f.receipt.createdAt}),/INVALID_OUTPUT_RECEIPT/,'a new render still requires a strict string hash in the bounded report');
}));
test('two completed receipts reload, while unknown files cannot be selected',()=>workspace(async folder=>{
 const first=await fixture(folder,1),second=await fixture(folder,2),orphan=await fixture(folder,3);
 let history=await createOutputHistory({folder,atomicJson});await history.record(first.receipt);await history.record(second.receipt);
 history=await createOutputHistory({folder,atomicJson});assert.deepEqual(history.list().entries.map(x=>x.id),[second.id,first.id]);
 for(const f of [first,second]){const selected=await history.open(f.id);try{assert.equal(selected.report.projectRevision,f.receipt.projectRevision);}finally{await selected.handle.close();}}
 await assert.rejects(()=>history.open(orphan.id),/OUTPUT_NOT_FOUND/);await assert.rejects(()=>history.open('../exports/secret'),/INVALID_OUTPUT_ID/);
}));
test('listing remains metadata-only even when video/report files are missing',()=>workspace(async folder=>{
 const f=await fixture(folder,1);let history=await createOutputHistory({folder,atomicJson});await history.record(f.receipt);
 await rm(join(folder,'exports'),{recursive:true});await rm(join(folder,'jobs'),{recursive:true});
 history=await createOutputHistory({folder,atomicJson});const list=history.list();assert.equal(list.entries.length,1);assert.equal(list.entries[0].integrity,'CHECK_ON_SELECTION');
 await assert.rejects(()=>history.open(f.id),/OUTPUT_EVIDENCE_UNAVAILABLE/);
}));
test('newest 50 receipts are retained without deleting old output files',()=>workspace(async folder=>{
 const history=await createOutputHistory({folder,atomicJson});let first;
 for(let n=1;n<=51;n++){const f=await fixture(folder,n);first??=f;await history.record(f.receipt);}
 assert.equal(history.list().limit,50);assert.equal(history.list().entries.length,50);assert.equal(history.list().entries.at(-1).projectRevision,2);
 assert.deepEqual(await readFile(first.output),first.bytes);assert.ok(await stat(first.reportFile));await assert.rejects(()=>history.open(first.id),/OUTPUT_NOT_FOUND/);
}));
test('malformed, oversized, duplicate and unsafe journals never admit entries',()=>workspace(async folder=>{
 const f=await fixture(folder,1),path=join(folder,'output-history.json');
 const variants=[
  '{', ' '.repeat(65537),
  JSON.stringify({schema:'aivs-output-history-v1',entries:[f.receipt,f.receipt]}),
  JSON.stringify({schema:'unknown',entries:[f.receipt]}),
  JSON.stringify({schema:'aivs-output-history-v1',entries:[{...f.receipt,id:'../../outside'}]}),
  JSON.stringify({schema:'aivs-output-history-v1',entries:[{...f.receipt,outputBytes:-1}]}),
  JSON.stringify({schema:'aivs-output-history-v1',entries:[{...f.receipt,reportSha256:'x'}]}),
  JSON.stringify({schema:'aivs-output-history-v1',entries:[{...f.receipt,reportSha256:[f.receipt.reportSha256]}]}),
  JSON.stringify({schema:'aivs-output-history-v1',entries:Array.from({length:51},(_,i)=>({...f.receipt,id:(i+1).toString(16).padStart(32,'0')}))})
 ];
 for(const bytes of variants){await writeFile(path,bytes);const history=await createOutputHistory({folder,atomicJson});assert.equal(history.list().status,'UNAVAILABLE');assert.deepEqual(history.list().entries,[]);await assert.rejects(()=>history.open(f.id),/HISTORY_UNAVAILABLE/);}
 await unlink(path);await symlink(f.reportFile,path);const linked=await createOutputHistory({folder,atomicJson});assert.equal(linked.list().status,'UNAVAILABLE');
}));
test('a failed atomic journal update preserves the earlier completed receipts',()=>workspace(async folder=>{
 const first=await fixture(folder,1),second=await fixture(folder,2);let failWrite=false;
 const history=await createOutputHistory({folder,atomicJson:async(path,value)=>{if(failWrite)throw new Error('ENOSPC');await atomicJson(path,value);}});
 await history.record(first.receipt);const original=await readFile(join(folder,'output-history.json'));failWrite=true;
 await assert.rejects(()=>history.record(second.receipt),/HISTORY_WRITE_FAILED/);
 assert.deepEqual(history.list().entries.map(x=>x.id),[first.id]);assert.deepEqual(await readFile(join(folder,'output-history.json')),original);
}));
test('report and output tampering invalidate even a previously selected cached pair',()=>workspace(async folder=>{
 const f=await fixture(folder,1),history=await createOutputHistory({folder,atomicJson});await history.record(f.receipt);
 await (await history.open(f.id)).handle.close();const originalReport=await readFile(f.reportFile);
 await writeFile(f.reportFile,JSON.stringify({...f.report,projectRevision:99}));await assert.rejects(()=>history.open(f.id),/REPORT_CHANGED/);
 await writeFile(f.reportFile,originalReport);await (await history.open(f.id)).handle.close();
 const before=await stat(f.output);await writeFile(f.output,Buffer.from('X'.repeat(f.bytes.length)));await utimes(f.output,before.atime,before.mtime);
 await assert.rejects(()=>history.open(f.id),/OUTPUT_CHANGED/);await writeFile(f.output,f.bytes);
 const mismatch={...f.receipt,projectRevision:9};await assert.rejects(()=>openRecordedOutput({folder,receipt:mismatch}),/REPORT_IDENTITY_MISMATCH/);
 await unlink(f.reportFile);await assert.rejects(()=>history.open(f.id),/OUTPUT_EVIDENCE_UNAVAILABLE/);
}));
test('symbolic links in output or report paths are rejected even if target bytes match',()=>workspace(async folder=>{
 for(const target of ['output','report','exports','job','render']){
  const base=join(folder,target);await mkdir(base);const f=await fixture(base,1),history=await createOutputHistory({folder:base,atomicJson});await history.record(f.receipt);
  const path={output:f.output,report:f.reportFile,exports:join(base,'exports'),job:join(base,'jobs',f.id),render:join(base,'jobs',f.id,'render')}[target];
  const moved=join(folder,target+'-moved');await rename(path,moved);await symlink(moved,path);
  await assert.rejects(()=>history.open(f.id),/OUTPUT_PATH_UNSAFE/);
 }
}));
test('report size ceiling and recorded output length prevent open-ended reads',()=>workspace(async folder=>{
 const f=await fixture(folder,1),history=await createOutputHistory({folder,atomicJson});await history.record(f.receipt);
 let handle=await open(f.reportFile,'r+');await handle.truncate(32*1024*1024+1);await handle.close();
 await assert.rejects(()=>history.open(f.id),/OUTPUT_JSON_TOO_LARGE/);
 await writeFile(f.reportFile,JSON.stringify(f.report));handle=await open(f.output,'r+');await handle.truncate(f.bytes.length+1);await handle.close();
 await assert.rejects(()=>history.open(f.id),/OUTPUT_CHANGED/);
}));
