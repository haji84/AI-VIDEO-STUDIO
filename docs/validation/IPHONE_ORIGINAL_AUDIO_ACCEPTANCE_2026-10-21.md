# iPhone real-source audio + caption diagnostic, 2026-10-21

## Purpose
The owner observed audible narration, but it was **not established whether the original soundtrack was preserved inside the saved captioned MP4**. Do not treat the narration test as verification of original audio.

## Change and scope
- Updated **static diagnostic only**: `prototypes/device-lab/AUDIO_MIX_LAB.html`.
- New clearly labeled **source-only** output button forces original video audio and excludes *all* imported BGM, SE, and narration, even if these are selected in the UI.
- Existing optional additional-audio mixer remains under a separate collapsible control.
- A browser-side Web Audio analyser records max source/output RMS and sample counts. Numeric RMS proves only a signal was detected in the live graph, **not** the output MP4's audio codec/content.
- Exports a local **up-to-4-second, 640×360** MP4 with caption; separates created-Blob status, browser playback advancement, and owner's subjective yes/no checks for real footage, subtitle, original sound and iPhone Files saved replay.
- A user-completed checklist records `USER_REPORTED_BROWSER_SOURCE_AUDIO_CAPTION_PASS`, explicitly **not independent/native validation**. No auto PASS based only on a screenshot or on attached audio tracks.

## Verification in Linux/desktop development environment
- 14/14 Node static tests and inline `node --check` passed.
- Playwright headless Chromium synthetic video with **440Hz original source audio**, generated 660Hz BGM and 990Hz narration, with extra audio preselected and the original checkbox deliberately unchecked:
  - Source-only button forced original audio and ignored extras, producing **572,829-byte MP4**, **3.997s**, H.264 + Opus.
  - Local FFmpeg full-file decode and browser output playback passed.
  - FFT at t=1.25s: 440Hz ~249.788, 660Hz ~0.017, 990Hz ~0.002, so added tracks were not present.
  - Web Audio peak RMS (source) 0.0971; no JavaScript page errors.
  - Before manual checkboxes: `INCOMPLETE`; after four explicit checks, the UI moved to **user-reported** status. Simulated checkbox operation is not evidence of an actual user's review.
- Extras regression: original+BGM+narration still exports. H.264 + Opus, **572,497-byte MP4**, ~4.015s; FFT detects 440Hz ~246.744, 660Hz ~62.528, 990Hz ~167.996. Full file decode and browser replay passed.
- Source footage and audio in those tests were synthetic. No private test media committed.

## Actual iPhone status
- Owner statement: 'ナレーションは音がなった', which shows a sound was heard. **Unclear whether it was in the generated MP4 or only during a preview**; not proof of original-audio preservation.
- Original video + original audio + caption export on a **physical iPhone Safari remains NOT VERIFIED** pending the new JSON and owner checks.
- Safari may refuse H.264+Opus MP4 or not route MediaElementSource audio the same way Chromium does. On `MP4_RECORDING_UNSUPPORTED`, `AUDIO_MIX_EXPORT_FAILED`, `REPLAY_FAILED` or audible silence, preserve the failure and investigate an OS-native AVFoundation fallback instead of claiming PASS.
- No cloud upload, paid compute, R2 activation, source video in GitHub, native editor, or GORIQ operation.

## Repeatable phone test
1. Open `https://haji84.github.io/AI-VIDEO-STUDIO/audio.html` in Safari. Pick a short non-sensitive MP4 with **audible sound in its first 4 seconds**.
2. Tap the prominent **① 元動画＋元音声＋字幕だけでMP4作成** (not the extra audio button).
3. Use the page's **出力MP4を再生して検査** button; listen specifically for the **original video's** audio.
4. Save the MP4, open the saved copy in the Files app, and confirm source footage, visible subtitle and audible original audio. Check the four boxes only if true.
5. Save only the anonymous results JSON and share that report, not the private video.
