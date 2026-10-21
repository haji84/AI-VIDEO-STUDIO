# AI VIDEO STUDIO | Project State

Updated: 2026-10-21
Product identity: independent repository, not GORIQ.
Version label: v0.3.1 design and prototype.
Production release: **NO**.
Public deployment: **NO**.
Subscription / billing: deferred.

## Verified in prepared source package

- Current sandbox re-run: **41/41 tests PASS** (21 Node, 7 Python engine, 3 Python audio, 10 Python legacy), on synthetic media / mocked cloud. Details: `docs/validation/CURRENT_INTEGRATION_REPORT.md`.
- GitHub source preservation is confirmed only by checking an actual remote commit SHA and its file tree; a local ZIP or bundle alone is not proof.

## Verified within earlier offline prototype scope

- `engine/` supports basic manifest-based FFmpeg composition on synthetic media; NOT verified on real 11 GB multi-camera footage.
- `cloud/` includes upload/session/job simulation and render pipeline tests using mocked R2/D1; real Cloudflare/Cloud Run deployment **not completed**.
- `prototypes/audio/` contains a genuine FFmpeg audio mix prototype for original audio, narration, BGM, and SE on short synthetic clips; iPhone/Android export unverified.
- Browser capability check and audio preview prototypes exist; iPhone device run not recorded.

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
- Added standalone smartphone/desktop capability/preview test page; an actual device run has **not** been observed. iPhone, Android, Windows, Mac acceptance is still `NOT_RUN`.
- These additions are distinct from the prior v0.3.1 synthetic 41/41 baseline. Do not add test counts from repeated runs as unique completed product requirements.
- Public repository means source is readable. It does not mean a public video-processing service has been deployed or user media sent anywhere.
- No R2, payment, cloud GPU, GORIQ, real training footage, or app distribution is authorized by this change.
