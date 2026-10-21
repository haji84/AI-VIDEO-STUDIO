# AI VIDEO STUDIO | Project State

Updated: 2026-10-21
Product identity: independent repository, not GORIQ.
Version label: v0.3.1 design and prototype.
Production release: **NO**.
Public video-editing product deployment: **NO**. A static, public GitHub Pages **device diagnostic page only** is deployed from the separate `gh-pages` branch; no source-media upload is implemented.
Subscription / billing: deferred.

## Current Work implementation (M1, 2026-10-21)

**Product: IN_PROGRESS, not complete.** Portable project/save/reopen and checked
FFmpeg handoff are `TESTED_SYNTHETIC`. See
`docs/validation/DURABLE_PROJECT_M1_2026-10-21.md` and `packages/project/README.md`.
Current run: 114 tests pass (88 Node, 13 engine/cloud, 3 audio, 10 legacy).
Saved/reopened/relinked three-camera edit -> H.264/AAC MP4 -> complete decode +
selected soundtrack FFT + frame/caption pixels + unchanged source hashes pass
on Linux. Independent review findings have regression fixes.

| Goal | Actual current classification/evidence |
|---|---|
| F1 project/history/relink | TESTED_SYNTHETIC: v1 JSON, disk I/O, 50-step history, hashes, migration; phone UI/autosave pending |
| F2 multi-camera | TESTED_SYNTHETIC: numerical sync/proposals + saved 3-camera/split export; real drift/manual UX pending |
| F3 local semantic AI | NOT_STARTED: signal scoring exists, trained model accuracy unproven |
| F4 beginner manual UI | NOT_STARTED for new portable editor; legacy/prototype UI is not final acceptance |
| F5 effects | TESTED_SYNTHETIC static caption renderer; other effect data needs renderer/preview parity |
| F6 four-bus sound | TESTED_SYNTHETIC separate mixer + persistent definitions; common-timeline mixer pending |
| F7 Japanese persisted voice | NOT_STARTED: browser speech is not an exported narration file |
| F8 export/self-QA | TESTED_SYNTHETIC whole decode/streams and sample frame/audio checks; full defect/self-repair coverage pending |
| F9 devices | BLOCKED for physical acceptance in this Linux runtime; no four-platform E2E pass claimed |

Next path: common project -> four-bus rendering -> beginner local editor ->
native adapters/real footage/model evaluation -> full acceptance.
Earlier sections below are historical evidence, not a later success override.

## Verified in prepared source package

- Current sandbox re-run: **41/41 tests PASS** (21 Node, 7 Python engine, 3 Python audio, 10 Python legacy), on synthetic media / mocked cloud. Details: `docs/validation/CURRENT_INTEGRATION_REPORT.md`.
- GitHub source preservation is confirmed only by checking an actual remote commit SHA and its file tree; a local ZIP or bundle alone is not proof.

## Verified within earlier offline prototype scope

- `engine/` supports basic manifest-based FFmpeg composition on synthetic media; NOT verified on real 11 GB multi-camera footage.
- `cloud/` includes upload/session/job simulation and render pipeline tests using mocked R2/D1; real Cloudflare/Cloud Run deployment **not completed**.
- `prototypes/audio/` contains a genuine FFmpeg audio mix prototype for original audio, narration, BGM, and SE on short synthetic clips; iPhone/Android export unverified.
- iPhone Safari browser capability check **received as owner-provided physical-device JSON** (2026-10-21 UTC); short playback progression, 3-frame sampling, Japanese browser TTS completion, synthetic caption preview and synthetic MP4 creation are reported. Source footage was not uploaded. See `docs/validation/IOS_SAFARI_BROWSER_RESULT_2026-10-21.md`. This is NOT native iOS editing or original-footage export.

## Required next acceptance

