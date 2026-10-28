/** Narrow bridge to engine.run_manifest; unsupported edits NEVER silently vanish. */
import {buildRenderPlan} from './project.mjs';
import {verifyBindings} from './local-store.mjs';
const same=(a,b)=>Math.abs(a-b)<1e-7;
const unsupported=reason=>{throw new Error('UNSUPPORTED_BY_MANIFEST_ENGINE:'+reason);};
export async function createManifest(project,bindings){
  const plan=buildRenderPlan(project);
  if(!plan.video.length||plan.video.length>1200)unsupported('VIDEO_CLIP_COUNT');
  const refs=new Map(project.sourceRefs.map(s=>[s.assetId,s]));
  const used=new Set(plan.video.flatMap(c=>[c.sourceId,...(c.secondarySourceId?[c.secondarySourceId]:[])]));
  const sources=project.sourceRefs.filter(s=>used.has(s.assetId));
  // The legacy engine fixes its first USED source at offset0, even when the
  // saved master is not in this render. Rebase both clocks; local trims stay exact.
  const clockOrigin=sources[0]?.offsetSec??0;
  for(const s of sources){
    if(!['master','verified'].includes(s.syncStatus))throw new Error('SYNC_UNVERIFIED:'+s.assetId);
    if(s.driftPpm!==0)unsupported('CLOCK_DRIFT');
  }
  for(const bus of Object.values(plan.audioBuses))if(bus.gainDb!==0||bus.muted)unsupported('AUDIO_BUS_PROCESSING');
  let nextStart=0;const expectedAudio=[];
  const timeline=plan.video.map(c=>{
    if(!same(c.startSec,nextStart))unsupported('VIDEO_GAP_OR_OVERLAP');nextStart=c.endSec;
    if(c.durationSec<.2)unsupported('CLIP_UNDER_200MS');
    const s=refs.get(c.sourceId),shared=c.sourceInSec+s.offsetSec;
    if(c.secondarySourceId&&!same(shared,c.secondaryInSec+refs.get(c.secondarySourceId).offsetSec))throw new Error('SYNC_CLOCK_MISMATCH');
    if(c.effects.length>1)unsupported('MULTIPLE_EFFECTS');let caption='';
    if(c.effects.length){const e=c.effects[0];
      if(e.type!=='caption'||e.version!==1||e.keyframes.length||!same(e.startSec,0)||
        !same(e.endSec,c.endSec-c.startSec)||Object.keys(e.parameters).some(k=>k!=='text')||
        e.parameters.text.length>200||e.parameters.text.trim()!==e.parameters.text)unsupported('EFFECT_RENDERING');
      caption=e.parameters.text;
    }
    if(s.hasAudio)expectedAudio.push({assetId:c.sourceId,bus:'source',startSec:c.startSec,endSec:c.endSec,
      trimInSec:c.sourceInSec,speed:c.speed,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0});
    return {id:c.clipId,sourceId:c.sourceId,start:shared-clockOrigin,duration:c.durationSec,speed:c.speed,
      layout:c.layout,caption,...(c.secondarySourceId?{secondarySourceId:c.secondarySourceId}:{})};
  });
  const actual=plan.audio.map(({id,...rest})=>rest).sort((a,b)=>a.startSec-b.startSec);
  if(actual.length!==expectedAudio.length)unsupported('AUDIO_ROUTING');
  for(let i=0;i<actual.length;i++){
    const a=actual[i],e=expectedAudio[i];
    if(Object.keys(a).some(k=>!Object.hasOwn(e,k))||Object.entries(e).some(([k,v])=>typeof v==='number'?!same(a[k],v):a[k]!==v))unsupported('AUDIO_ROUTING');
  }
  const paths=await verifyBindings(project,bindings);
  return {schema:1,name:project.name,sources:sources.map(s=>({assetId:s.assetId,path:paths[s.assetId],
      sha256:s.sha256,hasAudio:s.hasAudio,durationSec:s.durationSec})),
    quality:plan.exportProfile,autoPlan:false,timeline,
    manualOffsets:Object.fromEntries(sources.map(s=>[s.assetId,s.offsetSec-clockOrigin])),
    // The older engine calls all manual offsets unverified. This bridge already
    // requires explicit master/verified status and checks secondary clock parity.
    allowUnverifiedSync:true};
}

/** Full audio plan is retained; intermediate camera audio is explicitly ignored. */
export async function createRenderBundle(project,bindings){
  const plan=buildRenderPlan(project),videoProject=structuredClone(project);
  const refs=new Map(project.sourceRefs.map(s=>[s.assetId,s]));
  videoProject.audioBuses=Object.fromEntries(Object.keys(project.audioBuses).map(bus=>[bus,{gainDb:0,muted:false}]));
  videoProject.audioClips=plan.video.filter(c=>refs.get(c.sourceId).hasAudio).map((c,i)=>({
    id:'audio_intermediate_'+i,assetId:c.sourceId,bus:'source',startSec:c.startSec,endSec:c.endSec,
    trimInSec:c.sourceInSec,speed:c.speed,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0}));
  const videoManifest=await createManifest(videoProject,bindings);
  return {schema:'aivs-local-render-bundle-v1',plan,videoManifest,
    mediaPaths:Object.fromEntries(bindings.map(b=>[b.assetId,b.path])),intermediateAudio:'IGNORED_BY_FINAL_MIX'};
}
