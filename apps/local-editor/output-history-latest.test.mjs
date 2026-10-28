/** The last-job recovery uses the same bounded opened-file checks as history. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,open,symlink,unlink} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as outputs from './output-history.mjs';
const saved={status:'PASS',id:'1'.repeat(32),sha256:'a'.repeat(64)};
test('latest-job reader rejects oversized and linked records before interpreting them',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-latest-bounds-'));try{
  const file=join(dir,'last-job.json');await writeFile(file,JSON.stringify(saved));assert.deepEqual(await outputs.readLastOutputJob(dir),saved);
  await writeFile(file,JSON.stringify(saved)+' '.repeat(64*1024));await assert.rejects(()=>outputs.readLastOutputJob(dir),/OUTPUT_JSON_TOO_LARGE/);
  const other=join(dir,'other.json');await writeFile(other,JSON.stringify(saved));await unlink(file);await symlink(other,file);
  await assert.rejects(()=>outputs.readLastOutputJob(dir),/OUTPUT_PATH_UNSAFE/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('growth after opening cannot exceed the initial read length or become an accepted latest job',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-latest-growth-'));let prototype,original;
 try{
  const file=join(dir,'last-job.json'),bytes=Buffer.from(JSON.stringify(saved));await writeFile(file,bytes);
  const handle=await open(file,'r');prototype=Object.getPrototypeOf(handle);original=prototype.createReadStream;await handle.close();
  let injected=false,readBytes=0;
  prototype.createReadStream=function(options){
   if(!injected){appendFileSync(file,' '.repeat(128*1024));injected=true;}
   const stream=original.call(this,options);stream.on('data',chunk=>{readBytes+=chunk.length;});return stream;
  };
  await assert.rejects(()=>outputs.readLastOutputJob(dir),/OUTPUT_CHANGED/);
  assert.equal(injected,true);assert.equal(readBytes,bytes.length,'reader consumed appended bytes beyond its original bound');
  assert.ok((await readFile(file)).length>64*1024);
 }finally{if(prototype&&original)prototype.createReadStream=original;await rm(dir,{recursive:true,force:true});}
});
