import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import {createHash} from 'node:crypto';
const SHA=v=>createHash('sha256').update(v).digest('hex');
const FP=SHA('sample-fixture-file-identity');
async function putChunk(fx,uploadId,n,data){return api(worker,fx,`/api/uploads/${uploadId}/parts/${n}`,{method:'PUT',body:data,headers:{'x-content-sha256':SHA(data)}})}
import {api,fixture} from './helpers.mjs';
const createProject=async fx=>(await api(worker,fx,'/api/projects',{method:'POST',body:{name:'訓練の記録',mode:'training'}})).data.project.id;

async function uploaded(fx,id,filename='source.mp4',bytes=123){
  const init=await api(worker,fx,`/api/projects/${id}/uploads`,{method:'POST',body:{filename,bytes,fingerprint:FP}});
  assert.equal(init.status,201,JSON.stringify(init.data));
  const uploadId=init.data.uploadId;
  let numParts=init.data.totalParts,step=init.data.partSize;
  for(let n=1;n<=numParts;n++){
    const size=n===numParts?bytes-(n-1)*step:step;
    const content=new Uint8Array(size);content.fill(n);
    const part=await putChunk(fx,uploadId,n,content);
    assert.equal(part.status,200,JSON.stringify(part.data));
  }
  const done=await api(worker,fx,`/api/uploads/${uploadId}/complete`,{method:'POST',body:{}});
  assert.equal(done.status,200,JSON.stringify(done.data));
  return {...done.data,uploadId};
}

test('health announces preview limitations, no protected state without auth',async()=>{
 const f=fixture();const health=await api(worker,f,'/api/health',{token:null});
 assert.equal(health.status,200);assert.equal(health.data.processorConnected,false);assert.equal(health.data.billingEnabled,false);
 const list=await api(worker,f,'/api/projects',{token:null});assert.equal(list.status,401);
 const invalid=await api(worker,f,'/api/projects',{token:'not-the-token'});assert.equal(invalid.status,401);
 const misconfigured=fixture();misconfigured.env.OWNER_TOKEN='';const bad=await api(worker,misconfigured,'/api/projects');assert.equal(bad.status,503);
});

test('cross-origin mutations refused with owner token, ordinary reads allowed',async()=>{
 const f=fixture();const response=await api(worker,f,'/api/projects',{method:'POST',origin:'https://evil.example',body:{name:'a',mode:'training'}});
 assert.equal(response.status,403);assert.equal((await api(worker,f,'/api/projects')).data.projects.length,0);
});

test('create, list and reopen independent projects',async()=>{
 const f=fixture(),one=await createProject(f),two=await createProject(f);
 assert.notEqual(one,two);
 const list=await api(worker,f,'/api/projects');assert.equal(list.data.projects.length,2);
 const detail=await api(worker,f,`/api/projects/${one}`);assert.equal(detail.data.project.timeline.length,0);
 const unknown=await api(worker,f,'/api/projects/proj_'+ '0'.repeat(32));assert.equal(unknown.status,404);
});

test('multipart upload recovers and verifies exact 8MiB + final chunk',async()=>{
 const f=fixture(),id=await createProject(f),bytes=8*1024*1024+1024*1024;
 const init=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'GoPro.MP4',bytes,fingerprint:FP}});
 assert.equal(init.status,201);assert.equal(init.data.totalParts,2);
 const uploadId=init.data.uploadId;
 const first=await putChunk(f,uploadId,1,new Uint8Array(8*1024*1024));
 assert.equal(first.status,200);
 const status=await api(worker,f,`/api/uploads/${uploadId}`);
 assert.deepEqual(status.data.upload.parts,[1]);
 const tooEarly=await api(worker,f,`/api/uploads/${uploadId}/complete`,{method:'POST',body:{}});
 assert.equal(tooEarly.status,409);
 const second=await putChunk(f,uploadId,2,new Uint8Array(1024*1024));
 assert.equal(second.status,200);
 const completed=await api(worker,f,`/api/uploads/${uploadId}/complete`,{method:'POST',body:{}});
 assert.equal(completed.status,200);
 assert.equal(completed.data.bytes,bytes);
 const repeated=await api(worker,f,`/api/uploads/${uploadId}/complete`,{method:'POST',body:{}});
 assert.equal(repeated.data.alreadyComplete,true);
 const detail=await api(worker,f,`/api/projects/${id}`);
 assert.equal(detail.data.assets.length,1);assert.equal(detail.data.assets[0].bytes,bytes);
});

