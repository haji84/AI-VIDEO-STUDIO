# AI VIDEO STUDIO | Roadmap

Evaluation is based on verified, usable product requirements, not number of commits / PRs / AI calls.

## P0 Local-first mobile foundation

- [ ] iPhone: capability and performance test with owned footage, Japanese speech and effects.
- [ ] Portable local non-destructive project schema (sources, cameras, offsets, timeline, effect keyframes, narration, four audio buses, history).
- [ ] iPhone prototype: import -> timeline -> caption/effect -> preview -> local MP4 export -> reopen.
- [ ] Deterministic renderer: preview and exported MP4 have matching timing and visible effects.
- [ ] Four-bus audio mixing: source, narration, BGM, SE; ducking, fade, repeat and timeline persistence.
- [ ] Japanese offline voice generation with reusable file output and device performance evidence.
- [ ] Beginner UI: one-tap effects, thumbnails, clear undo/redo and recoverable state.

## P1 Multi-device / AI

- [ ] Android Media3 native adapter, benchmark parity.
- [ ] Windows and macOS desktop adapters; do not require ZBook uptime.
- [ ] 1–N camera synchronization, drift/silence handling and confidence gating.
- [ ] Per-device local ASR and light scene/pose/object analysis, real measurements.
- [ ] Content-based edit proposal and bounded independent quality checks.
- [ ] Multi-source real-world acceptance with actual GoPro/Insta360 footage when accessible, including 360-degree source constraints.

## P2 Optional cloud (future consent required)

- [ ] Opt-in private sync / CPU or GPU background job.
- [ ] Per-job cost quote, owner acceptance and safe budget gates; optional R2 storage.

## Deferred product commercialization

- [ ] Stripe, user accounts, subscription tiers and billing.
- [ ] Public commercial launch, support, rights and privacy compliance.
- [ ] GORIQ integration for development workflow only, separately authorized.

No item becomes checked merely because a design document or test stub exists.

## L0 baseline added in development (2026-10-21)

- [x] Dependency-free numerical **first-cut proposal** on 1/2/3+ synthetic cameras, tested in Node (10 cases). This is not semantic AI editing.
- [x] Genuine FFmpeg short synthetic 3-camera signal extraction -> proposal -> video export -> full decode integration test in Linux container.
- [ ] Review proposal quality against actual owned multi-camera footage and establish timing/semantic metrics.
- [ ] iPhone / Android / Windows / Mac real-device evidence from `prototypes/device-lab/DEVICE_LAB.html` and future native app; **all physical devices still pending**.


## New audio integration milestone (2026-10-21)

- [x] Four-route source/BGM/SE/narration **short browser test prototype**, verified on synthetic files in desktop Chromium; static tests 11/11 PASS and actual exported PCM frequency evidence.
- [ ] Physical iPhone Safari export with real selected source + optional owned BGM/SE; verify audio codec, output playback and audible track correctness.
- [ ] Android Chrome and desktop manual browser runs; record anonymous JSON and independent output QA.
- [ ] General full-duration / high-resolution audio exporter with frame timestamps, ducking, voice file synthesis and durable project timeline; device-native backends where needed.


## iPhone original audio export check

- [x] Implement source-only short selected-video captioned MP4 diagnostic, with no mix of extra tracks, analyzer readings and explicit user verification; desktop Chromium & FFT pass.
- [ ] Physical iPhone Safari: save a selected-source MP4 with visible caption and original audio, replay the saved file in Files, submit anonymous JSON.
- [ ] For iPhone failure, choose the smallest native iOS AVFoundation export slice instead of retrying identical browser recording without evidence.
- [ ] Expand only after success: BGM+SE mix, actual Japanese AI-voice file, full-duration and high-resolution export.


## Owner iPhone visual/audible acceptance (2026-10-21)

- [x] Owner checked the four short browser output criteria: real selected video, test caption, audible original audio and Files-app saved-MP4 playback. This is **USER-REPORTED PASS**, not independent codec validation.
- [ ] Capture anonymized JSON/codec observations for the same iPhone result, without uploading sensitive video.
- [ ] Real iPhone BGM+SE mix export and playback; verify original sound intelligibility, audio sync and saved MP4 support.
- [ ] Complete reusable timeline, long video/4K export, high-quality Japanese TTS audio file creation and native mobile backends.


## iPhone original-audio repair, latest evidence 2026-10-21

- [x] Analyze owner-provided JSON: source-only MP4/replay and visible caption pass, but original audio absent; zero source/output WebAudio meters. Earlier owner screenshot marked provisional, this detailed failed audio check takes precedence.
- [x] Prototype a bounded 96 MiB `decodeAudioData` + `AudioBufferSource` iOS compatibility path and no-success-on-silence guard. Verify on desktop Chromium using synthetic audible and deliberately silent-start MP4s.
- [ ] **Real iPhone Safari**: compatibility page source-only output contains original sound, visible source video/caption, Files-app saved playback, and nonzero source/output meters. Preserve failure if unsuccessful.
- [ ] Only then re-test local BGM/SE within memory/duration budgets; high-resolution and native mobile editing remain separate goals.
