# AI VIDEO STUDIO

**Status: v0.3.1 design + audio prototype, NOT a finished mobile app.**

AI VIDEO STUDIO is a standalone, local-first, non-destructive AI-assisted video editing project. It is **not** part of GORIQ, and does not share GORIQ's release status, repository, credentials or personal media. The goal is a beginner-friendly editor for **iPhone, Android, Windows and macOS**, supporting 1 to N cameras, Japanese subtitles/TTS, animated titles/video effects, BGM/SE, and optional cloud processing with separate consent.

## Canonical project documents

- [v0.3.1 product specification (DRAFT)](docs/specs/PRODUCT_SPEC_v0.3.1.md)
- [BGM / SE requirements](docs/specs/AUDIO_SPEC_v0.3.1.md)
- [Verified state and blockers](PROJECT_STATE.md)
- [Prioritized roadmap](ROADMAP.md)
- [Development policy / no false PASS](AGENTS.md)
- [GORIQ future-only boundary](docs/integrations/GORIQ_FUTURE_API.md)

## Source currently preserved

| Path | Reality / status |
|---|---|
| `engine/` | Existing FFmpeg Python processor from v0.2.1; synthetic-media tests only. |
| `cloud/` | Existing Cloudflare Workers/D1/R2 prototype; NOT deployed; optional cloud code, not default. |
| `prototypes/audio/` | v0.3.1 offline BGM, SE, narration FFmpeg prototype and tests. |
| `prototypes/iphone/` | Browser capability-check page; NOT native iPhone editor. |
| `legacy/desktop-v0.1/` | Older Python local editor reference; not a finished shipping product. |
| `docs/history/` | Historical plans and previous-version code notes, retained for traceability. |

**Important:** No iOS or Android native application exists yet; local AI scene understanding, native rendering, offline AI TTS, preview/export consistency, multi-camera realism, and expert-level training video QA are NOT proven. All claims of test success must be attached to the exact runtime and evidence.

## Run existing smoke tests locally

Requires Python 3, Node.js, FFmpeg/ffprobe; some audio tests require NumPy. Dependencies must be obtained according to your environment security policy.

```sh
cd cloud && node --test tests/*.test.mjs
cd ..
python -m unittest engine.test_manifest cloud.processor.test_r2_run -v
cd prototypes/audio && python -m unittest test_mix -v
```

The optional Cloudflare preview must NOT be deployed unless separately approved: no public production release, payment, R2 account activation, third-party media transfer or billed inference is authorized by this repository.

## Security, costs and copyright

Do not commit real filming footage, sensitive audio, names, access credentials, local workspace paths with personal data, secret configurations, or unlicensed stock media. Local-first storage is the default. The eventual cloud adapter will require explicit per-job permission and cost controls. There is no subscription/Stripe system yet. See `SECURITY.md`.

## In-progress local first-cut analysis (portable, no account or cloud required)

`engine/local_signals.py` captures low-level brightness/motion/audio-energy signals on local owned media, and `packages/edit-planner/auto-edit.mjs` generates a deterministic, editable camera/timeline proposal from 1–100 verified-clock sources. This is a basic **numerical first cut**; it does NOT recognize people/roles or deliver a final educational video.

See `docs/validation/LOCAL_FIRST_CUT_2026-10-21.md` for the integration test and `docs/validation/DEVICE_ACCEPTANCE_MATRIX.md` for physical device testing. Offline device capability page: `prototypes/device-lab/DEVICE_LAB.html`. No file uploads or cloud calls are made by the new prototype.


### Browser-only device test (separate from the editor)

The live, static GitHub Pages diagnostic is `https://haji84.github.io/AI-VIDEO-STUDIO/`. It keeps the selected video in the browser, offers an **experimental four-second, silent** selected-video + caption MP4 output, and reports replay separately. Full video/audio editing, AI semantics and native phone exports are not implemented by this test page. See `docs/validation/SELECTED_VIDEO_BROWSER_EXPORT_2026-10-21.md`.


### Browser audio-mix proof (device diagnostic, not a full editor)

Test-only path: [audio test](https://haji84.github.io/AI-VIDEO-STUDIO/audio.html). This uses a **4-second maximum, 640×360** excerpt of a user-selected local video, adds an animated caption, attempts to preserve original audio and optionally mixes user-selected BGM/SE/narration **audio files** locally through Web Audio. iPhone mixed-MP4 output, AI voice synthesis, codec compatibility and long-duration editing remain unverified. Source files are not uploaded. See `docs/validation/BROWSER_AUDIO_MIX_2026-10-21.md`.


### iPhone original soundtrack acceptance

The live `audio.html` diagnostic now has a **source-only** button for selected video + original soundtrack + caption, separate from optional BGM/SE/narration mixing. Limit: 4 seconds, 640×360. Desktop Chromium synthetic test passed; physical iPhone source-derived audio export has **not** yet been demonstrated. Use the four manual checks and share anonymous results only. See `docs/validation/IPHONE_SOURCE_AUDIO_CAPTION_GATE_2026-10-21.md`.
