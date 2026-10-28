# AI VIDEO STUDIO | Roadmap

Evaluation is based on verified, usable product requirements, not number of commits / PRs / AI calls.

Current checkpoint: 2026-10-29 JST. Caption PR #19 and true-peak PR #20 are
integrated; latest implementation basis is main
`80259d2f43c53254ac3b4ab7da87cef69e19a558`, tree
`d334434741245181ce251384f9ba08fd21156967`. PR #20 records its postmerge checks.
The existing manual gain path is now TESTED_SYNTHETIC: -6 dB edit, Undo/Redo,
save/restart/reopen and fresh MP4/report; +2.6 -> -4.2 dBTP, previous evidence
and source bytes retained. New generated-media HTTP acceptance + inspection
suite: 9/9 PASS. The carrying PR records this acceptance change's integration.
These slices do not complete F8, any platform Goal or the product. Hosted CI NOT_RUN.

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

## Current verified M1 slice (Work, updated 2026-10-29 JST)

- [x] Portable v1 project/time/source/audio/effect contract, strict reload and undo/redo; actual local disk roundtrip tested.
- [x] Streamed source hash/relink, fail-closed manifest bridge, real saved 3-camera caption/source-audio MP4 and full decode on Linux.
- [x] Fix renderer protected-file/temp/report aliases, verify source hash/capabilities at render boundary, migrate actual legacy IDs/profile.
- [x] Bind persisted four-bus timeline to FFmpeg mix; actual synthetic PCM checks timing, mute, loop, fade, ducking and delayed source audio (M2, Linux only).
- [x] Local desktop server import/edit/history/restart/reopen and real MP4 download API; preserve explicit audio/effects and reject stale edits (M3, synthetic).
- [x] Whole-output decode/frame-count check, black/silence/sample-peak evidence, output-hash/revision-bound report persistence and explicit manual re-edit -> fresh inspected MP4 (M4-A, synthetic Linux).
- [x] Per-audio timing/trim/speed/gain/loop/fade and explicit removal connected to common save/history/actual export; protect independent audio from later video auto-follow (A1, synthetic HTTP/PCM, GUI acceptance blocked).
- [x] Local sync candidates, bound evidence, explicit review/save/reopen, shared-clock camera choice and nonzero-offset camera export (S1, synthetic). Drift/real-device confirmation remains open.
- [x] Saved editor first-cut proposal from existing low-level signals; explicit source/revision-bound preview/apply, protected manual effects/four-bus audio, history/restart/re-edit/actual MP4 (P1, synthetic). Learned semantics and physical devices remain open.
- [x] Whole-output still/freeze candidates and aggregate PTS cadence evidence, warning-only explicit review/re-edit; old report coverage honest (F8-B, synthetic only).
- [x] Measured long/multiline static captions, Japanese glyph coverage or explicit failure, saved evidence/history and actual MP4 audio preservation (PR #19, synthetic Linux/Pillow 13 only).
- [x] Reference-checked true-peak measurement in the existing output QA report, with intersample-overshoot, safe/silent/unavailable/partial fixtures and honest legacy display. Global results cannot identify an edit clip. TESTED_SYNTHETIC; not a limiter or playback guarantee.
- [ ] Complete F8 device caption acceptance, intelligibility/true-peak guarantees, bounded automatic repair and real-device evidence. Limited technical checks are not full output quality acceptance.
- [x] Explicit audio-gain edit -> Undo/Redo/save/restart/reopen -> fresh MP4/true-peak report, preserving previous output/report and original input (synthetic HTTP/PCM; +2.6 -> -4.2 dBTP after -6 dB edit). Not a GUI, limiter or intelligibility guarantee.
- [ ] Restore/select earlier verified outputs/reports after restart. Existing files remain on disk, but only the latest is re-indexed. Bind both hashes, reject missing/changed evidence and retain stale-project checks. NOT_STARTED; exact scope in docs/work/WORK_CHECKPOINT.md.
- [ ] Actual browser operation/replay acceptance for new GUI (BLOCKED/BROWSER_EXECUTABLE_UNAVAILABLE; the 2026-10-29 JST official Chromium download returned a 195-byte HTML error, not a browser). Resume the existing temporary-local-media script only when a compatible browser is available; do not repeat the same failed download.
- [ ] Novice usability, complete audio/effect controls, preview/export parity, native platforms and real-user tests.

These M1 items are TESTED_SYNTHETIC. Broader P0/platform boxes stay open.

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


## Latest iPhone audio-buffer result (2026-10-21)

- [x] Physical iPhone iOS `DECODED_BUFFER` Web Audio source and output signal are nonzero. Owner checked original sound audible in output and saved Files replay; source/caption visible.
- [ ] Page's explicit **output MP4 replay diagnostic** still `NOT_RUN`. Retest, save JSON, verify `REPLAY_ADVANCED` and all owner flags before **user-reported browser acceptance**.
- [ ] Independent MP4 codec/PCM inspection from a non-sensitive exported file and A/V sync measurement.
- [ ] Separate iPhone BGM/SE mixing; SE over the prototype's 90-second guard currently rejected. Native/full-duration/multi-camera remain future requirements.
