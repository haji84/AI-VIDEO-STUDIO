/**
 * AI VIDEO STUDIO: offline, deterministic signal-assisted first-cut proposal.
 * No network, models, media I/O or automatic claims about scene meaning.
 * Works in Node and standards-based JavaScript runtimes.
 */
export const PLANNER_VERSION = '0.4.1-signal-preview';
const MAX_CAMERAS = 100;
const MAX_WINDOWS = 18000;
const MAX_DURATION = 14400;
const scoreWeights = Object.freeze({
  training: {contrast:.52,motion:.18,audioEnergy:.30},
  documentary: {contrast:.39,motion:.39,audioEnergy:.22},
  television: {contrast:.32,motion:.46,audioEnergy:.22},
  short: {contrast:.30,motion:.55,audioEnergy:.15}
});
const n = x => typeof x === 'number' && Number.isFinite(x);
const clamp = (v,lo=0,hi=1) => Math.min(hi,Math.max(lo,v));
const round = (x) => Math.round(x*1000)/1000;
const fail = reason => {throw new Error(reason)};
const same = (a,b) => Math.abs(a-b)<0.0005;

function validateSources(sources){
  if(!Array.isArray(sources)||sources.length===0||sources.length>MAX_CAMERAS) fail('SOURCES_OUT_OF_RANGE');
  const seen = new Set();
  return sources.map((src,index)=>{
    if(!src||typeof src!=='object')fail('INVALID_SOURCE');
    const id=src.assetId;
    if(typeof id!=='string'||!/^asset_[a-f0-9]{32}$/.test(id)||seen.has(id))fail('INVALID_OR_DUPLICATE_ASSET');
    seen.add(id);
    const duration=src.durationSeconds, offset=src.offsetSeconds ?? 0;
    if(!n(duration)||duration<=0||duration>MAX_DURATION||!n(offset)||Math.abs(offset)>7200)fail('INVALID_SOURCE_CLOCK');
    const sync=src.sync||{};
    if(!['master','verified','candidate','unverified'].includes(sync.status))fail('SYNC_STATUS_REQUIRED');
    if(index===0 && sync.status!=='master')fail('FIRST_SOURCE_MUST_BE_MASTER');
    if(sync.status==='candidate' && sync.ownerConfirmed !== true){ /* candidate is never trusted */ }
    if(!Array.isArray(src.windows)||src.windows.length>MAX_WINDOWS)fail('INVALID_SIGNAL_WINDOWS');
    let lastEnd=-1;
    const windows=src.windows.map(w=>{
      if(!w||!n(w.startSeconds)||!n(w.endSeconds)||w.startSeconds<0||
         w.endSeconds<=w.startSeconds||w.endSeconds>duration+.001||w.startSeconds<lastEnd-.001)fail('INVALID_WINDOW_RANGE');
      lastEnd=w.endSeconds;
      const result={startSeconds:w.startSeconds,endSeconds:w.endSeconds};
      for(const key of ['contrast','motion','audioEnergy']){
        if(w[key]!==null&&w[key]!==undefined){
          if(!n(w[key])||w[key]<0||w[key]>1)fail('SIGNAL_NOT_NORMALIZED');
          result[key]=w[key];
        }
      }
      return result;
    });
    return {...src,offsetSeconds:offset,windows,_eligible:sync.status==='master'||sync.status==='verified'};
  });
}
function signalFor(src,local){
  // Binary search keeps long multi-camera footage practical (O(log windows)).
  const arr=src.windows;
  let lo=0,hi=arr.length-1;
  while(lo<=hi){
    const mid=Math.floor((lo+hi)/2),w=arr[mid];
    if(local<w.startSeconds-1e-6)hi=mid-1;
    else if(local>=w.endSeconds-1e-6)lo=mid+1;
    else return w;
  }
  return null;
}
function scoreAt(src, t, mode){
  const s=signalFor(src,t-src.offsetSeconds);
  if(!s)return {score:.16,covered:false}; // missing data is not evidence of quality
  let value=0,availableWeight=0;
  for(const [key,weight] of Object.entries(scoreWeights[mode])){
    if(s[key]!=null){ value+=s[key]*weight; availableWeight+=weight; }
  }
  return availableWeight?{score:round(value/availableWeight),covered:true}:{score:.16,covered:false};
}
function available(src, start, end){
  return src._eligible && src.offsetSeconds<=start+.0001 &&
    src.offsetSeconds+src.durationSeconds>=end-.0001;
}
function timeBounds(sources, step){
  // Do not output negative shared timestamps: existing native/Cloud timeline uses >=0.
  const end=Math.max(...sources.filter(s=>s._eligible).map(s=>s.offsetSeconds+s.durationSeconds));
  if(!(end>=.2))fail('NO_NONNEGATIVE_SHARED_COVERAGE');
  const pts=new Set([0,round(end)]);
  for(let t=0;t<end;t+=step)pts.add(round(t));
  for(const src of sources.filter(s=>s._eligible)){
    for(const t of [src.offsetSeconds,src.offsetSeconds+src.durationSeconds]) {
      if(t>0 && t<end)pts.add(round(t));
    }
  }
  const bounds=[...pts].sort((a,b)=>a-b).filter((x,i,arr)=>i===0||x-arr[i-1]>.0005);
  // A camera boundary must not manufacture a gap in another camera's continuous
  // coverage. Merge tiny intervals only when one trusted camera covers the whole
  // combined interval; genuine missing footage remains a gap for review.
  for(let i=0;i<bounds.length-1;){
    if(bounds[i+1]-bounds[i]>=.2){i++;continue;}
    if(i+2<bounds.length&&sources.some(s=>available(s,bounds[i],bounds[i+2]))){bounds.splice(i+1,1);continue;}
    if(i>0&&sources.some(s=>available(s,bounds[i-1],bounds[i+1]))){bounds.splice(i,1);i--;continue;}
    i++;
  }
  return bounds;
}

