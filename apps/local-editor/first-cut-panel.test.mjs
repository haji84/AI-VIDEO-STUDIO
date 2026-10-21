/** DOM stub only: destructive confirmation and preview wiring, not browser proof. */
import test from 'node:test';import assert from 'node:assert/strict';
import {createProject} from '../../packages/project/project.mjs';import {proposeEdit} from '../../packages/edit-planner/auto-edit.mjs';import {mountFirstCutPanel} from './first-cut-panel.mjs';
class NodeStub{children=[];textContent='';disabled=false;readyState=1;constructor(tag){this.tagName=tag;}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}pause(){this.paused=true;}async play(){this.played=true;}load(){this.onloadedmetadata?.();}}
const find=(r,p)=>p(r)?r:r.children.map(c=>find(c,p)).find(Boolean);
test('preview is read-only; current explicit confirmation required; stale/effect replacement unavailable',async()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>new NodeStub(tag)};
 try{
  const source={assetId:'asset_'+'1'.repeat(32),sha256:'1'.repeat(64),mediaKind:'video',durationSec:4,hasAudio:false,offsetSec:0,driftPpm:0,syncStatus:'master'},p=createProject({projectId:'project_panel',sourceRefs:[source]});
  p.timeline=[{clipId:'clip_original',sourceId:source.assetId,sourceInSec:0,durationSec:4,startSec:0,speed:1,layout:'single',effects:[]}];
  const proposal=proposeEdit({sources:[{assetId:source.assetId,durationSeconds:4,offsetSeconds:0,sync:{status:'master'},windows:[{startSeconds:0,endSeconds:4,contrast:1,motion:0,audioEnergy:null}]}]});
  const report={schema:'aivs-first-cut-report-v1',projectId:p.projectId,projectRevision:0,sourceIdentities:[source],analysis:[{assetId:source.assetId,coverageSeconds:4,complete:true}],proposal};
  const state={session:{project:p},sources:[{assetId:source.assetId,label:'<script>untrusted label</script>'}],job:{status:'NOT_RUN'},sync:{status:'NOT_RUN'},firstCut:{id:'a'.repeat(32),status:'PASS',report}},root=new NodeStub('section'),calls=[];
  const panel=mountFirstCutPanel({container:root,current:()=>state,request:async(path,options)=>calls.push({path,...options}),act:action=>action(),refresh:async()=>{},mediaUrl:id=>'/media/'+id,notice:m=>assert.fail(m)});panel.show();
  const apply=find(root,n=>n.id==='first-cut-apply');assert.equal(apply.disabled,true);
  const preview=find(root,n=>n.tagName==='button'&&n.textContent.includes('<script>'));await preview.onclick();assert.equal(calls.length,0);const video=find(root,n=>n.id==='first-cut-preview');assert.equal(video.played,true);assert.equal(video.currentTime,0);video.currentTime=4;video.ontimeupdate();assert.equal(video.paused,true);
  const check=find(root,n=>n.id==='first-cut-confirm');check.checked=true;check.onchange();assert.equal(apply.disabled,false);await apply.onclick();assert.equal(calls[0].path,'/api/first-cut/apply');assert.equal(JSON.parse(calls[0].body).confirmed,true);
  p.revision++;panel.show();assert.equal(find(root,n=>n.id==='first-cut-apply'),undefined);assert.ok(find(root,n=>n.textContent.includes('新しい候補')));
  p.revision=0;p.timeline[0].effects=[{effectId:'effect_title',version:1,type:'caption',startSec:0,endSec:4,parameters:{text:'keep'},keyframes:[]}];panel.show();assert.equal(find(root,n=>n.id==='first-cut-confirm'),undefined);assert.ok(find(root,n=>n.textContent.includes('置換を保護')));
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
