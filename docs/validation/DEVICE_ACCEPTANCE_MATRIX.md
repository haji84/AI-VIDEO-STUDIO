# Physical device acceptance matrix (local-first)

Status is `NOT_RUN` until an **actual physical device** produced an attributable result. Do not promote synthetic or emulated browser observations to real-device PASS.

| Target | Device/browser decode short MP4 | Local frame analysis | Japanese TTS speech | Caption/effect preview | Output MP4 creation and replay | N-camera/audio/export QA |
| --- | --- | --- | --- | --- | --- | --- |
| iPhone / Safari | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Android / Chrome | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Windows / Chrome or Edge | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Mac / Safari or Chrome | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |

## Repeatable procedure

1. Open `prototypes/device-lab/DEVICE_LAB.html` **locally** on a compatible device. If iPhone Files/Safari refuses to run scripts from a local HTML file, report this as a **BLOCKER**, do not assume the test passed. Public hosting requires a separate deployment/security decision.
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
- Physical Safari / physical Android Chrome / physical desktop browsers: **NOT_RUN**.
- The device lab does not upload source files, but the OS browser's speech voice implementation may use external services. Offline guarantees require airplane-mode test.
