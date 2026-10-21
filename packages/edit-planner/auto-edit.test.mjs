import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeEdit} from './auto-edit.mjs';
const id = n=>'asset_'+n.toString(16).padStart(32,'0');
function src(n,{offset=0,duration=12,status=n===1?'master':'verified',signal=.7,windows=null}={}){
  return {assetId:id(n),durationSeconds:duration,offsetSeconds:offset,sync:{status},
    windows: windows ?? [{startSeconds:0,endSeconds:duration,contrast:signal,motion:signal,audioEnergy:signal}]};
}
const eligibleIds=(plan)=>new Set(plan.timeline.map(x=>x.sourceId));
test('single camera produces editable timeline without fictional titles',()=>{
  const r=proposeEdit({sources:[src(1)],multiView:'off'});
  assert.equal(r.durationSeconds,12);
  assert.equal(r.timeline.length,1);
  assert.equal(r.timeline[0].caption,'');
  assert.equal(r.semanticUnderstanding,'NOT_EVALUATED');
  assert.equal(r.reviewRequired,true);
});
test('unverified camera is excluded from N-camera plan',()=>{
  const p=proposeEdit({sources:[src(1,{signal:.2}),src(2,{status:'unverified',signal:1}),src(3,{signal:.8})]});
  assert(!eligibleIds(p).has(id(2)));
  assert(p.evidence.blockedCameraIds.includes(id(2)));
  assert(p.warnings.includes('UNVERIFIED_SYNC_CAMERAS_EXCLUDED'));
});
test('candidate offsets are not accepted as verified even with ownerConfirmed flag',()=>{
  const p=proposeEdit({sources:[src(1,{signal:.1}),{...src(2,{signal:1,status:'candidate'}),sync:{status:'candidate',ownerConfirmed:true}}]});
  assert.deepEqual([...eligibleIds(p)],[id(1)]);
});
test('when a camera starts later, first camera is used until actual overlap',()=>{
  const p=proposeEdit({sources:[src(1,{duration:12,signal:.1}),src(2,{offset:5,duration:8,signal:.9})],minShotSeconds:2,switchMargin:.08});
  assert(p.timeline[0].sourceId===id(1));
  assert(p.timeline.some(x=>x.sourceId===id(2) && x.start>=5));
  assert(p.timeline.every(x=>x.sourceId!==id(2)||x.start>=5));
});
test('no fabricated frames in a gap and no compression of shared clock',()=>{
  const p=proposeEdit({sources:[src(1,{duration:2}),src(2,{offset:8,duration:2,signal:.9})],windowSeconds:2,minShotSeconds:1});
  assert(p.evidence.gaps.some(g=>g.startSeconds===2&&g.endSeconds===4));
  assert(p.timeline.every(x=>x.start+x.duration<=2||x.start>=8));
  assert.equal(p.durationSeconds,4);
});
test('soundless/zero-signal source yields fallback, no invented role label',()=>{
  const p=proposeEdit({sources:[src(1,{windows:[]})]});
  assert(p.warnings.includes('MISSING_SIGNAL_EVIDENCE'));
  assert.equal(p.timeline[0].caption,'');
});
test('comparable two-camera signal only suggests split by default',()=>{
  const s=[src(1,{signal:.8}),src(2,{signal:.8})];
  const p=proposeEdit({sources:s});
  assert(p.evidence.multiViewSuggestions.length>0);
  assert(p.timeline.every(x=>x.layout==='single'));
  const auto=proposeEdit({sources:s,multiView:'auto'});
  assert(auto.timeline.some(x=>x.layout==='split'&&x.secondarySourceId));
});
test('hysteresis avoids rapid switches on tiny quality differences',()=>{
  const b=[{startSeconds:0,endSeconds:4,contrast:.80,motion:.80,audioEnergy:.80},
           {startSeconds:4,endSeconds:8,contrast:.73,motion:.73,audioEnergy:.73},
           {startSeconds:8,endSeconds:12,contrast:.80,motion:.80,audioEnergy:.80}];
  const a=[{...b[0],contrast:.79,motion:.79,audioEnergy:.79},
           {...b[1],contrast:.81,motion:.81,audioEnergy:.81},
           {...b[2],contrast:.79,motion:.79,audioEnergy:.79}];
  const p=proposeEdit({sources:[src(1,{windows:b}),src(2,{windows:a})],switchMargin:.17});
  assert(p.timeline.length<=2);
});
test('invalid offsets, duplicate ids, corrupt features fail closed',()=>{
  assert.throws(()=>proposeEdit({sources:[src(1),src(1)]}),/INVALID_OR_DUPLICATE_ASSET/);
  assert.throws(()=>proposeEdit({sources:[src(1),src(2,{offset:NaN})]}),/INVALID_SOURCE_CLOCK/);
  assert.throws(()=>proposeEdit({sources:[src(1,{windows:[{startSeconds:0,endSeconds:12,motion:1.1}]})]}),/SIGNAL_NOT_NORMALIZED/);
  assert.throws(()=>proposeEdit({sources:[src(1)],windowSeconds:0}),/INVALID_PLANNER_OPTIONS/);
});
test('deterministic re-runs preserve exact output',()=>{
  const input={sources:[src(1),src(2,{signal:.85}),src(3,{offset:3,duration:7,signal:.72})]};
  assert.deepEqual(proposeEdit(input),proposeEdit(input));
});