test('invalid chunk size fails before R2 and does not credit upload',async()=>{
 const f=fixture(),id=await createProject(f);
 const init=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'camera.mp4',bytes:8*1024*1024+1,fingerprint:FP}});
 const bad=await api(worker,f,`/api/uploads/${init.data.uploadId}/parts/1`,{method:'PUT',body:new Uint8Array(3)});
 assert.equal(bad.status,400);const status=await api(worker,f,`/api/uploads/${init.data.uploadId}`);
 assert.equal(status.data.upload.uploadedBytes,0);
});

test('project quota rejects excess single video, and path escape names are sanitized',async()=>{
 const f=fixture(),id=await createProject(f);
 const large=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'x.mp4',bytes:9*1024**3,fingerprint:FP}});
 assert.equal(large.status,413);
 const weird=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'../../path\\to\\video.mp4',bytes:48,fingerprint:FP}});
 assert.equal(weird.status,201);
 const u=await f.env.DB.prepare('SELECT filename,object_key FROM uploads WHERE id=?').bind(weird.data.uploadId).first();
 assert.ok(!u.filename.includes('/'));assert.ok(!u.filename.includes('\\'));
 assert.ok(u.object_key.startsWith('owner_preview/'+id+'/'));
});

test('timeline supports multiple clips, revision conflict and invalid camera rejection',async()=>{
 const f=fixture(),id=await createProject(f);
 const a=await uploaded(f,id,'GCVL5592.mp4'),b=await uploaded(f,id,'GX014526.mp4'),c=await uploaded(f,id,'camera3.mp4');
 const clip={id:'clip_aaa',sourceId:a.assetId,secondarySourceId:b.assetId,start:0,duration:5,speed:1,layout:'split',caption:'準備'};
 const put=await api(worker,f,`/api/projects/${id}`,{method:'PATCH',body:{expectedRevision:1,timeline:[clip,{...clip,id:'clip_bbb',sourceId:c.assetId,layout:'single',duration:3}]}});
 assert.equal(put.status,200);assert.equal(put.data.revision,2);
 const conflict=await api(worker,f,`/api/projects/${id}`,{method:'PATCH',body:{expectedRevision:1,timeline:[]}});
 assert.equal(conflict.status,409);
 const bad=await api(worker,f,`/api/projects/${id}`,{method:'PATCH',body:{expectedRevision:2,timeline:[{...clip,sourceId:'asset_nonexistent'}]}});
 assert.equal(bad.status,400);
 const detail=await api(worker,f,`/api/projects/${id}`);assert.equal(detail.data.project.timeline.length,2);
});

test('editing is queued without claiming an automatic processor or billing',async()=>{
 const f=fixture(),id=await createProject(f);
 const absent=await api(worker,f,`/api/projects/${id}/jobs`,{method:'POST',body:{kind:'edit',quality:'review'}});
 assert.equal(absent.status,409);
 await uploaded(f,id);
 const queued=await api(worker,f,`/api/projects/${id}/jobs`,{method:'POST',body:{kind:'edit',quality:'review'}});
 assert.equal(queued.status,202);assert.equal(queued.data.status,'waiting_for_processor');
 assert.equal(f.env.MEDIA.calls.filter(x=>x==='create').length,1);
 const latest=await api(worker,f,`/api/jobs/${queued.data.jobId}`);
 assert.equal(latest.data.job.progress,0);assert.equal(latest.data.job.status,'waiting_for_processor');
});

