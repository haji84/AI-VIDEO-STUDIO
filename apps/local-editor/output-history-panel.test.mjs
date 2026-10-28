/** DOM-double behavior only; actual browser acceptance is separate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountOutputHistory} from './output-history-panel.mjs';
class Element{
 children=[];textContent='';value='';disabled=false;
 constructor(tag){this.tagName=tag;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
}
function find(root,id){if(root.id===id)return root;for(const child of root.children){const found=find(child,id);if(found)return found;}}
const a='1'.repeat(32),b='2'.repeat(32);
const entries=[a,b].map((id,i)=>({id,outputSha256:String(i+1).repeat(64),reportSha256:'a'.repeat(64),outputBytes:1024,projectId:'project_panel',projectRevision:i+1,qualityStatus:'NEEDS_REVIEW',createdAt:'2026-10-29T00:00:00.000Z',origin:'RENDER',integrity:'CHECK_ON_SELECTION'}));
const history={status:'READY',limit:50,entries};
const view=id=>({id,status:'PASS',integrity:'CHECKED_THIS_ACCESS',qualityStatus:'NEEDS_REVIEW',download:'/exports/'+id,report:{schema:'aivs-saved-project-audio-report-v1',technical_ok:true,sha256:id.slice(0,1).repeat(64),projectId:'project_panel',projectRevision:id===a?1:2,inspection:{schema:'aivs-output-inspection-v1',status:'NEEDS_REVIEW',findings:[]}}});
async function withDOM(run){const old=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};try{await run();}finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}}

test('history list needs an explicit checked selection and shows its bounded scope',()=>withDOM(async()=>{
 const container=new Element('div'),shown=[],calls=[];
 const panel=mountOutputHistory({container,request:async path=>{calls.push(path);return path==='/api/outputs'?history:view(path.split('/').at(-1));},onSelect:x=>shown.push(x),notice:()=>{}});
 await panel.refresh();assert.deepEqual(shown,[]);assert.match(find(container,'output-history-scope').textContent,/50/);
 const select=find(container,'output-history-select');assert.equal(select.children.length,3,'placeholder plus two choices');
 select.value=b;select.onchange();await find(container,'output-history-open').onclick();
 assert.deepEqual(shown.map(x=>x.id),[b]);assert.deepEqual(calls,['/api/outputs','/api/outputs/'+b]);
 assert.match(find(container,'output-history-status').textContent,/表示/);
}));
test('unavailable or mismatched evidence never replaces the displayed output',()=>withDOM(async()=>{
 const container=new Element('div'),shown=[];let failure='missing';
 const panel=mountOutputHistory({container,request:async path=>{if(path==='/api/outputs')return history;if(failure==='missing')throw new Error('検査記録を確認できません');return view(b);},onSelect:x=>shown.push(x),notice:()=>{}});
 await panel.refresh();const select=find(container,'output-history-select');select.value=a;select.onchange();await find(container,'output-history-open').onclick();
 assert.deepEqual(shown,[]);assert.match(find(container,'output-history-status').textContent,/確認できません/);
 failure='mismatch';await find(container,'output-history-open').onclick();assert.deepEqual(shown,[]);
}));
test('a slower old selection cannot overwrite a newer choice or a completed new render',()=>withDOM(async()=>{
 const container=new Element('div'),shown=[],pending=new Map();
 const panel=mountOutputHistory({container,request:path=>path==='/api/outputs'?Promise.resolve(history):new Promise(resolve=>pending.set(path.split('/').at(-1),resolve)),onSelect:x=>shown.push(x),notice:()=>{}});
 await panel.refresh();const select=find(container,'output-history-select'),button=find(container,'output-history-open');
 select.value=a;select.onchange();const first=button.onclick();select.value=b;select.onchange();const second=button.onclick();
 pending.get(b)(view(b));await second;pending.get(a)(view(a));await first;assert.deepEqual(shown.map(x=>x.id),[b]);
 select.value=a;select.onchange();const old=button.onclick();panel.invalidate();pending.get(a)(view(a));await old;assert.deepEqual(shown.map(x=>x.id),[b]);
}));
test('corrupt history remains unavailable and does not fabricate selectable outputs',()=>withDOM(async()=>{
 const container=new Element('div');const panel=mountOutputHistory({container,request:async()=>({status:'UNAVAILABLE',limit:50,entries:[],error:'履歴記録を確認できません'}),onSelect:()=>assert.fail('unexpected view'),notice:()=>{}});
 await panel.refresh();assert.equal(find(container,'output-history-open').disabled,true);assert.match(find(container,'output-history-status').textContent,/確認できません/);
}));
