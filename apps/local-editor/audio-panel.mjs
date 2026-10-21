import {editAudioClip,removeAudioClip} from './audio-edits.mjs';
const names={source:'元音声',narration:'ナレーション',bgm:'BGM',sfx:'効果音'};
const fields=[['startSec','配置する開始 秒',0,14400],['endSec','配置する終了 秒',0,14400],
  ['trimInSec','素材から使う開始 秒',0,14400],['speed','速度',.25,4],['gainDb','この音声の音量 dB',-96,24],
  ['fadeInSec','フェードイン 秒',0,14400],['fadeOutSec','フェードアウト 秒',0,14400]];
const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function mountAudioPanel({container,current,commit,act,mediaUrl}){
  let selectedId,initialized=false;
  return {show(){
    const state=current(),p=state.session.project;container.replaceChildren();
    const heading=element('h3','音源ごとの配置・フェード');container.append(heading);
    if(!initialized&&p.audioClips.length){selectedId=p.audioClips[0].id;initialized=true;}
    else if(!p.audioClips.some(a=>a.id===selectedId))selectedId=undefined;
    const list=element('div');list.className='tools';container.append(list);
    for(const a of p.audioClips){
      const source=state.sources.find(s=>s.assetId===a.assetId),b=element('button',`${names[a.bus]} · ${source?.label??'音源'} · ${a.startSec.toFixed(2)}–${a.endSec.toFixed(2)}秒`);
      b.id='select-'+a.id;b.setAttribute('aria-pressed',String(a.id===selectedId));
      b.style.border=a.id===selectedId?'2px solid #a8b6ff':'1px solid #52617a';
      b.style.backgroundColor=a.id===selectedId?'#354a73':'#2b374b';
      b.onclick=()=>{selectedId=a.id;this.show();};list.append(b);
    }
    const selected=p.audioClips.find(a=>a.id===selectedId);
    if(!selected){container.append(element('p',p.audioClips.length?'編集する音源を選んでください。履歴で対象が変わった場合は、音源を選び直してください。':'音源を読み込むと配置やフェードを編集できます。'));return;}
    container.append(element('h4',`編集中：${names[selected.bus]} · ${state.sources.find(s=>s.assetId===selected.assetId)?.label??'音源'}`));
    container.append(element('p','配置・フェードを保存した音声は、映像カットと独立して配置されます。完成動画で仕上がりを確認してください。'));
    const row=element('div');row.className='row';const inputs={};
    for(const [key,label,min,max] of fields){
      const wrapper=element('label',label),input=element('input');input.type='number';input.id='audio-'+key;input.step='any';input.min=String(min);input.max=String(max);input.value=String(selected[key]);input.required=true;
      wrapper.append(input);row.append(wrapper);inputs[key]=input;
    }
    const loop=element('input');loop.type='checkbox';loop.id='audio-loop';loop.checked=selected.loop;
    const loopLabel=element('label','選んだ素材範囲を繰り返す');loopLabel.append(loop);row.append(loopLabel);container.append(row);
    const save=element('button','この音声を保存');save.id='audio-save';save.className='primary';
    save.onclick=()=>act(async()=>{
      const changes={loop:loop.checked};
      for(const [key,input] of Object.entries(inputs)){
        if(input.value===''||!Number.isFinite(input.valueAsNumber))throw new Error('音声の各欄に数値を入力してください');
        changes[key]=input.valueAsNumber;
      }
      const latest=current().session.project,index=latest.audioClips.findIndex(a=>a.id===selectedId);
      let edited;try{edited=editAudioClip(latest,selectedId,changes);}catch{
        throw new Error('配置の開始・終了、素材の使用範囲、速度、音量、フェード時間を確認してください。ダッキング指定がある音声は、その区間も含む範囲にしてください。');
      }
      await commit(edited);selectedId=edited.audioClips[index].id;
    });
    const remove=element('button','この音声を外す');remove.id='audio-remove';remove.onclick=()=>act(()=>commit(removeAudioClip(current().session.project,selectedId)));
    const actions=element('div');actions.className='tools';actions.append(save,remove);container.append(actions);
    const hint=element('p','「外す」は戻すボタンで復元できます。繰り返しは「素材から使う開始」から素材末尾までを使います。');hint.className='muted';container.append(hint);
    const preview=element('audio');preview.controls=true;preview.preload='none';preview.src=mediaUrl(selected.assetId);preview.setAttribute('aria-label','素材音源を試聴');container.append(preview);
  }};
}
