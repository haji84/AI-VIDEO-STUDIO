/**
 * AI VIDEO STUDIO v0.2 owner-private cloud control plane.
 * No production publishing, subscriptions, paid processing, or background processor is enabled.
 * Never route full video rendering through Workers: R2 stores media, D1 stores metadata.
 */
import {
  VERSION, CHUNK_BYTES, MAX_PROJECT_BYTES, MAX_PARTS, MAX_SOURCES, previewStorageLimit,
  APIError, checkedBytes, checkedMode, safeFilename, isoNow, uid, json,
} from './config.mjs';
import {verifyOwner, verifyWriteOrigin, parseJson} from './security.mjs';
import {validateTimeline, projectInput, validateJobRequest} from './timeline.mjs';
import {internalFetch} from './internal.mjs';
import {privateMediaFetch,mintPlayback} from './playback.mjs';

const owner='owner_preview';

function replyError(e) {
  if(e instanceof APIError) return json({ok:false,code:e.code,error:e.message},e.status);
  // Operational details and tokens must never be returned to clients.
  return json({ok:false,code:'INTERNAL_ERROR',error:'Server operation failed. Try again later.'},500);
}
async function fetchProject(env,id,ownerId) {
  const project=await env.DB.prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').bind(id,ownerId).first();
  if(!project)throw new APIError('Project not found',404,'PROJECT_NOT_FOUND');
  return project;
}
async function fetchUpload(env,id,ownerId) {
  const record=await env.DB.prepare('SELECT * FROM uploads WHERE id=? AND owner_id=?').bind(id,ownerId).first();
  if(!record)throw new APIError('Upload not found',404,'UPLOAD_NOT_FOUND');
  return record;
}
async function assetsFor(env,projectId,ownerId) {
  const {results}=await env.DB.prepare('SELECT id, filename, bytes, media_type, duration_seconds, codec, status, created_at FROM assets WHERE project_id=? AND owner_id=? ORDER BY created_at, id').bind(projectId,ownerId).all();
  return results.map(x=>({...x,durationSeconds:x.duration_seconds,mediaType:x.media_type}));
}
async function uploadState(env,uploadId,ownerId) {
  const u=await fetchUpload(env,uploadId,ownerId);
  const {results}=await env.DB.prepare('SELECT number, bytes FROM upload_parts WHERE upload_id=? ORDER BY number').bind(uploadId).all();
  const done=results.reduce((n,p)=>n+p.bytes,0);
  return {id:u.id,projectId:u.project_id,filename:u.filename,bytes:u.bytes, fingerprint:u.fingerprint,partSize:u.part_size,totalParts:u.total_parts,status:u.status,parts:results.map(p=>p.number),uploadedBytes:done,expiresHint:'R2 incomplete uploads may expire after 7 days'};
}
function numberId(p) {
  const n=Number(p);
  if(!Number.isSafeInteger(n)||n<1||n>MAX_PARTS)throw new APIError('Invalid part number');
  return n;
}
async function finalizeMetadata(env,u) {
  const head=await env.MEDIA.head(u.object_key);
  if(!head || head.size!==u.bytes)throw new APIError('Stored media size mismatch',409,'OBJECT_NOT_VERIFIED');
  const now=isoNow();
  await env.DB.prepare('INSERT OR IGNORE INTO assets (id,owner_id,project_id,object_key,filename,bytes,media_type,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(u.asset_id,u.owner_id,u.project_id,u.object_key,u.filename,u.bytes,'video/'+u.filename.split('.').pop().toLowerCase(),u.filename.toLowerCase().endsWith('.insv')?'conversion_required':'ready',now).run();
  await env.DB.prepare("INSERT OR IGNORE INTO usage_ledger (id,owner_id,project_id,job_id,metric,units,recorded_at) VALUES (?,?,?,?,?,?,?)")
    .bind('meter_'+u.asset_id,u.owner_id,u.project_id,null,'uploaded_bytes',u.bytes,now).run();
  await env.DB.prepare("UPDATE uploads SET status='ready',updated_at=? WHERE id=? AND owner_id=?")
    .bind(now,u.id,u.owner_id).run();
  return {assetId:u.asset_id,bytes:u.bytes};
}
async function updateProject(env,id,ownerId,data) {
  const p=await fetchProject(env,id,ownerId);
  if(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision!==p.revision)throw new APIError('Project changed. Reload before saving.',409,'REVISION_CONFLICT');
  if(data.timeline!==undefined) {
    const assets=await assetsFor(env,id,ownerId);
    validateTimeline(data.timeline,assets);
  }
  const name=data.name!==undefined?projectInput({name:data.name,mode:p.mode}).name:p.name;
  const timeline=data.timeline===undefined?p.timeline_json:JSON.stringify(data.timeline);
  const mode=data.mode===undefined?p.mode:checkedMode(data.mode);
  const now=isoNow();
  const r=await env.DB.prepare('UPDATE projects SET name=?,mode=?,timeline_json=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?')
    .bind(name,mode,timeline,now,id,ownerId,p.revision).run();
  if(r.meta.changes!==1)throw new APIError('Project changed. Reload before saving.',409,'REVISION_CONFLICT');
  return {revision:p.revision+1};
}
async function dispatch(request,env,ownerId,method,path) {
  const u=new URL(request.url);
  if(path==='/api/me'&&method==='GET')return json({ok:true,ownerId,tier:'owner_preview',billingEnabled:false,processorEnabled:env.PROCESSOR_ENABLED==='1'&&env.CLOUD_PROCESSING_APPROVED==='1',version:VERSION,limits:{maxSourceBytes:Math.min(checkedBytes(8*1024**3),previewStorageLimit(env)),maxProjectBytes:Math.min(MAX_PROJECT_BYTES,previewStorageLimit(env)),chunkBytes:CHUNK_BYTES,maxSources:MAX_SOURCES},preflight:{readyForLargeVideos:env.LARGE_UPLOAD_APPROVED==='1'&&env.STORAGE_COST_APPROVED==='1'&&previewStorageLimit(env)>32*1024**2,reason:previewStorageLimit(env)>32*1024**2?'OWNER_APPROVED_LARGE_INPUT':'SMALL_SMOKE_ONLY',publicBilling:false}});
  if(path==='/api/usage'&&method==='GET') {
    const {results}=await env.DB.prepare('SELECT metric,COALESCE(SUM(units),0) AS total FROM usage_ledger WHERE owner_id=? GROUP BY metric').bind(ownerId).all();
    return json({ok:true,usage:results,billedJpy:null,note:'Raw usage only. Actual cloud charges have not been measured or connected.'});
  }
  if(path==='/api/projects'&&method==='GET') {
    const {results}=await env.DB.prepare('SELECT id,name,mode,revision,created_at,updated_at FROM projects WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100').bind(ownerId).all();
    return json({ok:true,projects:results});
  }
  if(path==='/api/projects'&&method==='POST') {
    const data=projectInput(await parseJson(request));
    const id=uid('proj'),now=isoNow();
    await env.DB.prepare("INSERT INTO projects (id,owner_id,name,mode,timeline_json,revision,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)")
      .bind(id,ownerId,data.name,data.mode,'[]',now,now).run();
    return json({ok:true,project:{id,...data,revision:1}},201);
  }
  const proj=path.match(/^\/api\/projects\/(proj_[a-f0-9]{32})(?:\/(uploads|jobs))?$/);
  if(proj) {
    const [,projectId,kind]=proj;
    const p=await fetchProject(env,projectId,ownerId);
    if(!kind && method==='GET') {
      const assets=await assetsFor(env,projectId,ownerId);
      const {results:uploads}=await env.DB.prepare('SELECT id,filename,bytes,fingerprint,status FROM uploads WHERE project_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 200').bind(projectId,ownerId).all();
      const {results:jobs}=await env.DB.prepare('SELECT id,kind,quality,status,progress,created_at FROM jobs WHERE project_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 30').bind(projectId,ownerId).all();
      return json({ok:true,project:{id:p.id,name:p.name,mode:p.mode,revision:p.revision,timeline:JSON.parse(p.timeline_json),created_at:p.created_at,updated_at:p.updated_at},assets,uploads,jobs});
    }
    if(!kind && method==='PATCH')return json({ok:true,...await updateProject(env,projectId,ownerId,await parseJson(request))});
    if(kind==='uploads'&&method==='POST') {
      const body=await parseJson(request);
      const filename=safeFilename(body.filename);
      const bytes=checkedBytes(body.bytes);
      const fingerprint=body.fingerprint;
      if(typeof fingerprint!=='string' || !/^[a-f0-9]{64}$/.test(fingerprint))throw new APIError('File fingerprint is required',400,'FINGERPRINT_REQUIRED');
      const previewLimit=previewStorageLimit(env);
      if(bytes>previewLimit)throw new APIError('Large video upload is disabled until storage costs and privacy are approved',413,'PREVIEW_BUDGET_GATE');
      const globalStored=await env.DB.prepare('SELECT COALESCE(SUM(bytes),0) AS total FROM assets WHERE owner_id=?').bind(ownerId).first();
      const globalPending=await env.DB.prepare("SELECT COALESCE(SUM(bytes),0) AS total FROM uploads WHERE owner_id=? AND status IN ('uploading','finalizing')").bind(ownerId).first();
      if(Number(globalStored.total)+Number(globalPending.total)+bytes>previewLimit)throw new APIError('Private preview storage limit reached',413,'PREVIEW_BUDGET_GATE');
      const totalParts=Math.ceil(bytes/CHUNK_BYTES);
      if(totalParts>MAX_PARTS)throw new APIError('Too many upload parts',413);
      const current=await env.DB.prepare('SELECT COALESCE(SUM(bytes),0) AS total FROM assets WHERE project_id=? AND owner_id=?').bind(projectId,ownerId).first();
      const pending=await env.DB.prepare("SELECT COALESCE(SUM(bytes),0) AS total FROM uploads WHERE project_id=? AND owner_id=? AND status IN ('uploading','finalizing')").bind(projectId,ownerId).first();
      const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM assets WHERE project_id=? AND owner_id=?').bind(projectId,ownerId).first();
      const pendingCount=await env.DB.prepare("SELECT COUNT(*) AS total FROM uploads WHERE project_id=? AND owner_id=? AND status IN ('uploading','finalizing')").bind(projectId,ownerId).first();
      if(Number(current.total)+Number(pending.total)+bytes>MAX_PROJECT_BYTES || Number(count.total)+Number(pendingCount.total)>=MAX_SOURCES)
        throw new APIError('Project storage quota exceeded',413,'STORAGE_QUOTA');
      const id=uid('up'),assetId=uid('asset'),now=isoNow();
      const key=`owner_preview/${projectId}/${assetId}/${filename}`;
      const multi=await env.MEDIA.createMultipartUpload(key,{httpMetadata:{contentType:'application/octet-stream'}});
      try {
        await env.DB.prepare('INSERT INTO uploads (id,owner_id,project_id,asset_id,object_key,r2_upload_id,filename,bytes,fingerprint,part_size,total_parts,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(id,ownerId,projectId,assetId,key,multi.uploadId,filename,bytes,fingerprint,CHUNK_BYTES,totalParts,'uploading',now,now).run();
      } catch(e) {await multi.abort().catch(()=>{});throw e;}
      return json({ok:true,uploadId:id,fingerprint,partSize:CHUNK_BYTES,totalParts,bytes,status:'uploading'},201);
    }
    if(kind==='jobs'&&method==='POST') {
      const body=validateJobRequest(await parseJson(request));
      const assets=await assetsFor(env,projectId,ownerId);
      if(assets.length===0)throw new APIError('Upload at least one video first',409,'NO_MEDIA');
      if(assets.some(a=>a.status!=='ready'))throw new APIError('Some media need conversion before editing',409,'MEDIA_NOT_READY');
      const active=await env.DB.prepare("SELECT COUNT(*) AS total FROM jobs WHERE owner_id=? AND status IN ('waiting_for_processor','processing')").bind(ownerId).first();
      if(active.total>0)throw new APIError('An editing job is already waiting; automatic retries are disabled',409,'JOB_BUDGET_GATE');
      const {results:sourceRows}=await env.DB.prepare('SELECT id,object_key,bytes,filename,status FROM assets WHERE project_id=? AND owner_id=? ORDER BY created_at,id').bind(projectId,ownerId).all();
      const snapshot={schema:1,projectId,quality:body.quality,kind:body.kind,name:p.name,autoPlan:JSON.parse(p.timeline_json).length===0,timeline:JSON.parse(p.timeline_json),sources:sourceRows.map(a=>({assetId:a.id,objectKey:a.object_key,bytes:a.bytes,filename:a.filename})),allowUnverifiedSync:false};
      const jobId=uid('job'),now=isoNow();
      // No processor configured. Persist intent but do NOT claim editing has started.
      await env.DB.prepare('INSERT INTO jobs (id,project_id,owner_id,kind,quality,status,progress,created_at,updated_at,manifest_json) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(jobId,projectId,ownerId,body.kind,body.quality,'waiting_for_processor',0,now,now,JSON.stringify({...snapshot,jobId})).run();
      return json({ok:true,jobId,status:'waiting_for_processor',message:'Cloud render worker is not yet connected; no charge or video processing started.'},202);
    }
  }
  const uploadRoute=path.match(/^\/api\/uploads\/(up_[a-f0-9]{32})(?:\/(parts\/(\d+)|complete|abort))?$/);
  if(uploadRoute) {
    const [,uploadId,action,partNumber]=uploadRoute;
    const rec=await fetchUpload(env,uploadId,ownerId);
    if(!action && method==='GET')return json({ok:true,upload:await uploadState(env,uploadId,ownerId)});
    if(action?.startsWith('parts/')&&method==='PUT') {
      if(rec.status!=='uploading')throw new APIError('Upload no longer accepts parts',409,'UPLOAD_CLOSED');
      const number=numberId(partNumber);
      if(number>rec.total_parts)throw new APIError('Part number is out of range');
      const expected=number===rec.total_parts?rec.bytes-(number-1)*rec.part_size:rec.part_size;
      const declared=Number(request.headers.get('content-length'));
      if(request.headers.has('content-length') && declared!==expected)throw new APIError('Incorrect chunk size',400,'BAD_PART_SIZE');
      const data=await request.arrayBuffer();
      if(data.byteLength!==expected)throw new APIError('Incorrect chunk size',400,'BAD_PART_SIZE');
      const declaredHash=request.headers.get('x-content-sha256')||'';
      if(!/^[a-f0-9]{64}$/.test(declaredHash))throw new APIError('Chunk checksum required',400,'CHUNK_SHA_REQUIRED');
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
      const actual=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
      if(actual!==declaredHash)throw new APIError('Chunk checksum mismatch',409,'CHUNK_SHA_MISMATCH');
      const m=env.MEDIA.resumeMultipartUpload(rec.object_key,rec.r2_upload_id);
      const uploaded=await m.uploadPart(number,data);
      await env.DB.prepare('INSERT INTO upload_parts (upload_id,number,etag,bytes,sha256) VALUES (?,?,?,?,?) ON CONFLICT(upload_id,number) DO UPDATE SET etag=excluded.etag, bytes=excluded.bytes,sha256=excluded.sha256')
        .bind(uploadId,number,uploaded.etag,expected,actual).run();
      return json({ok:true,part:number,bytes:expected});
    }
    if(action==='complete'&&method==='POST') {
      if(rec.status==='ready')return json({ok:true,...await finalizeMetadata(env,rec),alreadyComplete:true});
      if(!['uploading','finalizing'].includes(rec.status))throw new APIError('Cannot complete upload',409);
      const {results:parts}=await env.DB.prepare('SELECT number,etag,bytes FROM upload_parts WHERE upload_id=? ORDER BY number').bind(uploadId).all();
      if(parts.length!==rec.total_parts||parts.reduce((n,p)=>n+p.bytes,0)!==rec.bytes || parts.some((p,i)=>p.number!==i+1))
        throw new APIError('Some video chunks have not uploaded',409,'PARTS_MISSING');
      const head=await env.MEDIA.head(rec.object_key);
      if(!head) {
        const update=await env.DB.prepare("UPDATE uploads SET status='finalizing',updated_at=? WHERE id=? AND owner_id=? AND status='uploading'").bind(isoNow(),uploadId,ownerId).run();
        if(rec.status==='uploading' && update.meta.changes!==1)throw new APIError('Upload finalization is in progress; retry to reconcile',409,'FINALIZE_BUSY');
        try {await env.MEDIA.resumeMultipartUpload(rec.object_key,rec.r2_upload_id).complete(parts.map(p=>({partNumber:p.number,etag:p.etag})));}
        catch(e) { /* R2 may have finalized: never falsely mark ready. */
          if(!await env.MEDIA.head(rec.object_key))throw new APIError('Could not finalize upload. Retry or contact owner.',502,'R2_FINALIZE_FAILED');
        }
      }
      return json({ok:true,...await finalizeMetadata(env,rec)});
    }
    if(action==='abort'&&method==='POST') {
      if(rec.status!=='uploading')throw new APIError('Only unfinished uploads can be aborted',409);
      const changed=await env.DB.prepare("UPDATE uploads SET status='aborted',updated_at=? WHERE id=? AND owner_id=? AND status='uploading'").bind(isoNow(),uploadId,ownerId).run();
      if(changed.meta.changes!==1)throw new APIError('Upload state changed',409);
      await env.MEDIA.resumeMultipartUpload(rec.object_key,rec.r2_upload_id).abort();
      return json({ok:true,status:'aborted'});
    }
  }
  const playbackRoute=path.match(/^\/api\/jobs\/(job_[a-f0-9]{32})\/playback$/);
  if(playbackRoute&&method==='GET')return await mintPlayback(request,env,playbackRoute[1]);
  const jobRoute=path.match(/^\/api\/jobs\/(job_[a-f0-9]{32})$/);
  if(jobRoute&&method==='GET') {
    const job=await env.DB.prepare('SELECT id,project_id,kind,quality,status,progress,error_code,created_at,updated_at FROM jobs WHERE id=? AND owner_id=?').bind(jobRoute[1],ownerId).first();
    if(!job)throw new APIError('Job not found',404,'JOB_NOT_FOUND');
    return json({ok:true,job});
  }
  return json({ok:false,code:'NOT_FOUND',error:'Route not found'},404);
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
    if(path.startsWith('/media/')){try{return await privateMediaFetch(request,env)}catch(e){return replyError(e)}}
    if(path==='/api/health'&&method==='GET')return json({ok:true,name:'AI VIDEO STUDIO',version:VERSION,ownerDataRequiresAuthentication:true,generalPublicLaunch:false,billingEnabled:false,processorConnected:env?.PROCESSOR_ENABLED==='1'&&env?.CLOUD_PROCESSING_APPROVED==='1'});
    if(!path.startsWith('/api/')) {
      if((method==='GET'||method==='HEAD')&&env.ASSETS) return env.ASSETS.fetch(request);
      return json({ok:false,error:'Not found'},404);
    }
    try {
      if(!env.DB||!env.MEDIA)throw new APIError('Cloud storage not configured',503,'STORAGE_NOT_CONFIGURED');
      if(path.startsWith('/api/internal/'))return await internalFetch(request,env,path);
      const ownerId=await verifyOwner(request,env);
      if(!['GET','HEAD'].includes(method))verifyWriteOrigin(request);
      return await dispatch(request,env,ownerId,method,path);
    } catch(e) {return replyError(e);}
  }
};
