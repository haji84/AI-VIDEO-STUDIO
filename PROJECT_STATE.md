# AI VIDEO STUDIO | Project State

Updated: 2026-10-21
Product identity: independent repository, not GORIQ.
Version label: v0.3.1 design and prototype.
Production release: **NO**.
Public video-editing product deployment: **NO**. A static, public GitHub Pages **device diagnostic page only** is deployed from the separate `gh-pages` branch; no source-media upload is implemented.
Subscription / billing: deferred.

## Local candidate: measured static caption raster (2026-10-28 UTC)

The long/multiline caption next step has a reviewed local candidate on canonical
base d849ab93. Real synthetic MP4 checks prove wrapping inside the safe area,
retained explicit lines, original audio and saved edit history; missing glyphs
and vertical overflow explicitly block export. Nine focused tests pass. Across
187 disjoint regression cases initially 184 passed and 3 lacked a Japanese font.
An additional official-font verification reran those unchanged 3 cases: all PASS.
Actual Japanese 130-character wrapping and 3 explicit lines now have verified
Linux MP4 raster/glyph/audio evidence. The initial results remain recorded;
there was no new full-suite run, CI, main merge or device acceptance. No font is
bundled or installed system-wide. A security follow-up sets Pillow >=13.0,<14
and Python >=3.11; all 12 caption/Japanese integration cases and both Japanese
MP4s were verified again under actual Pillow 13.0.0. Detailed evidence and exact remaining
gates: `docs/validation/CAPTION_RASTER_F8_2026-10-28.md`.

## Latest Work implementation (output freeze/cadence F8-B, 2026-10-21)

The existing full-output scan now records still/freeze intervals >=1s and aggregate
output PTS interval changes in the same disk-backed decode pass. REVIEW only:
intentional still images/VFR remain user decisions. Open frozen tails stop at
actual video end; missing video/audio/corrupt packet/frame-count/identity gates
remain. Valid one-frame output reports insufficient cadence evidence instead of
a broken decode. Findings retain time/clip references and saved output identity.
GUI names, scope and legacy-report coverage are explicit. No automatic repair.

Actual synthetic HTTP static4s output -> persisted warning -> restart -> exact
clip navigation -> explicit manual trim -> new0.812s checked MP4/full decode
passed; source unchanged. CFR moving negative, true variable PTS positive,
mid-clip hold and video-only tail regressions pass. Current177 tests PASS (122 Node +42 engine/cloud +3 audio +10 legacy).
Independent final review APPROVE; no blocking findings. PR #18 integrated at
1348c88bd9b482d0b501da918b3561a909aa16f4; source tree4655cea34ebfc5f3ce17e3e8250a5cb00d02816f
matched tested source. Postmerge29 editor and17 actual output/audio QA tests PASS; evidence: `docs/validation/OUTPUT_FREEZE_F8_2026-10-21.md`.
F8 remains partial: caption bounds, intelligibility/true peak, causal/source-frame
checks, bounded repair and real-device acceptance are unfinished.

P1 PR #17 integrated at bb872b8f9aeb9b85659d88cff59719ddd56d909c,
source381d740874cfe93a44287ee8644f1f0d7e3d1b8f matched, postmerge27 editor+11
actual-signal/proposal/output PASS. Checkpoint main0be8e706a8c42486706e5a854d9ae70ecdcd6ce2.

## Prior Work implementation (first-cut P1, 2026-10-21)

Existing signal extractor/planner connected to private revision/source-bound
candidates, persistent reports and explicit video-only replacement in the local
editor. Master at shared zero; <=8 verified zero-drift cameras and <=20min per
input/event span. Unverified cameras excluded visibly. Incomplete/gapped/stale
reports, changed source bytes, effects/split replacement and audio truncation
refused. Four-bus audio selections/settings stay exact. Individual cut previews
and normal manual caption/history/save/restart are wired; browser remains blocked.

