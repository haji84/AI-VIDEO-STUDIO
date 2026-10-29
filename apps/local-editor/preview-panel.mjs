/** Explicit, read-only saved-cut playback. A late reply never changes the view. */
const LIMIT_MS=180000;
const make=(tag,id,text)=>{const element=document.createElement(tag);if(id)element.id=id;if(text)element.textContent=text;return element;};
const seconds=value=>Number(value.toFixed(3)).toLocaleString('ja-JP',{minimumFractionDigits:1,maximumFractionDigits:3});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function message(error){
 const code=String(error.message??error).split(':')[0];
 return ({PREVIEW_TIMEOUT:'確認の制限時間を過ぎました。もう一度確認してください。',PREVIEW_EXPIRED:'確認動画の有効期限が切れました。もう一度確認してください。',
  PREVIEW_STALE:'保存内容が変わりました。もう一度確認してください。',PREVIEW_SOURCE_CHANGED:'素材が変わったため確認動画を表示できません。素材を確認してください。',
  PREVIEW_UNSUPPORTED_CUT:'このカットの画面構成にはまだ対応していません。',PREVIEW_UNSUPPORTED_EFFECT:'このカットの効果にはまだ対応していません。',
  PREVIEW_PLATFORM_UNVERIFIED:'この確認機能は現在Linuxで検証しています。',PREVIEW_RANGE_INVALID:'確認する開始位置をカットの範囲内で指定してください。',
  PREVIEW_INTERRUPTED_FILES:'前の確認処理の作業データが残っています。アプリと処理の終了を確認し、起動手順の復旧案内を確認してください。',
  PREVIEW_DIRECTORY_UNAVAILABLE:'確認動画の保存先を利用できません。保存先を確認してください。',
  PREVIEW_CLEANUP_FAILED:'処理の停止を確認できません。新しい処理を始めず、アプリと処理の終了を確認してください。',
  PREVIEW_CLEANUP_UNCONFIRMED:'処理の停止を確認できません。新しい処理を始めず、アプリと処理の終了を確認してください。',
  CAPTION_LAYOUT_OVERFLOW:'テロップが画面に収まりません。改行や文字数を減らして保存してください。',
  CAPTION_FONT_GLYPHS_MISSING:'テロップの文字を表示できるフォントを確認してください。',
  PREVIEW_BUSY:'ほかの処理が終わってから、もう一度確認してください。'})[code]??
  (code.startsWith('PREVIEW_')?'確認動画を作成・確認できませんでした。もう一度確認してください。':String(error.message??error));
}
export function mountPreviewPanel({container,current,selected,request,mediaURL,onJobChange=()=>{}}){
 const heading=make('h2',null,'保存したカットの確認'),scope=make('p','saved-preview-scope','映像とテロップの確認用です。音の仕上がりは完成動画で確認できます。');
 const row=make('div'),label=make('label',null,'カット内の開始位置 秒 '),start=make('input','saved-preview-start');
 row.className='row';start.type='number';start.min='0';start.step='0.1';start.value='0';label.append(start);
 const render=make('button','saved-preview-render','保存したカットを確認'),clear=make('button','saved-preview-clear','表示を閉じる');
 const interval=make('p','saved-preview-interval'),status=make('p','saved-preview-status'),video=make('video','saved-preview-video');
 scope.className=interval.className=status.className='muted';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 video.controls=true;video.playsInline=true;video.muted=true;video.defaultMuted=true;video.preload='metadata';video.hidden=true;clear.hidden=true;
 row.append(label,render,clear);container.append(heading,scope,row,interval,status,video);
 let generation=0,key,closed=false,busy=false,pollTimer,deadlineTimer,deadline=0,displayed;
 function selection(){const state=current(),project=state?.session?.project;return {state,project,clip:project?.timeline?.[selected()]};}
 function identity(){const {project,clip}=selection();return project&&clip?JSON.stringify([project.projectId,project.revision,clip,project.sourceRefs]):'';}
 function windowFor(clip,value){
  const at=value.trim()===''?NaN:Number(value),total=clip?.durationSec/clip?.speed,duration=Math.min(7,total-at);
  if(!clip||!Number.isFinite(at)||at<0||!Number.isFinite(total)||duration*clip.speed<.2-1e-9)return null;
  return {startSec:at,endSec:at+duration,durationSec:duration,totalSec:total,
   sourceInSec:clip.sourceInSec+at*clip.speed,sourceDurationSec:duration*clip.speed,speed:clip.speed};
 }
 function timers(){clearTimeout(pollTimer);clearTimeout(deadlineTimer);pollTimer=deadlineTimer=undefined;}
 function stopVideo(){video.pause();video.removeAttribute('src');video.load();video.hidden=true;clear.hidden=true;displayed=undefined;}
 function invalidate(text){generation++;timers();busy=false;stopVideo();if(text)status.textContent=text;}
 function updateJob(job){const state=current();if(state){state.preview=job;onJobChange();}}
 function controls(){
  const {state,clip}=selection(),window=displayed?.report.window??windowFor(clip,start.value);
  const otherJob=state?.job?.status==='RUNNING'||state?.sync?.status==='RUNNING'||state?.firstCut?.status==='RUNNING';
  const supported=state?.preview?.supported!==false;
  start.disabled=closed||busy||!clip||!supported;
  render.disabled=closed||busy||!clip||!windowFor(clip,start.value)||!supported||otherJob;
  start.max=clip?String(Math.max(0,clip.durationSec/clip.speed-.2/clip.speed)):'';
  interval.textContent=window?`カット ${seconds(window.startSec)}–${seconds(window.endSec)}秒 / 全${seconds(window.totalSec)}秒（保存済み）`:
   clip?`全${seconds(clip.durationSec/clip.speed)}秒。開始位置をカット内に指定してください。`:'動画を追加してカットを選んでください。';
  if(!supported)status.textContent=state?.preview?.error?message(state.preview.error):'この確認機能は現在Linuxで検証しています。';
 }
 function valid(context){return !closed&&context.generation===generation&&context.key===identity()&&Date.now()<context.deadline;}
 function fail(context,error){if(!valid(context))return;invalidate(message(error));controls();}
 function arm(context){
  clearTimeout(deadlineTimer);deadline=context.deadline;
  deadlineTimer=setTimeout(()=>{
   if(closed||context.generation!==generation||context.key!==identity())return;
   const wasBusy=busy;invalidate(wasBusy?'確認の制限時間を過ぎました。もう一度確認してください。':'確認動画の有効期限が切れました。もう一度確認してください。');
   if(wasBusy)updateJob({...current()?.preview,status:'FAIL',error:'PREVIEW_TIMEOUT'});controls();
  },Math.max(0,context.deadline-Date.now()));
 }
 async function watch(context,adopt){
  try{
   if(!valid(context))return;
   const job=await request('/api/preview');if(!valid(context))return;
   updateJob(job);
   if(adopt&&job.id!==context.id)throw new Error('PREVIEW_STALE');
   if(job.status==='RUNNING'){pollTimer=setTimeout(()=>watch(context,adopt),500);return;}
   if(!adopt){timers();busy=false;status.textContent=job.status==='FAIL'?message(job.error??'PREVIEW_FAILED'):'確認するカットを選び、ボタンを押してください。';controls();return;}
   if(job.status!=='PASS')throw new Error(job.error??'PREVIEW_FAILED');
   if(!valid(context))return;
   const view=await request('/api/preview/'+context.id);if(!valid(context))return;
   const report=view.report;
   if(view.id!==context.id||view.status!=='PASS'||view.download!=='/previews/'+context.id||
     report?.schema!=='aivs-saved-clip-preview-v1'||report.projectId!==context.project.projectId||
     report.projectRevision!==context.project.revision||report.clipId!==context.clip.clipId||
     report.exportProfile!==context.project.exportProfile||!same(report.sourceIdentities,context.project.sourceRefs)||
     report.wholeFileDecode!=='PASS'||Object.entries(context.window).some(([name,value])=>!Number.isFinite(report.window?.[name])||Math.abs(report.window[name]-value)>1e-7)||
     !Number.isFinite(view.expiresAt)||view.expiresAt<=Date.now())throw new Error('PREVIEW_STALE');
   context.deadline=Math.min(context.deadline,view.expiresAt);if(!valid(context))return;
   // The only source assignment is after every saved identity/generation check.
   displayed=view;busy=false;video.muted=true;video.defaultPlaybackRate=1;video.playbackRate=1;
   video.src=mediaURL(view.download);video.hidden=false;clear.hidden=false;video.load();
   status.textContent='保存したカットを表示しています。再生して映像とテロップを確認してください。';arm(context);controls();
  }catch(error){fail(context,error);}
 }
 function show(){
  if(closed)return;const next=identity(),changed=next!==key;
  if(changed){const previous=key;key=next;start.value='0';invalidate(previous?'保存内容または選んだカットが変わりました。もう一度確認してください。':'ボタンを押すと、保存したカットを最大7秒確認できます。');}
  const state=current();
  // Selection may change while the server is still rendering. Observe completion
  // to release controls, without adopting that obsolete selection's result.
  if(!busy&&!displayed&&state?.preview?.status==='RUNNING'){
   busy=true;const context={generation,key,deadline:deadline>Date.now()?deadline:Date.now()+LIMIT_MS};
   status.textContent='確認動画を作成中です。処理後に選んだカットを確認できます。';arm(context);watch(context,false);
  }
  controls();
 }
 start.oninput=()=>{invalidate('開始位置を変更しました。ボタンを押して確認してください。');controls();};
 render.onclick=async()=>{
  if(closed||busy)return;show();const {state,project,clip}=selection(),window=windowFor(clip,start.value);
  if(render.disabled||!window)return;
  invalidate();busy=true;
  const context={generation,key:identity(),project:structuredClone(project),clip:structuredClone(clip),window,deadline:Date.now()+LIMIT_MS};
  status.textContent='保存したカットを端末内で作成中です…';updateJob({...state.preview,status:'RUNNING'});arm(context);controls();
  try{
   if(!valid(context))return;
   const job=await request('/api/preview',{method:'POST',body:JSON.stringify({clipId:clip.clipId,startSec:window.startSec})});
   if(!valid(context))return;
   if(job.status!=='RUNNING'||!/^[a-f0-9]{32}$/.test(job.id))throw new Error('PREVIEW_FAILED');
   context.id=job.id;updateJob(job);await watch(context,true);
  }catch(error){
   if(valid(context)){updateJob({...current()?.preview,status:'FAIL',error:String(error.message)});fail(context,error);}
  }
 };
 clear.onclick=()=>{invalidate('表示を閉じました。ボタンを押すと再び確認できます。');controls();};
 video.onerror=()=>{if(displayed){invalidate('確認動画を読み込めませんでした。もう一度確認してください。');controls();}};
 return {show,close(){if(closed)return;closed=true;invalidate();controls();}};
}
