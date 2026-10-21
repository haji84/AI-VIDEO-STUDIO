import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,EditSession} from '../../packages/project/project.mjs';
import {applyClipEdit} from './edits.mjs';
import * as audio from './audio-edits.mjs';
function fixture(){
  const source={assetId:'asset_'+'1'.repeat(32),sha256:'1'.repeat(64),mediaKind:'video',durationSec:8,hasAudio:true,offsetSec:0,driftPpm:0,syncStatus:'master'};
  const p=createProject({projectId:'project_audio_edits',sourceRefs:[source]});
  p.timeline=[{clipId:'clip_a',sourceId:source.assetId,sourceInSec:0,durationSec:8,startSec:0,speed:1,layout:'single',effects:[]}];
  p.audioClips=[{id:'audio_clip_a',assetId:source.assetId,bus:'source',startSec:0,endSec:8,trimInSec:0,speed:1,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0},
   {id:'audio_bgm_'+'b'.repeat(32),assetId:source.assetId,bus:'bgm',startSec:0,endSec:8,trimInSec:0,speed:1,gainDb:-12,loop:true,fadeInSec:0,fadeOutSec:0}];
  return p;
}
test('audio timing, trim, speed, gain, loop and fades persist with undo/redo',()=>{
  const p=fixture(),before=JSON.stringify(p),session=new EditSession(p);
  const q=audio.editAudioClip(p,p.audioClips[1].id,{startSec:1,endSec:6,trimInSec:2,speed:2,gainDb:-9,loop:true,fadeInSec:.5,fadeOutSec:1});
  const changed=q.audioClips[1];assert.match(changed.id,/^audio_manual_/);
  assert.deepEqual({...changed,id:p.audioClips[1].id},{...p.audioClips[1],startSec:1,endSec:6,trimInSec:2,speed:2,gainDb:-9,loop:true,fadeInSec:.5,fadeOutSec:1});
  assert.deepEqual(q.audioClips[0],p.audioClips[0]);assert.deepEqual(q.timeline,p.timeline);assert.equal(JSON.stringify(p),before);
  session.apply(q);const reopened=EditSession.open(session.serialize());assert.deepEqual(reopened.current.audioClips,q.audioClips);
  reopened.undo();assert.deepEqual(reopened.current.audioClips,p.audioClips);reopened.redo();assert.deepEqual(reopened.current.audioClips,q.audioClips);
});
test('manual source fades and BGM range do not silently follow later video trims',()=>{
  let p=fixture();p=audio.editAudioClip(p,'audio_clip_a',{endSec:4,fadeInSec:.2});
  p=audio.editAudioClip(p,p.audioClips[1].id,{endSec:4,fadeOutSec:1});
  const expected=structuredClone(p.audioClips);
  const q=applyClipEdit(p,0,{durationSec:6,caption:''});assert.deepEqual(q.audioClips,expected);
  const again=audio.editAudioClip(q,q.audioClips[0].id,{gainDb:-3});assert.equal(again.audioClips[0].id,q.audioClips[0].id);
});
test('explicit independent audio and duck intervals survive unrelated changes',()=>{
  const p=fixture();p.audioClips[0].id='audio_custom';p.audioClips[0].ducking={enabled:true,gainFactor:.2,voiceIntervals:[[2,3]]};
  const q=audio.editAudioClip(p,'audio_custom',{gainDb:-3});assert.equal(q.audioClips[0].id,'audio_custom');
  assert.deepEqual(q.audioClips[0].ducking,p.audioClips[0].ducking);
  assert.throws(()=>audio.editAudioClip(p,'audio_custom',{endSec:1}),/INVALID_TIME/);
});
test('invalid edits fail without clipping ranges or changing identities',()=>{
  const p=fixture(),before=JSON.stringify(p);
  for(const change of [{endSec:10},{trimInSec:7},{fadeOutSec:9},{startSec:9},{gainDb:NaN},{assetId:p.sourceRefs[0].assetId},{bus:'sfx'},{ducking:null}])
    assert.throws(()=>audio.editAudioClip(p,'audio_clip_a',change));
  assert.throws(()=>audio.editAudioClip(p,'audio_missing',{gainDb:0}),/AUDIO_CLIP_NOT_FOUND/);
  assert.equal(JSON.stringify(p),before);
});
test('remove is explicit and reversible; detached IDs cannot collide',()=>{
  const p=fixture();p.audioClips.push({...p.audioClips[0],id:'audio_manual_1'});
  const q=audio.editAudioClip(p,'audio_clip_a',{endSec:4});assert.equal(q.audioClips[0].id,'audio_manual_2');
  const session=new EditSession(q);session.apply(audio.removeAudioClip(q,q.audioClips[1].id));
  assert.equal(session.current.audioClips.length,2);session.undo();assert.deepEqual(session.current.audioClips,q.audioClips);
  assert.throws(()=>audio.removeAudioClip(q,'audio_missing'),/AUDIO_CLIP_NOT_FOUND/);
});