test('unconverted .insv is safely held out of editing',async()=>{
 const f=fixture(),id=await createProject(f);await uploaded(f,id,'VID_0000_00_123.insv');
 const r=await api(worker,f,`/api/projects/${id}/jobs`,{method:'POST',body:{kind:'edit'}});
 assert.equal(r.status,409);assert.equal(r.data.code,'MEDIA_NOT_READY');
});

test('abort prevents completion and preserves other upload sessions',async()=>{
 const f=fixture(),id=await createProject(f);
 const x=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'x.mp4',bytes:50,fingerprint:FP}});
 const y=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'y.mp4',bytes:60,fingerprint:FP}});
 const abort=await api(worker,f,`/api/uploads/${x.data.uploadId}/abort`,{method:'POST',body:{}});
 assert.equal(abort.data.status,'aborted');
 const refused=await api(worker,f,`/api/uploads/${x.data.uploadId}/parts/1`,{method:'PUT',body:new Uint8Array(50)});
 assert.equal(refused.status,409);
 const active=await api(worker,f,`/api/uploads/${y.data.uploadId}`);
 assert.equal(active.data.upload.status,'uploading');
});

test('internal service API is separately authenticated and execution is disabled by default',async()=>{
 const f=fixture(),id=await createProject(f);await uploaded(f,id);
 const q=await api(worker,f,`/api/projects/${id}/jobs`,{method:'POST',body:{kind:'render'}});
 const jobId=q.data.jobId;
 const unauth=await api(worker,f,`/api/internal/jobs/${jobId}/manifest`);
 assert.equal(unauth.status,503); // no service credential configured
 f.env.WORKER_TOKEN='test-worker-token-long-and-not-for-production-xxx';
 const wrong=await api(worker,f,`/api/internal/jobs/${jobId}/manifest`);
 assert.equal(wrong.status,401);
 const manifest=await api(worker,f,`/api/internal/jobs/${jobId}/manifest`,{token:f.env.WORKER_TOKEN});
 assert.equal(manifest.status,200);
 assert.equal(manifest.data.manifest.sources.length,1);
 assert.equal(manifest.data.manifest.allowUnverifiedSync,false);
 const claim=await api(worker,f,`/api/internal/jobs/${jobId}/claim`,{method:'POST',body:{},token:f.env.WORKER_TOKEN});
 assert.equal(claim.status,503);assert.equal(claim.data.code,'PROCESSOR_DISABLED');
});

test('mode persists without starting media processing, usage is measured but not billed',async()=>{
 const f=fixture(),id=await createProject(f);
 const changed=await api(worker,f,`/api/projects/${id}`,{method:'PATCH',body:{expectedRevision:1,mode:'documentary'}});
 assert.equal(changed.status,200);
 assert.equal((await api(worker,f,`/api/projects/${id}`)).data.project.mode,'documentary');
 await uploaded(f,id,'clip.mp4',100);
 const usage=await api(worker,f,'/api/usage');
 assert.equal(usage.status,200);
 assert.equal(usage.data.usage.find(x=>x.metric==='uploaded_bytes').total,100);
 assert.equal(usage.data.billedJpy,null);
});

test('service claims cannot run until both execution switches are explicitly enabled',async()=>{
 const f=fixture(),id=await createProject(f);await uploaded(f,id,'clip.mp4',100);
 const q=await api(worker,f,`/api/projects/${id}/jobs`,{method:'POST',body:{kind:'render',quality:'review'}});const jobId=q.data.jobId;
 f.env.WORKER_TOKEN='local-test-service-token-please-never-deploy';
 f.env.PROCESSOR_ENABLED='1';
 const blocked=await api(worker,f,`/api/internal/jobs/${jobId}/claim`,{method:'POST',body:{},token:f.env.WORKER_TOKEN});
 assert.equal(blocked.status,503);
 f.env.CLOUD_PROCESSING_APPROVED='1';
 const claim=await api(worker,f,`/api/internal/jobs/${jobId}/claim`,{method:'POST',body:{},token:f.env.WORKER_TOKEN});
 assert.equal(claim.status,200);
 const failedReport=await api(worker,f,`/api/internal/jobs/${jobId}/report`,{method:'POST',body:{success:true,technicalOk:true,resultKey:`owner_preview/${id}/exports/${jobId}/result.mp4`},token:f.env.WORKER_TOKEN});
 assert.equal(failedReport.status,409);
 const status=await api(worker,f,`/api/jobs/${jobId}`);assert.equal(status.data.job.status,'processing');
 const end=await api(worker,f,`/api/internal/jobs/${jobId}/report`,{method:'POST',body:{success:false,errorCode:'SYNC_UNVERIFIED'},token:f.env.WORKER_TOKEN});
 assert.equal(end.status,200);
 assert.equal((await api(worker,f,`/api/jobs/${jobId}`)).data.job.status,'failed');
});

