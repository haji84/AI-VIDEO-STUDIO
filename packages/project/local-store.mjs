/** Node/workstation adapter. Portable projects never serialize these paths. */
import {createReadStream} from 'node:fs';
import {open,readFile,rename,unlink,realpath,stat,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,dirname,isAbsolute} from 'node:path';
import {EditSession,validateProject} from './project.mjs';

export async function hashFile(file){
  if(!(await stat(file)).isFile())throw new Error('REGULAR_FILE_REQUIRED');
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}
async function identity(file){
  try{const s=await stat(file);return {real:await realpath(file),dev:s.dev,ino:s.ino};}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function assertUnprotected(file,protectedPaths=[]){
  const target=resolve(file),targetInfo=await identity(target);
  for(const p of protectedPaths){
    const other=resolve(p),info=await identity(other);
    if(target===other||(targetInfo&&info&&(targetInfo.real===info.real||
      (targetInfo.ino!==0&&targetInfo.dev===info.dev&&targetInfo.ino===info.ino))))throw new Error('PROTECTED_FILE_OVERWRITE');
  }
}
export async function readLocalJson(file){
  const s=await stat(file);if(!s.isFile()||s.size>32*1024*1024)throw new Error('INVALID_JSON_SIZE');
  return readFile(file,'utf8');
}
export async function saveSession(file,session,{protectedPaths=[]}={}){
  // Validate before opening any destination. Bad snapshots cannot clobber good saves.
  const json=session.serialize();EditSession.open(json);
  await assertUnprotected(file,protectedPaths);
  const target=resolve(file);await mkdir(dirname(target),{recursive:true});
  const tmp=target+'.'+randomUUID()+'.tmp';let handle;
  try{
    handle=await open(tmp,'wx',0o600);await handle.writeFile(json,'utf8');await handle.sync();
    await handle.close();handle=null;
    await assertUnprotected(target,protectedPaths);await rename(tmp,target);
  }finally{if(handle)await handle.close();await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
export async function loadSession(file){return EditSession.open(await readLocalJson(file));}
export async function verifyBindings(project,bindings){
  validateProject(project);if(!Array.isArray(bindings)||bindings.length>100)throw new Error('INVALID_BINDINGS');
  const selected=new Map(),known=new Set(project.sourceRefs.map(s=>s.assetId));
  for(const b of bindings){
    if(!b||!known.has(b.assetId)||Object.keys(b).some(k=>!['assetId','path'].includes(k)))throw new Error('INVALID_BINDING');
    if(selected.has(b.assetId))throw new Error('DUPLICATE_BINDING');
    if(typeof b.path!=='string'||!isAbsolute(b.path)||b.path.includes('\0'))throw new Error('ABSOLUTE_LOCAL_PATH_REQUIRED');
    selected.set(b.assetId,b.path);
  }
  const result=Object.create(null),cache=new Map();
  for(const s of project.sourceRefs){
    const path=selected.get(s.assetId);if(!path)throw new Error('MISSING_BINDING:'+s.assetId);
    const local=await realpath(path);
    if(!cache.has(local))cache.set(local,await hashFile(local));
    if(cache.get(local)!==s.sha256)throw new Error('SOURCE_HASH_MISMATCH:'+s.assetId);
    result[s.assetId]=local;
  }
  return result;
}
