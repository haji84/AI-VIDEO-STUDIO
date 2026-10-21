# iPhone target: selected footage + original sound + caption, 2026-10-21

## Goal and evidence boundary

The owner's next acceptance requirement is to **create and replay an MP4 on the actual iPhone using the selected real footage, its original sound, and a visible caption**. Hearing narration separately does not establish original soundtrack retention or that the output file contains audio.

This branch adds an isolated **source-only** button to the existing `audio.html` diagnostic, while retaining the separate experimental BGM/SE/narration mode. The source-only button forces the original soundtrack on and excludes all added audio files even when their file inputs remain populated. It renders a **maximum four-second 640×360** diagnostic MP4 and requests manual visual/audible and Files-app replay confirmation.

## Local independent verification (NOT iPhone)

- Node test: **14/14 PASS** (11 preexisting tests + three new guards for source-only routing, signal metering without inflated PASS, and explicit user acceptance).
- Desktop Linux Chromium end-to-end with locally generated **8-second H.264/AAC synthetic source** containing a 440-Hz soundtrack:
  - Source-only mode while BGM and narration files were deliberately selected and the original track UI checkbox was off: generated ~4-second MP4, H.264 video and **Opus** audio, browser replay advanced, FFmpeg full-file decode PASS, PCM spectrum strong at **440 Hz (~249)** and negligible at **660 Hz (~0.017)** and **990 Hz (~0.003)**.
  - Regression test using added BGM/narration: generated ~4-second MP4, browser replay advanced, decoded output PCM contained 440, 660 and 990 Hz; no browser script errors.
  - Reported source and output audio RMS meter values indicate active signals, but do **not** independently prove a particular audio stream survived MP4 muxing. FFmpeg PCM analysis supplies the stronger local proof.
- Manual acceptance checkbox logic separately tested: before user feedback it remains `INCOMPLETE`, and becomes `USER_REPORTED_BROWSER_SOURCE_AUDIO_CAPTION_PASS` only after the special source-only result, confirmed playback advancement, and all four user confirmations.
- Source footage in these tests is programmatically generated; **the user's actual footage was not processed** and no original media or audio samples are committed.

## Remaining unknowns / constraints

- **iPhone Safari source-with-original-audio export, output saved to Files, and playback: NOT RUN.** No user-submitted iPhone result exists for this source-only feature.
- Desktop Chromium encoded Opus audio inside an MP4 container. iPhone codec support is not implied by the .mp4 extension or MediaRecorder MIME declaration; user should check whether the file plays with **audible** original sound.
- The browser test is not AVFoundation native editing, continuous full-video export, multiview editing, 4K rendering, Japanese AI voice file generation, license clearance, or semantic scene understanding.
- Raw source media remains in browser Object URLs; `connect-src 'none'` and no external dependencies. The public GitHub repository contains code and anonymous aggregate evidence only; never upload raw videos, sounds, filenames, tokens, personal information.

## Next physical run

1. On the iPhone, open the existing approved static diagnostic `https://haji84.github.io/AI-VIDEO-STUDIO/audio.html` in Safari.
2. Choose an owned short MP4 that **actually contains identifiable original sound**, preferably 10–30 seconds; leave BGM, SE and narration empty.
3. Tap the **① 元動画＋元音声＋字幕だけでMP4作成** button. Wait without leaving Safari.
4. Tap **出力MP4を再生して検査**, then **MP4を保存**. Replay the saved MP4 from the iPhone Files app. Check selected footage, caption and original audio separately.
5. Mark the four manual checks only if actually true. Save and upload **only** `aivs-audio-mix-results.json`. If there is any failure, retain the status and error without assuming success.

Go/no-go: until that physical report, this milestone is `IPHONE_SOURCE_AUDIO_CAPTION_UNVERIFIED`.
