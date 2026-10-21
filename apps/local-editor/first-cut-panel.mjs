import {validateFirstCutSelection,assertCurrentFirstCut,applyFirstCut} from '../../packages/project/first-cut.mjs';
const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const reason=code=>({FIRST_CUT_ZERO_MASTER_REQUIRED:'同期基準のカメラを1本、位置0秒で指定してください。',FIRST_CUT_DRIFT_UNSUPPORTED:'ドリフト補正のある素材は、この候補生成にまだ対応していません。',FIRST_CUT_CAMERA_BUDGET_EXCEEDED:'確認済みカメラは最大8本です。',FIRST_CUT_ANALYSIS_BUDGET_EXCEEDED:'各素材と共通区間は最大20分です。長い素材は手動で編集してください。',FIRST_CUT_PROTECTS_MANUAL_EFFECTS:'テロップ・効果・画面分割があるため置換を保護しています。プロジェクトを保存し、手動編集を続けてください。',FIRST_CUT_WOULD_TRUNCATE_AUDIO:'候補が現在の音声より短いため適用できません。音声を見直してから再解析してください。'}[code]??code);
export function mountFirstCutPanel({container,current,request,act,refresh,mediaUrl,notice}){
 let mode='training',poll;
 function watch(){if(poll)return;poll=setInterval(async()=>{try{const j=await request('/api/first-cut');if(j.status==='RUNNING')return;clearInterval(poll);poll=undefined;await refresh();if(j.status==='FAIL')notice(j.error);}catch(e){clearInterval(poll);poll=undefined;notice(e.message);}},500);}
 return {show(){
  const state=current(),p=state.session.project,job=state.firstCut??{status:'NOT_RUN'};container.replaceChildren();container.append(make('h2','自動編集の下書き候補'));
  container.append(make('p','素材全体の明暗・動き・音量からカメラを選ぶ下書きです。発話内容・人物の役割・作業の正しさは判断しません。完成版として自動確定しません。'));
  const row=make('div');row.className='row';const wrapper=make('label','編集の傾向'),select=make('select');select.id='first-cut-mode';
  for(const [value,text] of [['training','研修'],['documentary','記録'],['television','番組風'],['short','短編向けの傾向']]){const o=make('option',text);o.value=value;select.append(o);}select.value=mode;select.onchange=()=>{mode=select.value;};select.disabled=job.status==='RUNNING';wrapper.append(select);row.append(wrapper);
  const start=make('button',job.status==='RUNNING'?'端末内で解析中…':'下書き候補を作る');start.id='first-cut-analyse';let blocked;
  try{validateFirstCutSelection(p,{mode});}catch(e){blocked=reason(e.message);}
  start.disabled=!!blocked||job.status==='RUNNING'||state.job.status==='RUNNING'||state.sync?.status==='RUNNING';start.onclick=()=>act(async()=>{await request('/api/first-cut',{method:'POST',body:JSON.stringify({mode})});await refresh();watch();});row.append(start);container.append(row);
  container.append(make('p',blocked??'同期を確認済みのカメラだけを使います。最大8本・20分。未確認のカメラは自動同期しません。短編の目標尺調整や意味の要約は未対応です。'));
  if(job.status==='RUNNING'){container.append(make('p','このPCで解析中です。編集・書き出しは解析後に再開できます。'));watch();return;}
  if(job.error)container.append(make('p',job.error));const report=job.report;if(!report)return;
  try{assertCurrentFirstCut(p,report);}catch{container.append(make('p','解析後に編集内容が変わりました。新しい候補を作ってください。'));return;}
  const label=id=>state.sources.find(s=>s.assetId===id)?.label??'カメラ',proposal=report.proposal;
  container.append(make('h3',`候補：${proposal.timeline.length}カット / ${proposal.durationSeconds.toFixed(1)}秒`));
  container.append(make('p',`解析済み ${report.analysis.length}本。同期未確認で除外：${proposal.evidence.blockedCameraIds.map(label).join('、')||'なし'}。信号のある判定区間 ${proposal.evidence.signalCoveredWindows}/${proposal.evidence.signalTotalWindows}。`));
  container.append(make('p','各カットを再生して確認してください。個別の素材プレビューです。保持する音声ミックスは適用後の完成動画で確認できます。'));
  const video=make('video');video.controls=true;video.preload='metadata';video.playsInline=true;video.id='first-cut-preview';container.append(video);const list=make('ol');
  for(const c of proposal.timeline){const li=make('li'),play=make('button',`${c.start.toFixed(1)}秒〜 / ${label(c.sourceId)} / ${c.duration.toFixed(1)}秒`);
   play.onclick=async()=>{try{const source=p.sourceRefs.find(s=>s.assetId===c.sourceId),local=c.start-source.offsetSec;video.pause();video.src=mediaUrl(c.sourceId);video.onloadedmetadata=async()=>{video.currentTime=local;try{await video.play();}catch(e){notice(e.message);}};video.ontimeupdate=()=>{if(video.currentTime>=local+c.duration)video.pause();};video.load();}catch(e){notice(e.message);}};li.append(play);list.append(li);
  }container.append(list);
  let protectedReason;try{applyFirstCut(p,report,true);}catch(e){protectedReason=reason(e.message);}
  if(protectedReason){container.append(make('p',protectedReason));return;}
  container.append(make('p','適用すると現在の映像カットを候補へ置き換えます。元音声・ナレーション・BGM・効果音の素材、配置と音量は保持され、カメラには自動追従しません。適用後も手動編集と「戻す」が使えます。'));
  const checkbox=make('input');checkbox.type='checkbox';checkbox.id='first-cut-confirm';const check=make('label','映像カットの置換と音声の保持を確認した');check.append(checkbox);
  const apply=make('button','確認した下書きを編集へ取り込む');apply.id='first-cut-apply';apply.disabled=true;checkbox.onchange=()=>{apply.disabled=!checkbox.checked;};
  apply.onclick=()=>act(async()=>{await request('/api/first-cut/apply',{method:'POST',body:JSON.stringify({analysisId:job.id,confirmed:checkbox.checked})});await refresh();});container.append(check,apply);
 }};
}
