/** Opt-in audible replay from the already verified completed MP4.
 * This never renders a new mix. It MUST NOT adopt a previous-revision output.
 */
export function completedClipWindow(project, clipId, atSec = 0) {
  if (!project || !Array.isArray(project.timeline) || typeof clipId !== 'string' ||
      !Number.isFinite(atSec) || atSec < 0) return null;
  const clip = project.timeline.find(c => c.clipId === clipId);
  if (!clip || !Number.isFinite(clip.startSec) || clip.startSec < 0 ||
      !Number.isFinite(clip.durationSec) || clip.durationSec <= 0 ||
      !Number.isFinite(clip.speed) || clip.speed <= 0) return null;
  const total = clip.durationSec / clip.speed;
  if (!Number.isFinite(total) || atSec >= total) return null;
  const duration = Math.min(7, total - atSec);
  if (!(duration > 0.0001)) return null;
  const startSec = clip.startSec + atSec;
  const endSec = startSec + duration;
  if (!Number.isFinite(endSec)) return null;
  return {clipId, cutStartSec: atSec, cutEndSec: atSec + duration,
    startSec, endSec, durationSec: duration, totalCutSec: total};
}

export function reportMatchesCompletedProject(report, project) {
  return !!(report && project && report.technical_ok === true &&
    typeof report.sha256 === 'string' && /^[0-9a-f]{64}$/.test(report.sha256) &&
    report.projectId === project.projectId &&
    Number.isSafeInteger(report.projectRevision) && report.projectRevision === project.revision &&
    report.inspection?.status !== 'FAILED_TECHNICAL');
}

export function mountCompletedAudioPreview({container, video, current, selected, request,
  mediaURL, outputGeneration = () => 0} = {}) {
  const button = document.createElement('button');
  const status = document.createElement('p');
  button.type = 'button'; button.textContent = '最新の完成MP4で音付き確認';
  status.className = 'muted'; status.setAttribute('role', 'status');
  container.append(button, status);
  let generation = 0, active = null, busy = false, closed = false;
  const startInput = document.getElementById('saved-preview-start');
  const snapshot = () => {
    const state = current(), project = state?.session?.project,
      clip = project?.timeline?.[selected()], job = state?.job;
    const localText = document.getElementById('saved-preview-start')?.value ?? '0';
    const local = localText.trim() === '' ? NaN : Number(localText);
    const window = completedClipWindow(project, clip?.clipId, local);
    return {project, job, window, outputGeneration: outputGeneration()};
  };
  const keyOf = s => [s.project?.projectId, s.project?.revision, s.job?.id,
    s.window?.clipId, s.window?.cutStartSec, s.outputGeneration].join('|');
  function invalidate(message = '') {
    generation++;
    // The audible player is a dedicated read-only view. Invalidation must
    // release its old media, not leave a stale completed export playable.
    video.pause(); active = null; video.removeAttribute('src'); video.load(); video.hidden = true;
    busy = false; if (message) status.textContent = message;
  }
  function show() {
    if (closed) return;
    const s = snapshot();
    if (active && active.key !== keyOf(s)) invalidate('編集や選択が変わりました。もう一度確認してください。');
    const available = s.job?.status === 'PASS' &&
      /^\/exports\/[a-f0-9]{32}$/.test(s.job?.download || '') && !!s.window;
    button.disabled = busy || !available;
    if (!available && !busy) status.textContent = '現在の編集版の完成MP4が必要です。完成動画を作ってから確認してください。';
  }
  const onBoundedPlayback = () => {
    if (!active || !Number.isFinite(video.currentTime)) return;
    if (video.currentTime < active.window.startSec - 0.05) {
      video.pause(); video.currentTime = active.window.startSec;
      status.textContent = '選択したカットの範囲外です。再生位置を戻しました。';
      return;
    }
    if (video.currentTime >= active.window.endSec - 0.02) {
      // Keep the active boundary, including after a user presses native Play.
      video.pause();
      status.textContent = '選択したカットの確認が終わりました。';
    }
  };
  const onStartInput = () => { if (closed) return; invalidate('開始位置が変わりました。もう一度確認してください。'); show(); };
  startInput?.addEventListener('input', onStartInput);
  for (const event of ['timeupdate', 'play', 'seeking']) video.addEventListener(event, onBoundedPlayback);
  button.onclick = async () => {
    if (closed || busy || button.disabled) return;
    const s = snapshot(), key = keyOf(s), id = ++generation;
    if (!s.window || s.job?.status !== 'PASS') return;
    busy = true; button.disabled = true;
    status.textContent = '現在の完成MP4と編集版の一致を確認中…';
    try {
      const report = await request('/api/qa');
      if (closed || id !== generation || key !== keyOf(snapshot())) return;
      if (!reportMatchesCompletedProject(report, s.project)) {
        status.textContent = '完成MP4が現在の編集版と一致しません。再度完成動画を作ってください。';
        return;
      }
      const window = s.window;
      active = {key, window};
      const src = mediaURL(s.job.download);
      if (video.getAttribute('src') !== src) video.src = src;
      video.hidden = false; video.muted = false;
      const start = async () => {
        if (closed || id !== generation || !active || key !== keyOf(snapshot())) return;
        video.pause();
        if (Math.abs(video.currentTime - window.startSec) > 0.03) video.currentTime = window.startSec;
        const afterSeek = async () => {
          if (closed || id !== generation || !active || key !== keyOf(snapshot())) return;
          if (video.seeking) {video.addEventListener('seeked', afterSeek, {once:true}); return;}
          status.textContent = `完成MP4の ${window.startSec.toFixed(2)}–${window.endSec.toFixed(2)} 秒を音付き確認中（カットの終端で停止）`;
          try {await video.play();}
          catch (error) {if (id === generation) status.textContent = '再生できません。動画の再生ボタンで確認してください。';}
        };
        await afterSeek();
      };
      if (video.readyState >= 1) await start();
      else video.addEventListener('loadedmetadata', start, {once: true});
    } catch (error) {
      if (id === generation && !closed) status.textContent = '完成動画を確認できませんでした。再書き出し後に試してください。';
    } finally {
      if (id === generation && !closed) {busy = false; show();}
    }
  };
  show();
  return {show, invalidate, close() {if (closed) return; closed = true; invalidate();
    startInput?.removeEventListener('input', onStartInput);
    for (const event of ['timeupdate','play','seeking']) video.removeEventListener(event, onBoundedPlayback);
    button.disabled = true;}};
}
