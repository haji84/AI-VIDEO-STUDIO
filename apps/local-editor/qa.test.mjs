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

test('reopening old reports never claims new freeze/cadence detector coverage',async()=>{
 const {inspectionScope}=await import('./qa.mjs');const old={inspection:{schema:'aivs-output-inspection-v1',status:'CHECKED_LIMITED'}};
 assert.match(inspectionScope(old),/フリーズ候補は未検査/);assert.match(inspectionScope(old),/フレーム間隔の検査は未完了/);
 const current=structuredClone(old);Object.assign(current.inspection,{detectors:['freezedetect-v1','vfrdet-v1'],cadence:{status:'CONSTANT_INTERVALS'}});
 assert.match(inspectionScope(current),/フレーム間隔の変化を集計/);assert.match(inspectionScope(current),/意図した静止画/);
 current.inspection.cadence.status='INCOMPLETE';assert.match(inspectionScope(current),/フレーム間隔の検査は未完了/);
});

test('true-peak display uses measured values and a rounded review reference without promising repair',async()=>{
 const {inspectionScope}=await import('./qa.mjs');
 const report={inspection:{schema:'aivs-output-inspection-v1',status:'NEEDS_REVIEW',
   detectors:['true-peak-ebur128-v1'],truePeak:'MEASURED',thresholds:{truePeakReviewDbTP:-1},
   truePeakMeasurement:{maximumDbTP:-1,unit:'dBTP',method:'ffmpeg-ebur128-peak-true',reportedPrecisionDb:.1}}};
 const before=JSON.stringify(report),text=inspectionScope(report);
 assert.match(text,/-1\.0 dBTP/);assert.match(text,/0\.1 dB/);assert.match(text,/以上/);
 assert.match(text,/自動修復は行いません/);assert.equal(JSON.stringify(report),before);
});

test('old, incomplete and absent true-peak evidence never acquires measured coverage on reload',async()=>{
 const {inspectionScope}=await import('./qa.mjs');
 const legacy=JSON.parse(JSON.stringify({inspection:{schema:'aivs-output-inspection-v1',status:'CHECKED_LIMITED',truePeak:'NOT_MEASURED'}}));
 assert.match(inspectionScope(legacy),/サンプル間の音量ピークは未検査/);
 for(const status of ['UNAVAILABLE','INCOMPLETE']){
  const report={inspection:{schema:'aivs-output-inspection-v1',status:'NEEDS_REVIEW',truePeak:status,
   detectors:['true-peak-ebur128-v1'],truePeakMeasurement:{maximumDbTP:null,unit:'dBTP',method:'ffmpeg-ebur128-peak-true'}}};
  assert.match(inspectionScope(report),/サンプル間の音量ピークは未検査/);
 }
});

test('measured digital silence is distinct from an unavailable meter or missing audio track',async()=>{
 const {inspectionScope}=await import('./qa.mjs');
 const report={inspection:{schema:'aivs-output-inspection-v1',status:'CHECKED_LIMITED',detectors:['true-peak-ebur128-v1'],
  truePeak:'SILENT',truePeakMeasurement:{maximumDbTP:null,unit:'dBTP',method:'ffmpeg-ebur128-peak-true'}}};
 assert.match(inspectionScope(report),/デジタル無音/);
 report.inspection.truePeak='NOT_APPLICABLE';report.inspection.detectors=[];
 assert.match(inspectionScope(report),/音声トラックがない/);
});

test('whole-output true-peak results cannot identify an arbitrary clip for editing',()=>{
 for(const code of ['TRUE_PEAK_AT_OR_ABOVE_REFERENCE','TRUE_PEAK_UNAVAILABLE']){
  const report={projectId:project.projectId,projectRevision:project.revision,inspection:{findings:[{
   code,...(code==='TRUE_PEAK_AT_OR_ABOVE_REFERENCE'?{scope:'GLOBAL_MAXIMUM_NO_PEAK_TIMESTAMP'}:{}),
   startSec:0,endSec:8,clipIds:['clip_one','clip_two']}]}};
  const before=JSON.stringify(report);
  assert.throws(()=>reviewTarget(report,project,0),/FINDING_NOT_LOCALIZED/);
  assert.equal(JSON.stringify(report),before);
 }
});
