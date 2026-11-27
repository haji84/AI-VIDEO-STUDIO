import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {request} from 'node:http';
import {appendFile, link, mkdtemp, readFile, rm, stat, unlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';
import test from 'node:test';
import {startServer} from './server.mjs';
import {createProject, EditSession} from '../../packages/project/project.mjs';

const exec = promisify(execFile);
const chunkBytes = 16 * 1024 ** 2;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('video resumes after an interrupted HTTP chunk and editor restart without resending its confirmed prefix', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aivs-resume-'));
  const workspace = join(root, 'editor');
  let app;
  try {
    app = await startServer({workspace,port:0});
    const original = join(root, 'owned.mp4');
    await exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=1','-c:v','libx264',original]);
    const media = await readFile(original);
    const file = Buffer.alloc(chunkBytes + 4096);
    media.copy(file);
    file.writeUInt32BE(file.length - media.length, media.length);
    file.write('free', media.length + 4);
    const prefix = file.subarray(0, chunkBytes), suffix = file.subarray(chunkBytes);
    const state = async () => fetch(app.url+'/api/state',{headers:{'X-AIVS-Token':app.token}}).then(res=>res.json());
    const post = (route, body, headers={}) => fetch(app.url+'/api/import/resume/'+route,{
      method:'POST',body,headers:{'X-AIVS-Token':app.token,'X-AIVS-Revision':'0',...headers},
    });
    assert.equal((await state()).resumableImport,null);
    const start = await post('start', JSON.stringify({name:'合成動画.mp4',totalBytes:file.length}));
    assert.equal(start.status,200,await start.clone().text());
    const first = await start.json();
    const {uploadId} = first;
    assert.deepEqual(first,{uploadId,name:'合成動画.mp4',totalBytes:file.length,offset:0,chunkBytes,chunkHashes:[]});
    const chunkHeaders = (offset, bytes) => ({
      'Content-Length':String(bytes.length),'X-AIVS-Upload-Id':uploadId,'X-AIVS-Upload-Offset':String(offset),'X-AIVS-Chunk-SHA256':hash(bytes),
    });
    const wrongOffset = await post('chunk',suffix,chunkHeaders(chunkBytes,suffix));
    assert.equal(wrongOffset.status,409);
    const firstResponse = await post('chunk', prefix, chunkHeaders(0,prefix));
    assert.equal(firstResponse.status,200,await firstResponse.clone().text());
    const accepted = await firstResponse.json();
    assert.equal(accepted.offset,chunkBytes);
    assert.deepEqual(accepted.chunkHashes,[hash(prefix)]);

    const broken = request(app.url+'/api/import/resume/chunk',{
      method:'POST',headers:{'X-AIVS-Token':app.token,'X-AIVS-Revision':'0',...chunkHeaders(chunkBytes,suffix)},
    });
    const connectionClosed = new Promise(resolve=>broken.once('close',resolve));
    broken.on('error',()=>{});
    broken.write(suffix.subarray(0,512));
    await delay(75);
    const blocked = await post('start',JSON.stringify({name:'other.mp4',totalBytes:128}));
    assert.equal(blocked.status,409);
    assert.match((await blocked.json()).error,/処理が終わるまで/);
    broken.destroy();
    await connectionClosed;
    const oldToken = app.token;
    await app.close();
    // Model a process interruption after writing an unacknowledged tail.
    const staged = join(workspace, 'assets', uploadId+'.mp4.tmp');
    await appendFile(staged,Buffer.alloc(64,0xa7));
    await stat(staged);
    app = await startServer({workspace,port:0});
    assert.notEqual(app.token,oldToken);
    const resumed = (await state()).resumableImport;
    assert.deepEqual(resumed,accepted);
    const discardedWrongId = await post('discard',JSON.stringify({uploadId:'asset_'+'c'.repeat(32)}));
    assert.equal(discardedWrongId.status,404);
    const finishEarly = await post('finish',JSON.stringify({uploadId}));
    assert.equal(finishEarly.status,409);
    const last = await post('chunk',suffix,chunkHeaders(chunkBytes,suffix));
    assert.equal(last.status,200,await last.clone().text());
    const complete = await last.json();
    assert.equal(complete.offset,file.length);
    assert.deepEqual(complete.chunkHashes,[hash(prefix),hash(suffix)]);
    const duplicate = await post('chunk',suffix,chunkHeaders(chunkBytes,suffix));
    assert.equal(duplicate.status,200,await duplicate.clone().text());
    assert.deepEqual(await duplicate.json(),complete);
    const changedReplay = Buffer.alloc(suffix.length,0x72);
    const conflict = await post('chunk',changedReplay,chunkHeaders(chunkBytes,changedReplay));
    assert.equal(conflict.status,409);
    assert.equal((await stat(staged)).size,file.length);
    const finished = await post('finish',JSON.stringify({uploadId}));
    assert.equal(finished.status,200,await finished.clone().text());
    const result = await finished.json();
    assert.equal(result.resumableImport,null);
    assert.equal(result.pendingImports.length,0);
    assert.equal(result.session.project.sourceRefs.length,1);
    assert.equal(result.session.project.sourceRefs[0].sha256,hash(file));
    const repeated = await post('finish',JSON.stringify({uploadId}),{'X-AIVS-Revision':String(result.session.project.revision)});
    assert.equal(repeated.status,200,await repeated.clone().text());
    assert.equal((await repeated.json()).session.project.sourceRefs.length,1);
    assert.deepEqual(await readFile(original),media);
    assert.deepEqual(await readFile(join(workspace,'assets',uploadId+'.mp4')),file);
  } finally {
    await app?.close();
    await rm(root,{recursive:true,force:true});
  }
});

