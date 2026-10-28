/** Explicit saved-project recovery. Selected media stays a streaming File body. */
const key=state=>({projectId:state?.session?.project?.projectId,revision:state?.session?.project?.revision});
const same=(a,b)=>a?.projectId===b?.projectId&&a?.revision===b?.revision;
const stale='現在の編集内容が変わりました。画面を開き直してから、保存ファイルを選び直してください。';
function explanation(error){
 const messages={
  SOURCE_NOT_IN_PROJECT:'この素材は保存したプロジェクトの内容と一致しません。元の素材を選んでください。',
  SOURCE_METADATA_MISMATCH:'素材の映像・音声情報が保存内容と一致しません。元の素材を選んでください。',
  SOURCE_IDENTITY_CONFLICT:'保存ファイル内の素材情報に矛盾があるため開けません。別の保存ファイルを選んでください。',
  SOURCE_ID_CONFLICT:'この保存先の素材と保存ファイルの情報が一致しません。新しい専用の保存先で開いてください。',
  SOURCE_COUNT_LIMIT:'この保存先で扱える素材は100本までです。新しい専用の保存先を使ってください。',
  SOURCE_DISK_SPACE:'保存先の空き容量が不足しています。空きを増やしてから素材を選び直してください。',
  SOURCE_EXTENSION:'対応する動画・音声ファイルを選んでください。',
  SOURCE_SIZE:'素材は空でない16 GiB以下のファイルを選んでください。',
  SOURCE_LENGTH_MISMATCH:'素材の読み込みが完了しませんでした。同じ素材を選び直してください。',
  SOURCES_MISSING:'まだ不足している素材があります。元の素材を選んでください。',
  RELINK_JSON_SIZE:'保存ファイルが大きすぎます。4 MiB以下のファイルを選んでください。',
  RELINK_JSON_INVALID:'保存ファイルを読み込めません。プロジェクト保存で作ったJSONを選んでください。'
 };
 if(error.message==='RELINK_STALE'||error.message?.includes('REVISION_CONFLICT'))return stale;
 if(messages[error.message])return messages[error.message];
 if(/^SOURCE_(CHANGED|MISSING|FILE_UNSAFE|PATH_UNSAFE|REGISTRY_INVALID)$/.test(error.message))return '保存先の素材を確認できません。元の素材を用意し、新しい専用の保存先で開いてください。';
 if(/^RELINK_PLAN_/.test(error.message))return '開く準備を確認できません。保存ファイルを選び直してください。';
 if(error.status===403)return '画面を開き直してから、保存ファイルを選び直してください。';
 if(error.status===409)return '別の処理が終わってから、もう一度操作してください。';
 return '読み込みを完了できませんでした。保存ファイルと元の素材を確認して、もう一度お試しください。';
}

