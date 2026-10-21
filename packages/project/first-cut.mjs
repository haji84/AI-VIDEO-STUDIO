/** Portable first-cut evidence. Never changes sync, effects or owned soundtracks. */
import {createProject,validateProject} from './project.mjs';
const fail=code=>{throw new Error(code);};
const identityKeys=['assetId','sha256','mediaKind','durationSec','hasAudio','offsetSec','driftPpm','syncStatus'];
const known=s=>['master','verified'].includes(s.syncStatus);
export function validateFirstCutSelection(project,request){
  validateProject(project);
  if(!request||Object.getPrototypeOf(request)!==Object.prototype||Object.keys(request).some(k=>k!=='mode')||!['training','documentary','television','short'].includes(request.mode))fail('INVALID_FIRST_CUT_REQUEST');
  const videos=project.sourceRefs.filter(s=>s.mediaKind==='video'),masters=videos.filter(s=>s.syncStatus==='master');
  if(masters.length!==1||masters[0].offsetSec!==0)fail('FIRST_CUT_ZERO_MASTER_REQUIRED');
  const ordered=[masters[0],...videos.filter(s=>s!==masters[0])],eligible=ordered.filter(known);
  if(eligible.length>8)fail('FIRST_CUT_CAMERA_BUDGET_EXCEEDED');
  if(eligible.some(s=>s.driftPpm!==0))fail('FIRST_CUT_DRIFT_UNSUPPORTED');
  if(eligible.some(s=>s.durationSec<.2||s.durationSec>1200||Math.abs(s.offsetSec)>7200)||Math.max(...eligible.map(s=>s.offsetSec+s.durationSec))>1200)fail('FIRST_CUT_ANALYSIS_BUDGET_EXCEEDED');
  return {videos:ordered,eligible};
}
function timelineFor(report){
  const sources=new Map(report.sourceIdentities.map(s=>[s.assetId,s]));let cursor=0;
  if(!Array.isArray(report.proposal.timeline)||!report.proposal.timeline.length||report.proposal.timeline.length>1200)fail('INVALID_FIRST_CUT_TIMELINE');
  const timeline=report.proposal.timeline.map(c=>{
    const s=sources.get(c.sourceId);
    if(!s||!known(s)||c.layout!=='single'||c.speed!==1||c.caption||c.secondarySourceId!==undefined||!Number.isFinite(c.start)||Math.abs(c.start-cursor)>.0005||!Number.isFinite(c.duration)||c.duration<.2)fail('FIRST_CUT_UNSUPPORTED_OR_GAPPED_TIMELINE');
    const clip={clipId:c.id,sourceId:c.sourceId,sourceInSec:Math.max(0,c.start-s.offsetSec),durationSec:c.duration,startSec:cursor,speed:1,layout:'single',effects:[]};
    if(c.start-s.offsetSec<-.0001)fail('FIRST_CUT_SOURCE_RANGE');cursor+=c.duration;return clip;
  });
  if(!Number.isFinite(report.proposal.durationSeconds)||Math.abs(report.proposal.durationSeconds-cursor)>.002||cursor>1200)fail('INVALID_FIRST_CUT_DURATION');
  return timeline;
}
export function validateFirstCutReport(report){
  if(!report||report.schema!=='aivs-first-cut-report-v1'||!Number.isSafeInteger(report.projectRevision)||report.projectRevision<0||!Array.isArray(report.sourceIdentities)||report.sourceIdentities.some(s=>s.mediaKind!=='video'))fail('INVALID_FIRST_CUT_REPORT');
  const p=createProject({projectId:report.projectId,sourceRefs:report.sourceIdentities}),proposal=report.proposal;
  if(proposal?.schema!=='aivs-auto-edit-proposal-v1'||proposal.reviewRequired!==true||proposal.semanticUnderstanding!=='NOT_EVALUATED'||proposal.evidence?.type!=='deterministic_local_signal_scoring'||!Array.isArray(proposal.warnings)||!Array.isArray(proposal.evidence.gaps)||proposal.evidence.gaps.length)fail('INVALID_OR_GAPPED_FIRST_CUT_REPORT');
  const {eligible}=validateFirstCutSelection(p,{mode:proposal.mode});
  if(!Array.isArray(report.analysis)||report.analysis.length!==eligible.length||new Set(report.analysis.map(a=>a.assetId)).size!==eligible.length)fail('FIRST_CUT_INCOMPLETE_ANALYSIS');
  for(const s of eligible){const a=report.analysis.find(a=>a.assetId===s.assetId);
    if(!a||a.complete!==true||!Number.isFinite(a.coverageSeconds)||a.coverageSeconds<s.durationSec-.1||a.coverageSeconds>s.durationSec+.1)fail('FIRST_CUT_INCOMPLETE_ANALYSIS');}
  p.timeline=timelineFor(report);validateProject(p);return report;
}
export function assertCurrentFirstCut(project,report){
  validateProject(project);validateFirstCutReport(report);
  if(project.projectId!==report.projectId||project.revision!==report.projectRevision)fail('STALE_FIRST_CUT_EVIDENCE');
  const videos=project.sourceRefs.filter(s=>s.mediaKind==='video');
  if(videos.length!==report.sourceIdentities.length)fail('FIRST_CUT_SOURCE_CHANGED');
  for(const expected of report.sourceIdentities){const actual=videos.find(s=>s.assetId===expected.assetId);
    if(!actual||identityKeys.some(k=>actual[k]!==expected[k]))fail('FIRST_CUT_SOURCE_CHANGED');}
}
export function applyFirstCut(project,report,confirmed){
  assertCurrentFirstCut(project,report);if(confirmed!==true)fail('EXPLICIT_FIRST_CUT_CONFIRMATION_REQUIRED');
  if(project.timeline.some(c=>c.layout!=='single'||c.effects.length))fail('FIRST_CUT_PROTECTS_MANUAL_EFFECTS');
  const next=structuredClone(project);next.timeline=timelineFor(report);
  if(next.audioClips.some(c=>c.endSec>report.proposal.durationSeconds+1e-7))fail('FIRST_CUT_WOULD_TRUNCATE_AUDIO');
  validateProject(next);return next;
}
