import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
export class D1TestDB {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));}
  prepare(query){return new Statement(this.db.prepare(query));}
}
class Statement {
  constructor(stmt,args=[]){this.stmt=stmt;this.args=args}
  bind(...args){return new Statement(this.stmt,args)}
  async first(){return this.stmt.get(...this.args)||null}
  async all(){return{results:this.stmt.all(...this.args)}}
  async run(){const r=this.stmt.run(...this.args);return {meta:{changes:Number(r.changes)}}}
}
export class FakeR2 {
  constructor(){this.pending=new Map();this.done=new Map();this.calls=[]}
  async createMultipartUpload(key){let id=randomUUID();this.pending.set(id,{key,parts:new Map()});this.calls.push('create');return{uploadId:id,abort:async()=>{this.pending.delete(id)}}}
  resumeMultipartUpload(key,id){const instance=this;const get=()=>{const found=instance.pending.get(id);if(!found||found.key!==key)throw Error('NoSuchUpload');return found};return{
    async uploadPart(number,body){const b=Buffer.from(await new Response(body).arrayBuffer());const etag=createHash('md5').update(b).digest('hex');get().parts.set(number,{etag,bytes:b});return{etag,partNumber:number}},
    async complete(parts){const list=parts.map(p=>{const part=get().parts.get(p.partNumber);if(!part||part.etag!==p.etag)throw Error('bad part receipt');return part.bytes});instance.done.set(key,Buffer.concat(list));instance.pending.delete(id);return{key}},
    async abort(){instance.pending.delete(id)}
  }}
  async head(key){return this.done.has(key)?{size:this.done.get(key).length}:null}
  async get(key,opts={}){
    if(!this.done.has(key))return null;const value=this.done.get(key);
    const header=opts.range?.get?.('range')||'';const match=header.match(/^bytes=(\d+)-(\d*)$/);
    if(match){const start=Number(match[1]),end=match[2]?Number(match[2]):value.length-1;
      if(start>=value.length||end<start)return null;const cut=value.subarray(start,Math.min(end+1,value.length));
      return{size:value.length,range:{offset:start,length:cut.length},body:new Blob([cut]).stream()};
    }
    return{size:value.length,body:new Blob([value]).stream()};
  }
}
export function fixture(){return{env:{OWNER_TOKEN:'development-only-private-owner-token-xxxxxxxx',DB:new D1TestDB(),MEDIA:new FakeR2()},url:'https://private.example'}}
export async function api(worker,fx,path,{method='GET',body=null,token=fx.env.OWNER_TOKEN,origin,headers={}}={}){
  let h=new Headers(headers);if(token!==null)h.set('authorization',`Bearer ${token}`);if(origin)h.set('origin',origin);
  let requestBody=body;
  if(body&&typeof body==='object'&&!Buffer.isBuffer(body)&&!(body instanceof ArrayBuffer)&&!(body instanceof Uint8Array)&&!(body instanceof Blob)){
    h.set('content-type','application/json');requestBody=JSON.stringify(body);
  }
  const req=new Request(fx.url+path,{method,headers:h,body:requestBody});
  const res=await worker.fetch(req,fx.env);let data=await res.json();return{status:res.status,data};
}
