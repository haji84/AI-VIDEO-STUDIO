/** Beginner operations preserve explicit unsupported edits instead of guessing. */
import {validateProject} from '../../packages/project/project.mjs';
const same=(a,b)=>Math.abs(a-b)<1e-7;
function simple(c){
  if(c.layout!=='single'||c.effects.length>1)throw new Error('UNSUPPORTED_EDITOR_EFFECT: このカットの詳細な効果はまだ編集できません');
  for(const e of c.effects)if(e.type!=='caption'||e.version!==1||e.keyframes.length||!same(e.startSec,0)||
    !same(e.endSec,c.durationSec/c.speed)||Object.keys(e.parameters).some(k=>k!=='text'))throw new Error('UNSUPPORTED_EDITOR_EFFECT: 保存した効果を保護するため編集を止めました');
}
function prepare(project){validateProject(project);const p=structuredClone(project),linked=new Map();
  for(const c of p.timeline){simple(c);const a=p.audioClips.find(a=>a.id==='audio_'+c.clipId);
    if(a&&a.bus==='source'&&a.assetId===c.sourceId&&same(a.trimInSec,c.sourceInSec)&&same(a.speed,c.speed)&&
      same(a.startSec,c.startSec)&&same(a.endSec,c.startSec+c.durationSec/c.speed)&&!a.loop){
      if(a.ducking||a.fadeInSec||a.fadeOutSec)throw new Error('UNSUPPORTED_EDITOR_AUDIO: この音声の詳細設定は保持して編集してください');
      linked.set(c.clipId,a.id);
    }
  }return {p,linked};
}
function linkedAudio(c){return {id:'audio_'+c.clipId,assetId:c.sourceId,bus:'source',startSec:c.startSec,endSec:c.startSec+c.durationSec/c.speed,
  trimInSec:c.sourceInSec,speed:c.speed,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0};}
function reflow(p,linked){let cursor=0;
  for(const c of p.timeline){c.startSec=cursor;const end=cursor+c.durationSec/c.speed,a=p.audioClips.find(a=>a.id===linked.get(c.clipId));
    if(a){if(p.sourceRefs.find(s=>s.assetId===c.sourceId).hasAudio)Object.assign(a,{assetId:c.sourceId,startSec:cursor,endSec:end,trimInSec:c.sourceInSec,speed:c.speed});
      else p.audioClips=p.audioClips.filter(item=>item!==a);}
    cursor=end;
  }
  // Only app-created automatic full-length BGM slots resize with the movie.
  // All other user audio keeps its explicit timing/selection or validation refuses.
  for(const a of p.audioClips)if(/^audio_bgm_[a-f0-9]{32}$/.test(a.id)&&a.startSec===0&&a.loop&&!a.ducking)a.endSec=cursor;
  validateProject(p);return p;
}
export function applyClipEdit(project,index,changes){
  const {p,linked}=prepare(project),c=p.timeline[index];if(!c)throw new Error('CLIP_NOT_FOUND');
  for(const key of ['sourceId','sourceInSec','durationSec','speed'])if(changes[key]!==undefined)c[key]=changes[key];
  const text=changes.caption??c.effects[0]?.parameters.text??'';
  c.effects=text?[{effectId:c.effects[0]?.effectId??'effect_'+c.clipId,version:1,type:'caption',startSec:0,endSec:c.durationSec/c.speed,parameters:{text},keyframes:[]}]:[];
  return reflow(p,linked);
}
export function splitClip(project,index,sourceOffset,newClipId){
  const {p,linked}=prepare(project),c=p.timeline[index];if(!c||sourceOffset<.2||sourceOffset>c.durationSec-.2)throw new Error('カットの途中を再生して分割してください');
  const second=structuredClone(c);second.clipId=newClipId;second.sourceInSec+=sourceOffset;second.durationSec-=sourceOffset;c.durationSec=sourceOffset;
  for(const e of c.effects)e.endSec=c.durationSec/c.speed;
  for(const e of second.effects){e.effectId='effect_'+newClipId;e.endSec=second.durationSec/second.speed;}
  const original=p.audioClips.find(a=>a.id===linked.get(c.clipId));
  if(original){const a={...structuredClone(original),id:'audio_'+newClipId};p.audioClips.push(a);linked.set(newClipId,a.id);}
  p.timeline.splice(index+1,0,second);return reflow(p,linked);
}
export function moveClip(project,index,direction){const {p,linked}=prepare(project),target=index+direction;
  if(target<0||target>=p.timeline.length)return p;[p.timeline[index],p.timeline[target]]=[p.timeline[target],p.timeline[index]];return reflow(p,linked);}
export function appendClip(project,sourceId,clipId,{withSourceAudio=false}={}){
  const {p,linked}=prepare(project),source=p.sourceRefs.find(s=>s.assetId===sourceId);if(!source||source.mediaKind!=='video')throw new Error('VIDEO_SOURCE_REQUIRED');
  const c={clipId,sourceId,sourceInSec:0,durationSec:source.durationSec,startSec:0,speed:1,layout:'single',effects:[]};p.timeline.push(c);
  if(withSourceAudio&&source.hasAudio){const a=linkedAudio(c);p.audioClips.push(a);linked.set(clipId,a.id);}return reflow(p,linked);
}
export function cameraSourceIn(project,index,targetId){
  validateProject(project);const c=project.timeline[index],old=project.sourceRefs.find(s=>s.assetId===c?.sourceId),target=project.sourceRefs.find(s=>s.assetId===targetId);
  if(!c||!old||!target||target.mediaKind!=='video')throw new Error('VIDEO_SOURCE_REQUIRED');
  if(!['master','verified'].includes(old.syncStatus)||!['master','verified'].includes(target.syncStatus))throw new Error('SYNC_UNVERIFIED: 先に同期位置を確認してください');
  if(old.driftPpm!==0||target.driftPpm!==0)throw new Error('CLOCK_DRIFT_UNSUPPORTED');
  const start=c.sourceInSec+old.offsetSec-target.offsetSec;
  if(start<0||start+c.durationSec>target.durationSec+1e-7)throw new Error('CAMERA_HAS_NO_COVERAGE: この共通時刻は選んだカメラの撮影範囲外です');
  return start;
}
