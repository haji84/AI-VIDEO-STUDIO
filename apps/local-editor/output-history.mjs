/** Bounded completed-output receipts. No workspace scans or automatic media edits. */
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const LIMIT=50,JOURNAL_BYTES=64*1024,REPORT_BYTES=32*1024*1024;
const SCHEMA='aivs-output-history-v1',ID=/^[a-f0-9]{32}$/,HASH=/^[a-f0-9]{64}$/;
const keys=['id','outputSha256','reportSha256','outputBytes','projectId','projectRevision','qualityStatus','createdAt','origin'];
const fail=code=>{throw new Error(code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function outputId(id){if(typeof id!=='string'||!ID.test(id))fail('INVALID_OUTPUT_ID');}
function recordShape(r){
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==keys.length||Object.keys(r).some(k=>!keys.includes(k)))fail('INVALID_OUTPUT_RECEIPT');
 outputId(r.id);
 if(typeof r.outputSha256!=='string'||!HASH.test(r.outputSha256)||typeof r.reportSha256!=='string'||!HASH.test(r.reportSha256)||!Number.isSafeInteger(r.outputBytes)||r.outputBytes<1||
  typeof r.projectId!=='string'||!/^project_[A-Za-z0-9_-]{1,70}$/.test(r.projectId)||!Number.isSafeInteger(r.projectRevision)||r.projectRevision<0||
  !['CHECKED_LIMITED','NEEDS_REVIEW','NOT_INSPECTED'].includes(r.qualityStatus)||!['RENDER','LEGACY_LATEST'].includes(r.origin))fail('INVALID_OUTPUT_RECEIPT');
 if(r.createdAt!==null&&(typeof r.createdAt!=='string'||r.createdAt.length!==24||!Number.isFinite(Date.parse(r.createdAt))||new Date(r.createdAt).toISOString()!==r.createdAt))fail('INVALID_OUTPUT_RECEIPT');
 if(r.origin==='RENDER'&&r.createdAt===null)fail('INVALID_OUTPUT_RECEIPT');
 return r;
}
function fingerprint(s){return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.nlink].join(':');}
function evidenceError(error){return /^(OUTPUT_|REPORT_|INVALID_)/.test(error.message)?error:new Error('OUTPUT_EVIDENCE_UNAVAILABLE');}
async function parents(root,parts){
 let path=root;
 for(const part of ['',...parts.slice(0,-1)]){
  if(part)path=join(path,part);
  const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||await realpath(path)!==path)fail('OUTPUT_PATH_UNSAFE');
 }
}
async function checkedOpen(root,parts,maxBytes=Number.MAX_SAFE_INTEGER){
 await parents(root,parts);const path=join(root,...parts),before=await lstat(path,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n)fail('OUTPUT_PATH_UNSAFE');
 if(before.size>BigInt(maxBytes))fail('OUTPUT_JSON_TOO_LARGE');
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{
  const observed=await handle.stat({bigint:true});
  if(!observed.isFile()||fingerprint(observed)!==fingerprint(before))fail('OUTPUT_CHANGED');
  await parents(root,parts);const current=await lstat(path,{bigint:true});
  if(current.isSymbolicLink()||fingerprint(current)!==fingerprint(observed))fail('OUTPUT_CHANGED');
  return {handle,path,parts,stat:observed,stamp:fingerprint(observed)};
 }catch(error){await handle.close();throw error;}
}
async function unchanged(root,file){
 await parents(root,file.parts);const current=await lstat(file.path,{bigint:true}),opened=await file.handle.stat({bigint:true});
 if(!current.isFile()||current.isSymbolicLink()||fingerprint(current)!==file.stamp||fingerprint(opened)!==file.stamp)fail('OUTPUT_CHANGED');
}
async function buffer(file){
 if(file.stat.size<1n)fail('OUTPUT_JSON_INVALID');
 const parts=[];let length=0;
 for await(const chunk of file.handle.createReadStream({start:0,end:Number(file.stat.size)-1,autoClose:false})){parts.push(chunk);length+=chunk.length;}
 if(length!==Number(file.stat.size))fail('OUTPUT_CHANGED');return Buffer.concat(parts,length);
}
async function digest(file){
 if(file.stat.size<1n)fail('OUTPUT_CHANGED');const h=createHash('sha256');let length=0;
 for await(const chunk of file.handle.createReadStream({start:0,end:Number(file.stat.size)-1,autoClose:false})){h.update(chunk);length+=chunk.length;}
 if(length!==Number(file.stat.size))fail('OUTPUT_CHANGED');return h.digest('hex');
}
function parse(bytes){try{return JSON.parse(bytes.toString('utf8'));}catch{fail('OUTPUT_JSON_INVALID');}}
function quality(report){
 return report.inspection?.schema==='aivs-output-inspection-v1'&&['CHECKED_LIMITED','NEEDS_REVIEW'].includes(report.inspection.status)?report.inspection.status:'NOT_INSPECTED';
}
function reportIdentity(report,receipt){
 if(!report||typeof report!=='object'||Array.isArray(report)||report.technical_ok!==true||report.sha256!==receipt.outputSha256||
  report.projectId!==receipt.projectId||report.projectRevision!==receipt.projectRevision||quality(report)!==receipt.qualityStatus||report.inspection?.status==='FAILED_TECHNICAL')fail('REPORT_IDENTITY_MISMATCH');
}
function paths(id){return {output:['exports',id+'.mp4'],report:['jobs',id,'render','technical_qa.json']};}

