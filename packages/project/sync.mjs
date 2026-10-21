/** Portable sync evidence and explicit review. A score never confirms a camera. */
import {createProject,validateProject} from './project.mjs';
const identityKeys=['assetId','sha256','mediaKind','durationSec','hasAudio','offsetSec','driftPpm','syncStatus'];
const fail=code=>{throw new Error(code);};
export function validateSyncReport(report){
  if(!report||report.schema!=='aivs-sync-report-v1'||!['CANDIDATE','UNVERIFIED'].includes(report.status)||
    !Number.isSafeInteger(report.projectRevision)||report.projectRevision<0||
    !Number.isFinite(report.confidence)||report.confidence<0||report.confidence>1||
    !Number.isFinite(report.uniqueness)||report.uniqueness<0||report.uniqueness>2||
    !Number.isFinite(report.analysisWindowSec)||report.analysisWindowSec<10||report.analysisWindowSec>7200||
    report.driftMeasurement!=='NOT_ESTIMATED')fail('INVALID_SYNC_REPORT');
  createProject({projectId:report.projectId,sourceRefs:[report.masterIdentity,report.targetIdentity]});
  if(report.masterIdentity.mediaKind!=='video'||report.targetIdentity.mediaKind!=='video')fail('INVALID_SYNC_REPORT');
  if(report.candidateOffsetSec!==null&&(!Number.isFinite(report.candidateOffsetSec)||Math.abs(report.candidateOffsetSec)>14400))fail('INVALID_SYNC_OFFSET');
  if(report.status==='CANDIDATE'&&(report.method!=='audio_candidate'||report.candidateOffsetSec===null||report.confidence<.43||report.uniqueness<.045))fail('SYNC_NOT_RELIABLE');
  return report;
}
export function assertCurrentSyncReport(project,report){
  validateProject(project);validateSyncReport(report);
  if(project.projectId!==report.projectId||project.revision!==report.projectRevision)fail('STALE_SYNC_EVIDENCE');
  for(const expected of [report.masterIdentity,report.targetIdentity]){
    const actual=project.sourceRefs.find(s=>s.assetId===expected.assetId);
    if(!actual||identityKeys.some(k=>actual[k]!==expected[k]))fail('SYNC_SOURCE_CHANGED');
  }
  if(report.masterIdentity.driftPpm!==0||report.targetIdentity.driftPpm!==0)fail('SYNC_DRIFT_UNSUPPORTED');
}
export function syncPreviewTimes(project,report,position='start'){
  assertCurrentSyncReport(project,report);if(report.candidateOffsetSec===null)fail('SYNC_NO_COMMON_PREVIEW');
  const m=report.masterIdentity,t=report.targetIdentity,start=Math.max(m.offsetSec,report.candidateOffsetSec),
    end=Math.min(m.offsetSec+Math.min(m.durationSec,report.analysisWindowSec),report.candidateOffsetSec+Math.min(t.durationSec,report.analysisWindowSec));
  if(end-start<.2)fail('SYNC_NO_COMMON_PREVIEW');const margin=Math.min(1,(end-start)/2),sharedSec=position==='end'?end-margin:start+margin;
  return {masterSec:sharedSec-m.offsetSec,targetSec:sharedSec-report.candidateOffsetSec,sharedSec};
}
export function applySyncCandidate(project,report,confirmed){
  assertCurrentSyncReport(project,report);
  if(confirmed!==true)fail('EXPLICIT_SYNC_CONFIRMATION_REQUIRED');
  if(!['unverified','candidate'].includes(report.targetIdentity.syncStatus))fail('SYNC_TARGET_PROTECTED');
  if(!['master','verified'].includes(report.masterIdentity.syncStatus))fail('SYNC_MASTER_UNVERIFIED');
  if(report.status!=='CANDIDATE')fail('SYNC_NOT_RELIABLE');syncPreviewTimes(project,report);
  const p=structuredClone(project),target=p.sourceRefs.find(s=>s.assetId===report.targetIdentity.assetId);
  target.offsetSec=report.candidateOffsetSec;target.syncStatus='verified';validateProject(p);return p;
}
