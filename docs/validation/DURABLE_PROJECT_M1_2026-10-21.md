# M1 portable project and local FFmpeg handoff

Status: **TESTED_SYNTHETIC**. Full product remains **NOT COMPLETE**.
Base main: `64cfb20c86a6abcf445124566ff873e887b27dee`.
Scope: GOAL F1/M1 and a narrow M2 reference path. No deployment.

## Observed result

- Browser-compatible versioned project JSON with source hashes, independent
  original/output clocks, camera offsets/drift, effect data, four audio bus/clip
  definitions and deterministic render plans.
- Local file save/load retains validated, bounded undo/redo. Moved sources
  relink by streamed SHA-256; wrong bytes fail. Existing engine project migration
  handles its actual bare-hex clip IDs and preserves export quality.
- A reopened three-camera project exported a genuine 2-second 960x540 H.264/AAC
  MP4. First second uses split red/blue synthetic cameras with a static caption;
  second second uses the third green camera. Independent decoded soundtrack FFT
  found the selected first/third camera tones (440/880 Hz). All frames/audio were
  decoded, pixels/caption checked and original source hashes unchanged.
- Renderer checks SHA-256 and declared audio/duration against staged media.
  It rejects protected final/temp/report destinations and aliases before writing.
  Final output/report use exclusive private temporary files before replacement.
- Unsupported audio processing/effects, gaps and unverified camera sync fail
  explicitly instead of being silently dropped by the legacy renderer bridge.

## Commands and runtime

Linux container: Node v24.19.0, Python 3.12.14, FFmpeg 6.1.1.
No paid service/model, private media upload, cloud storage or production launch.

```sh
node --test cloud/tests/*.test.mjs packages/edit-planner/*.test.mjs packages/project/*.test.mjs prototypes/device-lab/*.test.mjs
python -m unittest engine.test_manifest engine.test_local_signals engine.test_autoplan_pipeline engine.test_project_pipeline cloud.processor.test_r2_run -v
python -m unittest discover -s prototypes/audio -p 'test_*.py' -v
cd legacy/desktop-v0.1
python -m unittest discover -s tests -v
```

Observed: **88 Node + 13 Python engine/cloud + 3 audio + 10 legacy = 114 tests,
0 failures**, including 25 new project Node tests and 2 new pipeline tests.
Repeated executions are not additional completed requirements. Remote CI was
not run; the existing workflow is manual-only, with no required PR checks
reported by the main branch API. The manual workflow now includes this slice.

The initial legacy discovery from repository root lacked `studio` on sys.path;
re-running from `legacy/desktop-v0.1` passed all ten cases. An initial caption
assertion inspected a cropped/downscaled region; native output inspection
located the glyphs. The final assertion uses native lower-quarter pixels.

## Synthetic bytes observed

Generated with the integration test's lavfi color/sine commands; no media
committed or uploaded. Encoded hashes may vary with FFmpeg versions.

| File | Bytes | SHA-256 |
|---|---:|---|
| synthetic_0.mp4 | 32107 | 37a27cf03840dfda81aa154a7ffe0c097d4433905eeea43321e8d0c6b4120b0b |
| synthetic_1.mp4 | 32089 | e4599cf08568f1959ec2794ede2be8064c7dc5aa9b348229306f8114674b91ec |
| moved_2.mp4 | 32103 | afd1f8df4cb7c1d42403c27e3791eb9be18ff44de650c83d7272a213df602b7b |
| completed.mp4 | 39864 | 4d7d7c2e00c6364542c40481143f4ccbdcd5c7b15c18af07128a25c220060edf |

## Independent review and corrections

One independent reviewer identified four material findings: renderer file
alias overwrites, source identity lost at manifest handoff, inaccurate audio
capability silently ignored, and real legacy IDs/export quality failing
migration. Reproduced locally; regression tests failed before corrections and
passed afterward. Malformed combined-history budget was also caught and fixed.
No safety gate was removed.

Minor limitations remain: Node save has no parent-directory fsync; simultaneous
writers have no conflict resolution. The reference renderer is not a concurrent
service or a guarantee against power loss.

## Limits and next slice

Four-bus audio/effect definitions are **persisted**, not all rendered. The narrow
adapter handles unmodified primary source audio and clip-wide static text.
No trained semantic AI, natural Japanese voice-file synthesis, beginner GUI,
mobile native app, full preview/export parity or long/4K performance proven.
All four platform acceptance paths remain unverified. Next independent task:
connect four-bus data to local FFmpeg mixing with timing, mute, fades/loop/ducking
tests, then wire an actual beginner editing UI.

Physical iPhone's latest short browser result remains INCOMPLETE until output
replay diagnostics/codec evidence arrive. Issue #10 stays open.
