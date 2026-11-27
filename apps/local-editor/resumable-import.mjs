/** One project-bound video transfer. An offset is acknowledged only after its bytes are synced. */
import {createHash, randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat, open, realpath, unlink} from 'node:fs/promises';
import {extname, join} from 'node:path';

const chunkBytes = 16 * 1024 ** 2;
const videoExtensions = new Set(['.mp4','.mov','.mkv','.webm']);
const idPattern = /^asset_[a-f0-9]{32}$/;
const projectPattern = /^project_[A-Za-z0-9_-]{1,70}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const fail = (code, status=400) => {throw Object.assign(new Error(code),{status});};
const extension = name => extname(name).toLowerCase();
const validName = name => typeof name==='string' && name.length<=255 &&
  !/[\/\\\x00-\x1f\x7f]/.test(name) && videoExtensions.has(extension(name));
const position = record => Math.min(record.totalBytes,record.acceptedChunks*chunkBytes);
const validManifest = (hashes, bytes) => Array.isArray(hashes) && hashes.length===Math.ceil(bytes/chunkBytes) &&
  hashes.every(value=>typeof value==='string' && hashPattern.test(value));
const exactKeys = (object, keys) => object && Object.getPrototypeOf(object)===Object.prototype &&
  Object.keys(object).length===keys.length && keys.every(key=>Object.hasOwn(object,key));
const stamp = value => [value.dev,value.ino,value.size,value.mtimeMs,value.ctimeMs].join(':');

async function fileInfo(path) {
  try { return await lstat(path); }
  catch (error) { if(error.code==='ENOENT')return null;throw error; }
}

function safeFile(info) {
  if(!info?.isFile() || info.nlink!==1)fail('RESUMABLE_IMPORT_UNSAFE_FILE',409);
}

function integer(value) {
  return typeof value==='string' && /^(0|[1-9][0-9]{0,15})$/.test(value) ? Number(value) : NaN;
}

async function collectChunk(body, length, expected) {
  const bytes = Buffer.allocUnsafe(length);
  let received=0;
  for await(const part of body) {
    if(received+part.length>length)fail('RESUMABLE_IMPORT_CHUNK_LENGTH');
    part.copy(bytes,received);
    received+=part.length;
  }
  if(received!==length)fail('RESUMABLE_IMPORT_CHUNK_LENGTH');
  if(createHash('sha256').update(bytes).digest('hex')!==expected)fail('RESUMABLE_IMPORT_CHUNK_HASH');
  return bytes;
}

