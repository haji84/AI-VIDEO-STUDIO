/** v0.2 configuration. No implicit billing or production deployment. */
export const VERSION = '0.2.1-private-preflight';
export const CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 8 * 1024 ** 3;
// Safe nonbillable-by-design smoke gate; uploading real large files needs separate approval.
export const DEFAULT_PREVIEW_STORAGE_BYTES = 32 * 1024 ** 2;
export function previewStorageLimit(env) {
  const v = Number(env.MAX_PREVIEW_STORAGE_BYTES ?? DEFAULT_PREVIEW_STORAGE_BYTES);
  // A real-large-file test needs TWO independent, consciously configured flags.
  // The cap is still bounded to 24 GiB and the 8 GiB single-source limit applies.
  const allowed=(env.LARGE_UPLOAD_APPROVED==='1' && env.STORAGE_COST_APPROVED==='1');
  const limit=allowed ? 24*1024**3 : DEFAULT_PREVIEW_STORAGE_BYTES;
  return Number.isSafeInteger(v) && v > 0 ? Math.min(v,limit) : DEFAULT_PREVIEW_STORAGE_BYTES;
}
export const MAX_PROJECT_BYTES = 24 * 1024 ** 3;
export const MAX_PARTS = 10_000;
export const MAX_SOURCES = 100;
export const ALLOWED_EXT = new Set(['mp4', 'mov', 'mkv', 'm4v', 'webm', 'avi', 'insv']);
export const ALLOWED_QUALITIES = new Set(['review', 'hd', 'fullhd']);
export const BILLING_ENABLED = false;
export const PROCESSOR_ENABLED = false;
export function isoNow() { return new Date().toISOString(); }
export function uid(prefix) { return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`; }
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    },
  });
}
export class APIError extends Error {
  constructor(message, status=400, code='INVALID_REQUEST') {super(message); this.status=status; this.code=code;}
}
export function requireText(value, field='name', max=120) {
  if(typeof value !== 'string' || !value.trim() || value.trim().length>max) throw new APIError(`${field} is invalid`);
  return value.trim();
}
export function safeFilename(v) {
  const name=requireText(v,'filename',210).replace(/[\\/]/g,'_');
  const extension = name.split('.').pop().toLowerCase();
  if(!ALLOWED_EXT.has(extension)) throw new APIError('This video format is not allowed',415,'UNSUPPORTED_MEDIA');
  return name.replace(/[^\p{L}\p{N}._-]/gu,'_').slice(-120);
}
export function checkedBytes(value) {
  if(!Number.isSafeInteger(value)||value<1||value>MAX_SOURCE_BYTES)throw new APIError('Invalid or too large video size',413,'SOURCE_TOO_LARGE');
  return value;
}
export function checkedMode(v) {
  if(!['training','documentary','tv','short'].includes(v))throw new APIError('Invalid editing mode');
  return v;
}
export function hasOwn(obj,key) {return Object.prototype.hasOwnProperty.call(obj,key);}
