import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rename,rm,symlink,link,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createProject,EditSession} from './project.mjs';
import * as store from './local-store.mjs';
import * as adapter from './manifest-adapter.mjs';

const assetId='asset_'+'1'.padStart(32,'0');
const source=sha256=>({assetId,sha256,mediaKind:'video',durationSec:12,hasAudio:true,offsetSec:0,driftPpm:0,syncStatus:'master'});
const fixture=sha=>{
  const p=createProject({projectId:'project_disk',sourceRefs:[source(sha)]});
  p.timeline=[{clipId:'clip_a',sourceId:assetId,sourceInSec:1,durationSec:2,startSec:0,speed:1,layout:'single',effects:[]}];
  p.audioClips=[{id:'audio_a',assetId,bus:'source',startSec:0,endSec:2,trimInSec:1,speed:1,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0}];
  return p;
};
async function withFiles(fn){const dir=await mkdtemp(join(tmpdir(),'aivs-store-'));try{
  const media=join(dir,'synthetic.mp4');await writeFile(media,'synthetic bytes for identity test');
  const sha=createHash('sha256').update(await readFile(media)).digest('hex');await fn({dir,media,sha});
}finally{await rm(dir,{recursive:true,force:true});}}

test('exports atomic save/load and source hash APIs',()=>{
  assert.equal(typeof store.saveSession,'function');assert.equal(typeof adapter.createManifest,'function');
});
test('real disk save/reload retains undo and redo without leftover partial files',()=>withFiles(async({dir,media,sha})=>{
  const s=new EditSession(fixture(sha)),p=s.current;p.name='保存した編集';s.apply(p);
  const file=join(dir,'project.aivs.json');await store.saveSession(file,s,{protectedPaths:[media]});
  const loaded=await store.loadSession(file);assert.equal(loaded.current.name,'保存した編集');
  assert.equal(loaded.undo(),true);assert.equal(loaded.redo(),true);
  await store.saveSession(file,loaded,{protectedPaths:[media]});
  assert.equal((await store.loadSession(file)).current.revision,3);
  assert.deepEqual((await readdir(dir)).sort(),['project.aivs.json','synthetic.mp4']);
}));
test('corrupt session cannot replace a good save; originals cannot be a save target',()=>withFiles(async({dir,media,sha})=>{
  const file=join(dir,'project.json'),s=new EditSession(fixture(sha));await store.saveSession(file,s);
  const before=await readFile(file,'utf8');await assert.rejects(store.saveSession(file,{serialize:()=>'{bad'}),/JSON/);
  assert.equal(await readFile(file,'utf8'),before);
  await assert.rejects(store.saveSession(media,s,{protectedPaths:[media]}),/PROTECTED/);
  assert.equal(await store.hashFile(media),sha);
}));
test('symlink and hardlink aliases of source media cannot be overwritten',()=>withFiles(async({dir,media,sha})=>{
  const a=join(dir,'alias.json'),b=join(dir,'hardlink.json');await symlink(media,a);await link(media,b);
  for(const file of [a,b])await assert.rejects(store.saveSession(file,new EditSession(fixture(sha)),{protectedPaths:[media]}),/PROTECTED/);
  assert.equal(await store.hashFile(media),sha);
}));
test('streamed hashes allow moved media and reject wrong same-name bytes',()=>withFiles(async({dir,media,sha})=>{
  const p=fixture(sha),moved=join(dir,'moved.mp4');await rename(media,moved);
  const bindings=[{assetId,path:moved}];assert.equal((await store.verifyBindings(p,bindings))[assetId],moved);
  await writeFile(media,'wrong bytes');await assert.rejects(store.verifyBindings(p,[{assetId,path:media}]),/HASH_MISMATCH/);
  await assert.rejects(store.verifyBindings(p,[]),/MISSING_BINDING/);
  await assert.rejects(store.verifyBindings(p,[...bindings,...bindings]),/DUPLICATE/);
  await assert.rejects(store.verifyBindings(p,[{assetId,path:'https://example.invalid/video.mp4'}]),/LOCAL_PATH/);
}));
test('existing manifest bridge preserves clip order, source time, static text and audio',()=>withFiles(async({media,sha})=>{
  const p=fixture(sha);p.timeline[0].effects=[{effectId:'effect_a',type:'caption',version:1,startSec:0,endSec:2,parameters:{text:'合成テロップ'},keyframes:[]}];
  const manifest=await adapter.createManifest(p,[{assetId,path:media}]);
  assert.equal(manifest.timeline[0].start,1);assert.equal(manifest.timeline[0].caption,'合成テロップ');
  assert.equal(manifest.sources[0].path,media);assert.equal(manifest.autoPlan,false);
  assert.equal(manifest.sources[0].sha256,sha);assert.equal(manifest.sources[0].hasAudio,true);
  assert.equal(manifest.sources[0].durationSec,12);
}));
test('multiline caption survives disk history and reaches the render bundle unchanged',()=>withFiles(async({dir,media,sha})=>{
  const original=fixture(sha),session=new EditSession(original),edited=session.current;
  const text='FIRST LINE\nSECOND LINE\nTHIRD LINE';
  edited.timeline[0].effects=[{effectId:'effect_lines',type:'caption',version:1,startSec:0,endSec:2,parameters:{text},keyframes:[]}];
  session.apply(edited);const path=join(dir,'multiline.aivs.json');await store.saveSession(path,session);
  const reopened=await store.loadSession(path);assert.equal(reopened.undo(),true);assert.equal(reopened.redo(),true);
  const bundle=await adapter.createRenderBundle(reopened.current,[{assetId,path:media}]);
  assert.equal(bundle.videoManifest.timeline[0].caption,text);
  assert.deepEqual(bundle.plan.audio,original.audioClips);
  assert.equal(await store.hashFile(media),sha);
}));
test('bridge refuses unsupported effects, audio processing, drift and gaps',()=>withFiles(async({media,sha})=>{
  for(const edit of [p=>p.timeline[0].startSec=.5,p=>p.sourceRefs[0].driftPpm=2,
    p=>p.audioBuses.source.muted=true,p=>p.audioClips[0].gainDb=-12,
    p=>p.audioClips[0].fadeInSec=.3,p=>p.audioClips[0].bus='bgm',
    p=>p.timeline[0].effects=[{effectId:'effect_zoom',type:'zoom',version:1,startSec:0,endSec:2,parameters:{scale:2},keyframes:[]}],
    p=>p.timeline[0].effects=[{effectId:'effect_a',type:'caption',version:1,startSec:0,endSec:2,parameters:{text:'x',x:.2},keyframes:[]}]]){
    const p=fixture(sha);edit(p);await assert.rejects(adapter.createManifest(p,[{assetId,path:media}]),/UNSUPPORTED/);
  }
}));
test('bridge rejects unverified sync and inconsistent secondary clock mappings',()=>withFiles(async({media,sha})=>{
  const p=fixture(sha),s={...source(sha),assetId:'asset_'+'2'.padStart(32,'0'),syncStatus:'unverified'};p.sourceRefs.push(s);
  Object.assign(p.timeline[0],{layout:'split',secondarySourceId:s.assetId,secondaryInSec:1});
  const bindings=[{assetId,path:media},{assetId:s.assetId,path:media}];
  await assert.rejects(adapter.createManifest(p,bindings),/SYNC_UNVERIFIED/);
  s.syncStatus='verified';p.timeline[0].secondaryInSec=2;
  await assert.rejects(adapter.createManifest(p,bindings),/SYNC_CLOCK_MISMATCH/);
}));
test('audio render bundle preserves requested four-bus edits separately from video composition',()=>withFiles(async({media,sha})=>{
  const p=fixture(sha);p.audioClips[0].gainDb=-9;p.audioBuses.source.muted=true;
  for(const bus of ['narration','bgm','sfx'])p.audioClips.push({...p.audioClips[0],id:'audio_'+bus,bus,gainDb:-12});
  const bundle=await adapter.createRenderBundle(p,[{assetId,path:media}]);
  assert.equal(bundle.schema,'aivs-local-render-bundle-v1');assert.equal(bundle.plan.audio.length,4);
  assert.deepEqual(bundle.plan.audio,p.audioClips);assert.equal(bundle.plan.audioBuses.source.muted,true);
  assert.equal(bundle.videoManifest.timeline.length,1);assert.equal(bundle.mediaPaths[assetId],media);
  assert.equal(bundle.intermediateAudio,'IGNORED_BY_FINAL_MIX');
  p.timeline[0].effects=[{effectId:'effect_zoom',version:1,type:'zoom',startSec:0,endSec:2,parameters:{scale:2},keyframes:[]}];
  await assert.rejects(adapter.createRenderBundle(p,[{assetId,path:media}]),/UNSUPPORTED/);
}));