test('preview hard budget stops videos above 32 MiB before R2 multipart initiation',async()=>{
 const f=fixture(),id=await createProject(f),count=f.env.MEDIA.calls.length;
 const r=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'long.mp4',bytes:33*1024*1024,fingerprint:FP}});
 assert.equal(r.status,413);assert.equal(r.data.code,'PREVIEW_BUDGET_GATE');
 assert.equal(f.env.MEDIA.calls.length,count);
 const limits=await api(worker,f,'/api/me');
 assert.equal(limits.data.limits.maxSourceBytes,32*1024*1024);
 assert.equal(limits.data.preflight.readyForLargeVideos,false);
});

test('preview storage budget enforces total across different projects',async()=>{
 const f=fixture(),a=await createProject(f),b=await createProject(f);
 const first=await api(worker,f,`/api/projects/${a}/uploads`,{method:'POST',body:{filename:'a.mp4',bytes:20*1024*1024,fingerprint:FP}});
 assert.equal(first.status,201);
 const blocked=await api(worker,f,`/api/projects/${b}/uploads`,{method:'POST',body:{filename:'b.mp4',bytes:15*1024*1024,fingerprint:FP}});
 assert.equal(blocked.status,413);assert.equal(blocked.data.code,'PREVIEW_BUDGET_GATE');
});

test('chunk checksum is compulsory and no wrong bytes are accepted',async()=>{
 const f=fixture(),id=await createProject(f);
 const init=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'hash.mp4',bytes:10,fingerprint:FP}});
 const name=`/api/uploads/${init.data.uploadId}/parts/1`,content=new Uint8Array(10);
 const missing=await api(worker,f,name,{method:'PUT',body:content});
 assert.equal(missing.status,400);assert.equal(missing.data.code,'CHUNK_SHA_REQUIRED');
 const wrong=await api(worker,f,name,{method:'PUT',body:content,headers:{'x-content-sha256':SHA('not matching')}});
 assert.equal(wrong.status,409);assert.equal(wrong.data.code,'CHUNK_SHA_MISMATCH');
 assert.equal((await api(worker,f,`/api/uploads/${init.data.uploadId}`)).data.upload.uploadedBytes,0);
 assert.equal((await putChunk(f,init.data.uploadId,1,content)).status,200);
});

test('file fingerprint is required for safe resume and returned unchanged',async()=>{
 const f=fixture(),id=await createProject(f);
 const invalid=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'x.mp4',bytes:10}});
 assert.equal(invalid.data.code,'FINGERPRINT_REQUIRED');
 const good=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'x.mp4',bytes:10,fingerprint:FP}});
 assert.equal(good.status,201);
 const status=await api(worker,f,`/api/uploads/${good.data.uploadId}`);
 assert.equal(status.data.upload.fingerprint,FP);
});