export function mountSourceRelink({container,fileInput,current,request,onOpen,notice}){
 let plan=null,origin=null,generation=0,busy=false,committing=false,visible=false,message='';
 const node=(tag,id,text='')=>{const e=document.createElement(tag);e.id=id;e.textContent=text;return e;};
 const title=node('h2','source-relink-title','プロジェクトを開く'),status=node('p','source-relink-status'),missing=node('ul','source-relink-missing');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const label=node('label','source-relink-label','不足している素材を選ぶ'),files=node('input','source-relink-files');
 files.type='file';files.multiple=true;files.accept='.mp4,.mov,.mkv,.webm,.wav,.mp3,.m4a,.aac,.flac,.ogg';label.append(files);
 const actions=node('div','source-relink-actions'),open=node('button','source-relink-open','このプロジェクトを開く'),cancel=node('button','source-relink-cancel','キャンセル');
 actions.className='row';open.className='primary';actions.append(open,cancel);
 const note=node('p','source-relink-note','保存時の動画・音声を選んでください。「開く」を押すまで現在の編集は変わりません。確認できた素材のコピーは、キャンセル後もこのPCの保存先に残ります。');note.className='muted';
 container.replaceChildren(title,status,missing,label,actions,note);
 function draw(){
  container.hidden=!visible;fileInput.disabled=busy;
  title.textContent=plan?'「'+plan.name+'」を開く':'プロジェクトを開く';
  status.textContent=message;missing.replaceChildren();
  for(const source of plan?.missing??[]){const item=document.createElement('li');item.textContent=(source.mediaKind==='video'?'動画':'音声')+'・'+source.durationSec.toFixed(1)+'秒';missing.append(item);}
  files.disabled=busy||!plan||plan.ready;open.disabled=busy||!plan?.ready||!same(origin,key(current()));cancel.disabled=committing||!plan&&!busy;
 }
 function report(text){message=text;draw();notice(text);}
 function invalidate(text=''){generation++;plan=null;origin=null;busy=false;committing=false;visible=!!text;message=text;draw();if(text)notice(text);}
 function live(sequence,base){if(sequence!==generation)return false;if(!same(base,key(current()))){invalidate(stale);return false;}return true;}
 function accept(value,base,expectedId){
  if(!value||!(/^[a-f0-9]{32}$/).test(value.planId)||expectedId&&value.planId!==expectedId||!same(value.base,base)||
    typeof value.name!=='string'||!Number.isInteger(value.total)||value.total<0||value.total>100||
    !Number.isInteger(value.available)||value.available<0||value.available>value.total||!Array.isArray(value.missing)||
    value.missing.length!==value.total-value.available||value.ready!==(value.missing.length===0))throw new Error('RELINK_PLAN_INVALID');
  plan=value;
 }
 function progress(){return plan.ready?'素材がそろいました。「このプロジェクトを開く」で編集を再開できます。':`${plan.total}本中${plan.available}本の素材を確認しました。残り${plan.missing.length}本を選んでください。`;}
 function failed(error){
  const text=explanation(error);
  if(error.message==='RELINK_STALE'||error.message?.includes('REVISION_CONFLICT')||/^RELINK_PLAN_/.test(error.message))invalidate(text);
  else report(text);
 }
 fileInput.onchange=async()=>{
  if(committing)return;
  const file=fileInput.files?.[0];if(!file)return;fileInput.value='';
  const sequence=++generation,base=key(current());plan=null;origin=base;busy=true;visible=true;report('保存ファイルを確認しています…');
  try{
   if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>4*1024**2)throw new Error('RELINK_JSON_SIZE');
   const body=await file.text();if(!live(sequence,base))return;
   try{JSON.parse(body);}catch{throw new Error('RELINK_JSON_INVALID');}
   const prepared=await request('/api/relink/prepare',{method:'POST',body});if(!live(sequence,base))return;
   accept(prepared,base);report(progress());
  }catch(error){if(live(sequence,base))failed(error);}
  finally{if(sequence===generation){busy=false;draw();}}
 };
 files.onchange=async()=>{
  if(!plan||busy)return;const selected=Array.from(files.files??[]);files.value='';if(!selected.length)return;
  const sequence=generation,base={...origin},planId=plan.planId;busy=true;draw();
  try{
   if(selected.length>100)throw new Error('SOURCE_COUNT_LIMIT');
   for(const [index,file] of selected.entries()){
    if(!live(sequence,base))return;
    if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>16*1024**3)throw new Error('SOURCE_SIZE');
    report(`${file.name} を確認しています（${index+1}/${selected.length}）`);
    const next=await request('/api/relink/media?id='+planId,{method:'POST',headers:{'X-File-Name':encodeURIComponent(file.name)},body:file});
    if(!live(sequence,base))return;accept(next,base,planId);report(progress());
   }
  }catch(error){if(live(sequence,base))failed(error);}
  finally{if(sequence===generation){busy=false;draw();}}
 };
 open.onclick=async()=>{
  if(!plan?.ready||busy)return;const sequence=generation,base={...origin},planId=plan.planId;if(!live(sequence,base))return;
  busy=true;committing=true;report('素材を確認してプロジェクトを開いています…');
  try{
   const opened=await request('/api/relink/open',{method:'POST',body:JSON.stringify({planId})});if(!live(sequence,base))return;
   invalidate();onOpen(opened);notice('プロジェクトを開きました。端末内に保存済みです。');
  }catch(error){if(live(sequence,base))failed(error);}
  finally{if(sequence===generation){busy=false;committing=false;draw();}}
 };
 cancel.onclick=async()=>{
  if(committing)return;
  const planId=plan?.planId;invalidate();notice('開く準備をキャンセルしました。確認済みの素材はこのPCの保存先に残っています。');
  // A copying request may still hold the server mutation lock. Its late reply is
  // ignored by generation; copied media can remain, but it cannot open a project.
  if(planId)await request('/api/relink/cancel',{method:'POST',body:JSON.stringify({planId})}).catch(()=>{});
 };
 draw();return {invalidate,show(){if(origin&&!same(origin,key(current())))invalidate(stale);else draw();}};
}
