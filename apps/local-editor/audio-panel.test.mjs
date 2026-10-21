/** DOM stub regression only; this does not replace a browser acceptance run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,EditSession} from '../../packages/project/project.mjs';
import {mountAudioPanel} from './audio-panel.mjs';
class NodeStub{
  children=[];style={};textContent='';attributes={};value='';
  constructor(tag){this.tagName=tag;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(key,value){this.attributes[key]=value;}
  get valueAsNumber(){return Number(this.value);}
}
function find(root,predicate){if(predicate(root))return root;for(const child of root.children){const found=find(child,predicate);if(found)return found;}}
test('audio target lost across undo/redo clears selection instead of deleting original sound',async()=>{
  const previous=globalThis.document;globalThis.document={createElement:tag=>new NodeStub(tag)};
  try{
    const source={assetId:'asset_'+'1'.repeat(32),sha256:'1'.repeat(64),mediaKind:'video',durationSec:4,hasAudio:true,offsetSec:0,driftPpm:0,syncStatus:'master'};
    const p=createProject({projectId:'project_panel',sourceRefs:[source]});p.timeline=[{clipId:'clip_a',sourceId:source.assetId,sourceInSec:0,durationSec:4,startSec:0,speed:1,layout:'single',effects:[]}];
    p.audioClips=[{id:'audio_clip_a',assetId:source.assetId,bus:'source',startSec:0,endSec:4,trimInSec:0,speed:1,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0},
      {id:'audio_bgm_'+'b'.repeat(32),assetId:source.assetId,bus:'bgm',startSec:0,endSec:4,trimInSec:0,speed:1,gainDb:-12,loop:true,fadeInSec:0,fadeOutSec:0}];
    const session=new EditSession(p),root=new NodeStub('div');
    const state=()=>({session:JSON.parse(session.serialize()),sources:[{assetId:source.assetId,label:'synthetic.wav'}]});
    let panel;panel=mountAudioPanel({container:root,current:state,commit:async q=>session.apply(q),act:async action=>{await action();panel.show();},mediaUrl:()=>'/synthetic'});
    panel.show();find(root,n=>n.id==='select-'+p.audioClips[1].id).onclick();
    find(root,n=>n.id==='audio-gainDb').value='-6';await find(root,n=>n.id==='audio-save').onclick();
    const expected=session.current.audioClips;assert.match(expected[1].id,/audio_manual/);
    session.undo();panel.show();session.redo();panel.show();
    const accidentalRemove=find(root,n=>n.id==='audio-remove');if(accidentalRemove)await accidentalRemove.onclick();
    assert.deepEqual(session.current.audioClips,expected,'history changed the audio target and removed original sound');
    assert.equal(find(root,n=>n.id==='audio-save'),undefined,'save must require an explicit target after selection was lost');
    const select=find(root,n=>n.id==='select-'+expected[1].id);select.onclick();
    const active=find(root,n=>n.id===select.id);assert.equal(active.attributes['aria-pressed'],'true');assert.ok(active.style.border.includes('2px'));
    assert.ok(find(root,n=>n.textContent.includes('編集中：BGM')),'current audio name must be visible');
    await find(root,n=>n.id==='audio-remove').onclick();assert.deepEqual(session.current.audioClips,[expected[0]]);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
