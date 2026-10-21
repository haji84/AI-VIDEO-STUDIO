# v0.3.1 Integrated source validation

Date: 2026-10-21 02:10 UTC (current sandbox/container; not user device).

## Observed results on the assembled package

| Test scope | Result | Real-world limits |
|---|---|---|
| `cd cloud && node --test tests/*.test.mjs` | **21/21 PASS** | Fake D1/R2; 1 test launches real FFmpeg on a synthetic short MP4 |
| `python -m unittest engine.test_manifest cloud.processor.test_r2_run -v` | **7/7 PASS** | Short artificial 1-camera/3-camera clips; no live cloud deployment |
| `cd prototypes/audio && python -m unittest test_mix -v` | **3/3 PASS** | FFmpeg/Numpy artificial tones for BGM/SE/narration, not device-native |
| `cd legacy/desktop-v0.1 && python -m unittest discover -s tests -v` | **10/10 PASS** | Legacy desktop engine, synthetic test assets |
| **Total** | **41/41 PASS** | Does not validate iOS, Android, actual GoPro/Insta360 footage or cloud integration |

Environment: Linux container; Node v22.16.0; Python 3.13.5; FFmpeg 7.1.5; NumPy 2.3.5. The cloud tests report an experimental Node SQLite API; do not rely on this as proof of production compatibility.

## Explicit NOT RUN / NOT PROVEN

- GitHub repository and GitHub CI (this archive is only prepared for upload).
- iPhone/Android native import, auto-edit, Japanese offline TTS file export, animated preview→MP4 identity, BGM/SE real-device export.
- Actual 11GB user videos, real multi-camera scene understanding, training expertise, full-output semantic QA.
- Deployed private Cloudflare storage, R2 account enablement, Cloud Run, real subscription or billing.

Retain raw test logs locally; they are not uploaded by default. New commits require re-running relevant tests and recording results.
