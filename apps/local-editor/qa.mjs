/** Read-only navigation from a saved render finding to its exact project. */
export function inspectionMessage(report){
  const inspection=report?.inspection;
  if(inspection?.schema==='aivs-output-inspection-v1'){
    if(inspection.status==='CHECKED_LIMITED')return '検査対象の範囲で要確認箇所はありません。内容や聞き取りやすさは再生して確認してください。';
    if(inspection.status==='NEEDS_REVIEW')return '確認したい箇所があります。意図した映像・無音の場合はそのまま使えます。';
    if(inspection.status==='FAILED_TECHNICAL')return '技術検査に失敗しました。検査記録を確認し、編集内容から作り直してください。';
  }
  return '黒画面・無音・音量ピークは未検査です。今の編集内容で作り直すと検査できます。';
}
export function reviewTarget(report,project,findingIndex){
  if(report?.projectId!==project.projectId||report?.projectRevision!==project.revision)
    throw new Error('OUTPUT_PROJECT_CHANGED: 出力後に編集されています。今の内容で動画を作り直してください');
  const finding=report.inspection?.findings[findingIndex];if(!finding)throw new Error('FINDING_NOT_FOUND');
  const clipIndex=project.timeline.findIndex(c=>finding.clipIds.includes(c.clipId)&&c.startSec<finding.endSec&&c.startSec+c.durationSec/c.speed>finding.startSec);
  if(clipIndex<0)throw new Error('FINDING_CLIP_NOT_FOUND');
  const c=project.timeline[clipIndex],outputSec=Math.max(finding.startSec,c.startSec);
  return {clipIndex,sourceSec:c.sourceInSec+(outputSec-c.startSec)*c.speed,outputSec};
}
/** Older saved reports cannot acquire detector coverage merely by reopening. */
export function inspectionScope(report){
  const i=report?.inspection;if(i?.schema!=='aivs-output-inspection-v1')return 'この出力の検査範囲は未確認です。編集内容から再作成して検査できます。';
  const base='全編デコード・黒画面・無音・サンプル音量ピークを検査します。';
  const freeze=i.detectors?.includes('freezedetect-v1'),cadence=i.detectors?.includes('vfrdet-v1')&&['VARIABLE_INTERVALS','CONSTANT_INTERVALS','INSUFFICIENT_FRAMES'].includes(i.cadence?.status);
  return base+(freeze?'1秒以上ほぼ変化しない静止・フリーズ候補も検査します。':'静止・フリーズ候補は未検査です。')+
    (cadence?'出力のフレーム間隔の変化を集計します。':'フレーム間隔の検査は未完了です。')+
    '意図した静止画や可変のフレーム間隔の場合もあります。再生して判断してください。字幕位置、音声の明瞭度、内容の正しさは未検査です。自動修復は行いません。';
}
