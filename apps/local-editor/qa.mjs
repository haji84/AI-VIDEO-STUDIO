/** Read-only navigation from a saved render finding to its exact project. */
export function inspectionMessage(report){
  const inspection=report?.inspection;
  if(inspection?.schema==='aivs-output-inspection-v1'){
    if(inspection.status==='CHECKED_LIMITED')return '検査対象の範囲で要確認箇所はありません。内容や聞き取りやすさは再生して確認してください。';
    if(inspection.status==='NEEDS_REVIEW')return '確認したい箇所があります。完成動画と検査記録を確認し、必要なら編集して作り直してください。';
    if(inspection.status==='FAILED_TECHNICAL')return '技術検査に失敗しました。検査記録を確認し、編集内容から作り直してください。';
  }
  return '黒画面・無音・音量ピークは未検査です。今の編集内容で作り直すと検査できます。';
}
export function isWholeOutputFinding(finding){
  return finding?.scope==='GLOBAL_MAXIMUM_NO_PEAK_TIMESTAMP'||
    ['TRUE_PEAK_AT_OR_ABOVE_REFERENCE','TRUE_PEAK_UNAVAILABLE'].includes(finding?.code);
}
export function reviewTarget(report,project,findingIndex){
  if(report?.projectId!==project.projectId||report?.projectRevision!==project.revision)
    throw new Error('OUTPUT_PROJECT_CHANGED: 出力後に編集されています。今の内容で動画を作り直してください');
  const finding=report.inspection?.findings[findingIndex];if(!finding)throw new Error('FINDING_NOT_FOUND');
  if(isWholeOutputFinding(finding))throw new Error('FINDING_NOT_LOCALIZED: 全編の測定値で、特定のカットは示していません。完成動画全体を確認してください');
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
  const measurement=i.truePeakMeasurement,reference=i.thresholds?.truePeakReviewDbTP;
  const measured=i.detectors?.includes('true-peak-ebur128-v1')&&measurement?.method==='ffmpeg-ebur128-peak-true'&&measurement.unit==='dBTP';
  let peak='サンプル間の音量ピークは未検査です。';
  if(measured&&i.truePeak==='MEASURED'&&Number.isFinite(measurement.maximumDbTP)&&measurement.reportedPrecisionDb===.1&&Number.isFinite(reference))
    peak=`サンプル間を含む音量ピークは${measurement.maximumDbTP.toFixed(1)} dBTP（0.1 dB刻み）です。${reference.toFixed(1)} dBTP以上を確認の目安にしています。`;
  else if(measured&&i.truePeak==='SILENT'&&measurement.maximumDbTP===null)peak='音量ピークの測定対象はデジタル無音です。';
  else if(i.truePeak==='NOT_APPLICABLE')peak='音声トラックがないため、サンプル間の音量ピークは未計測です。';
  return base+(freeze?'1秒以上ほぼ変化しない静止・フリーズ候補も検査します。':'静止・フリーズ候補は未検査です。')+
    (cadence?'出力のフレーム間隔の変化を集計します。':'フレーム間隔の検査は未完了です。')+
    peak+
    '意図した静止画や可変のフレーム間隔の場合もあります。再生して判断してください。字幕位置、音声の明瞭度、内容の正しさは未検査です。自動修復は行いません。';
}
