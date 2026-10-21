# M2 saved four-bus audio -> actual local MP4

Status: TESTED_SYNTHETIC on Linux; product IN_PROGRESS.
Base main: `02a0e2d8200d02d157ab8dc48e1f28b70a1b2ddd` (M1 PR #11).

## Delivered path

Saved session + local bindings -> strict common validator and hashes -> bundle
-> existing video composition -> explicit source/narration/BGM/SFX mix -> new
H.264/AAC MP4 -> whole-file decode. Intermediate camera audio is ignored in the
final mix; empty selected audio means silence. No implicit soundtrack doubling.

Supports independent bus mute/gain, audio trim/speed, global start/end, fades,
looping the selected source tail, and saved duck intervals. Delayed audio starts
keep leading silence before trim/speed. No VAD/transcript or TTS claimed. Loops
use disk PCM rather than retaining whole decoded tracks in application memory.

New workspace/output required. All audio/video hashes/capabilities verified.
Standalone local demuxers/protocols only: normal/disguised playlists referencing
un-hashed dependent files are refused before decoding them. Output uses an
exclusive temporary file and atomic no-clobber install. Reference backend has a
64-audio-clip cap. Unsupported visual effects remain explicit failures.

## Actual validation

Node v24.19.0, Python 3.12.14, FFmpeg 6.1.1, Linux container.

```sh
node --test cloud/tests/*.test.mjs packages/edit-planner/*.test.mjs packages/project/*.test.mjs prototypes/device-lab/*.test.mjs
python -m unittest engine.test_manifest engine.test_local_signals engine.test_autoplan_pipeline engine.test_project_pipeline engine.test_saved_project_audio cloud.processor.test_r2_run -v
python -m unittest discover -s prototypes/audio -p 'test_*.py' -v
cd legacy/desktop-v0.1
python -m unittest discover -s tests -v
```

**89 Node + 19 engine/cloud + 3 original audio + 10 legacy = 121 tests PASS**.
Six new audio integration cases inspect actual PCM. Original mute/empty audio
are silent, another selected source stays audible. Nonzero trim, speed2,
repeated trimmed tails, delayed streams and global placement verified.
Whole decode proves technical decodability, not complete semantic QA.

One persisted synthetic four-bus example produced:

| Measurement | Observed |
|---|---:|
| Output duration | 4.02 seconds (4.00-second plan; AAC/container tail) |
| Frame | 960 x 540 |
| Encoded bytes | 103965 |
| Original 440 Hz amplitude | 0.06251215 |
| Narration surrogate 880 Hz amplitude | 0.06231528 |
| SFX 990 Hz amplitude | 0.06281837 |
| BGM 660 Hz, normal / ducked | 0.06248763 / 0.01250582 |
| Measured duck ratio | 0.20013271 (requested 0.2) |
| Decoded sample peak | 0.17222199 |

Output SHA-256: `8970641f1198fdc4b8280d0c1021e0e0cfeda733150295301d39a1723337649d`.
Synthetic source hashes, checked unchanged in tests:

- source.mp4: `66d852bb60ab2be73cb46ea8fdcb75f51f32c8b2367876430e0608faa01e43a0`
- bgm.wav: `c7039b80bea9235f2114377cbda4ec180e896bfd8cf4d37b52698e673b6d92cb`
- narration.wav: `e234105e11e49d1590c105634bc80879d464a0a609b1d40eee80fbbd5e57ca9a`
- sfx.wav: `759f0ac6fac63653aea674866ad05ee05d446a26d734ee3fb90ab84653439069`

Encoded hashes may vary by runtime. No source/output media pushed.

## Review corrections

Independent review reproduced early audio from a delayed stream. Regression
first measured RMS 0.08835 in a silent span; media-PTS reconstruction fixes both
nonloop and trimmed/speed-adjusted loop paths. Reviewer also rendered HLS with
un-hashed dependencies. A regression initially accepted the playlist; demuxer/
protocol allowlists now reject it even with a disguised audio extension. Both
fixes have green real-output regressions. No safety/test gate removed.

## Limits and next acceptance

Local command backend, not a beginner/native app or product finish. No natural
Japanese TTS file, semantic AI, real 11GB performance, preview parity, physical
four-platform export or novice use verified. Limiting is not a true-peak/LUFS
guarantee. Hard-link install/filesystem power-loss behavior needs platform tests.
Concurrent writes and automatic crash resume remain pending; use new job names.

Next bounded task: beginner desktop local editor on this shared session/backend,
import -> trim/caption/audio -> undo/save/reopen -> MP4 download/replay. Loopback
only, protected local requests/media, actual synthetic browser flow tests. Then
native adapters and real-data acceptance. No paid/public-product activation.
Issue #10 remains open.
