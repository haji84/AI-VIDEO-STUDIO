import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,EditSession} from '../../packages/project/project.mjs';
import * as sync from './sync-edits.mjs';
function fixture(){
  const refs=[0,1,2].map(i=>({assetId:'asset_'+String(i+1).repeat(32),sha256:String(i+1).repeat(64),mediaKind:'video',durationSec:20,hasAudio:true,offsetSec:i===0?3:0,driftPpm:0,syncStatus:i===0?'master':'unverified'}));
  const p=createProject({projectId:'project_sync',sourceRefs:refs});p.revision=7;
  p.timeline=[{clipId:'clip_one',sourceId:refs[0].assetId,sourceInSec:0,durationSec:4,startSec:0,speed:1,layout:'single',effects:[]}];
  p.audioClips=[{id:'audio_custom',assetId:refs[2].assetId,bus:'source',startSec:0,endSec:4,trimInSec:1,speed:1,gainDb:-6,loop:false,fadeInSec:0,fadeOutSec:0}];
  const report={schema:'aivs-sync-report-v1',projectId:p.projectId,projectRevision:7,
    masterIdentity:structuredClone(refs[0]),targetIdentity:structuredClone(refs[1]),
    status:'CANDIDATE',candidateOffsetSec:5,confidence:.91,uniqueness:.2,analysisWindowSec:300,
    driftMeasurement:'NOT_ESTIMATED',method:'audio_candidate'};
  return {p,report};
}
test('explicit confirmation only updates target offset/status and is undoable',()=>{
  const {p,report}=fixture(),before=JSON.stringify(p),session=new EditSession(p);
  assert.throws(()=>sync.applySyncCandidate(p,report,false),/EXPLICIT_SYNC_CONFIRMATION/);
  const q=sync.applySyncCandidate(p,report,true);assert.equal(q.sourceRefs[1].offsetSec,5);assert.equal(q.sourceRefs[1].syncStatus,'verified');
  assert.deepEqual(q.sourceRefs.filter((_,i)=>i!==1),p.sourceRefs.filter((_,i)=>i!==1));assert.deepEqual(q.audioClips,p.audioClips);assert.deepEqual(q.timeline,p.timeline);assert.equal(JSON.stringify(p),before);
  session.apply(q);const reopened=EditSession.open(session.serialize());reopened.undo();assert.equal(reopened.current.sourceRefs[1].offsetSec,0);reopened.redo();assert.equal(reopened.current.sourceRefs[1].offsetSec,5);
});
test('stale/weak/confirmed/changed-identity evidence cannot be applied',()=>{
  for(const change of [r=>r.projectRevision++,r=>r.projectId='project_other',r=>r.confidence=.4,r=>r.uniqueness=.01,r=>r.candidateOffsetSec=NaN,r=>r.targetIdentity.sha256='a'.repeat(64),r=>r.targetIdentity.assetId=r.masterIdentity.assetId]){
    const {p,report}=fixture(),before=JSON.stringify(p);change(report);assert.throws(()=>sync.applySyncCandidate(p,report,true));assert.equal(JSON.stringify(p),before);
  }
  for(const status of ['verified','master','manual']){const {p,report}=fixture();p.sourceRefs[1].syncStatus=status;report.targetIdentity.syncStatus=status;assert.throws(()=>sync.applySyncCandidate(p,report,true),/SYNC_TARGET_PROTECTED/);}
  const {p,report}=fixture();report.status='UNVERIFIED';assert.throws(()=>sync.applySyncCandidate(p,report,true),/SYNC_NOT_RELIABLE/);
});
test('paired preview uses shared clock and refuses unsupported drift/out-of-range',()=>{
  const {p,report}=fixture();assert.deepEqual(sync.syncPreviewTimes(p,report),{masterSec:3,targetSec:1,sharedSec:6});
  report.targetIdentity.driftPpm=100;p.sourceRefs[1].driftPpm=100;assert.throws(()=>sync.applySyncCandidate(p,report,true),/SYNC_DRIFT_UNSUPPORTED/);
  const other=fixture();other.report.candidateOffsetSec=30;assert.throws(()=>sync.syncPreviewTimes(other.p,other.report),/SYNC_NO_COMMON_PREVIEW/);
});
