import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewTarget,inspectionMessage} from './qa.mjs';
const project={projectId:'project_review',revision:4,timeline:[
  {clipId:'clip_one',startSec:0,sourceInSec:0,durationSec:4,speed:1},
  {clipId:'clip_two',startSec:4,sourceInSec:12,durationSec:8,speed:2}]};
const qa={projectId:project.projectId,projectRevision:4,inspection:{findings:[
  {code:'BLACK_INTERVAL',startSec:6,endSec:8,clipIds:['clip_two']} ]}};
test('review handoff maps output finding to source trim and never edits history',()=>{
  const before=JSON.stringify(project),report=JSON.stringify(qa);
  assert.deepEqual(reviewTarget(qa,project,0),{clipIndex:1,sourceSec:16,outputSec:6});
  assert.equal(JSON.stringify(project),before);assert.equal(JSON.stringify(qa),report);
});
test('old output cannot silently navigate a changed project or wrong clip',()=>{
  assert.throws(()=>reviewTarget(qa,{...project,revision:5},0),/OUTPUT_PROJECT_CHANGED/);
  assert.throws(()=>reviewTarget(qa,{...project,projectId:'project_other'},0),/OUTPUT_PROJECT_CHANGED/);
  assert.throws(()=>reviewTarget(qa,project,99),/FINDING_NOT_FOUND/);
  const wrong=structuredClone(qa);wrong.inspection.findings[0].clipIds=['clip_deleted'];
  assert.throws(()=>reviewTarget(wrong,project,0),/FINDING_CLIP_NOT_FOUND/);
});
test('legacy, failed and unknown reports never claim the new inspection passed',()=>{
  assert.match(inspectionMessage({whole_file_decode_checked:true}),/未検査/);
  assert.match(inspectionMessage({inspection:{schema:'future-inspector',status:'CHECKED_LIMITED'}}),/未検査/);
  assert.match(inspectionMessage({inspection:{schema:'aivs-output-inspection-v1',status:'FAILED_TECHNICAL'}}),/失敗/);
  assert.match(inspectionMessage({inspection:{schema:'aivs-output-inspection-v1',status:'UNKNOWN'}}),/未検査/);
  assert.match(inspectionMessage({inspection:{schema:'aivs-output-inspection-v1',status:'CHECKED_LIMITED'}}),/範囲で要確認箇所はありません/);
});