1. Review actual iPhone capabilities with device logs and a short owned MP4; verify decoded input, TTS file creation, animated caption preview and exported MP4 equivalence.
2. Design shared JSON project/timeline/audio/effect schema with migrations and deterministic preview/export transforms.
3. Implement local-first iOS native slice with video/audio mixer, preview, save/reopen, export.
4. Repeat on Android with native backend. Confirm Windows/macOS independent operation.
5. Test 1, 2, and 3+ camera sources with sync confidence and deliberate offset / silence cases.
6. Evaluate local ASR / scene understanding and record quality metrics. Never claim expert correctness from a synthetic clip.
7. Implement technical full-output QA and bounded auto-repair with checksums and logs.

## Boundaries

- No paid services or Cloudflare R2 activation without explicit owner approval.
- No access to GORIQ services or credentials. Future integration is a separately designed adapter.
- Keep original media immutable; video project/data stored locally unless owner opts into transfer.
- Cloud billing/marketplace and public launch deferred until a separate owner decision.

If a test has not run on a physical phone with an actual MP4 export, its state is **UNVERIFIED**, not PASS.

## L0 proposal / device-lab development (2026-10-21)

- Scope: signal-assisted first-cut proposal, **not** trained AI semantic editing.
- Added offline FFmpeg numerical signal extractor and deterministic browser/Node edit planner with verified clock-source gating and decision evidence. Portable 3-camera synthetic media → FFmpeg analysis → edit proposal → FFmpeg MP4 → whole-file decode tested. See `docs/validation/LOCAL_FIRST_CUT_2026-10-21.md` for commands and test scope.
- Added standalone smartphone/desktop capability/preview test page. Owner-provided iPhone Safari JSON now supports **partial physical browser acceptance only**; no native app E2E or full original-video export has been observed. Android, Windows, Mac physical device acceptance remains `NOT_RUN`. See `docs/validation/IOS_SAFARI_BROWSER_RESULT_2026-10-21.md`.
- These additions are distinct from the prior v0.3.1 synthetic 41/41 baseline. Do not add test counts from repeated runs as unique completed product requirements.
- Public repository means source is readable. It does not mean a public video-processing service has been deployed or user media sent anywhere.
- No R2, payment, cloud GPU, GORIQ, real training footage, or app distribution is authorized by this change.


## Selected-video 4-second browser export prototype (2026-10-21)

- Added an opt-in, no-upload, 640×360, silent, max 4-second source-video+animated-caption MP4 recorder to the Device Lab. It is a separate button from the old artificial test clip.
- Headless desktop Chromium with a generated H.264/AAC test video: selected video → composited preview → H.264 MP4 → page replay and independent FFmpeg whole-file decode PASS. Static no-network/safety tests 8/8 PASS. Details: `docs/validation/SELECTED_VIDEO_BROWSER_EXPORT_2026-10-21.md`.
- **iPhone Safari selected-video export: NOT_RUN.** Prior physical iPhone result proves only synthetic MP4 creation, not real-source video export.
- Original audio, narration, BGM/SE, full-duration rendering, native apps and AI semantic editing remain UNVERIFIED/NOT IMPLEMENTED.
- Device Lab GitHub Pages is test-interface-only, not product distribution. No original media uploaded.


## Short local browser audio-mix experiment (2026-10-21)

- Added separate static `prototypes/device-lab/AUDIO_MIX_LAB.html`, not a replacement for the primary device lab and not part of the production editor. It imports a local MP4 and optionally BGM/SE/narration files, routes the chosen original soundtrack and audio files through Web Audio, overlays a caption and exports a short clip as browser MediaRecorder MP4.
- Linux development **Chromium** test with synthetic 8-second H.264/AAC video and synthetic 440/660/880/990 Hz audio: original-only, music-only and four-bus scenarios passed. Generated MP4 H.264/Opus decoded and audio FFT verified four distinct sources and SE timing. Static tests 11/11 PASS. See `docs/validation/BROWSER_AUDIO_MIX_2026-10-21.md`.
- **Physical iPhone Safari mixed-audio MP4 export: NOT_RUN.** Browser output used Opus in MP4 on Chromium, and variable frame timestamp warnings were observed. Exact cross-device audio compatibility and A/V timing remain unverified.
- Japanese AI voice generation, BGM ducking, full-length non-destructive editing and Android/native iOS editor still **NOT COMPLETE**. Commercial/public product and R2 remain off.


