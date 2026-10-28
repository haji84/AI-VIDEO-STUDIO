/** DOM-double behavior; actual browser/device acceptance remains separate. */
import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('./source-relink-panel.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
class Element{
 children=[];textContent='';value='';disabled=false;hidden=false;files=[];
 constructor(tag){this.tagName=tag;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(name,value){this[name]=value;}
}
function find(root,id){if(root.id===id)return root;for(const child of root.children){const found=find(child,id);if(found)return found;}}
const base={projectId:'project_current',revision:3},id='1'.repeat(32),id2='2'.repeat(32);
const progress=(planId=id,available=0)=>({planId,name:'Saved edit',total:2,available,missing:[{assetId:'asset_'+'1'.repeat(32),mediaKind:'video',durationSec:2},{assetId:'asset_'+'2'.repeat(32),mediaKind:'audio',durationSec:2}].slice(available),ready:available===2,base:{...base}});
const jsonFile={name:'saved.json',size:30,text:async()=>'{"saved":"document"}'};
const chosen=name=>({name,size:1024,arrayBuffer:()=>assert.fail('media must remain a File body')});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function setup(request,run){
 assert.equal(typeof api.mountSourceRelink,'function');
 const old=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 const container=new Element('section'),fileInput=new Element('input'),opened=[],notices=[];let current={session:{project:{...base}}};
 try{
  const panel=api.mountSourceRelink({container,fileInput,current:()=>current,request,onOpen:x=>{opened.push(x);current=x;},notice:x=>notices.push(x)});
  await run({container,fileInput,panel,opened,notices,change:p=>{current={session:{project:p}};},select:async file=>{fileInput.files=[file??jsonFile];await fileInput.onchange();}});
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
}

test('prepare and raw selected-file progress never open automatically; explicit Open uses the prepared plan',async()=>{
 const calls=[],files=[chosen('a.mp4'),chosen('b.wav')],opened={session:{project:{projectId:'project_saved',revision:4}}};let uploads=0;
 await setup(async(path,options)=>{
  calls.push({path,options});if(path==='/api/relink/prepare')return progress();
  if(path.startsWith('/api/relink/media')){assert.equal(options.body,files[uploads]);return progress(id,++uploads);}
  if(path==='/api/relink/open'){assert.deepEqual(JSON.parse(options.body),{planId:id});return opened;}
  throw new Error('unexpected path '+path);
 },async s=>{
  await s.select();assert.equal(find(s.container,'source-relink-open').disabled,true);assert.equal(find(s.container,'source-relink-missing').children.length,2);assert.deepEqual(s.opened,[]);
  const input=find(s.container,'source-relink-files');input.files=files;await input.onchange();
  assert.equal(find(s.container,'source-relink-open').disabled,false);assert.deepEqual(s.opened,[]);assert.equal(input.value,'');
  assert.ok(s.notices.some(x=>x.includes('1/2')));assert.ok(s.notices.some(x=>x.includes('2/2')));
  await find(s.container,'source-relink-open').onclick();assert.deepEqual(s.opened,[opened]);assert.equal(s.container.hidden,true);
  assert.equal(calls.filter(x=>x.path==='/api/relink/open').length,1);
 });
});

test('wrong later media leaves prior verified progress and the current editor intact for retry',async()=>{
 let uploads=0;
 await setup(async path=>{if(path==='/api/relink/prepare')return progress();if(path.startsWith('/api/relink/media')){uploads++;if(uploads===2)throw new Error('SOURCE_NOT_IN_PROJECT');return progress(id,uploads===1?1:2);}throw new Error('unexpected');},async s=>{
  await s.select();const input=find(s.container,'source-relink-files');input.files=[chosen('a.mp4'),chosen('wrong.wav')];await input.onchange();
  assert.deepEqual(s.opened,[]);assert.equal(find(s.container,'source-relink-open').disabled,true);assert.equal(find(s.container,'source-relink-missing').children.length,1);
  assert.match(find(s.container,'source-relink-status').textContent,/一致しません/);
  input.files=[chosen('correct.wav')];await input.onchange();assert.equal(find(s.container,'source-relink-open').disabled,false);assert.deepEqual(s.opened,[]);
 });
});

test('cancel and a ready existing copy both require a later explicit Open',async()=>{
 const calls=[];
 await setup(async(path,options)=>{calls.push(path);if(path==='/api/relink/prepare')return progress(id,2);assert.deepEqual(JSON.parse(options.body),{planId:id});return {cancelled:true};},async s=>{
  await s.select();assert.equal(find(s.container,'source-relink-open').disabled,false);assert.deepEqual(s.opened,[]);
  await find(s.container,'source-relink-cancel').onclick();assert.equal(s.container.hidden,true);assert.deepEqual(s.opened,[]);assert.deepEqual(calls,['/api/relink/prepare','/api/relink/cancel']);
 });
});

test('oversized or invalid JSON is refused before sending a prepare request',async()=>{
 await setup(async()=>assert.fail('invalid file must not be sent'),async s=>{
  await s.select({name:'huge.json',size:4*1024**2+1,text:()=>assert.fail('oversized file must not be read')});assert.match(s.notices.at(-1),/大きすぎ/);
  await s.select({name:'bad.json',size:5,text:async()=>'{bad}'});assert.match(s.notices.at(-1),/読み込めません/);assert.deepEqual(s.opened,[]);
 });
});

test('a late previous prepare cannot enable Open for a newer saved file',async()=>{
 const first=deferred(),second=deferred();let n=0;
 await setup(async path=>{assert.equal(path,'/api/relink/prepare');return ++n===1?first.promise:second.promise;},async s=>{
  const pending=s.select();await Promise.resolve();const newer=s.select({...jsonFile,name:'newer.json'});await Promise.resolve();
  second.resolve(progress(id2,0));await newer;first.resolve(progress(id,2));await pending;
  assert.equal(find(s.container,'source-relink-open').disabled,true);assert.equal(find(s.container,'source-relink-missing').children.length,2);assert.deepEqual(s.opened,[]);
 });
});

test('changed project or revision invalidates a pending plan and ignores an old upload response',async()=>{
 for(const changed of [{...base,revision:4},{projectId:'project_other',revision:3}]){
  const upload=deferred();
  await setup(async path=>path==='/api/relink/prepare'?progress():upload.promise,async s=>{
   await s.select();const input=find(s.container,'source-relink-files');input.files=[chosen('a.mp4')];const pending=input.onchange();
   s.change(changed);s.panel.show();upload.resolve(progress(id,2));await pending;
   assert.deepEqual(s.opened,[]);assert.equal(find(s.container,'source-relink-open').disabled,true);assert.match(s.notices.at(-1),/選び直/);
  });
 }
});

test('cancelled pending upload or stale final reply never replaces the displayed editor',async()=>{
 const upload=deferred();
 await setup(async path=>path==='/api/relink/prepare'?progress():path==='/api/relink/cancel'?{cancelled:true}:upload.promise,async s=>{
  await s.select();const input=find(s.container,'source-relink-files');input.files=[chosen('a.mp4')];const pending=input.onchange();
  await find(s.container,'source-relink-cancel').onclick();upload.resolve(progress(id,2));await pending;assert.equal(s.container.hidden,true);assert.deepEqual(s.opened,[]);
 });
 const opening=deferred();
 await setup(async path=>path==='/api/relink/prepare'?progress(id,2):opening.promise,async s=>{
  await s.select();const pending=find(s.container,'source-relink-open').onclick();s.change({...base,revision:4});s.panel.show();
  opening.resolve({session:{project:{projectId:'project_old_response',revision:4}}});await pending;assert.deepEqual(s.opened,[]);
 });
});

test('a server stale-plan rejection disables Open and explains reselecting the saved project',async()=>{
 await setup(async path=>{if(path==='/api/relink/prepare')return progress(id,2);throw new Error('RELINK_STALE');},async s=>{
  await s.select();await find(s.container,'source-relink-open').onclick();assert.deepEqual(s.opened,[]);assert.equal(find(s.container,'source-relink-open').disabled,true);assert.match(s.notices.at(-1),/選び直/);
 });
});