Actual generated HTTP -> analysis -> restart -> explicit apply -> Undo/Redo ->
restart -> manual caption -> selected-camera MP4/full decode passed. Preserved
440Hz master +880Hz extra buses; unintended660Hz camera sound absent. Full suite
171 PASS (120 Node +38 engine/cloud +3 audio +10 legacy). Shared analysis manager
keeps busy until durable journal, exposes missing/changed reports as failure.
Delayed audio clock and disguised reference-container regressions fixed.
F3/F4 partial TESTED_SYNTHETIC, not learned semantic AI or complete device support.
Evidence: `docs/validation/FIRST_CUT_P1_2026-10-21.md`.

S1 PR #16 integrated at fbad7612905a3b4b3a3d0fdde21bccbed571f264,
source tree8e482a686f8f12ccb246f3ca750fe75e8d3d3fa6 matched; postmerge23 editor
and13 sync/saved-output PASS. S1 checkpoint mainb6b755ff41914ac908cddc7eedad34597738b394.

## Prior Work implementation (sync candidates S1, 2026-10-21)

Existing local audio-correlation engine is connected to read-only candidates,
private SHA/revision-bound reports, restart recovery and explicit confirmation.
No analysis auto-verifies a camera. Weak/silent/missing audio, changed files,
stale evidence, confirmed targets and unsupported drift fail closed. Two common
scene previews and manual fallback are wired; actual browser/paired playback
remains BLOCKED. Shared-clock camera choice and legacy manifest rebasing fix
nonzero-offset camera-only MP4 export without changing selected soundtrack.

Full local suite156 PASS:112 Node +31 engine/cloud +3 audio +10 legacy.
Actual synthetic HTTP analysis -> restart -> confirm -> camera output/decode,
red-camera pixels and original-audio RMS0.1537 passed. Offset2.0s, audio agreement
0.998, uniqueness0.591. F2 remains partial TESTED_SYNTHETIC; drift/common-event
vision, real footage and physical platforms are not accepted. Independent review
found no Critical/Important issues. Evidence: `docs/validation/SYNC_CANDIDATES_S1_2026-10-21.md`.

A1 PR #15 main30d758bd1cb2f374a729632757dc451fdf0f3078/tree03ae10aea63401e76b82c71820e33632b9f3c49b
verified; post-merge18 editor+8 actual-output PASS. Previous checkpoint main7fed306e67da59c59dadf03c1a89000a55b450d6.

## Prior Work implementation (audio controls A1, 2026-10-21)

The local desktop UI now exposes existing per-clip audio start/end, source trim,
speed, gain, loop, fade-in/out and explicit removal. Shared pure operations use
the existing version1 validator and actual renderer. Custom audio/ducking data
is preserved; manually changed automatic slots become independent audio so later
video edits cannot overwrite their timing. No inferred tracks or automatic clamp.
Actual HTTP edit -> undo/redo -> remove/undo -> disk restart -> real MP4 proves
selected1320Hz at1–3s, retained440Hz original audio and fade amplitude ratios
0.1244/0.1264. Sources unchanged. UI DOM/browser acceptance remains BLOCKED.
Evidence: `docs/validation/AUDIO_CONTROLS_A1_2026-10-21.md`.
Current full local suite:146 PASS (107 Node +26 engine/cloud +3 audio +10 legacy).
Independent review's Undo/Redo wrong-target removal was reproduced RED and fixed
GREEN with the real panel module in a DOM stub; no implicit target fallback.
F4/F6 remain partial TESTED_SYNTHETIC; native platforms/novices not accepted.

M4-A PR #14 integrated at c480cfe87fcb238dd4736e4747272d7405695c88;
verified tree3d508ef23431f1735900289d606419d9f183403b. Post-merge11 editor +15
actual-output/QA tests passed. Last checkpoint maincc8974f8460b69899558814237c2d7289c250c1b.

