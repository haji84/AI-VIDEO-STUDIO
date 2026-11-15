/** Completed local transfers awaiting validation. Never serve unvalidated media. */
import {lstat,realpath,link,unlink,copyFile,statfs} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,extname} from 'node:path';
import {hashFile,readLocalJson} from '../../packages/project/local-store.mjs';

const extensions=new Set(['.mp4','.mov','.mkv','.webm','.wav','.mp3','.m4a','.aac','.flac','.ogg']);
const idPattern=/^asset_[a-f0-9]{32}$/;
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':');
const fail=code=>{throw new Error(code);};
async function info(file){try{return await lstat(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function valid(record){
 return record&&typeof record==='object'&&!Array.isArray(record)&&idPattern.test(record.uploadId)&&
  ['video','bgm','narration','sfx'].includes(record.kind)&&typeof record.label==='string'&&record.label.length<=160&&
  typeof record.file==='string'&&record.file===record.uploadId+extname(record.file)&&extensions.has(extname(record.file))&&
  Number.isSafeInteger(record.bytes)&&record.bytes>0&&record.bytes<=16*1024**3&&/^[a-f0-9]{64}$/.test(record.sha256)&&
  Object.keys(record).every(key=>['uploadId','kind','label','file','bytes','sha256'].includes(key));
}

export async function createPendingImports({folder,assets,atomicJson}){
 const journal=join(folder,'pending-imports.json');let records=new Map();
 if(await info(journal)){
  const saved=JSON.parse(await readLocalJson(journal));
  if(!Array.isArray(saved)||saved.length>100)fail('PENDING_IMPORTS_INVALID');
  for(const record of saved){if(!valid(record)||records.has(record.uploadId))fail('PENDING_IMPORTS_INVALID');records.set(record.uploadId,record);}
 }
 const save=async next=>{await atomicJson(journal,[...next.values()]);records=next;};
 const views=()=>[...records.values()].map(({uploadId,kind,label,bytes})=>({uploadId,kind,label,bytes}));
 async function checked(uploadId){
  if(!idPattern.test(uploadId))fail('IMPORT_ID_INVALID');
  const record=records.get(uploadId);if(!record)fail('IMPORT_NOT_PENDING');
  const final=join(assets,record.file),staged=final+'.tmp';
  const file=await info(staged)?staged:final,stat=await info(file);
  if(!stat||!stat.isFile()||stat.isSymbolicLink()||stat.size!==record.bytes)fail('IMPORT_BYTES_CHANGED');
  if(await realpath(file)!==join(await realpath(assets),record.file+(file===staged?'.tmp':'')))fail('IMPORT_BYTES_CHANGED');
  if(await hashFile(file)!==record.sha256||stamp(await lstat(file))!==stamp(stat))fail('IMPORT_BYTES_CHANGED');
  return {record,file,final,stamp:stamp(stat)};
 }
 async function materialize(verified){
  if(stamp(await lstat(verified.file))!==verified.stamp)fail('IMPORT_BYTES_CHANGED');
  if(verified.file!==verified.final){
   try{await link(verified.file,verified.final);}
   catch(error){
    if(['ENOTSUP','EOPNOTSUPP','EPERM','EXDEV','ENOSYS','EINVAL'].includes(error.code)){
     const disk=await statfs(assets);
     if(Number(disk.bavail)*Number(disk.bsize)<verified.record.bytes+600*1024**2)fail('IMPORT_FINALIZE_SPACE_NEEDED: 保存先の空き容量を増やしてから再試行してください。送信済みコピーは保持しています。');
     try{await copyFile(verified.file,verified.final,constants.COPYFILE_EXCL);}
     catch(copyError){if(copyError.code!=='EEXIST')throw copyError;}
    }else if(error.code!=='EEXIST')throw error;
    const stat=await info(verified.final);
    if(!stat?.isFile()||stat.isSymbolicLink()||stat.size!==verified.record.bytes||await hashFile(verified.final)!==verified.record.sha256)fail('IMPORT_FINAL_CONFLICT');
   }
   await unlink(verified.file);
  }
  return verified.final;
 }
 return {views,checked,materialize,size:()=>records.size,get:id=>records.get(id),
  record:async record=>{if(!valid(record)||records.has(record.uploadId)||records.size>=100)fail('PENDING_IMPORTS_INVALID');const next=new Map(records);next.set(record.uploadId,record);await save(next);},
  forget:async id=>{if(records.has(id)){const next=new Map(records);next.delete(id);await save(next);}}
 };
}
