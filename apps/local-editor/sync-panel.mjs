import {assertCurrentSyncReport,syncPreviewTimes} from './sync-edits.mjs';
const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function mountSyncPanel({container,current,request,act,refresh,mediaUrl,notice}){
  let masterId,targetId,poll;
  function watch(){if(poll)return;poll=setInterval(async()=>{try{const s=await request('/api/sync');if(s.status==='RUNNING')return;clearInterval(poll);poll=undefined;await refresh();if(s.status==='FAIL')notice(s.error);}catch(e){clearInterval(poll);poll=undefined;notice(e.message);}},500);}
  return {show(){
    const state=current(),p=state.session.project,videos=p.sourceRefs.filter(s=>s.mediaKind==='video'),job=state.sync??{status:'NOT_RUN'};
    container.replaceChildren();container.append(make('h3','複数カメラの同期候補'));
    if(videos.length<2){container.append(make('p','動画を2本以上追加すると音声から同期候補を調べられます。'));return;}
    const label=id=>state.sources.find(s=>s.assetId===id)?.label??'カメラ';
    if(!videos.some(s=>s.assetId===masterId))masterId=videos.find(s=>s.syncStatus==='master')?.assetId??videos[0].assetId;
    if(!videos.some(s=>s.assetId===targetId&&s.assetId!==masterId))targetId=videos.find(s=>s.assetId!==masterId)?.assetId;
    const row=make('div');row.className='row';
    for(const [name,selected,change] of [['基準カメラ',masterId,id=>{masterId=id;this.show();}],['調べるカメラ',targetId,id=>{targetId=id;this.show();}]]){
      const wrapper=make('label',name),select=make('select');select.id=name==='基準カメラ'?'sync-master':'sync-target';
      for(const v of videos){if(name==='調べるカメラ'&&v.assetId===masterId)continue;const option=make('option',label(v.assetId));option.value=v.assetId;select.append(option);}
      select.value=selected;select.onchange=()=>change(select.value);select.disabled=job.status==='RUNNING';wrapper.append(select);row.append(wrapper);
    }
    const start=make('button',job.status==='RUNNING'?'音声を解析中…':'この組み合わせの同期候補を調べる');start.id='sync-analyse';
    const master=videos.find(s=>s.assetId===masterId),target=videos.find(s=>s.assetId===targetId);
    start.disabled=job.status==='RUNNING'||state.job.status==='RUNNING'||state.firstCut?.status==='RUNNING'||!['master','verified'].includes(master.syncStatus)||!['unverified','candidate'].includes(target.syncStatus);
    start.onclick=()=>act(async()=>{await request('/api/sync',{method:'POST',body:JSON.stringify({masterId,targetId})});await refresh();watch();});row.append(start);container.append(row);
    const scope=make('p','先頭の最大300秒の音声から位置を推定します。ドリフトは未検査です。確認済みの位置は自動変更しません。');scope.className='muted';container.append(scope);
    if(job.status==='RUNNING'){container.append(make('p','このPCで解析中です。終了まで編集・書き出しをお待ちください。'));watch();return;}
    if(job.error)container.append(make('p',job.error));const report=job.report;if(!report)return;
    if(report.masterIdentity.assetId!==masterId||report.targetIdentity.assetId!==targetId)return;
    if(['verified','master'].includes(target.syncStatus)){container.append(make('p','このカメラの同期位置は確認済みです。変更する場合は手動の同期欄で見直してください。'));return;}
    try{assertCurrentSyncReport(p,report);}catch{container.append(make('p','解析後に編集内容が変わりました。新しい候補を調べてください。'));return;}
    container.append(make('h4',`解析対象：${label(report.masterIdentity.assetId)} / ${label(report.targetIdentity.assetId)}`));
    container.append(make('p',`${report.reason} 音声の一致度 ${report.confidence.toFixed(3)}、一意性 ${report.uniqueness.toFixed(3)}。`));
    if(report.candidateOffsetSec!==null)container.append(make('p',`同期位置の候補：${report.candidateOffsetSec.toFixed(2)}秒`));
    if(report.status!=='CANDIDATE'){container.append(make('p','候補の確定はできません。上のカメラ欄で共通場面から手動調整してください。'));return;}
    const players=make('div');players.className='grid';const m=make('video'),t=make('video');
    for(const [v,id] of [[m,masterId],[t,targetId]]){v.controls=true;v.preload='metadata';v.playsInline=true;v.src=mediaUrl(id);v.setAttribute('aria-label',label(id));players.append(v);}container.append(players);
    for(const [position,text] of [['start','共通場面①を再生'],['end','共通場面②を再生']]){const play=make('button',text);
      play.onclick=async()=>{try{const times=syncPreviewTimes(current().session.project,report,position);
        for(const [video,sec] of [[m,times.masterSec],[t,times.targetSec]]){if(video.readyState)video.currentTime=sec;else await new Promise(done=>video.addEventListener('loadedmetadata',()=>{video.currentTime=sec;done();},{once:true}));}
        await Promise.all([m.play(),t.play()]);}catch(e){notice(e.message);}};container.append(play);}
    const checked=make('input');checked.type='checkbox';checked.id='sync-review-confirm';const check=make('label','2箇所で映像と音が一致することを確認した');check.append(checked);
    const apply=make('button','確認した候補を保存');apply.id='sync-apply';apply.disabled=true;checked.onchange=()=>{apply.disabled=!checked.checked;};
    apply.onclick=()=>act(async()=>{await request('/api/sync/apply',{method:'POST',body:JSON.stringify({analysisId:job.id,confirmed:checked.checked})});await refresh();});
    container.append(check,apply);
  }};
}
