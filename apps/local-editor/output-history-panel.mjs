/** Explicit view-only selection. This panel never mutates an editing session. */
export function mountOutputHistory({container,request,onSelect,notice}){
 const make=(tag,id,text)=>{const element=document.createElement(tag);if(id)element.id=id;if(text)element.textContent=text;return element;};
 const heading=make('h3',null,'以前の完成動画'),scope=make('p','output-history-scope'),label=make('label',null,'表示する出力 ');
 const select=make('select','output-history-select'),open=make('button','output-history-open','この出力を表示'),reload=make('button',null,'履歴を更新'),status=make('p','output-history-status');
 scope.className=status.className='muted';label.append(select);container.append(heading,scope,label,open,reload,status);
 let entries=[],selection=0,refreshVersion=0;
 function invalidate(){selection++;open.disabled=!entries.some(x=>x.id===select.value);}
 select.onchange=invalidate;
 async function refresh(){
  const version=++refreshVersion;
  try{
   const result=await request('/api/outputs');if(version!==refreshVersion)return;
   scope.textContent=`最近${result.limit??50}件を表示します。以前のファイルは削除しません。選ぶとファイルを確認します。`;
   entries=result.status==='READY'&&Array.isArray(result.entries)?result.entries:[];
   const previous=select.value;select.replaceChildren(make('option',null,'出力を選んでください'));select.children[0].value='';
   for(const item of entries){const option=make('option');option.value=item.id;
    const time=item.createdAt?new Date(item.createdAt).toLocaleString('ja-JP'):'以前の出力';
    const quality={CHECKED_LIMITED:'限定検査済み',NEEDS_REVIEW:'要確認',NOT_INSPECTED:'未検査'}[item.qualityStatus]??'未確認';
    option.textContent=`${time} · 編集版${item.projectRevision} · ${quality}`;select.append(option);
   }
   select.value=entries.some(x=>x.id===previous)?previous:'';open.disabled=!select.value;
   if(result.status!=='READY')status.textContent=result.error||'履歴記録を確認できません。';
   else status.textContent=entries.length?'出力を選び「この出力を表示」で開けます。':'保存された完成動画の履歴はまだありません。';
  }catch(error){if(version===refreshVersion){entries=[];select.replaceChildren();open.disabled=true;status.textContent=error.message;}}
 }
 open.onclick=async()=>{
  const id=select.value;if(!entries.some(x=>x.id===id))return;
  const version=++selection;open.disabled=true;status.textContent='ファイルを確認中です。大きい動画では時間がかかります。';
  try{
   const view=await request('/api/outputs/'+id);if(version!==selection)return;
   if(view.id!==id||view.status!=='PASS'||view.integrity!=='CHECKED_THIS_ACCESS')throw new Error('選んだ出力の検査記録を確認できません。');
   onSelect(view);status.textContent='選んだ完成動画を表示しています。';notice('以前の完成動画を表示しました。現在の編集内容はそのままです。');
  }catch(error){if(version===selection){status.textContent=error.message;notice(error.message);}}
  finally{if(version===selection)open.disabled=!entries.some(x=>x.id===select.value);}
 };
 reload.onclick=refresh;
 return {refresh,invalidate};
}