/** Latest-job metadata is small too; never use an unbounded readFile after stat. */
export async function readLastOutputJob(folder){
 const root=resolve(folder);let file;
 try{file=await checkedOpen(root,['last-job.json'],JOURNAL_BYTES);const bytes=await buffer(file);await unchanged(root,file);return parse(bytes);}
 catch(error){throw evidenceError(error);}
 finally{if(file)await file.handle.close();}
}

/** Verify at access; a handle pins the opened file while the caller streams it. */
export async function openRecordedOutput({folder,receipt,cache}){
 recordShape(receipt);const root=resolve(folder),p=paths(receipt.id);let output,reportFile;
 try{
  output=await checkedOpen(root,p.output);
  if(output.stat.size!==BigInt(receipt.outputBytes))fail('OUTPUT_CHANGED');
  reportFile=await checkedOpen(root,p.report,REPORT_BYTES);
  const stamp=JSON.stringify(receipt)+'|'+output.stamp+'|'+reportFile.stamp,cached=cache?.get(receipt.id);
  let report;
  if(cached?.stamp===stamp)report=cached.report;
  else{
   const bytes=await buffer(reportFile);if(hash(bytes)!==receipt.reportSha256)fail('REPORT_CHANGED');
   report=parse(bytes);reportIdentity(report,receipt);
   if(await digest(output)!==receipt.outputSha256)fail('OUTPUT_CHANGED');
   const {path,...portable}=report;report=portable;
  }
  await unchanged(root,reportFile);await unchanged(root,output);
  if(cache){cache.delete(receipt.id);cache.set(receipt.id,{stamp,report});while(cache.size>2)cache.delete(cache.keys().next().value);}
  await reportFile.handle.close();reportFile=null;
  return {id:receipt.id,status:'PASS',integrity:'CHECKED_THIS_ACCESS',qualityStatus:receipt.qualityStatus,download:'/exports/'+receipt.id,report:structuredClone(report),handle:output.handle,size:receipt.outputBytes};
 }catch(error){if(reportFile)await reportFile.handle.close().catch(()=>{});if(output)await output.handle.close().catch(()=>{});cache?.delete(receipt.id);throw evidenceError(error);}
}

