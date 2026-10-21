# Physical device acceptance matrix (local-first)

Status is `NOT_RUN` until an **actual physical device** produced an attributable result. Do not promote synthetic or emulated browser observations to real-device PASS.

| Target | Device/browser decode short MP4 | Local frame analysis | Japanese TTS speech | Caption/effect preview | Output MP4 creation and replay | N-camera/audio/export QA |
| --- | --- | --- | --- | --- | --- | --- |
| iPhone / Safari | PASS, short playback advancement (111.09s source; not full-duration playback) | PASS, 3 sampled frames | PASS browser playback only; audio file NOT_RUN | PASS synthetic caption preview | PARTIAL, 178386-byte synthetic MP4 generated; independent replay NOT_RUN | NOT_RUN |
| Android / Chrome | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Windows / Chrome or Edge | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Mac / Safari or Chrome | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |

## Repeatable procedure

1. For iPhone Safari, open the already approved static device diagnostic at `https://haji84.github.io/AI-VIDEO-STUDIO/` over HTTPS; the product editor is not publicly deployed. For a local developer test, open `prototypes/device-lab/DEVICE_LAB.html` directly on a compatible device. Local HTML sandbox restrictions may prevent JavaScript execution; report that separately. The public diagnostic is a client-side page and does not upload selected video.
2. Tap **端末の機能を調べる** and save the capability results.
3. Select a small, non-sensitive MP4 recorded with that device; tap **短い映像を解析** and verify it displays 3 sample frames' aggregate metrics. No file contents are transmitted.
4. Tap **日本語音声を再生**, listen on a physical speaker, and rate naturalness. The browser TTS result is **playback-only**; it cannot prove audio file synthesis.
5. Tap **エフェクト再生**. If an MP4 MediaRecorder and captureStream are supported, try **MP4出力を試す**; play the generated synthetic animation. If unsupported, report it as such, not a regression in the eventual native app.
6. Download the `aivs-device-results.json` and provide it for independent inspection, excluding personal photos/video. Keep raw private video local.
7. Separately, once a native iOS/Android implementation exists, test actual selected-video export through AVFoundation/Media3, media/audio synchronization, undo/reopen, app backgrounding and render resume.

## Evidence and release requirements

- Record hardware class, OS/browser versions, video metadata (not names), measured runtime, capability flags, output hashes if a native export exists, errors, and test timestamp.
- Do **not** record phone identifiers, GPS, faces, source file names, personal audio, source bytes, or credentials in public GitHub.
- Browser playback or a synthetic MP4 export is not equivalent to a native video editing pipeline.
- The application can only claim device support when actual native app operations and output validation have been observed.

## Current non-device smoke (does not change NOT_RUN statuses)

- Linux-hosted headless Chromium: 3-second artificial MP4 decoded; frame luminance sampled; animated caption previewed; 2.499-second synthetic MP4 recorded and FFmpeg-decoded.
- Browser TTS playback output and recording/export of synthesized Japanese voice: **NOT_RUN**.
- Physical iPhone Safari browser smoke: **PARTIAL/PASS by column above** from owner-provided JSON (selected-video full replay and native export not proved). Physical Android Chrome and physical desktop browsers: **NOT_RUN**.
- The device lab does not upload source files, but the OS browser's speech voice implementation may use external services. Offline guarantees require airplane-mode test.

## 2026-10-21 owner-supplied iPhone Safari run

- Source: one uploaded anonymous Device Lab v1 result JSON, timestamp 2026-10-21T04:15:38.681Z. Results are owner-provided app observations, not independently authenticated platform telemetry.
- Selected MP4: 214.31 MiB, 111.09 seconds; browser element advanced playback and three frames were sampled (not continuous whole-video playback).
- Japanese browser speech synthesis: two voices detected and `PLAYBACK_FINISHED`; no file was generated and subjective quality score was not recorded.
- Synthetic caption preview finished, and a 178386-byte synthetic MP4 was reported as created. Independent replay/decode of that MP4 is **NOT VERIFIED**.
- No selected-video caption export, BGM/SE mixing, native iOS renderer, or semantic AI analysis has been accepted.
- Details: `docs/validation/IOS_SAFARI_BROWSER_RESULT_2026-10-21.md`. The public repository stores no source video or filename.


## Selected-video export candidate, 2026-10-21

- New experiment: a separate `選んだ動画にテロップを付けてMP4作成` control records up to four seconds of the actual selected video with Japanese caption as a **silent** 640×360 MP4, then offers an independent replay check and manual download link.
- Desktop Chromium generated synthetic H.264/AAC input → caption output H.264 MP4 + replay + FFmpeg decode: PASS (non-iPhone).
- iPhone Safari source-derived MP4+caption output/replay: **NOT_RUN**. Do not substitute the prior iPhone artificial-test-clip result.
- Detailed trace: `docs/validation/SELECTED_VIDEO_BROWSER_EXPORT_2026-10-21.md`.
