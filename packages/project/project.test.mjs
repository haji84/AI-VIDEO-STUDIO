import test from 'node:test';
import assert from 'node:assert/strict';
import * as project from './project.mjs';

export const asset = (n=1) => ({assetId:`asset_${String(n).padStart(32,'0')}`,
  sha256:String(n).padStart(64,'0'),mediaKind:'video',durationSec:12,
  hasAudio:true,offsetSec:0,driftPpm:0,syncStatus:n===1?'master':'unverified'});
export function fixture(n=1){
  const p=project.createProject({projectId:'project_fixture',name:'合成テスト',sourceRefs:Array.from({length:n},(_,i)=>asset(i+1))});
  p.timeline=[{clipId:'clip_a',sourceId:asset().assetId,sourceInSec:1,
    durationSec:4,startSec:0,speed:2,layout:'single',effects:[]}];
  p.audioClips=[{id:'audio_original',assetId:asset().assetId,bus:'source',startSec:0,endSec:2,
    trimInSec:1,speed:2,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0}];
  return p;
}

test('exports the actual project creation API',()=>assert.equal(typeof project.createProject,'function'));
test('one, two and three-plus source projects serialize without paths',()=>{
  for(const n of [1,2,4]){
    const p=fixture(n),json=project.serializeProject(p),loaded=project.openProject(json);
    assert.deepEqual(loaded,p); assert.equal(loaded.sourceRefs.length,n);
    assert.deepEqual(Object.keys(p.audioBuses),['source','narration','bgm','sfx']);
    assert.equal(json.includes('localPath'),false);
  }
});
test('render plan deterministically distinguishes source/output clocks and drift',()=>{
  const p=fixture(3); p.sourceRefs[0].offsetSec=3;p.sourceRefs[0].driftPpm=1000;
  const a=project.buildRenderPlan(p),b=project.buildRenderPlan(project.openProject(project.serializeProject(p)));
  assert.deepEqual(a,b);assert.equal(a.durationSec,2);
  assert.equal(a.video[0].sourceInSec,1);assert.equal(a.video[0].endSec,2);
  assert.equal(project.sourceToSharedTime(p.sourceRefs[0],2),5.002);
  assert.ok(Math.abs(project.sharedToSourceTime(p.sourceRefs[0],5.002)-2)<1e-9);
});
test('four independent buses, envelopes and effect keyframes survive reopen',()=>{
  const p=fixture(2);p.sourceRefs[1].mediaKind='audio';
  for(const bus of ['narration','bgm','sfx'])p.audioClips.push({id:'audio_'+bus,assetId:asset(2).assetId,bus,
    startSec:0,endSec:2,trimInSec:0,speed:1,gainDb:-12,loop:true,fadeInSec:.2,fadeOutSec:.3,
    ducking:{enabled:true,gainFactor:.22,voiceIntervals:[[.3,1]]}});
  p.timeline[0].effects=[{effectId:'effect_caption',version:1,type:'caption',startSec:0,endSec:2,
    parameters:{text:'合成字幕',x:.5,y:.85},keyframes:[{atSec:0,value:0},{atSec:1,value:1}]}];
  assert.deepEqual(project.openProject(project.serializeProject(p)),p);
  const plan=project.buildRenderPlan(p);assert.equal(plan.audio.length,4);
  assert.deepEqual(plan.video[0].effects,p.timeline[0].effects);
});
test('undo and redo persist across session reopening without mutating callers',()=>{
  const original=fixture(),session=new project.EditSession(original);
  const edit=structuredClone(original);edit.timeline[0].durationSec=2;edit.timeline[0].speed=1;
  session.apply(edit);edit.name='outside mutation';
  const restored=project.EditSession.open(session.serialize());
  assert.equal(restored.current.name,'合成テスト');assert.equal(restored.current.revision,1);
  assert.equal(restored.undo(),true);assert.equal(restored.current.timeline[0].speed,2);
  assert.equal(restored.current.revision,2);assert.equal(restored.redo(),true);
  assert.equal(restored.current.timeline[0].speed,1);
  const leaked=restored.current;leaked.name='mutated';assert.notEqual(restored.current.name,'mutated');
  assert.equal(original.revision,0);
});
test('a new edit clears redo and history remains bounded',()=>{
  const s=new project.EditSession(fixture());for(let i=0;i<55;i++){const p=s.current;p.name='edit'+i;s.apply(p);}
  const doc=JSON.parse(s.serialize());assert.equal(doc.undo.length,50);
  s.undo();const p=s.current;p.name='new branch';s.apply(p);assert.equal(s.redo(),false);
  const roundtrip=project.EditSession.open(s.serialize());assert.equal(roundtrip.current.name,'new branch');
});
test('invalid edits are transactional and do not destroy redo',()=>{
  const s=new project.EditSession(fixture()),p=s.current;p.name='edit';s.apply(p);s.undo();
  const before=s.serialize(),bad=s.current;bad.timeline[0].sourceId='missing';
  assert.throws(()=>s.apply(bad),/SOURCE/);assert.equal(s.serialize(),before);assert.equal(s.redo(),true);
});
test('all historical snapshots are validated on open',()=>{
  const s=new project.EditSession(fixture()),p=s.current;p.name='edit';s.apply(p);
  const doc=JSON.parse(s.serialize());doc.undo[0].timeline[0].durationSec=-1;
  assert.throws(()=>project.EditSession.open(JSON.stringify(doc)),/TIME/);
});
test('combined persisted history cannot exceed the actual undo budget',()=>{
  const s=new project.EditSession(fixture()),p=s.current;p.name='edit';s.apply(p);
  const doc=JSON.parse(s.serialize());doc.undo=Array(50).fill(doc.project);doc.redo=[doc.project];
  assert.throws(()=>project.EditSession.open(JSON.stringify(doc)),/HISTORY/);
});
test('future versions and unknown fields fail closed',()=>{
  const p=fixture();p.projectVersion=999;assert.throws(()=>project.openProject(JSON.stringify(p)),/VERSION/);
  const q=fixture();q.sourceRefs[0].localPath='/private/example.mp4';
  assert.throws(()=>project.serializeProject(q),/UNKNOWN_FIELD/);
  assert.throws(()=>project.openProject('{broken'),/JSON/);
});
test('duplicate identifiers, invalid hashes and missing sources fail validation',()=>{
  for(const edit of [p=>p.sourceRefs.push(asset()),p=>p.sourceRefs[0].sha256='bad',
    p=>p.timeline[0].sourceId=asset(9).assetId,p=>p.audioClips[0].assetId=asset(9).assetId,
    p=>p.timeline.push({...p.timeline[0]}),p=>p.audioClips.push({...p.audioClips[0]})]){
    const p=fixture();edit(p);assert.throws(()=>project.validateProject(p));
  }
});
test('negative, nonfinite, boolean, excessive and out-of-source times fail',()=>{
  for(const value of [-1,NaN,Infinity,true,20000]){
    const p=fixture();p.timeline[0].durationSec=value;assert.throws(()=>project.validateProject(p));
  }
  const p=fixture();p.timeline[0].sourceInSec=11;assert.throws(()=>project.validateProject(p),/SOURCE_RANGE/);
});
test('audio trims, fades, ducking intervals and source audio capability are checked',()=>{
  for(const edit of [p=>p.audioClips[0].trimInSec=12,p=>p.audioClips[0].fadeInSec=3,
    p=>p.audioClips[0].gainDb=100,p=>p.sourceRefs[0].hasAudio=false,
    p=>p.audioClips[0].ducking={enabled:true,gainFactor:.2,voiceIntervals:[[1,3]]}]){
    const p=fixture();edit(p);assert.throws(()=>project.validateProject(p));
  }
});
test('secondary camera trims are independently range checked',()=>{
  const p=fixture(2);Object.assign(p.timeline[0],{layout:'split',secondarySourceId:asset(2).assetId,secondaryInSec:2});
  assert.doesNotThrow(()=>project.validateProject(p));p.timeline[0].secondaryInSec=11;
  assert.throws(()=>project.validateProject(p),/SOURCE_RANGE/);
});
test('audio-only sources cannot be used as video, effect times stay inside clips',()=>{
  const p=fixture();p.sourceRefs[0].mediaKind='audio';assert.throws(()=>project.validateProject(p),/VIDEO/);
  const q=fixture();q.timeline[0].effects=[{effectId:'effect_a',version:1,type:'caption',startSec:0,endSec:3,parameters:{text:'x'},keyframes:[]}];
  assert.throws(()=>project.validateProject(q),/EFFECT/);
});
test('migrates existing v0.1 source/timeline model only with explicit hash identities',()=>{
  const legacy={schema:1,name:'旧編集',sources:[{id:'old_cam',path:'/not/copied.mp4',duration:12,offset:0,
    has_audio:true,sync:{method:'master'}}],timeline:[{id:'clip_legacy',camera:'old_cam',secondary:null,
      layout:'single',start:1,duration:4,speed:2,caption:'引継ぎ'}]};
  assert.throws(()=>project.migrateLegacyProject(legacy,{projectId:'project_migrate',identities:{}}),/IDENTITY/);
  const p=project.migrateLegacyProject(legacy,{projectId:'project_migrate',identities:{old_cam:asset()}});
  assert.equal(p.timeline[0].sourceInSec,1);assert.equal(p.timeline[0].startSec,0);
  assert.equal(p.timeline[0].effects[0].parameters.text,'引継ぎ');
  assert.equal(p.audioClips[0].speed,2);assert.equal(project.serializeProject(p).includes('/not/'),false);
});
test('real legacy bare hexadecimal clip IDs and chosen output quality migrate',()=>{
  const legacy={schema:1,name:'旧編集',settings:{export_profile:'fullhd'},
    sources:[{id:'f9d73a4c1230',duration:12,offset:0,has_audio:true,sync:{method:'master'}}],
    timeline:[{id:'3ac04e2b9af1',camera:'f9d73a4c1230',secondary:null,layout:'single',start:1,duration:4,speed:2,caption:''}]};
  const p=project.migrateLegacyProject(legacy,{projectId:'project_migrate',identities:{f9d73a4c1230:asset()}});
  assert.equal(p.timeline[0].clipId,'clip_3ac04e2b9af1');assert.equal(p.exportProfile,'fullhd');
});
