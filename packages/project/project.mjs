/** Portable offline editing contract. No media bytes, paths, network or OS APIs. */
export const PROJECT_VERSION = 1;
export const AUDIO_BUSES = Object.freeze(['source','narration','bgm','sfx']);
const MAX_TIME = 14400, MAX_HISTORY = 50;
const fail = code => { throw new Error(code); };
const clone = value => structuredClone(value);
const num = (v,lo,hi,code='INVALID_TIME') => {
  if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)fail(code);
};
function fields(v,allowed,code='UNKNOWN_FIELD'){
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)fail('INVALID_OBJECT');
  if(Object.keys(v).some(k=>!allowed.includes(k)))fail(code);
}
function list(v,max,code){if(!Array.isArray(v)||v.length>max)fail(code);}
function text(v,max,code){if(typeof v!=='string'||v.length>max)fail(code);}
function id(v,prefix){if(typeof v!=='string'||!new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,70}$`).test(v))fail('INVALID_ID');}
function unique(values,code){if(new Set(values).size!==values.length)fail(code);}
function jsonValue(v,depth=0){
  if(depth>8)fail('PARAMETERS_TOO_DEEP');
  if(v===null||typeof v==='boolean')return;
  if(typeof v==='number'){num(v,-1e12,1e12,'INVALID_PARAMETER');return;}
  if(typeof v==='string'){text(v,2000,'INVALID_PARAMETER');return;}
  if(Array.isArray(v)){list(v,100,'INVALID_PARAMETER');v.forEach(x=>jsonValue(x,depth+1));return;}
  fields(v,Object.keys(v??{}));
  if(Object.keys(v).length>40||Object.keys(v).some(k=>['__proto__','constructor','prototype'].includes(k)))fail('INVALID_PARAMETER');
  Object.values(v).forEach(x=>jsonValue(x,depth+1));
}
function parse(json){
  if(typeof json!=='string'||json.length>32*1024*1024)fail('INVALID_JSON_SIZE');
  try{return JSON.parse(json);}catch{fail('INVALID_JSON');}
}
export function createProject({projectId,name='新しい動画',sourceRefs=[]}={}){
  const p={schema:'aivs-project',projectVersion:PROJECT_VERSION,projectId,name,revision:0,
    sourceRefs:clone(sourceRefs),timeline:[],audioClips:[],
    audioBuses:Object.fromEntries(AUDIO_BUSES.map(bus=>[bus,{gainDb:0,muted:false}])),
    exportProfile:'review'};
  validateProject(p);return p;
}

/** Checks the unmodified object before cloning/JSON can erase invalid values. */
export function validateProject(p){
  fields(p,['schema','projectVersion','projectId','name','revision','sourceRefs','timeline','audioClips','audioBuses','exportProfile']);
  if(p.schema!=='aivs-project'||p.projectVersion!==PROJECT_VERSION)fail('UNSUPPORTED_PROJECT_VERSION');
  id(p.projectId,'project');text(p.name,160,'INVALID_NAME');
  if(!Number.isSafeInteger(p.revision)||p.revision<0)fail('INVALID_REVISION');
  if(!['review','hd','fullhd'].includes(p.exportProfile))fail('INVALID_EXPORT_PROFILE');
  list(p.sourceRefs,100,'INVALID_SOURCES');
  const sources=new Map();
  for(const s of p.sourceRefs){
    fields(s,['assetId','sha256','mediaKind','durationSec','hasAudio','offsetSec','driftPpm','syncStatus']);
    if(typeof s.assetId!=='string'||!/^asset_[a-f0-9]{32}$/.test(s.assetId)||sources.has(s.assetId))fail('INVALID_OR_DUPLICATE_SOURCE');
    if(typeof s.sha256!=='string'||!/^[a-f0-9]{64}$/.test(s.sha256))fail('INVALID_SOURCE_HASH');
    if(!['video','audio'].includes(s.mediaKind)||typeof s.hasAudio!=='boolean')fail('INVALID_SOURCE_KIND');
    num(s.durationSec,.001,MAX_TIME);num(s.offsetSec,-MAX_TIME,MAX_TIME);num(s.driftPpm,-10000,10000);
    if(!['master','verified','candidate','unverified','manual'].includes(s.syncStatus))fail('INVALID_SYNC_STATUS');
    sources.set(s.assetId,s);
  }
  const range=(assetId,start,duration,video=false)=>{
    const s=sources.get(assetId);if(!s)fail('MISSING_SOURCE');
    if(video&&s.mediaKind!=='video')fail('VIDEO_SOURCE_REQUIRED');
    num(start,0,MAX_TIME);num(duration,.001,MAX_TIME);
    if(start+duration>s.durationSec+1e-7)fail('SOURCE_RANGE_EXCEEDED');return s;
  };
  list(p.timeline,2000,'INVALID_TIMELINE');unique(p.timeline.map(x=>x?.clipId),'DUPLICATE_CLIP');
  let end=0;const effectIds=[];
  for(const c of p.timeline){
    fields(c,['clipId','sourceId','sourceInSec','durationSec','startSec','speed','layout','secondarySourceId','secondaryInSec','effects']);
    id(c.clipId,'clip');num(c.startSec,0,MAX_TIME);num(c.speed,.25,4);
    range(c.sourceId,c.sourceInSec,c.durationSec,true);
    const length=c.durationSec/c.speed;num(c.startSec+length,.001,MAX_TIME);end=Math.max(end,c.startSec+length);
    if(!['single','split'].includes(c.layout))fail('INVALID_LAYOUT');
    if(c.layout==='split'){
      if(c.secondarySourceId===c.sourceId)fail('INVALID_SECONDARY_SOURCE');
      range(c.secondarySourceId,c.secondaryInSec,c.durationSec,true);
    }else if(c.secondarySourceId!==undefined||c.secondaryInSec!==undefined)fail('UNUSED_SECONDARY_SOURCE');
    list(c.effects,100,'INVALID_EFFECTS');
    for(const e of c.effects){
      fields(e,['effectId','version','type','startSec','endSec','parameters','keyframes']);id(e.effectId,'effect');effectIds.push(e.effectId);
      if(e.version!==1||!['caption','zoom','color','blur','mosaic','transition','arrow','pip'].includes(e.type))fail('UNSUPPORTED_EFFECT_VERSION_OR_TYPE');
      num(e.startSec,0,length,'INVALID_EFFECT_TIME');num(e.endSec,e.startSec+.000001,length,'INVALID_EFFECT_TIME');
      jsonValue(e.parameters);list(e.keyframes,200,'INVALID_EFFECT_KEYFRAMES');
      let previous=-1;
      for(const k of e.keyframes){fields(k,['atSec','value']);num(k.atSec,e.startSec,e.endSec,'INVALID_EFFECT_KEYFRAME');
        if(k.atSec<=previous)fail('INVALID_EFFECT_KEYFRAME_ORDER');previous=k.atSec;jsonValue(k.value);}
      if(e.type==='caption')text(e.parameters.text,2000,'INVALID_CAPTION');
    }
  }
  unique(effectIds,'DUPLICATE_EFFECT');
  fields(p.audioBuses,AUDIO_BUSES);
  for(const bus of AUDIO_BUSES){const b=p.audioBuses[bus];fields(b,['gainDb','muted']);num(b.gainDb,-96,24,'INVALID_BUS_GAIN');if(typeof b.muted!=='boolean')fail('INVALID_MUTE');}
  list(p.audioClips,2000,'INVALID_AUDIO_CLIPS');unique(p.audioClips.map(x=>x?.id),'DUPLICATE_AUDIO_CLIP');
  for(const a of p.audioClips){
    fields(a,['id','assetId','bus','startSec','endSec','trimInSec','speed','gainDb','loop','fadeInSec','fadeOutSec','ducking']);id(a.id,'audio');
    if(!AUDIO_BUSES.includes(a.bus))fail('INVALID_AUDIO_BUS');
    num(a.startSec,0,MAX_TIME);num(a.endSec,a.startSec+.000001,MAX_TIME);num(a.speed,.25,4);
    const s=sources.get(a.assetId);if(!s)fail('MISSING_AUDIO_SOURCE');if(!s.hasAudio)fail('SOURCE_HAS_NO_AUDIO');
    if(typeof a.loop!=='boolean')fail('INVALID_LOOP');num(a.trimInSec,0,s.durationSec-.000001);
    if(!a.loop)range(a.assetId,a.trimInSec,(a.endSec-a.startSec)*a.speed);
    num(a.gainDb,-96,24,'INVALID_AUDIO_GAIN');num(a.fadeInSec,0,a.endSec-a.startSec);num(a.fadeOutSec,0,a.endSec-a.startSec);
    if(a.endSec>end+1e-7)fail('AUDIO_EXCEEDS_VIDEO_TIMELINE');
    if(a.ducking!==undefined){const d=a.ducking;fields(d,['enabled','gainFactor','voiceIntervals']);
      if(typeof d.enabled!=='boolean')fail('INVALID_DUCKING');num(d.gainFactor,0,1);list(d.voiceIntervals,500,'INVALID_DUCK_INTERVALS');
      for(const pair of d.voiceIntervals){if(!Array.isArray(pair)||pair.length!==2)fail('INVALID_DUCK_INTERVAL');
        num(pair[0],a.startSec,a.endSec);num(pair[1],pair[0]+.000001,a.endSec);}
    }
  }
  return p;
}
export function serializeProject(p){validateProject(p);return JSON.stringify(p,null,2)+'\n';}
export function openProject(json){const p=parse(json);validateProject(p);return p;}
export function sourceToSharedTime(source,localSec){num(localSec,0,source.durationSec);return source.offsetSec+localSec*(1+source.driftPpm/1e6);}
export function sharedToSourceTime(source,sharedSec){num(sharedSec,-MAX_TIME*2,MAX_TIME*2);return (sharedSec-source.offsetSec)/(1+source.driftPpm/1e6);}
export function buildRenderPlan(p){
  validateProject(p);
  const video=clone(p.timeline).sort((a,b)=>a.startSec-b.startSec||a.clipId.localeCompare(b.clipId))
    .map(c=>({...c,endSec:c.startSec+c.durationSec/c.speed}));
  return {schema:'aivs-render-plan-v1',projectId:p.projectId,revision:p.revision,
    exportProfile:p.exportProfile,sourceRefs:clone(p.sourceRefs),
    durationSec:Math.max(0,...video.map(c=>c.endSec)),video,
    audio:clone(p.audioClips),audioBuses:clone(p.audioBuses)};
}

/** History contains full validated JSON snapshots, bounded independently of media size. */
export class EditSession {
  #project; #undo=[]; #redo=[];
  constructor(p){validateProject(p);this.#project=clone(p);}
  get current(){return clone(this.#project);}
  apply(next){
    validateProject(next);if(next.projectId!==this.#project.projectId)fail('PROJECT_ID_CHANGED');
    if(this.#project.revision===Number.MAX_SAFE_INTEGER)fail('REVISION_EXHAUSTED');
    this.#undo.push(clone(this.#project));this.#undo=this.#undo.slice(-MAX_HISTORY);this.#redo=[];
    this.#project={...clone(next),revision:this.#project.revision+1};
  }
  #move(from,to){
    if(!from.length)return false;if(this.#project.revision===Number.MAX_SAFE_INTEGER)fail('REVISION_EXHAUSTED');
    const revision=this.#project.revision+1;to.push(clone(this.#project));this.#project={...from.pop(),revision};return true;
  }
  undo(){return this.#move(this.#undo,this.#redo);}
  redo(){return this.#move(this.#redo,this.#undo);}
  serialize(){return JSON.stringify({schema:'aivs-edit-session',version:1,project:this.#project,undo:this.#undo,redo:this.#redo})+'\n';}
  static open(json){
    const d=parse(json);fields(d,['schema','version','project','undo','redo']);
    if(d.schema!=='aivs-edit-session'||d.version!==1)fail('UNSUPPORTED_SESSION_VERSION');
    list(d.undo,MAX_HISTORY,'INVALID_HISTORY');list(d.redo,MAX_HISTORY,'INVALID_HISTORY');
    if(d.undo.length+d.redo.length>MAX_HISTORY)fail('INVALID_HISTORY_BUDGET');
    const session=new EditSession(d.project);
    for(const p of [...d.undo,...d.redo]){validateProject(p);if(p.projectId!==d.project.projectId)fail('HISTORY_PROJECT_MISMATCH');}
    session.#undo=clone(d.undo);session.#redo=clone(d.redo);return session;
  }
}

/** Explicit migration from engine/core_v01.py. Hashes come from verified local I/O. */
export function migrateLegacyProject(legacy,{projectId,identities}={}){
  if(legacy?.schema!==1||!Array.isArray(legacy.sources)||!Array.isArray(legacy.timeline))fail('UNSUPPORTED_LEGACY_VERSION');
  const byOld=new Map();
  const sourceRefs=legacy.sources.map(s=>{
    const identity=identities?.[s.id];if(!identity)fail('LEGACY_SOURCE_IDENTITY_REQUIRED');
    if(s.equirect||s.yaw||s.pitch)fail('LEGACY_PROJECTION_REQUIRES_NATIVE_ADAPTER');
    const ref={...clone(identity),durationSec:s.duration,hasAudio:s.has_audio,offsetSec:s.offset,
      syncStatus:s.sync?.method==='master'?'master':'unverified'};
    byOld.set(s.id,ref);return ref;
  });
  const p=createProject({projectId,name:legacy.name,sourceRefs});let start=0;
  p.exportProfile=legacy.settings?.export_profile??'review';
  for(const c of legacy.timeline){
    const src=byOld.get(c.camera);if(!src)fail('MISSING_LEGACY_SOURCE');
    const speed=c.speed??1,duration=c.duration/speed;
    const clip={clipId:String(c.id).startsWith('clip_')?c.id:`clip_${c.id}`,sourceId:src.assetId,sourceInSec:c.start-src.offsetSec,
      durationSec:c.duration,startSec:start,speed,layout:c.layout,effects:[]};
    if(c.layout==='split'){
      const secondary=byOld.get(c.secondary);if(!secondary)fail('MISSING_LEGACY_SECONDARY_SOURCE');
      clip.secondarySourceId=secondary.assetId;clip.secondaryInSec=c.start-secondary.offsetSec;
    }
    if(c.caption)clip.effects.push({effectId:`effect_legacy_${p.timeline.length}`,version:1,type:'caption',
      startSec:0,endSec:duration,parameters:{text:c.caption},keyframes:[]});
    p.timeline.push(clip);
    if(src.hasAudio)p.audioClips.push({id:`audio_legacy_${p.audioClips.length}`,assetId:src.assetId,
      bus:'source',startSec:start,endSec:start+duration,trimInSec:clip.sourceInSec,speed,gainDb:0,
      loop:false,fadeInSec:0,fadeOutSec:0});
    start+=duration;
  }
  validateProject(p);return p;
}