## Prior Work implementation (M4-A, 2026-10-21)

Full-output technical inspection is connected to the saved-project renderer.
Every video frame/selected audio stream is decoded, container/decoded frame
counts compared when available, black/silent intervals and sample peaks measured.
Selected missing audio tails are inspected on the output media clock; explicit
absent/muted audio is preserved. Portable reports bind output SHA256, project
revision and clip references. Local API/journal restores reports; a manual re-edit
and fresh render can remove a known synthetic fault without overwriting output.

**F8: TESTED_SYNTHETIC, still incomplete.** CHECKED_LIMITED is a limited technical
result. Black/silence remain REVIEW. No automatic subjective edits, freeze/cadence,
caption raster safe-bound, speech intelligibility, true-peak or semantic pass.
Review found short-audio-tail and legacy-report false-clean cases; regression
tests and fixes added. Late packet corruption silently skipped by FFmpeg is now
detected through decoded/container frame-count disagreement.
GUI browser acceptance remains BLOCKED; no physical/novice result added.
Full local suite: 139 PASS (100 Node +26 engine/cloud +3 audio +10 legacy).
Evidence: `docs/validation/OUTPUT_INSPECTION_M4A_2026-10-21.md`.

M3 PR #13 integrated at fba046fedac395f0709c7c9faab615ce6cdc801f, source tree
a17a03351c892ecebe27580442a038e103af8294 matched local tests. Post-merge 7 editor
and 8 saved-output tests passed. M1–M3 checkpoint commit912ba3aa8d422a535cb37fe55dcc4ae520636d7b.

## Prior Work implementation (M3, 2026-10-21)

Local desktop editor source/server added; launch: `apps/local-editor/README.md`.
Actual loopback API covers source import -> trim/caption edit -> history ->
save/restart/reopen -> M2 render -> MP4 download/full decode. Seven new HTTP/pure
edit cases pass, including workspace locking, stale-tab refusal, explicit audio
selection and unsupported-caption preservation. **128 tests PASS** total.

F4 UI is IMPLEMENTING, not complete: actual browser acceptance is BLOCKED because
this runtime has Playwright but no browser executable, and CDN probe timed out.
`node apps/local-editor/browser-acceptance.mjs` returned BLOCKED, code2.
Evidence/resumption: `docs/validation/LOCAL_EDITOR_M3_2026-10-21.md`.
No physical browser/device/novice success claimed. No deployment or paid service.
M2 PR #12 integrated as `8ae096242752b46ce652505fd9ddc43c7b01ebd2`, verified
tree37d5fe12128f04ef1f0c42482785c8bb57513b7d; post-merge 8 output tests passed.

## Prior Work implementation (M2, 2026-10-21)

Saved common audio timeline is now connected to local FFmpeg output:
`python -m engine.render_saved_project --help`. Source/narration/BGM/SFX timing,
gain/mute, fades, selected-tail loop and duck intervals verified by actual
decoded synthetic PCM. Empty selection is silent; delayed audio keeps its media
clock. No narration model, mobile GUI or physical platform acceptance claimed.
Current total: **121 tests PASS** (89 Node + 19 engine/cloud + 3 audio + 10 legacy).
Independent review's delayed-stream and un-hashed playlist findings have failing
regressions and fixes. Evidence: `docs/validation/SAVED_PROJECT_AUDIO_M2_2026-10-21.md`.
M1 merged as PR #11, main `02a0e2d8200d02d157ab8dc48e1f28b70a1b2ddd`;
remote source tree matched local tests; post-merge pipeline passed.

F6 connected reference mixing is `TESTED_SYNTHETIC`; device preview/export
parity and real speech quality remain unverified. Next unblocked work is the
beginner local editor, then native adapters and real-data gates. Product overall
remains IN_PROGRESS. No paid/cloud/public-product activation.

## Prior Work implementation (M1, 2026-10-21)

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
