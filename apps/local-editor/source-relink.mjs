/** Explicit local source recovery. No arbitrary client paths and no editing on upload. */
import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join,extname,sep} from 'node:path';
import {EditSession} from '../../packages/project/project.mjs';

const MAX_BYTES=16*1024**3,MAX_SOURCES=100,RESERVE=600*1024**2,JSON_LIMIT=4*1024**2;
const EXTENSIONS=new Set(['.mp4','.mov','.mkv','.webm','.wav','.mp3','.m4a','.aac','.flac','.ogg']);
const ID=/^asset_[a-f0-9]{32}$/;
const immutable=['assetId','sha256','mediaKind','durationSec','hasAudio'];
// mediaKind is the saved import role: an audiovisual MP4 may also be BGM.
const intrinsic=['sha256','durationSec','hasAudio'];
const fail=code=>{throw new Error(code);};
const same=(a,b,keys)=>keys.every(k=>a?.[k]===b?.[k]);
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs,s.nlink].join(':');
const currentKey=session=>({projectId:session.current.projectId,revision:session.current.revision});
function checkMedia(source,info){
 if(source.durationSec!==info.durationSec||source.hasAudio!==info.hasAudio||
   (source.mediaKind==='video'?!info.hasVideo:!info.hasAudio))fail('SOURCE_METADATA_MISMATCH');
}

export function collectSessionSources(document){
 const json=JSON.stringify(document);if(typeof json!=='string'||Buffer.byteLength(json)>JSON_LIMIT)fail('RELINK_JSON_SIZE');
 const session=EditSession.open(json),d=JSON.parse(session.serialize()),refs=new Map(),hashes=new Map();
 for(const p of [d.project,...d.undo,...d.redo])for(const source of p.sourceRefs){
  const old=refs.get(source.assetId);
  if(old&&!same(old,source,immutable))fail('SOURCE_IDENTITY_CONFLICT');
  const physicalMatch=hashes.get(source.sha256);
  if(physicalMatch&&!same(physicalMatch,source,intrinsic))fail('SOURCE_IDENTITY_CONFLICT');
  hashes.set(source.sha256,source);
  if(!old)refs.set(source.assetId,structuredClone(source));
 }
 if(refs.size>MAX_SOURCES)fail('SOURCE_COUNT_LIMIT');
 return {session,refs:[...refs.values()]};
}

