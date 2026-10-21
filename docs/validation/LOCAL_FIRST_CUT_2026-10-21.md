# AI VIDEO STUDIO — L0 first-cut development evidence

Date: 2026-10-21. Scope: independent AI VIDEO STUDIO repository (NOT GORIQ).

## What was implemented

- `engine/local_signals.py`: on-device-compatible **reference extractor** using installed FFmpeg/ffprobe. Reads local input without modifying it and exports low-resolution numerical frame contrast / motion / audio RMS into a file containing no source path.
- `packages/edit-planner/auto-edit.mjs`: dependency-free deterministic 1–100 camera first-cut proposer; source offset mapping, trust-gated synchronization, overlap/gap handling, shot hysteresis, optional suggested split views, a machine-readable decision trace, and explicit review/uncertainty flags.
- `tools/compose-proposal.mjs`: offline CLI from extracted signal JSON to editable proposal JSON.
- `prototypes/device-lab/DEVICE_LAB.html`: offline browser capability page for a physical iPhone/Android/desktop operator to collect video decode, simplified signal analysis, Japanese browser TTS preview, caption/effect preview, and conditional synthetic MP4 MediaRecorder evidence. Data stays in the selected device; JSON evidence is user-exported manually.
- End-to-end isolated test: three synthetic MP4s → genuine FFmpeg low-res analysis → actual Node planner → existing `engine.run_manifest` real FFmpeg rendering → whole output decode.

## Commands for repeatability

```sh
node --test packages/edit-planner/auto-edit.test.mjs
python -m unittest engine.test_local_signals engine.test_autoplan_pipeline -v
cd cloud && node --test tests/*.test.mjs
cd .. && python -m unittest engine.test_manifest cloud.processor.test_r2_run -v
cd prototypes/audio && python -m unittest test_mix -v
cd ../../legacy/desktop-v0.1 && python -m unittest discover -s tests -v
```

`prototypes/device-lab/DEVICE_LAB.html` has a standalone JavaScript syntax check. It is **not** a native iOS or Android application. Browser execution on a physical device is required before marking any hardware acceptance item passed.

## Safety and limitations

- No original private video/voice is in the repository. All new video tests generate disposable synthetic clips.
- The planner is **signal-assisted, not a semantic video understanding AI**. It does not know what a particular worker is doing or whether a safety-critical technique is correct. It adds no fabricated titles or expert commentary and marks `reviewRequired=true`.
- Camera offsets need independently verified evidence; `candidate` and `unverified` sources are excluded by default.
- The generated edit proposal is **not an accepted training film**. No automatic destructive omission of a critical event occurs; gaps are reported.
- Audio energy is not ASR. Japanese browser TTS speech is not a produced or mixed voice file. A synthetic MediaRecorder export, if supported, is not source-video native AVFoundation/Media3 export.
- No physical iPhone, Android, Windows workstation, or actual 11 GB GoPro/Insta360 test has been performed by this environment.
- Cloud services, subscription, public app release, external media upload, and GORIQ runtime remain untouched.

## Current acceptance

**Implementation tests**: see the commit/PR description and attached executed test logs.

**Device real acceptance**: all pending. A browser test harness alone is not a passed hardware run. See `DEVICE_ACCEPTANCE_MATRIX.md`.

## Executed checks (2026-10-21 development container)

| Executed suite | Pass | Fail | Environment / interpretation |
| --- | ---: | ---: | --- |
| Cloud mock Node suite | 21 | 0 | Linux container, fake R2/D1 |
| Existing FFmpeg engine and cloud adapter | 7 | 0 | Linux, disposable synthetic media |
| Audio mix prototype | 3 | 0 | Linux, synthetic voice/BGM/SE tones |
| Legacy editor | 10 | 0 | Linux, synthetic inputs |
| New numerical edit planner | 10 | 0 | Node.js, synthetic 1–N camera signals |
| New FFmpeg signals and three-camera full render | 4 | 0 | Real FFmpeg, synthetic 3-camera input and whole-output decode |
| **Total** | **55** | **0** | This is NOT a device hardware acceptance result |

Additional Chromium **headless browser** smoke using a 3-second artificial MP4: video decode and three representative brightness measurements PASS; animated-caption preview PASS; MediaRecorder produced a 2.499-second synthetic MP4 (167249 bytes in the observed run), and FFprobe/FFmpeg full decode PASS. Browser execution was performed via Playwright `page.set_content` because direct file/loopback URL navigation was blocked by this container's administrator. **This is not an iPhone, Android or Windows physical-device test** and does not validate original-video compositing or TTS audio-file export.

`prototypes/device-lab/DEVICE_LAB.html` makes no application-level network requests, but browser/OS TTS implementation may use a service outside the app's control; confirm on-device offline behavior separately. Never claim OS speech synthesis is always offline.