## iPhone original-sound acceptance gate, 2026-10-21

- Narration sound was reported by owner, but not specifically verified as the original selected-video audio in a saved MP4; original soundtrack preservation remains **NOT VERIFIED** on iPhone.
- Diagnostic audio page now isolates original video audio from loaded BGM/SE/narration by a dedicated source-only button and records separate browser replay + explicit human audio/caption/files checks. Browser-side waveform RMS telemetry is advisory only.
- Local dev tests: 14/14 static Node PASS, two desktop Chromium exported short H.264+Opus MP4s passed FFmpeg decode and browser replay. FFT of source-only output proved 440Hz original audio present and selected 660/990Hz extra audio absent. See `docs/validation/IPHONE_ORIGINAL_AUDIO_ACCEPTANCE_2026-10-21.md`.
- Physical iPhone source-audio/caption saved-MP4 replay: **NOT_RUN**, and Opus in MP4 may be incompatible with Safari. No native/full-duration functionality claimed.


## Physical iPhone source-video + original-sound + caption (owner report, 2026-10-21)

- **USER-REPORTED BROWSER PASS** for the short, 640×360, approximately four-second diagnostic: screenshot shows actual selected footage with test caption and four checked owner confirmations (selected footage, caption, audible original sound, and saved MP4 replay via iPhone Files app).
- This supersedes the earlier **NOT_RUN** marker for the **specific short browser source-only test**, not for native/full-duration audio-video export. No actual MP4 bytes or device JSON are available for independent codec, audio-spectrum or full-file validation.
- Next acceptance: receive anonymized `aivs-audio-mix-results.json`, then test iPhone BGM+SE mixing and separately validate the saved MP4. Details: `docs/validation/IOS_SOURCE_AUDIO_CAPTION_OWNER_REPORT_2026-10-21.md`.


## Latest iPhone audio result: silent original source (2026-10-21)

- **LATEST PHYSICAL iPhone REPORT = FAIL/INCOMPLETE for original soundtrack.** Owner-supplied 2026-10-21T08:37:53Z JSON shows a playable 613669-byte `SOURCE_ONLY` MP4 Blob and visible original footage/caption, but `originalSoundAudible=false`, `originalSignalPeakRms=0`, `outputSignalPeakRms=0` across 241 samples. This overrides the earlier provisional owner screenshot's checked sound item for the same milestone. The original source audio did not pass.
- BGM was rejected by the local prototype file size guard and SE by its 90-second decode-duration guard; neither was included in the source-only MP4.
- Added a **separate local compatibility diagnostic** `prototypes/device-lab/AUDIO_COMPAT_LAB.html`: iOS defaults to MP4 `decodeAudioData` + `AudioBufferSource` path (96 MiB cap) and fails closed on silent source/output WebAudio measurements. Desktop Chromium synthetic audio trial passed; negative (opening silence) failed safely, static 10/10 tests passed. **Physical iPhone compatibility fix still UNVERIFIED.** See `docs/validation/IOS_ORIGINAL_AUDIO_ZERO_2026-10-21.md`.


## Newer iPhone decoded-buffer trial (2026-10-21, latest evidence)

- Owner-submitted JSON (`2026-10-21T09:04:32Z`) confirms the iOS `DECODED_BUFFER` route produced **nonzero** input/output browser Web Audio signals: buffer RMS 0.00454; original 0.048032; output 0.060492, versus zero in the earlier trial. 394937-byte 3.88s source-only MP4 was created. The user checked source visible, caption visible, original sound audible, Files replay.
- **Acceptance remains INCOMPLETE:** `replay.status=NOT_RUN` and `browserReplayConfirmed=false` in the newest JSON. There is no independent inspection of exported MP4 audio bytes, actual codec or A/V sync. The latest evidence supersedes earlier *zero-signal* findings for this test but does not establish full native mobile export.
- Optional SE source rejected by the prototype's `AUDIO_DURATION_INVALID_OR_TOO_LONG` guard; source-only export contained no SE/BGM/narration. See `docs/validation/IOS_BUFFER_AUDIO_OWNER_RETEST_2026-10-21.md`.
