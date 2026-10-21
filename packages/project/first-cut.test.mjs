import test from 'node:test';import assert from 'node:assert/strict';
import {createProject,EditSession} from './project.mjs';
import {proposeEdit} from '../edit-planner/auto-edit.mjs';
import {validateFirstCutSelection,validateFirstCutReport,applyFirstCut} from './first-cut.mjs';
function fixture(){
 const refs=[0,1,2].map(i=>({assetId:'asset_'+String(i+1).repeat(32),sha256:String(i+1).repeat(64),mediaKind:'video',durationSec:8,hasAudio:true,offsetSec:0,driftPpm:0,syncStatus:['master','verified','unverified'][i]}));
 const p=createProject({projectId:'project_firstcut',sourceRefs:refs});p.revision=4;
 p.timeline=[{clipId:'clip_old',sourceId:refs[0].assetId,sourceInSec:0,durationSec:8,startSec:0,speed:1,layout:'single',effects:[]}];
 p.audioClips=[{id:'audio_deliberate',assetId:refs[0].assetId,bus:'source',startSec:0,endSec:8,trimInSec:0,speed:1,gainDb:-7,loop:false,fadeInSec:.2,fadeOutSec:.3}];p.audioBuses.bgm.muted=true;
 const proposal=proposeEdit({sources:refs.map((s,i)=>({assetId:s.assetId,durationSeconds:8,offsetSeconds:0,sync:{status:s.syncStatus},windows:[{startSeconds:0,endSeconds:8,contrast:i===1?1:0,motion:0,audioEnergy:0}]})),multiView:'recommend'});
 const report={schema:'aivs-first-cut-report-v1',projectId:p.projectId,projectRevision:p.revision,sourceIdentities:structuredClone(refs),analysis:refs.slice(0,2).map(s=>({assetId:s.assetId,coverageSeconds:8,complete:true})),proposal};
 return {p,report};
}
test('explicit first-cut changes only video; survives history and source shared clock',()=>{
 const {p,report}=fixture(),before=JSON.stringify(p);validateFirstCutReport(report);
 assert.throws(()=>applyFirstCut(p,report,false),/EXPLICIT_FIRST_CUT_CONFIRMATION/);
 const q=applyFirstCut(p,report,true);assert.equal(q.timeline[0].sourceId,p.sourceRefs[1].assetId);assert.equal(q.timeline[0].sourceInSec,0);
 assert.deepEqual(q.audioClips,p.audioClips);assert.deepEqual(q.audioBuses,p.audioBuses);assert.deepEqual(q.sourceRefs,p.sourceRefs);assert.equal(JSON.stringify(p),before);
 const s=new EditSession(p);s.apply(q);const reopened=EditSession.open(s.serialize());reopened.undo();assert.deepEqual(reopened.current.timeline,p.timeline);reopened.redo();assert.deepEqual(reopened.current.timeline,q.timeline);
 const clock=fixture();clock.p.sourceRefs[1].offsetSec=-2;clock.p.sourceRefs[1].durationSec=10;clock.report.sourceIdentities=structuredClone(clock.p.sourceRefs);clock.report.analysis[1].coverageSeconds=10;
 assert.equal(applyFirstCut(clock.p,clock.report,true).timeline[0].sourceInSec,2);
});
test('stale, missing, unverified, partial, gaps and invalid reports cannot apply',()=>{
 for(const change of [(p,r)=>p.revision++,(p,r)=>r.sourceIdentities[0].sha256='a'.repeat(64),(p,r)=>r.sourceIdentities.pop(),(p,r)=>r.analysis[1].complete=false,(p,r)=>r.analysis[1].coverageSeconds=3,(p,r)=>r.proposal.evidence.gaps.push({startSeconds:0,endSeconds:1}),(p,r)=>r.proposal.timeline[0].sourceId=p.sourceRefs[2].assetId,(p,r)=>r.proposal.timeline[0].start=1,(p,r)=>r.proposal.reviewRequired=false]){
  const {p,report}=fixture();change(p,report);const before=JSON.stringify(p);assert.throws(()=>applyFirstCut(p,report,true));assert.equal(JSON.stringify(p),before);
 }
});
test('effects, split layouts and audio truncation protected; bounded selection requires zero master and known sync',()=>{
 const {p,report}=fixture();p.timeline[0].effects=[{effectId:'effect_title',version:1,type:'caption',startSec:0,endSec:8,parameters:{text:'keep me'},keyframes:[]}];assert.throws(()=>applyFirstCut(p,report,true),/FIRST_CUT_PROTECTS_MANUAL_EFFECTS/);
 const x=fixture();x.report.proposal.timeline[0].duration=4;x.report.proposal.durationSeconds=4;assert.throws(()=>applyFirstCut(x.p,x.report,true),/FIRST_CUT_WOULD_TRUNCATE_AUDIO/);
 for(const change of [p=>p.sourceRefs[0].offsetSec=1,p=>p.sourceRefs[0].driftPpm=1,p=>p.sourceRefs[1].durationSec=1201,p=>p.sourceRefs[1].offsetSec=1200]){const {p}=fixture();change(p);assert.throws(()=>validateFirstCutSelection(p,{mode:'training'}));}
 assert.throws(()=>validateFirstCutSelection(fixture().p,{mode:'invalid'}));assert.throws(()=>validateFirstCutSelection(fixture().p,{mode:'training',unknown:true}));
});