test('checked complete bytes survive a media validation failure for the ordinary retry route', async () => {
  const root=await mkdtemp(join(tmpdir(),'aivs-resume-retry-'));
  const workspace=join(root,'editor');
  const toolDirectory=process.env.AIVS_FFMPEG_DIR;
  let app;
  try {
    const original=join(root,'source.mp4');
    await exec('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=1','-c:v','libx264',original]);
    const bytes=await readFile(original);
    app=await startServer({workspace,port:0});
    const call=(route,body,headers={})=>fetch(app.url+'/api/'+route,{
      method:'POST',body,headers:{'X-AIVS-Token':app.token,'X-AIVS-Revision':'0',...headers},
    });
    const state=()=>fetch(app.url+'/api/state',{headers:{'X-AIVS-Token':app.token}}).then(res=>res.json());
    const suffix='import/resume/';
    const start=await call(suffix+'start',JSON.stringify({name:'検査用.mov',totalBytes:bytes.length}));
    assert.equal(start.status,200,await start.clone().text());
    const {uploadId}=await start.json();
    const headers={'Content-Length':String(bytes.length),'X-AIVS-Upload-Id':uploadId,'X-AIVS-Upload-Offset':'0'};
    const badChunk=await call(suffix+'chunk',bytes,{...headers,'X-AIVS-Chunk-SHA256':'0'.repeat(64)});
    assert.equal(badChunk.status,400);
    assert.equal((await state()).resumableImport.offset,0);
    const goodChunk=await call(suffix+'chunk',bytes,{...headers,'X-AIVS-Chunk-SHA256':hash(bytes)});
    assert.equal(goodChunk.status,200,await goodChunk.clone().text());
    const staged=join(workspace,'assets',uploadId+'.mov.tmp');
    const changed=Buffer.from(bytes);changed[changed.length-1]^=1;
    await writeFile(staged,changed);
    const badFinish=await call(suffix+'finish',JSON.stringify({uploadId}));
    assert.equal(badFinish.status,409);
    assert.equal((await state()).pendingImports.length,0);
    await writeFile(staged,bytes);
    process.env.AIVS_FFMPEG_DIR=join(root,'intentionally-missing-tools');
    const failedProbe=await call(suffix+'finish',JSON.stringify({uploadId}));
    assert.equal(failedProbe.status,400);
    const pending=await state();
    assert.equal(pending.resumableImport,null);
    assert.deepEqual(pending.pendingImports.map(row=>row.uploadId),[uploadId]);
    const discard=await call(suffix+'discard',JSON.stringify({uploadId}));
    assert.equal(discard.status,409);
    assert.deepEqual(await readFile(staged),bytes);
    await app.close();
    app=await startServer({workspace,port:0});
    if(toolDirectory===undefined)delete process.env.AIVS_FFMPEG_DIR;
    else process.env.AIVS_FFMPEG_DIR=toolDirectory;
    const retry=await call('import/retry',JSON.stringify({uploadId}));
    assert.equal(retry.status,200,await retry.clone().text());
    assert.equal((await retry.json()).session.project.sourceRefs[0].sha256,hash(bytes));
    assert.equal((await state()).pendingImports.length,0);
  } finally {
    if(toolDirectory===undefined)delete process.env.AIVS_FFMPEG_DIR;
    else process.env.AIVS_FFMPEG_DIR=toolDirectory;
    await app?.close();
    await rm(root,{recursive:true,force:true});
  }
});

