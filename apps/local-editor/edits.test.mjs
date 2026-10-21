import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../../packages/project/project.mjs';
import * as edits from './edits.mjs';
function fixture(){const source={assetId:'asset_'+'1'.repeat(32),sha256:'1'.repeat(64),mediaKind:'video',durationSec:8,hasAudio:true,offsetSec:0,driftPpm:0,syncStatus:'master'};
 const p=createProject({projectId:'project_edits',sourceRefs:[source]});p.timeline=[{clipId:'clip_a',sourceId:source.assetId,sourceInSec:0,durationSec:2,startSec:0,speed:1,layout:'single',effects:[]}];return p;}
const changes={sourceInSec:0,durationSec:2,speed:1,caption:'new'};
test('silent reopened projects stay silent through trim, split and move',()=>{
 const p=fixture(),before=JSON.stringify(p);const edited=edits.applyClipEdit(p,0,{...changes,durationSec:1});
 assert.deepEqual(edited.audioClips,[]);const split=edits.splitClip(p,0,1,'clip_b');
 assert.deepEqual(split.audioClips,[]);assert.deepEqual(edits.moveClip(split,0,1).audioClips,[]);assert.equal(JSON.stringify(p),before);
});
test('custom explicit source audio is preserved without duplication or invented linkage',()=>{
 const p=fixture();p.audioClips=[{id:'audio_original',assetId:p.sourceRefs[0].assetId,bus:'source',startSec:0,endSec:2,trimInSec:0,speed:1,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0}];
 assert.deepEqual(edits.applyClipEdit(p,0,changes).audioClips,p.audioClips);
 assert.deepEqual(edits.splitClip(p,0,1,'clip_b').audioClips,p.audioClips);
});
test('multiple, partial, positioned and animated captions refuse unchanged',()=>{
 const base={effectId:'effect_a',version:1,type:'caption',startSec:0,endSec:2,parameters:{text:'old'},keyframes:[]};
 for(const effects of [[base,{...base,effectId:'effect_b'}],[{...base,startSec:.5,endSec:1}],
   [{...base,parameters:{text:'old',x:.2}}],[{...base,keyframes:[{atSec:0,value:0},{atSec:2,value:1}]}]]){
  const p=fixture();p.timeline[0].effects=structuredClone(effects);const before=JSON.stringify(p);
  assert.throws(()=>edits.applyClipEdit(p,0,changes),/UNSUPPORTED_EDITOR/);
  assert.throws(()=>edits.splitClip(p,0,1,'clip_b'),/UNSUPPORTED_EDITOR/);assert.equal(JSON.stringify(p),before);
 }
});
test('app-linked source audio follows an explicit trim and splits without overlap',()=>{
 let p=edits.appendClip(fixture(),fixture().sourceRefs[0].assetId,'clip_b',{withSourceAudio:true});
 assert.equal(p.audioClips.length,1);p=edits.applyClipEdit(p,1,{...changes,durationSec:2});
 assert.equal(p.audioClips[0].id,'audio_clip_b');assert.equal(p.audioClips[0].startSec,2);
 const split=edits.splitClip(p,1,1,'clip_c');assert.equal(split.audioClips.length,2);
 assert.equal(split.audioClips.find(a=>a.id==='audio_clip_c').startSec,3);
});
test('confirmed camera choice preserves shared event time instead of source file time',()=>{
 const p=fixture();p.timeline[0].sourceInSec=5;p.sourceRefs.push({...p.sourceRefs[0],assetId:'asset_'+'2'.repeat(32),offsetSec:2,syncStatus:'verified'});
 assert.equal(edits.cameraSourceIn(p,0,p.sourceRefs[1].assetId),3);
 p.timeline[0].sourceInSec=1;assert.throws(()=>edits.cameraSourceIn(p,0,p.sourceRefs[1].assetId),/CAMERA_HAS_NO_COVERAGE/);
 p.sourceRefs[1].syncStatus='unverified';assert.throws(()=>edits.cameraSourceIn(p,0,p.sourceRefs[1].assetId),/SYNC_UNVERIFIED/);
});