export async function createResumableImport({
  folder, assets, atomicJson, maxImportBytes, getProjectId, handedOff, requireImportSpace, availableImportBytes,
}) {
  const journal=join(folder,'resumable-import.json');
  const validSize=value=>Number.isSafeInteger(value)&&value>0&&value<=maxImportBytes;
  let saved=null;
  const journalInfo=await fileInfo(journal);
  if(journalInfo) {
    safeFile(journalInfo);
    if(journalInfo.size>80*1024)fail('RESUMABLE_IMPORT_INVALID_JOURNAL');
    const handle=await open(journal,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try {
      if(stamp(await handle.stat())!==stamp(journalInfo))fail('RESUMABLE_IMPORT_INVALID_JOURNAL');
      try { saved=JSON.parse(await handle.readFile('utf8')); }
      catch { fail('RESUMABLE_IMPORT_INVALID_JOURNAL'); }
    } finally { await handle.close(); }
    if(saved!==null&&(!exactKeys(saved,['uploadId','projectId','name','totalBytes','acceptedChunks','chunkHashes'])||
      typeof saved.uploadId!=='string'||!idPattern.test(saved.uploadId)||
      typeof saved.projectId!=='string'||!projectPattern.test(saved.projectId)||
      !validName(saved.name)||!validSize(saved.totalBytes)||!validManifest(saved.chunkHashes,saved.totalBytes)||
      !Number.isSafeInteger(saved.acceptedChunks)||saved.acceptedChunks<0||saved.acceptedChunks>saved.chunkHashes.length)) {
      fail('RESUMABLE_IMPORT_INVALID_JOURNAL');
    }
  }
  const active=()=>saved!==null&&!handedOff(saved.uploadId);
  const present=record=>({
    uploadId:record.uploadId,name:record.name,totalBytes:record.totalBytes,offset:position(record),
    chunkBytes,chunkHashes:[...record.chunkHashes],
  });
  const fileName=record=>record.uploadId+extension(record.name);
  const staged=record=>join(assets,fileName(record)+'.tmp');
  async function update(record) {
    const previous=await fileInfo(journal);
    if(previous)safeFile(previous);
    await atomicJson(journal,record);
    saved=record;
  }
  function owned(uploadId) {
    if(typeof uploadId!=='string'||!idPattern.test(uploadId))fail('RESUMABLE_IMPORT_INVALID_ID');
    if(!saved||saved.uploadId!==uploadId)fail('RESUMABLE_IMPORT_NOT_FOUND',404);
    if(saved.projectId!==getProjectId())fail('RESUMABLE_IMPORT_PROJECT_CONFLICT',409);
    return saved;
  }
  async function stagedInfo(file) {
    if(await realpath(assets)!==assets)fail('RESUMABLE_IMPORT_UNSAFE_FILE',409);
    const info=await fileInfo(file);
    if(info)safeFile(info);
    return info;
  }
  async function checkedHandle(file, flags, info) {
    const handle=await open(file,flags|(constants.O_NOFOLLOW??0),0o600);
    try {
      const actual=await handle.stat();
      safeFile(actual);
      if(info&&stamp(actual)!==stamp(info))fail('RESUMABLE_IMPORT_BYTES_CHANGED',409);
      return handle;
    } catch(error) { await handle.close();throw error; }
  }
  return {
    active,
    view:()=>active()&&saved.projectId===getProjectId()?present(saved):null,
    async start(body) {
      if(!exactKeys(body,['name','totalBytes','chunkHashes'])||!validName(body.name))fail('RESUMABLE_IMPORT_INVALID_VIDEO');
      if(!validSize(body.totalBytes))fail('RESUMABLE_IMPORT_SIZE_LIMIT',413);
      if(!validManifest(body.chunkHashes,body.totalBytes))fail('RESUMABLE_IMPORT_INVALID_MANIFEST');
      if(active())fail('RESUMABLE_IMPORT_ALREADY_ACTIVE',409);
      requireImportSpace();
      if(body.totalBytes>await availableImportBytes())fail('保存先の空き容量が不足しています');
      const record={uploadId:'asset_'+randomUUID().replaceAll('-',''),projectId:getProjectId(),
        name:body.name,totalBytes:body.totalBytes,acceptedChunks:0,chunkHashes:[...body.chunkHashes]};
      await update(record);
      return present(record);
    },
    async chunk(body,headers) {
      const record=owned(headers['x-aivs-upload-id']);
      if(!active())fail('RESUMABLE_IMPORT_ALREADY_FINISHED',409);
      const offset=integer(headers['x-aivs-upload-offset']);
      const length=integer(headers['content-length']);
      const digest=headers['x-aivs-chunk-sha256'];
      if(!Number.isSafeInteger(offset)||offset%chunkBytes!==0||offset>=record.totalBytes||offset>position(record)) {
        fail('RESUMABLE_IMPORT_OFFSET_CONFLICT',409);
      }
      if(length!==Math.min(chunkBytes,record.totalBytes-offset))fail('RESUMABLE_IMPORT_CHUNK_LENGTH');
      if(typeof digest!=='string'||!hashPattern.test(digest))fail('RESUMABLE_IMPORT_CHUNK_HASH');
      const index=offset/chunkBytes;
      if(record.chunkHashes[index]!==digest)fail('RESUMABLE_IMPORT_CHUNK_MISMATCH',409);
      const bytes=await collectChunk(body,length,digest);
      if(index<record.acceptedChunks)return present(record);

      const file=staged(record), info=await stagedInfo(file);
      if((!info&&offset!==0)||(info&&(info.size<offset||info.size>offset+length)))fail('RESUMABLE_IMPORT_BYTES_CHANGED',409);
      const flags=info?constants.O_RDWR:constants.O_RDWR|constants.O_CREAT|constants.O_EXCL;
      const handle=await checkedHandle(file,flags,info);
      try {
        if(info&&info.size!==offset)await handle.truncate(offset);
        if(length>await availableImportBytes())fail('保存先の空き容量が不足しています');
        for(let written=0;written<length;) {
          const part=await handle.write(bytes,written,length-written,offset+written);
          if(!part.bytesWritten)fail('RESUMABLE_IMPORT_WRITE_FAILED');
          written+=part.bytesWritten;
        }
        await handle.sync();
      } finally { await handle.close(); }
      const next={...record,acceptedChunks:record.acceptedChunks+1};
      await update(next);
      return present(next);
    },
    async prepareFinish(uploadId) {
      const record=owned(uploadId);
      if(handedOff(uploadId))return null;
      if(position(record)!==record.totalBytes)fail('RESUMABLE_IMPORT_INCOMPLETE',409);
      const file=staged(record), info=await stagedInfo(file);
      if(info?.size!==record.totalBytes)fail('RESUMABLE_IMPORT_BYTES_CHANGED',409);
      const handle=await checkedHandle(file,constants.O_RDONLY,info);
      const fullHash=createHash('sha256');
      try {
        const buffer=Buffer.allocUnsafe(Math.min(chunkBytes,record.totalBytes));
        let offset=0;
        for(const digest of record.chunkHashes) {
          const length=Math.min(chunkBytes,record.totalBytes-offset);
          for(let read=0;read<length;) {
            const part=await handle.read(buffer,read,length-read,offset+read);
            if(!part.bytesRead)fail('RESUMABLE_IMPORT_BYTES_CHANGED',409);
            read+=part.bytesRead;
          }
          const bytes=buffer.subarray(0,length);
          if(createHash('sha256').update(bytes).digest('hex')!==digest)fail('RESUMABLE_IMPORT_BYTES_CHANGED',409);
          fullHash.update(bytes);offset+=length;
        }
        if(stamp(await handle.stat())!==stamp(info)||stamp(await stagedInfo(file)??{})!==stamp(info)) {
          fail('RESUMABLE_IMPORT_BYTES_CHANGED',409);
        }
      } finally { await handle.close(); }
      return {uploadId,kind:'video',label:record.name.slice(0,160),file:fileName(record),
        bytes:record.totalBytes,sha256:fullHash.digest('hex')};
    },
    async discard(uploadId) {
      const record=owned(uploadId);
      if(handedOff(uploadId))fail('RESUMABLE_IMPORT_ALREADY_FINISHED',409);
      const file=staged(record);
      if(await stagedInfo(file))await unlink(file);
      await update(null);
    },
  };
}
