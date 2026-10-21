# AI VIDEO STUDIO | Project State

Updated: 2026-10-21
Product identity: independent repository, not GORIQ.
Version label: v0.3.1 design and prototype.
Production release: **NO**.
Public video-editing product deployment: **NO**. A static, public GitHub Pages **device diagnostic page only** is deployed from the separate `gh-pages` branch; no source-media upload is implemented.
Subscription / billing: deferred.

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
