/** Private R2 video playback: owner-authenticated minting, hour-limited signed URLs.
 * Never issues public R2 bucket access or buffers media in the Worker.
 * URLs are capabilities: anyone with one can view until expiration. Do not log them.
 */
import {APIError,json} from './config.mjs';
const enc=new TextEncoder();
function keyBytes(env){
  if(typeof env.PLAYBACK_KEY!=='string'||env.PLAYBACK_KEY.length<32)throw new APIError('Private playback is not configured',503,'PLAYBACK_NOT_CONFIGURED');
  return enc.encode(env.PLAYBACK_KEY);
}
async function key(env){return crypto.subtle.importKey('raw',keyBytes(env),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function unhex(h){if(!/^[a-f0-9]{64}$/.test(h||''))throw new APIError('Invalid media link',403,'MEDIA_UNAUTHORIZED');return Uint8Array.from(h.match(/../g),x=>parseInt(x,16));}
async function signed(jobId,expires,env){return hex(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),enc.encode(jobId+'|'+expires))));}
async function requireCompletedJob(env,jobId){
 const row=await env.DB.prepare("SELECT id,result_key,status FROM jobs WHERE id=? AND owner_id='owner_preview'").bind(jobId).first();
 if(!row||row.status!=='completed_technical'||!row.result_key)throw new APIError('Completed video not found',404,'VIDEO_NOT_READY');
 if(!row.result_key.startsWith('owner_preview/'))throw new APIError('Invalid private output reference',403,'MEDIA_UNAUTHORIZED');
 return row;
}
export async function mintPlayback(request,env,jobId){
 const row=await requireCompletedJob(env,jobId);
 const head=await env.MEDIA.head(row.result_key);
 if(!head)throw new APIError('Completed video was not found in storage',404,'VIDEO_NOT_READY');
 const expires=Math.floor(Date.now()/1000)+3600;
 const signature=await signed(jobId,expires,env);
 const url=new URL(request.url);url.pathname='/media/'+jobId+'/result.mp4';url.searchParams.set('e',String(expires));url.searchParams.set('s',signature);
 return json({ok:true,playbackUrl:url.toString(),expiresAt:new Date(expires*1000).toISOString(),bytes:head.size,private:true});
}
export async function privateMediaFetch(request,env){
 if(!env.DB||!env.MEDIA)throw new APIError('Media storage not configured',503,'STORAGE_NOT_CONFIGURED');
 const path=new URL(request.url);
 const match=path.pathname.match(/^\/media\/(job_[a-f0-9]{32})\/result\.mp4$/);
 if(!match||!['GET','HEAD'].includes(request.method))throw new APIError('Media not found',404,'MEDIA_NOT_FOUND');
 const expiresText=path.searchParams.get('e')||'';
 if(!/^\d{10}$/.test(expiresText))throw new APIError('Invalid media link',403,'MEDIA_UNAUTHORIZED');
 const expires=Number(expiresText),now=Math.floor(Date.now()/1000);
 if(expires<=now||expires>now+3600)throw new APIError('Media link expired',403,'MEDIA_LINK_EXPIRED');
 const sig=unhex(path.searchParams.get('s'));
 const valid=await crypto.subtle.verify('HMAC',await key(env),sig,enc.encode(match[1]+'|'+expires));
 if(!valid)throw new APIError('Invalid media link',403,'MEDIA_UNAUTHORIZED');
 const job=await requireCompletedJob(env,match[1]);
 let obj;
 if(request.method==='HEAD')obj=await env.MEDIA.head(job.result_key);
 else obj=await env.MEDIA.get(job.result_key,{range:request.headers});
 if(!obj)throw new APIError('Video no longer stored',404,'VIDEO_NOT_READY');
 const h=new Headers({'content-type':'video/mp4','accept-ranges':'bytes','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-disposition':'inline; filename="result.mp4"'});
 const range=obj.range,partial=request.headers.has('range')&&range&&Number.isInteger(range.offset)&&Number.isInteger(range.length);
 if(partial){h.set('content-range',`bytes ${range.offset}-${range.offset+range.length-1}/${obj.size}`);h.set('content-length',String(range.length));}
 else h.set('content-length',String(obj.size));
 return new Response(request.method==='HEAD'?null:obj.body,{status:partial?206:200,headers:h});
}