test('resume endpoints enforce authorization, project ownership, limits and safe discard', async () => {
  const root=await mkdtemp(join(tmpdir(),'aivs-resume-guard-'));
  const workspace=join(root,'editor');
  let app;
  try {
    app=await startServer({workspace,port:0});
    let revision=0;
    const call=(route,body,headers={})=>fetch(app.url+'/api/'+route,{
      method:'POST',body,headers:{'X-AIVS-Token':app.token,'X-AIVS-Revision':String(revision),...headers},
    });
    const state=()=>fetch(app.url+'/api/state',{headers:{'X-AIVS-Token':app.token}}).then(res=>res.json());
    const suffix='import/resume/';
    const name='記'.repeat(164)+'.mp4';
    const input=JSON.stringify({name,totalBytes:32});
    const original=(await state()).session;
    assert.equal((await call(suffix+'start',input,{Origin:'https://example.invalid'})).status,403);
    assert.equal((await call(suffix+'start',input,{'X-AIVS-Token':'bad'})).status,403);
    assert.equal((await call(suffix+'start',input,{'X-AIVS-Revision':'-1'})).status,409);
    assert.equal((await call(suffix+'start',JSON.stringify({name:'a.mp4',totalBytes:16*1024**3+1}))).status,413);
    assert.equal((await call(suffix+'start',JSON.stringify({name:'../a.mp4',totalBytes:32}))).status,400);
    const start=await call(suffix+'start',input);
    assert.equal(start.status,200,await start.clone().text());
    const record=await start.json();
    assert.equal(record.name,name);
    const {uploadId}=record;
    const bytes=Buffer.alloc(32,0x2b);
    const headers={'Content-Length':String(bytes.length),'X-AIVS-Upload-Id':uploadId,'X-AIVS-Upload-Offset':'0','X-AIVS-Chunk-SHA256':hash(bytes)};
    const other=new EditSession(createProject({projectId:'project_unrelated'}));
    const opened=await call('open',other.serialize());
    assert.equal(opened.status,200,await opened.clone().text());
    const otherState=await opened.json();
    revision=otherState.session.project.revision;
    assert.equal(otherState.resumableImport,null);
    assert.equal((await call(suffix+'chunk',bytes,headers)).status,409);
    assert.equal((await call(suffix+'discard',JSON.stringify({uploadId}))).status,409);
    const returned=await call('open',JSON.stringify(original));
    assert.equal(returned.status,200,await returned.clone().text());
    const prior=await returned.json();
    revision=prior.session.project.revision;
    assert.equal(prior.resumableImport.uploadId,uploadId);
    const received=await call(suffix+'chunk',bytes,headers);
    assert.equal(received.status,200,await received.clone().text());
    const asset=join(workspace,'assets',uploadId+'.mp4.tmp');
    const adjacent=join(root,'owned.txt');
    await writeFile(adjacent,'keep');
    if(process.platform!=='win32'){
      // A local substitution referring to another file must not be mutated or deleted.
      await unlink(asset);
      await link(adjacent,asset);
      const unsafe=await call(suffix+'discard',JSON.stringify({uploadId}));
      assert.equal(unsafe.status,409);
      assert.equal(await readFile(adjacent,'utf8'),'keep');
      assert.equal((await stat(asset)).nlink,2);
      await unlink(asset);
      await writeFile(asset,bytes,{flag:'wx'});
    }
    const discarded=await call(suffix+'discard',JSON.stringify({uploadId}));
    assert.equal(discarded.status,200,await discarded.clone().text());
    assert.equal((await discarded.json()).resumableImport,null);
    assert.equal(await readFile(adjacent,'utf8'),'keep');
    await assert.rejects(stat(asset),{code:'ENOENT'});
  } finally {
    await app?.close();
    await rm(root,{recursive:true,force:true});
  }
});
