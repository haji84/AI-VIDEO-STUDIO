# Browser audio + caption export trial, 2026-10-21

## Evidence and scope

- Source: `prototypes/device-lab/AUDIO_MIX_LAB.html`, strictly static, no external assets/API, CSP `connect-src 'none'`. Works on selected local videos and user-selected local audio files. No source footage, audio assets or identifiers committed.
- Runtime: Linux development container, Chromium headless, synthetic 8-second testsrc2 H.264 video with 440 Hz AAC original soundtrack; generated WAV tones 660 Hz BGM, 880 Hz SE, 990 Hz narration. These are test tones, not actual AI-generated speech or licensed audio assets.
- A **four-second, 640×360** animated-caption MP4 was captured by Chromium MediaRecorder from real frames of the selected synthetic video, with Web Audio mixed into the output MediaStream.
- Three browser integration runs: source audio only, BGM with source unchecked, and source + BGM + SE + narration. All three recorded valid MP4 blobs, with an H.264 video and Opus audio stream, and FFmpeg decoded them. The four-bus output was about **519,975 bytes and 3.982 seconds** in one measured run. Browser output replay progressed and no page script errors occurred.
- Python FFT of the output PCM independently verified frequency peaks at the expected windows. At t=1.35 seconds, the complete mix had 440 Hz, 660 Hz, 880 Hz and 990 Hz present; at t=2.45 seconds 880/990 Hz were absent. The source-only output showed 440 Hz and no 660 Hz. With original unchecked and BGM selected, 660 Hz was present and 440 Hz was absent. This proves separate routing and basic timing in the **desktop development environment**.
- Static Node `node --test prototypes/device-lab/audio-mix.test.mjs`: **11/11 PASS** in the local development container.
- The source MP4 was read via a local Object URL, not modified. Generated synthetic media is excluded from the public repository.

## Codec and QA caveats

- Chromium output negotiated **H.264 video + Opus audio inside MP4**, despite trying MP4/AAC MIME candidates first. **iPhone Safari interoperability is unverified.** Do not equate the `video/mp4` MIME with AAC audio.
- Decoder surfaced non-monotonic DTS warnings in some FFmpeg runs even though full file decoding completed. Exact frame pacing / A/V drift still requires independent QA. Do not label broadcast-ready quality.
- User's iPhone previously confirmed only a **silent synthetic clip**. The selected-video silent MP4 export and **new audio mix export are NOT RUN** on actual iPhone Safari.
- Android, native iOS editing, 4K/multicamera, the full original video length, AI-created Japanese speech and auto ducking are not part of this test.
- Audio file inputs currently support at most 12 MiB each and decode up to 90 seconds; on weak devices this may still hit resource limits.
- Optional cloud resources, R2, GORIQ, subscription and public product editor remain unchanged.

## Next physical acceptance

1. In Safari open the public **diagnostic-only** path `https://haji84.github.io/AI-VIDEO-STUDIO/audio.html`. Select a short owned non-sensitive MP4 with spoken audio, leave other tracks empty first, export, replay and listen for actual original sound.
2. Repeat with small user-owned BGM and SE. Use narration file only if legitimately owned. Report if an iOS browser does not support recording the mixed audio into MP4.
3. Save only the anonymous `aivs-audio-mix-results.json` and send it for comparison. Do **not** upload original footage/audio to public GitHub.
4. In a later separate native iOS implementation, confirm long/4K output, codec, audio timing, backgrounding/resume and actual use of generated Japanese AI voice.
