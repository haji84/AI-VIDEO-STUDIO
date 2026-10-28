import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {createProject,EditSession} from '../../packages/project/project.mjs';

const api=await import('./source-relink.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const sha=b=>createHash('sha256').update(b).digest('hex');
const asset=n=>'asset_'+String(n).padStart(32,'0');
const ref=(n,bytes)=>({assetId:asset(n),sha256:sha(bytes),mediaKind:'video',durationSec:2,hasAudio:true,offsetSec:0,driftPpm:0,syncStatus:'master'});
function saved(refs,older=[]){
 const p=createProject({projectId:'project_saved',sourceRefs:refs});
 const d=JSON.parse(new EditSession(p).serialize());
 d.undo=older.map(x=>createProject({projectId:p.projectId,sourceRefs:x}));
 return d;
}
async function setup(t,entries=[],probeInfo={durationSec:2,hasAudio:true,hasVideo:true}){
 assert.equal(typeof api.createSourceRelinkManager,'function');
 const dir=await mkdtemp(join(tmpdir(),'aivs-relink-unit-'));await mkdir(join(dir,'assets'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 let session=new EditSession(createProject({projectId:'project_current'})),registry=new Map(),failRegistry=false,failOpen=false,opened=0,probes=0;
 for(const [source,bytes] of entries){const file=source.assetId+'.mp4';await writeFile(join(dir,'assets',file),bytes);registry.set(source.assetId,{assetId:source.assetId,source,file,path:join(dir,'assets',file),label:'old.mp4'});}
 const config={folder:dir,getSession:()=>session,getRegistry:()=>registry,
  probe:async()=>{probes++;return {...probeInfo};},
  commitRegistry:async next=>{if(failRegistry)throw new Error('REGISTRY_WRITE_FAILED');await writeFile(join(dir,'media.json'),JSON.stringify([...next.values()].map(({path,...x})=>x)));registry=next;},
  commitSession:async next=>{if(failOpen)throw new Error('SESSION_WRITE_FAILED');session=next;opened++;return {opened:true};}};
 const manager=await api.createSourceRelinkManager(config);
 return {dir,manager,newManager:()=>api.createSourceRelinkManager(config),registry:()=>registry,current:()=>session.serialize(),probes:()=>probes,opened:()=>opened,
  failRegistry:v=>{failRegistry=v;},failOpen:v=>{failOpen=v;},change:(id='project_current',revision=1)=>{const p=createProject({projectId:id});p.revision=revision;session=new EditSession(p);}};
}
const upload=(m,id,b,label='selected.mp4')=>m.receive(id,Readable.from([b.subarray(0,2),b.subarray(2)]),{label,length:b.length});

test('collects immutable source identities across current and both histories without changing edits',()=>{
 assert.equal(typeof api.collectSessionSources,'function');
 const a=ref(1,Buffer.from('one')),b=ref(2,Buffer.from('two')),d=saved([a],[[b]]);
 d.redo=[createProject({projectId:'project_saved',sourceRefs:[{...a,offsetSec:1,syncStatus:'verified'}]})];
 const before=JSON.stringify(d),c=api.collectSessionSources(d);
 assert.deepEqual(c.refs.map(x=>x.assetId),[a.assetId,b.assetId]);assert.equal(c.session.serialize(),EditSession.open(JSON.stringify(d)).serialize());assert.equal(JSON.stringify(d),before);
 const bad=structuredClone(d);bad.undo[0].sourceRefs.push({...a,sha256:'f'.repeat(64)});
 assert.throws(()=>api.collectSessionSources(bad),/SOURCE_IDENTITY_CONFLICT/);
 const tooMany=saved(Array.from({length:100},(_,i)=>ref(i,Buffer.from('x'))),[[ref(101,Buffer.from('y'))]]);
 assert.throws(()=>api.collectSessionSources(tooMany),/SOURCE_COUNT_LIMIT/);
});

test('verified copies keep original asset IDs and current session until explicit Open',async t=>{
 const s=await setup(t),b=Buffer.from('source contents to copy'),a=ref(1,b),before=s.current(),d=saved([a]),p=await s.manager.prepare(d);
 assert.equal(p.missing.length,1);assert.equal(p.ready,false);
 const ready=await upload(s.manager,p.planId,b);assert.equal(ready.ready,true);assert.equal(s.current(),before);assert.equal(s.opened(),0);
 const entry=s.registry().get(a.assetId);assert.equal(sha(await readFile(entry.path)),a.sha256);assert.equal(JSON.parse(await readFile(join(s.dir,'media.json')))[0].assetId,a.assetId);
 await s.manager.open(p.planId);assert.equal(s.opened(),1);assert.equal(JSON.parse(s.current()).project.projectId,'project_saved');
 await assert.rejects(s.manager.open(p.planId),/RELINK_PLAN/);
});

test('wrong same-name media and incomplete historical bindings cannot open the session',async t=>{
 const s=await setup(t),aBytes=Buffer.from('a bytes'),bBytes=Buffer.from('b bytes'),a=ref(1,aBytes),b=ref(2,bBytes),before=s.current();
 const p=await s.manager.prepare(saved([a],[[b]]));await upload(s.manager,p.planId,aBytes,'same-name.mp4');
 await assert.rejects(upload(s.manager,p.planId,Buffer.from('wrong bytes'),'same-name.mp4'),/SOURCE_NOT_IN_PROJECT/);
 assert.equal(s.registry().size,1);assert.equal(s.current(),before);await assert.rejects(s.manager.open(p.planId),/SOURCES_MISSING/);assert.equal(s.opened(),0);
 await upload(s.manager,p.planId,bBytes);await s.manager.open(p.planId);
 const doc=JSON.parse(s.current());assert.deepEqual(doc.undo[0].sourceRefs,[b]);
});

test('one verified physical copy can satisfy repeated IDs and restart requires explicit prepare/Open',async t=>{
 const s=await setup(t),bytes=Buffer.from('shared physical bytes'),a=ref(1,bytes),b=ref(2,bytes),d=saved([a],[[b]]),before=s.current();
 const p=await s.manager.prepare(d);await upload(s.manager,p.planId,bytes);
 const entries=[...s.registry().values()];assert.equal(entries.length,2);assert.equal(new Set(entries.map(x=>x.path)).size,1);assert.equal(s.current(),before);
 const next=await s.newManager();const q=await next.prepare(d);assert.equal(q.ready,true);assert.equal(s.current(),before);assert.equal(s.opened(),0);
 await next.cancel(q.planId);assert.equal(s.registry().size,2);assert.equal(s.current(),before);await assert.rejects(next.open(q.planId),/RELINK_PLAN/);
});

test('reuses already-registered matching bytes without accepting a conflicting existing ID',async t=>{
 const bytes=Buffer.from('registered copy'),old=ref(9,bytes),a=ref(1,bytes),s=await setup(t,[[old,bytes]]);
 const p=await s.manager.prepare(saved([a]));assert.equal(p.ready,true);assert.equal(s.registry().size,1);
 await s.manager.open(p.planId);assert.equal(s.registry().get(a.assetId).path,s.registry().get(old.assetId).path);
 const conflict=await setup(t,[[{...a,sha256:sha(Buffer.from('other'))},Buffer.from('other')]]);
 await assert.rejects(conflict.manager.prepare(saved([a])),/SOURCE_ID_CONFLICT/);
});

test('same hash with false metadata is refused and never enters the registry',async t=>{
 const s=await setup(t),b=Buffer.from('actual media stand-in'),a={...ref(1,b),durationSec:3},before=s.current();
 const p=await s.manager.prepare(saved([a]));await assert.rejects(upload(s.manager,p.planId,b),/SOURCE_METADATA_MISMATCH/);
 assert.equal(s.registry().size,0);assert.equal(s.current(),before);
});

test('one physical hash cannot supply contradictory immutable metadata under different saved IDs',async t=>{
 const s=await setup(t),bytes=Buffer.from('same physical file'),a=ref(1,bytes),b={...ref(2,bytes),durationSec:3},before=s.current();
 await assert.rejects(s.manager.prepare(saved([a],[[b]])),/SOURCE_IDENTITY_CONFLICT/);
 assert.equal(s.registry().size,0);assert.equal(s.current(),before);
});

test('one audiovisual copy can retain separate video and audio import roles',async t=>{
 const bytes=Buffer.from('audiovisual bytes'),video=ref(1,bytes),audio={...ref(2,bytes),mediaKind:'audio'},s=await setup(t);
 const p=await s.manager.prepare(saved([video,audio]));const ready=await upload(s.manager,p.planId,bytes);assert.equal(ready.ready,true);
 assert.equal(s.registry().get(video.assetId).path,s.registry().get(audio.assetId).path);
 await s.manager.open(p.planId);assert.deepEqual(JSON.parse(s.current()).project.sourceRefs.map(x=>x.mediaKind),['video','audio']);
});

test('a reused audio-only copy cannot satisfy a newly requested video role',async t=>{
 const bytes=Buffer.from('audio only bytes'),audio={...ref(1,bytes),mediaKind:'audio'},video=ref(2,bytes);
 const s=await setup(t,[[audio,bytes]],{durationSec:2,hasAudio:true,hasVideo:false}),before=s.current();
 await assert.rejects(s.manager.prepare(saved([video])),/SOURCE_METADATA_MISMATCH/);assert.equal(s.current(),before);assert.equal(s.registry().size,1);
});

test('existing registry metadata is checked against the actual media before reuse',async t=>{
 const bytes=Buffer.from('old physical file'),a={...ref(1,bytes),durationSec:3},s=await setup(t,[[a,bytes]]),before=s.current();
 await assert.rejects(s.manager.prepare(saved([a])),/SOURCE_METADATA_MISMATCH/);
 assert.equal(s.current(),before);assert.equal(s.opened(),0);
});

test('revision or project changes invalidate upload and Open before consuming any media',async t=>{
 for(const [id,revision] of [['project_current',1],['project_other',0]]){
  const s=await setup(t),b=Buffer.from('chosen file'),p=await s.manager.prepare(saved([ref(1,b)]));s.change(id,revision);let consumed=0;
  async function* chunks(){consumed++;yield b;}
  await assert.rejects(s.manager.receive(p.planId,chunks(),{label:'a.mp4',length:b.length}),/RELINK_STALE/);
  assert.equal(consumed,0);await assert.rejects(s.manager.open(p.planId),/RELINK_STALE/);assert.equal(s.registry().size,0);
 }
});

test('partial upload, wrong declared length, unsupported extension and excessive bytes are refused',async t=>{
 const s=await setup(t),b=Buffer.from('bounded input'),p=await s.manager.prepare(saved([ref(1,b)])),before=s.current();
 for(const length of [b.length-1,b.length+1])await assert.rejects(s.manager.receive(p.planId,Readable.from([b]),{label:'a.mp4',length}),/SOURCE_LENGTH/);
 await assert.rejects(upload(s.manager,p.planId,b,'a.exe'),/SOURCE_EXTENSION/);
 let reads=0;async function* body(){reads++;yield b;}
 await assert.rejects(s.manager.receive(p.planId,body(),{label:'a.mp4',length:16*1024**3+1}),/SOURCE_SIZE/);assert.equal(reads,0);
 assert.equal(s.registry().size,0);assert.equal(s.current(),before);
 assert.equal((await readdir(join(s.dir,'assets'))).filter(x=>x.endsWith('.tmp')).length,0);
});

test('disk reserve is checked before receiving media',async t=>{
 const s=await setup(t),b=Buffer.from('bounded disk'),p=await s.manager.prepare(saved([ref(1,b)]));
 const spy=mock.method(fs,'statfs',async()=>({bavail:0,bsize:4096}));let read=0;
 try{async function* body(){read++;yield b;}await assert.rejects(s.manager.receive(p.planId,body(),{label:'a.mp4',length:b.length}),/SOURCE_DISK_SPACE/);assert.equal(read,0);}
 finally{spy.mock.restore();}
});

test('registry and final-session write failures never report successful Open',async t=>{
 const s=await setup(t),b=Buffer.from('recoverable source'),d=saved([ref(1,b)]),p=await s.manager.prepare(d),before=s.current();
 s.failRegistry(true);await assert.rejects(upload(s.manager,p.planId,b),/REGISTRY_WRITE_FAILED/);assert.equal(s.registry().size,0);assert.equal(s.current(),before);
 const unacknowledged=await readdir(join(s.dir,'assets'));assert.equal(unacknowledged.length,1);assert.ok(!unacknowledged[0].endsWith('.tmp'));
 assert.equal(sha(await readFile(join(s.dir,'assets',unacknowledged[0]))),sha(b));
 const afterFailure=await s.newManager();assert.equal((await afterFailure.prepare(d)).available,0,'unregistered copied files are never admitted by folder scanning');
 s.failRegistry(false);await upload(s.manager,p.planId,b);s.failOpen(true);await assert.rejects(s.manager.open(p.planId),/SESSION_WRITE_FAILED/);assert.equal(s.current(),before);assert.equal(s.registry().size,1);
 assert.equal((await readdir(join(s.dir,'assets'))).length,2);assert.equal(sha(await readFile(s.registry().values().next().value.path)),sha(b));
 const next=await s.newManager();assert.equal((await next.prepare(d)).ready,true);assert.equal(s.opened(),0);
});

test('changed, missing or linked registered media is not treated as verified',async t=>{
 for(const mode of ['changed','missing','link']){
  const b=Buffer.from('original registered media'),a=ref(1,b),s=await setup(t,[[a,b]]),p=await s.manager.prepare(saved([a])),entry=s.registry().get(a.assetId),before=s.current();
  if(mode==='changed')await writeFile(entry.path,Buffer.from('different same size bytes'));
  if(mode==='missing')await fs.unlink(entry.path);
  if(mode==='link'){const outside=join(s.dir,'outside.mp4');await writeFile(outside,b);await fs.unlink(entry.path);await symlink(outside,entry.path);}
  await assert.rejects(s.manager.open(p.planId),/SOURCE_/);assert.equal(s.current(),before);assert.equal(s.opened(),0);
 }
});

test('registry capacity is checked before assigning saved IDs',async t=>{
 const s=await setup(t),bytes=Buffer.from('capacity');
 for(let i=0;i<100;i++)s.registry().set(asset(i),{source:ref(i,bytes),assetId:asset(i),file:asset(i)+'.mp4',path:join(s.dir,'assets',asset(i)+'.mp4'),label:'file'});
 await assert.rejects(s.manager.prepare(saved([ref(101,bytes)])),/SOURCE_COUNT_LIMIT/);assert.equal(s.registry().size,100);
});