export async function createSourceRelinkManager({folder,getSession,getRegistry,commitRegistry,probe,commitSession}){
 const assets=join(resolve(folder),'assets'),canonicalAssets=await fs.realpath(assets);
 let plan=null,generation=0;
 async function directory(){
  const s=await fs.lstat(assets);
  if(!s.isDirectory()||s.isSymbolicLink()||await fs.realpath(assets)!==canonicalAssets)fail('SOURCE_PATH_UNSAFE');
 }
 async function safeStat(path){
  try{
   await directory();const s=await fs.lstat(path);
   if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||!Number.isSafeInteger(s.size)||s.size<=0||s.size>MAX_BYTES)fail('SOURCE_FILE_UNSAFE');
   const real=await fs.realpath(path);if(!real.startsWith(canonicalAssets+sep))fail('SOURCE_PATH_UNSAFE');
   return s;
  }catch(error){if(error.code==='ENOENT')fail('SOURCE_MISSING');if(error.code==='ELOOP')fail('SOURCE_PATH_UNSAFE');throw error;}
 }
 async function stableHash(path){
  const before=await safeStat(path),handle=await fs.open(path,'r');
  try{
   if(stamp(await handle.stat())!==stamp(before)||stamp(await safeStat(path))!==stamp(before))fail('SOURCE_CHANGED');
   const hash=createHash('sha256'),buffer=Buffer.alloc(256*1024);let offset=0;
   while(offset<before.size){
    const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,before.size-offset),offset);
    if(bytesRead<=0)fail('SOURCE_CHANGED');hash.update(buffer.subarray(0,bytesRead));offset+=bytesRead;
   }
   if(stamp(await handle.stat())!==stamp(before)||stamp(await safeStat(path))!==stamp(before))fail('SOURCE_CHANGED');
   return {sha256:hash.digest('hex'),size:before.size,stamp:stamp(before),path};
  }finally{await handle.close();}
 }
 function registry(){const r=getRegistry();if(!(r instanceof Map)||r.size>MAX_SOURCES)fail('SOURCE_REGISTRY_INVALID');return r;}
 function capacity(refs){
  const ids=new Set(registry().keys());for(const ref of refs)ids.add(ref.assetId);
  if(ids.size>MAX_SOURCES)fail('SOURCE_COUNT_LIMIT');
 }
 function active(id){
  if(!plan||typeof id!=='string'||id!==plan.id)fail('RELINK_PLAN_INVALID');
  if(!same(plan.base,currentKey(getSession()),['projectId','revision']))fail('RELINK_STALE');
  return plan;
 }
 function publicPlan(p){
  const missing=p.refs.filter(r=>!p.resolved.has(r.assetId)).map(({assetId,mediaKind,durationSec})=>({assetId,mediaKind,durationSec}));
  return {planId:p.id,name:p.session.current.name,total:p.refs.length,available:p.refs.length-missing.length,missing,ready:missing.length===0,base:{...p.base}};
 }
 async function registered(entry,cache){
  if(!entry||!ID.test(entry.assetId)||typeof entry.file!=='string'||!/^asset_[a-f0-9]{32}\.[a-z0-9]+$/.test(entry.file)||!EXTENSIONS.has(extname(entry.file)))fail('SOURCE_REGISTRY_INVALID');
  const path=join(assets,entry.file);
  let checked=cache.get(path);
  if(!checked){
   const proof=await stableHash(path),info=await probe(path);
   if(stamp(await safeStat(path))!==proof.stamp)fail('SOURCE_CHANGED');
   checked={proof,info};cache.set(path,checked);
  }
  const {proof,info}=checked;
  if(proof.sha256!==entry.source?.sha256||(entry.byteLength!==undefined&&entry.byteLength!==proof.size))fail('SOURCE_CHANGED');
  checkMedia(entry.source,info);
  return {entry:{...entry,path,byteLength:proof.size},proof,info};
 }
 async function resolveRefs(refs){
  capacity(refs);const result=new Map(),cache=new Map(),r=registry();
  for(const source of refs){
   const direct=r.get(source.assetId);
   if(direct&&!same(direct.source,source,immutable))fail('SOURCE_ID_CONFLICT');
   const candidate=direct??[...r.values()].find(x=>same(x.source,source,intrinsic));
   if(!candidate)continue;
   const checked=await registered(candidate,cache);
   if(checked.proof.sha256!==source.sha256)fail('SOURCE_CHANGED');
   checkMedia(source,checked.info);
   result.set(source.assetId,{entry:{...checked.entry,assetId:source.assetId,source:structuredClone(source)},proof:checked.proof});
  }
  return result;
 }
 async function addEntries(refs,resolved){
  capacity(refs);const next=new Map(registry());let changed=false;
  for(const source of refs){
   const value=resolved.get(source.assetId);if(!value)fail('SOURCES_MISSING');
   const existing=next.get(source.assetId);
   if(existing){if(!same(existing.source,source,immutable))fail('SOURCE_ID_CONFLICT');}
   else{next.set(source.assetId,value.entry);changed=true;}
  }
  if(changed)await commitRegistry(next);
 }
 async function unchanged(resolved){
  const seen=new Set();
  for(const {proof} of resolved.values())if(!seen.has(proof.path)){
   seen.add(proof.path);if(stamp(await safeStat(proof.path))!==proof.stamp)fail('SOURCE_CHANGED');
  }
 }
 return {
  async prepare(document){
   const sequence=++generation;plan=null;
   const {session,refs}=collectSessionSources(document),base=currentKey(getSession());
   capacity(refs);const resolved=await resolveRefs(refs);
   if(sequence!==generation)fail('RELINK_PLAN_SUPERSEDED');
   if(!same(base,currentKey(getSession()),['projectId','revision']))fail('RELINK_STALE');
   plan={id:randomUUID().replaceAll('-',''),session,refs,base,resolved};return publicPlan(plan);
  },
  status(id){return publicPlan(active(id));},
  async receive(id,body,{label,length}={}){
   const p=active(id);capacity(p.refs);
   if(typeof label!=='string'||label.length>1024)fail('SOURCE_EXTENSION');
   const extension=extname(label).toLowerCase();if(!EXTENSIONS.has(extension))fail('SOURCE_EXTENSION');
   if(!Number.isSafeInteger(length)||length<=0||length>MAX_BYTES)fail('SOURCE_SIZE');
   await directory();const disk=await fs.statfs(folder);
   if(Number(disk.bavail)*Number(disk.bsize)<length+RESERVE)fail('SOURCE_DISK_SPACE');
   active(id);
   const storageId='asset_'+randomUUID().replaceAll('-',''),file=storageId+extension,local=join(assets,file),staged=local+'.tmp';
   try{
    const handle=await fs.open(staged,'wx',0o600);let received=0;
    try{
     for await(const chunk of body){
      received+=chunk.length;if(received>length)fail('SOURCE_LENGTH_MISMATCH');
      let offset=0;
      while(offset<chunk.length){const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset,null);if(bytesWritten<=0)fail('SOURCE_WRITE_FAILED');offset+=bytesWritten;}
     }
     if(received!==length)fail('SOURCE_LENGTH_MISMATCH');await handle.sync();
    }finally{await handle.close();}
    active(id);const beforeProbe=await safeStat(staged),info=await probe(staged);
    if(stamp(await safeStat(staged))!==stamp(beforeProbe))fail('SOURCE_CHANGED');
    const proof=await stableHash(staged);if(proof.size!==length)fail('SOURCE_LENGTH_MISMATCH');
    const matched=p.refs.filter(x=>x.sha256===proof.sha256);if(!matched.length)fail('SOURCE_NOT_IN_PROJECT');
    for(const source of matched)checkMedia(source,info);
    active(id);let resolved=await resolveRefs(matched);
    const shared=[...resolved.values()][0];
    if(shared){
     for(const source of matched)if(!resolved.has(source.assetId))resolved.set(source.assetId,{entry:{...shared.entry,assetId:source.assetId,source:structuredClone(source)},proof:shared.proof});
    }else{
     if(stamp(await safeStat(staged))!==proof.stamp)fail('SOURCE_CHANGED');
     await fs.rename(staged,local);
     const afterRename=await safeStat(local);
     if(afterRename.size!==proof.size||afterRename.dev!==beforeProbe.dev||afterRename.ino!==beforeProbe.ino||afterRename.mtimeMs!==beforeProbe.mtimeMs)fail('SOURCE_CHANGED');
     const movedProof={...proof,path:local,stamp:stamp(afterRename)};
     for(const source of matched)resolved.set(source.assetId,{entry:{assetId:source.assetId,file,path:local,label:label.slice(0,160),byteLength:length,source:structuredClone(source)},proof:movedProof});
    }
    active(id);await unchanged(resolved);await addEntries(matched,resolved);active(id);
    for(const [assetId,value] of resolved)p.resolved.set(assetId,value);
    return publicPlan(p);
   }finally{await fs.unlink(staged).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  },
  async open(id){
   const p=active(id),resolved=await resolveRefs(p.refs);active(id);
   if(resolved.size!==p.refs.length)fail('SOURCES_MISSING');
   await unchanged(resolved);await addEntries(p.refs,resolved);active(id);await unchanged(resolved);
   const result=await commitSession(EditSession.open(p.session.serialize()));plan=null;generation++;return result;
  },
  async cancel(id){active(id);plan=null;generation++;return {cancelled:true};}
 };
}