/** Called only from a completed render or the single existing latest-job recovery. */
export async function captureOutputReceipt({folder,id,outputSha256,createdAt=new Date().toISOString(),origin='RENDER'}){
 outputId(id);
 if(outputSha256===undefined?origin!=='RENDER':typeof outputSha256!=='string'||!HASH.test(outputSha256))fail('INVALID_OUTPUT_RECEIPT');
 const root=resolve(folder),p=paths(id);let file,output;
 try{
  file=await checkedOpen(root,p.report,REPORT_BYTES);const bytes=await buffer(file),report=parse(bytes);await unchanged(root,file);
  outputSha256??=report?.sha256;
  if(typeof outputSha256!=='string'||!HASH.test(outputSha256))fail('INVALID_OUTPUT_RECEIPT');
  if(report?.sha256!==outputSha256)fail('OUTPUT_CHANGED');
  output=await checkedOpen(root,p.output);
  const receipt=recordShape({id,outputSha256,reportSha256:hash(bytes),outputBytes:Number(output.stat.size),projectId:report?.projectId,projectRevision:report?.projectRevision,qualityStatus:quality(report??{}),createdAt,origin});
  reportIdentity(report,receipt);await file.handle.close();file=null;await output.handle.close();output=null;
  const checked=await openRecordedOutput({folder:root,receipt});await checked.handle.close();return receipt;
 }catch(error){if(file)await file.handle.close().catch(()=>{});if(output)await output.handle.close().catch(()=>{});throw evidenceError(error);}
}

export async function createOutputHistory({folder,atomicJson}){
 const root=await realpath(folder),journal=join(root,'output-history.json'),cache=new Map();let entries=[],unavailable=false,journalSha=null;
 async function readJournal(){
  let file;try{file=await checkedOpen(root,['output-history.json'],JOURNAL_BYTES);const bytes=await buffer(file);await unchanged(root,file);return {bytes,data:parse(bytes)};}
  finally{if(file)await file.handle.close();}
 }
 function validJournal(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==2||data.schema!==SCHEMA||!Array.isArray(data.entries)||data.entries.length>LIMIT)fail('INVALID_HISTORY_JOURNAL');
  data.entries.forEach(recordShape);if(new Set(data.entries.map(x=>x.id)).size!==data.entries.length)fail('INVALID_HISTORY_JOURNAL');return data.entries;
 }
 try{const saved=await readJournal();entries=validJournal(saved.data);journalSha=hash(saved.bytes);}catch(error){if(error.code!=='ENOENT')unavailable=true;}
 return {
  list:()=>({status:unavailable?'UNAVAILABLE':'READY',limit:LIMIT,entries:unavailable?[]:entries.map(r=>({...r,integrity:'CHECK_ON_SELECTION'})),...(unavailable?{error:'完成動画の履歴記録を読み込めません。最新の出力は個別に確認できます。'}:{})}),
  receipt:id=>{outputId(id);const r=entries.find(x=>x.id===id);return r?structuredClone(r):undefined;},
  async record(receipt){
   recordShape(receipt);if(unavailable)fail('HISTORY_UNAVAILABLE');const known=entries.find(x=>x.id===receipt.id);
   if(known){if(JSON.stringify(known)!==JSON.stringify(receipt))fail('HISTORY_DUPLICATE_ID');return;}
   try{
    if(journalSha!==null){const current=await readJournal();if(hash(current.bytes)!==journalSha)fail('HISTORY_CHANGED');}
    else{try{await lstat(journal);fail('HISTORY_CHANGED');}catch(error){if(error.code!=='ENOENT')throw error;}}
    const next=[structuredClone(receipt),...entries].slice(0,LIMIT),data={schema:SCHEMA,entries:next},encoded=Buffer.from(JSON.stringify(data));
    if(encoded.length>JOURNAL_BYTES)fail('HISTORY_TOO_LARGE');await parents(root,['output-history.json']);await atomicJson(journal,data);
    entries=next;journalSha=hash(encoded);
   }catch{fail('HISTORY_WRITE_FAILED');}
  },
  async open(id,{fallbackReceipt}={}){
   outputId(id);const receipt=entries.find(x=>x.id===id)??(fallbackReceipt?.id===id?fallbackReceipt:undefined);
   if(!receipt)fail(unavailable?'HISTORY_UNAVAILABLE':'OUTPUT_NOT_FOUND');
   return openRecordedOutput({folder:root,receipt,cache});
  }
 };
}