/**
 * Returns an editable *proposal*, never a finished video or expert evaluation.
 * Unknown/unverified cameras are excluded, never silently synchronized.
 * Windows are extracted by a separately tested local analyzer, or user-supplied.
 */
export function proposeEdit({sources,mode='training',windowSeconds=2,
  minShotSeconds=4,switchMargin=.14,multiView='recommend'}={}){
  if(!Object.hasOwn(scoreWeights,mode))fail('INVALID_EDIT_MODE');
  if(!n(windowSeconds)||windowSeconds<.5||windowSeconds>30||
    !n(minShotSeconds)||minShotSeconds<.2||minShotSeconds>60||
    !n(switchMargin)||switchMargin<0||switchMargin>1||
    !['off','recommend','auto'].includes(multiView))fail('INVALID_PLANNER_OPTIONS');
  const all=validateSources(sources);
  const included=all.filter(s=>s._eligible);
  if(!included.length)fail('NO_SYNCHRONIZED_CAMERA');
  const excluded=all.filter(s=>!s._eligible).map(s=>s.assetId);
  const bounds=timeBounds(all,windowSeconds),clips=[],gaps=[],suggestions=[];
  let previous=null,shotStart=0;
  const decisions=[];
  for(let k=0;k<bounds.length-1;k++){
    const start=bounds[k],end=bounds[k+1];
    if(end-start<.2){gaps.push({startSeconds:start,endSeconds:end,reason:'too_short_for_engine'});continue;}
    const center=(start+end)/2;
    const choices=included.filter(s=>available(s,start,end)).map(s=>({...scoreAt(s,center,mode),id:s.assetId}));
    if(!choices.length){gaps.push({startSeconds:start,endSeconds:end,reason:'no_verified_camera_coverage'});previous=null;continue;}
    choices.sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id));
    const current=choices.find(x=>x.id===previous);
    let chosen=choices[0];
    if(current && current.id!==chosen.id){
      const held=start-shotStart;
      if(held<minShotSeconds || chosen.score-current.score<switchMargin)chosen=current;
    }
    if(chosen.id!==previous)shotStart=start;
    previous=chosen.id;
    const other=choices.find(x=>x.id!==chosen.id && x.score>=.66 && chosen.score-x.score<=.1 && x.covered && chosen.covered);
    if(other && multiView!=='off')suggestions.push({atSeconds:start,primary:chosen.id,secondary:other.id,reason:'comparable_local_signals_review_before_using_split'});
    const split=!!other && multiView==='auto';
    const next={id:'',sourceId:chosen.id,start,duration:round(end-start),speed:1,
      layout:split?'split':'single',caption:''};
    if(split)next.secondarySourceId=other.id;
    const last=clips.at(-1);
    if(last && same(last.start+last.duration,start) && last.sourceId===next.sourceId &&
      last.layout===next.layout && last.secondarySourceId===next.secondarySourceId && last.duration+next.duration<=300){
      last.duration=round(last.duration+next.duration);
    }else {next.id=`clip_auto_${String(clips.length+1).padStart(5,'0')}`;clips.push(next);}
    decisions.push({startSeconds:start,endSeconds:end,sourceId:chosen.id,
      availableSignal:chosen.covered,chosenScore:chosen.score,
      note:chosen.covered?'numerical_signal_ranking_not_semantic':'missing_signals_fallback'});
  }
  if(!clips.length)fail('NO_EDITABLE_COVERAGE');
  if(clips.length>1200)fail('TOO_MANY_CLIPS');
  return {schema:'aivs-auto-edit-proposal-v1',plannerVersion:PLANNER_VERSION,mode,
    timeline:clips,
    durationSeconds:round(clips.reduce((total,x)=>total+x.duration/x.speed,0)),
    evidence:{type:'deterministic_local_signal_scoring',cameraCount:all.length,
      eligibleCameraCount:included.length,blockedCameraIds:excluded,
      signalCoveredWindows:decisions.filter(x=>x.availableSignal).length,
      signalTotalWindows:decisions.length,decisions,gaps,multiViewSuggestions:suggestions},
    reviewRequired:true,semanticUnderstanding:'NOT_EVALUATED',
    warnings:[
      ...(excluded.length?['UNVERIFIED_SYNC_CAMERAS_EXCLUDED']:[]),
      ...(gaps.length?['UNRECORDED_OR_UNTRUSTED_GAPS']:[]),
      ...(decisions.some(x=>!x.availableSignal)?['MISSING_SIGNAL_EVIDENCE']:[]),
      'NO_SEMANTIC_ACTOR_ROLE_OR_TECHNICAL_CORRECTNESS_INFERENCE',
      'TIMELINE_IS_FIRST_CUT_ONLY_NOT_A_FINISHED_EDUCATIONAL_VIDEO'
    ]};
}
