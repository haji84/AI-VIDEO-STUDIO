/** Private processing interface. No service is automatically deployed or charged. */
import {APIError, isoNow, json} from './config.mjs';
import {verifyService,parseJson} from './security.mjs';
export async function internalFetch(request,env,path) {
  await verifyService(request,env);
  const matched=path.match(/^\/api\/internal\/jobs\/(job_[a-f0-9]{32})\/(manifest|claim|report)$/);
  if(!matched)throw new APIError('Route not found',404);
  const [,jobId,action]=matched;
  const job=await env.DB.prepare('SELECT * FROM jobs WHERE id=? AND owner_id=?').bind(jobId,'owner_preview').first();
  if(!job)throw new APIError('Job not found',404,'JOB_NOT_FOUND');
  const p=await env.DB.prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').bind(job.project_id,'owner_preview').first();
  if(!p)throw new APIError('Project not found',404);
  if(action==='manifest' && request.method==='GET') {
    // Immutable job snapshot: subsequent project edits must not change an accepted render.
    if(!job.manifest_json)throw new APIError('Missing immutable render snapshot',409,'MANIFEST_MISSING');
    const manifest=JSON.parse(job.manifest_json);
    if(manifest.jobId!==jobId || manifest.projectId!==p.id)throw new APIError('Render snapshot identity mismatch',409,'MANIFEST_MISMATCH');
    return json({ok:true,manifest});
  }
  if(action==='claim' && request.method==='POST') {
    if(env.PROCESSOR_ENABLED!=='1'||env.CLOUD_PROCESSING_APPROVED!=='1')
      throw new APIError('Cloud execution is disabled pending explicit approval',503,'PROCESSOR_DISABLED');
    const r=await env.DB.prepare("UPDATE jobs SET status='processing',updated_at=? WHERE id=? AND owner_id=? AND status='waiting_for_processor'")
      .bind(isoNow(),jobId,'owner_preview').run();
    if(r.meta.changes!==1)throw new APIError('Job cannot be claimed',409,'JOB_ALREADY_CLAIMED');
    return json({ok:true,status:'processing'});
  }
  if(action==='report' && request.method==='POST') {
    if(job.status!=='processing')throw new APIError('Job not actively processing',409);
    const body=await parseJson(request,6000);
    if(body.success===true) {
      const prefix=`owner_preview/${job.project_id}/exports/${job.id}/`;
      if(typeof body.resultKey!=='string'||!body.resultKey.startsWith(prefix)||body.resultKey.length>240||!body.resultKey.endsWith('.mp4'))
        throw new APIError('Invalid result object key');
      const exists=await env.MEDIA.head(body.resultKey);
      if(!exists||exists.size<=1000)throw new APIError('Verified output was not uploaded',409,'OUTPUT_MISSING');
      if(body.technicalOk!==true)throw new APIError('Technical QA not passed',409,'QA_INCOMPLETE');
      await env.DB.prepare("UPDATE jobs SET status='completed_technical',progress=1,result_key=?,updated_at=? WHERE id=? AND owner_id=? AND status='processing'")
        .bind(body.resultKey,isoNow(),job.id,'owner_preview').run();
      return json({ok:true,status:'completed_technical',semanticReview:'not_performed'});
    }
    if(body.success!==false||!['STAGING_FAILED','SYNC_UNVERIFIED','FFMPEG_FAILED','QA_FAILED','RESOURCE_EXHAUSTED','UNKNOWN'].includes(body.errorCode))
      throw new APIError('Invalid job failure report');
    await env.DB.prepare("UPDATE jobs SET status='failed',error_code=?,updated_at=? WHERE id=? AND owner_id=? AND status='processing'")
      .bind(body.errorCode,isoNow(),job.id,'owner_preview').run();
    return json({ok:true,status:'failed',errorCode:body.errorCode});
  }
  throw new APIError('Route not found',404);
}
