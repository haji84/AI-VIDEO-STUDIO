import {APIError} from './config.mjs';
const encoder=new TextEncoder();
export async function verifyOwner(request,env) {
  // Only an owner-private development preview. Accounts and Stripe remain disabled.
  if(typeof env.OWNER_TOKEN!=='string'||env.OWNER_TOKEN.length<24)
    throw new APIError('Owner authentication not configured',503,'AUTH_NOT_CONFIGURED');
  const raw=request.headers.get('authorization')||'';
  const supplied=raw.startsWith('Bearer ')?raw.slice(7):'';
  if(!supplied || supplied.length>400)throw new APIError('Authentication required',401,'UNAUTHORIZED');
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(supplied)),crypto.subtle.digest('SHA-256',encoder.encode(env.OWNER_TOKEN))]);
  const x=new Uint8Array(a),y=new Uint8Array(b);let mismatch=0;
  for(let i=0;i<x.length;i++)mismatch|=x[i]^y[i];
  if(mismatch!==0)throw new APIError('Authentication required',401,'UNAUTHORIZED');
  return 'owner_preview';
}
export function verifyWriteOrigin(request) {
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)throw new APIError('Cross-origin writes blocked',403,'BAD_ORIGIN');
}
export async function parseJson(request,max=32768) {
  const length=Number(request.headers.get('content-length'));
  if(Number.isFinite(length) && length>max)throw new APIError('Request is too large',413);
  const ct=request.headers.get('content-type')||'';
  if(!ct.startsWith('application/json'))throw new APIError('Expected JSON content type',415);
  const raw=await request.text();
  if(raw.length>max)throw new APIError('Request is too large',413);
  try {
    const obj=JSON.parse(raw);
    if(!obj || typeof obj!=='object'||Array.isArray(obj))throw new Error('object only');
    return obj;
  } catch {throw new APIError('Invalid JSON object');}
}

export async function verifyService(request,env) {
  if(typeof env.WORKER_TOKEN!=='string'||env.WORKER_TOKEN.length<32)
    throw new APIError('Worker authentication not configured',503,'WORKER_AUTH_UNCONFIGURED');
  const raw=request.headers.get('authorization')||'';
  const supplied=raw.startsWith('Bearer ')?raw.slice(7):'';
  if(!supplied||supplied.length>400)throw new APIError('Service authentication required',401,'WORKER_UNAUTHORIZED');
  const a=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(supplied)));
  const b=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(env.WORKER_TOKEN)));
  let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
  if(mismatch!==0)throw new APIError('Service authentication required',401,'WORKER_UNAUTHORIZED');
}
