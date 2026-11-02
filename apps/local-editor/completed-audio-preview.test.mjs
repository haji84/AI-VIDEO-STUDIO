import test from 'node:test';
import assert from 'node:assert/strict';
import {completedClipWindow, reportMatchesCompletedProject} from './completed-audio-preview.mjs';
const project = {projectId:'project_test',revision:9,timeline:[
  {clipId:'clip_a',startSec:0,sourceInSec:2,durationSec:2,speed:1},
  {clipId:'clip_b',startSec:3.25,sourceInSec:10,durationSec:20,speed:2},
  {clipId:'clip_c',startSec:13.25,sourceInSec:0,durationSec:1,speed:0.5},
]};
const report = {projectId:'project_test',projectRevision:9,technical_ok:true,sha256:'f'.repeat(64),inspection:{status:'CHECKED_LIMITED'}};
test('audio uses PROJECT clock, not cut-local or source-local clock',()=>{
  assert.deepEqual(completedClipWindow(project,'clip_b',2),{
    clipId:'clip_b',cutStartSec:2,cutEndSec:9,startSec:5.25,endSec:12.25,durationSec:7,totalCutSec:10});
});
test('short tail never extends into the next cut',()=>{
  const w=completedClipWindow(project,'clip_b',9.5);
  assert.equal(w.startSec,12.75);assert.equal(w.endSec,13.25);assert.equal(w.durationSec,0.5);
});
test('slow and fast cut output durations use source duration divided by speed',()=>{
  const w=completedClipWindow(project,'clip_c',1);
  assert.equal(w.totalCutSec,2);assert.equal(w.startSec,14.25);assert.equal(w.endSec,15.25);
});
test('invalid windows fail closed without a guessed clip',()=>{
  for(const at of [-1,NaN,Infinity,10,1e20])assert.equal(completedClipWindow(project,'clip_b',at),null);
  assert.equal(completedClipWindow(project,'clip_missing',0),null);
  assert.equal(completedClipWindow({timeline:[]},'clip_b',0),null);
});
test('only a byte-identified successful export of same exact revision is eligible',()=>{
  assert.equal(reportMatchesCompletedProject(report,project),true);
  assert.equal(reportMatchesCompletedProject({...report,projectRevision:8},project),false);
  assert.equal(reportMatchesCompletedProject({...report,projectId:'project_other'},project),false);
  assert.equal(reportMatchesCompletedProject({...report,technical_ok:false},project),false);
  assert.equal(reportMatchesCompletedProject({...report,sha256:'bad'},project),false);
  assert.equal(reportMatchesCompletedProject({...report,inspection:{status:'FAILED_TECHNICAL'}},project),false);
});

// Isolated DOM-double interaction checks; these do not replace real Chrome acceptance.
import {mountCompletedAudioPreview} from './completed-audio-preview.mjs';
function domFixture({exported=true,readiness=1,request=async()=>report}={}) {
  const input={value:'2'},elements=[];
  class Fake {
    constructor(){this.listeners=new Map();this.attrs=new Map();this.hidden=true;this.muted=true;this.readyState=readiness;this.currentTime=0;this.paused=true;}
    setAttribute(k,v){this.attrs.set(k,v);}
    getAttribute(k){return k==='src'?this.src??null:this.attrs.get(k);}
    addEventListener(k,fn){this.listeners.set(k,[...(this.listeners.get(k)??[]),fn]);}
    removeEventListener(k,fn){this.listeners.set(k,(this.listeners.get(k)??[]).filter(f=>f!==fn));}
    fire(k){for(const fn of this.listeners.get(k)??[])fn();}
    async play(){this.paused=false;this.playCount=(this.playCount??0)+1;}
    pause(){this.paused=true;}
    append(...children){this.children=(this.children??[]).concat(children);}
  }
  const oldDocument=globalThis.document;
  globalThis.document={createElement(){const e=new Fake();elements.push(e);return e;},getElementById(id){return id==='saved-preview-start'?input:null;}};
  const state={session:{project},job:exported?{id:'a'.repeat(32),status:'PASS',download:'/exports/'+'a'.repeat(32)}:{status:'NOT_RUN'}};
  const video=new Fake(),container=new Fake();let outputGeneration=0;
  const ctrl=mountCompletedAudioPreview({container,video,current:()=>state,selected:()=>1,
    request,mediaURL:path=>path+'?token=fake',outputGeneration:()=>outputGeneration});
  const button=container.children[0],status=container.children[1];
  return {ctrl,video,button,status,state,input,outputChanged(){outputGeneration++},restore(){ctrl.close();globalThis.document=oldDocument;}};
}
test('explicit user action plays the saved full mix at project time and stops at selected cut end',async()=>{
  const f=domFixture();try{
    assert.equal(f.button.disabled,false);await f.button.onclick();
    assert.equal(f.video.currentTime,5.25);assert.equal(f.video.muted,false);
    assert.equal(f.video.paused,false);assert.equal(f.video.src,'/exports/'+'a'.repeat(32)+'?token=fake');
    f.video.currentTime=12.251;f.video.fire('timeupdate');assert.equal(f.video.paused,true);
  }finally{f.restore();}
});
test('a stale export report is not played even when the old MP4 is still in history',async()=>{
  const f=domFixture({request:async()=>({...report,projectRevision:8})});try{
    await f.button.onclick();assert.equal(f.video.playCount,undefined);
    assert.match(f.status.textContent,/一致しません/);
  }finally{f.restore();}
});
test('a late verified reply is dropped if the edit or cut selection changes',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r),f=domFixture({request:()=>pending});try{
    const running=f.button.onclick();f.state.session.project={...project,revision:10};f.ctrl.show();
    resolve(report);await running;assert.equal(f.video.playCount,undefined);
  }finally{f.restore();}
});
test('a late verified reply is dropped if another finished output was selected',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r),f=domFixture({request:()=>pending});try{
    const running=f.button.onclick();f.outputChanged();f.ctrl.show();resolve(report);await running;
    assert.equal(f.video.playCount,undefined);
  }finally{f.restore();}
});
test('no completed output means no possible audible action',()=>{
  const f=domFixture({exported:false});try{assert.equal(f.button.disabled,true);}finally{f.restore();}
});
test('when a completed MP4 is not loaded, playback waits for its metadata',async()=>{
  const f=domFixture({readiness:0});try{
    await f.button.onclick();assert.equal(f.video.playCount,undefined);
    f.video.readyState=1;f.video.fire('loadedmetadata');
    assert.equal(f.video.currentTime,5.25);assert.equal(f.video.playCount,1);
  }finally{f.restore();}
});
test('metadata from an invalidated selection cannot start audible playback',async()=>{
  const f=domFixture({readiness:0});try{
    await f.button.onclick();f.outputChanged();f.ctrl.show();f.video.readyState=1;f.video.fire('loadedmetadata');
    assert.equal(f.video.playCount,undefined);
  }finally{f.restore();}
});
