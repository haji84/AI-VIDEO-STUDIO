# Selected source video + caption browser export trial (2026-10-21)

## Evidence / status

- Source implementation: `prototypes/device-lab/DEVICE_LAB.html` (no external JS/CSS, no user video uploaded).
- Synthetic input: local 10-second H.264/AAC MP4 created with FFmpeg testsrc2 + sine. **This is test footage, not the user's GoPro/Insta360 footage.**
- Actual decoded video frames from the selected file are drawn on a 640×360 canvas, with a visible animated Japanese caption; the canvas is captured through MediaRecorder as MP4 where supported.
- Headless **desktop Chromium** run: `SOURCE_CAPTION_MP4_CREATED`, 4-second silent H.264 MP4; browser re-open and playback advancement: `REPLAY_ADVANCED`; independent FFprobe recognized MP4/H.264; FFmpeg whole-file decode succeeded.
- At output time ~2s, tested pixels outside the caption area were consistent with input synthetic video colors; the caption panel was present at the output bottom. This establishes that the output used the selected source, not merely the prior synthetic blue caption background.
- Static Node tests: 8/8 PASS for syntax, no external requests, CSP, controls, recorder gates, explicit audio/length limits and replay status.
- A physical **iPhone Safari real selected-source export and replay is NOT VERIFIED**. Android and desktop in-device testing remain separate. The earlier iPhone test only generated a synthetic test MP4.

## Explicit limitations

- This is a **4-second maximum, silent, 640×360** proof of source-video + caption composition. It is *not* complete training-video editing, original soundtrack mix, BGM, SE, AI narration, multi-camera composition, 4K export or neural video understanding.
- Safari codec, backpressure, visibility/backgrounding, device heat/battery and file-picker behavior must be measured on iPhone. If a device rejects the codec or recording, report failure rather than claiming success.
- The browser gets a local object URL for selected video; source bytes aren't sent to the server. CSP has `connect-src 'none'` and no external scripts/media imports. Browser-provided OS speech synthesis is a separate facility and may not be offline.
- GitHub Pages publishes **the test interface only**. No raw test source, original video, personal data, tokens or rendered output were committed.
- Output replay confirmation is tracked separately from the recording's `onstop` / Blob creation. A Blob is not independent validation of video replay or quality.

## iPhone repeat test (owner)

1. In Safari open `https://haji84.github.io/AI-VIDEO-STUDIO/`; select an owned, non-sensitive short MP4 (a few seconds).
2. In item 2 preview the footage and select an appropriate playback position; in item 5 tap `選んだ動画にテロップを付けてMP4作成`.
3. Do not background Safari until rendering finishes. Use `出力動画の再生を検査` to confirm the newly generated video advances, inspect the original background and Japanese caption, and tap `字幕付きMP4を保存` if correct.
4. Send the generated JSON result only. Do **not** upload the private source or final video to GitHub. Save `SOURCE_EXPORT_FAILED`, `UNSUPPORTED`, or `REPLAY_NOT_CONFIRMED` without guessing the reason.

Once real Safari output is observed, separately evaluate original audio preservation and voice/BGM/SE mixing. Never promote the browser test to iOS-native export acceptance.