test('render job snapshots its source list and timeline, blocking duplicate unresolved jobs',async()=>{
 const f=fixture(),id=await createProject(f);
 const first=await uploaded(f,id,'cam_a.mp4',100);
 const clip={id:'clip_frozen',sourceId:first.assetId,start:0,duration:1,speed:1,layout:'single',caption:'初期版'};
 await api(worker,f,`/api/projects/${id}`,{method:'PATCH',body:{expectedRevision:1,timeline:[clip]}});
 f.env.WORKER_TOKEN='snapshot-test-internal-worker-token-xxxxxxxx';
 const q=await api(worker,f,`/api/projects/${id}/jobs`,{method:'POST',body:{kind:'render',quality:'review'}});
 assert.equal(q.status,202);
 const dup=await api(worker,f,`/api/projects/${id}/jobs`,{method:'POST',body:{kind:'render',quality:'review'}});
 assert.equal(dup.status,409);assert.equal(dup.data.code,'JOB_BUDGET_GATE');
 await uploaded(f,id,'cam_b.mp4',200);
 await api(worker,f,`/api/projects/${id}`,{method:'PATCH',body:{expectedRevision:2,timeline:[]}});
 const snapshot=await api(worker,f,`/api/internal/jobs/${q.data.jobId}/manifest`,{token:f.env.WORKER_TOKEN});
 assert.equal(snapshot.status,200);
 assert.equal(snapshot.data.manifest.sources.length,1);
 assert.equal(snapshot.data.manifest.timeline[0].caption,'初期版');
});


test('large upload requires both independent approval flags and explicit storage cap',async()=>{
 const f=fixture(),id=await createProject(f);
 f.env.MAX_PREVIEW_STORAGE_BYTES=20*1024**3;
 let x=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'large.mp4',bytes:40*1024*1024,fingerprint:FP}});
 assert.equal(x.status,413);
 f.env.LARGE_UPLOAD_APPROVED='1';
 x=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'large.mp4',bytes:40*1024*1024,fingerprint:FP}});
 assert.equal(x.status,413);
 f.env.STORAGE_COST_APPROVED='1';
 x=await api(worker,f,`/api/projects/${id}/uploads`,{method:'POST',body:{filename:'large.mp4',bytes:40*1024*1024,fingerprint:FP}});
 assert.equal(x.status,201);
 const me=await api(worker,f,'/api/me');
 assert.equal(me.data.preflight.readyForLargeVideos,true);
 assert.equal(me.data.limits.maxSourceBytes,8*1024**3);
});

test('private MP4 playback requires signed, expiring capability and streams Range',async()=>{
 const f=fixture(),pid=await createProject(f),done=await uploaded(f,pid,'private.mp4',1100);
 const q=await api(worker,f,`/api/projects/${pid}/jobs`,{method:'POST',body:{kind:'render',quality:'review'}});
 const jid=q.data.jobId,objectKey=`owner_preview/${pid}/exports/${jid}/result.mp4`;
 f.env.MEDIA.done.set(objectKey,Buffer.alloc(5000,17));
 await f.env.DB.prepare("UPDATE jobs SET result_key=?,status='completed_technical' WHERE id=?").bind(objectKey,jid).run();
 const unavailable=await api(worker,f,`/api/jobs/${jid}/playback`);
 assert.equal(unavailable.status,503);assert.equal(unavailable.data.code,'PLAYBACK_NOT_CONFIGURED');
 f.env.PLAYBACK_KEY='test-hmac-key-kept-private-use-environment-only';
 const authLink=await api(worker,f,`/api/jobs/${jid}/playback`);
 assert.equal(authLink.status,200);
 assert.equal(authLink.data.bytes,5000);
 const url=authLink.data.playbackUrl;
 const anon=await worker.fetch(new Request('https://private.example/media/'+jid+'/result.mp4'),f.env);
 assert.equal(anon.status,403);
 const correct=await worker.fetch(new Request(url,{headers:{'range':'bytes=10-109'}}),f.env);
 assert.equal(correct.status,206);
 assert.equal(correct.headers.get('content-range'),'bytes 10-109/5000');
 assert.equal((await correct.arrayBuffer()).byteLength,100);
 const tampered=new URL(url);tampered.searchParams.set('s','f'.repeat(64));
 assert.equal((await worker.fetch(new Request(tampered),f.env)).status,403);
 const expired=new URL(url);expired.searchParams.set('e','1000000000');
 assert.equal((await worker.fetch(new Request(expired),f.env)).status,403);
 const unauth=await api(worker,f,`/api/jobs/${jid}/playback`,{token:null});
 assert.equal(unauth.status,401);
});
