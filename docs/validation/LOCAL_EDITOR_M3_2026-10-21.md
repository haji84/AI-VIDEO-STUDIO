# M3 local desktop editing slice

Base main: `8ae096242752b46ce652505fd9ddc43c7b01ebd2` (M2 PR #12).
State: backend/edit operations TESTED_SYNTHETIC; actual UI browser gate BLOCKED.
Full product remains IN_PROGRESS.

## Implementation and observed scope

`apps/local-editor` reuses packages/project and engine.render_saved_project.
Node serves only loopback, with Host/Origin/token checks and workspace locking.
Imports stream to exclusive private local copies. Hash/metadata/source registry
remain local. Common session handles save/reopen/history. Immutable media
identity and optimistic revision checks protect state; stale tabs are refused.
File range playback and new snapshot jobs produce actual MP4 downloads.
Finished output metadata/hash survives process restart; interrupted jobs are
reported rather than claimed to be continuing invisibly.

Japanese UI source includes video/audio inputs, trim/speed/static captions,
split/reorder/append, camera/manual-sync selection, four-bus gain/mute,
project download/open, and MP4 render/replay/download. **These controls have
not been exercised in a real browser here.** No native/mobile support claimed.

## Actual tests

```sh
node --test cloud/tests/*.test.mjs packages/edit-planner/*.test.mjs packages/project/*.test.mjs prototypes/device-lab/*.test.mjs apps/local-editor/*.test.mjs
python -m unittest engine.test_manifest engine.test_local_signals engine.test_autoplan_pipeline engine.test_project_pipeline engine.test_saved_project_audio cloud.processor.test_r2_run -v
python -m unittest discover -s prototypes/audio -p 'test_*.py' -v
cd legacy/desktop-v0.1
python -m unittest discover -s tests -v
```

Observed **96 Node + 19 engine/cloud + 3 audio + 10 legacy = 128 PASS**.
Seven new editor tests use a real loopback server and generated H.264/AAC bytes:
import, edit, history, 206 range bytes, token/origin refusal, duplicate workspace
refusal, refusal of private state inside the public source checkout, stale edit/undo refusal, restart/reopen, actual renderer invocation,
MP4 download and independent complete decode. Original input bytes unchanged.
Pure edit tests exercise the exact functions imported by the UI, not a copied
simulation of them. Those tests prove model operations, not DOM/touch usability.

Runtime: Linux, Node24.19.0, Python3.12.14, FFmpeg6.1.1. No cloud job/paid model,
deployment, real footage, personal voice or private-media transmission involved.

## Independent review fixes

Three Important findings reproduced before fixes:

- Stale revision clients could overwrite other saved changes. All POST mutations
  now require expected revision; edits also compare the project revision. UI
  reloads current state and offers the unsaved edit JSON instead of losing it.
- Reflow reintroduced source audio in a deliberately silent project and doubled
  arbitrary named explicit audio. Shared pure operations now retain explicit
  selection; only explicit append can create a default source track.
- Apply/reflow normalized complex captions, losing timing/position/multiple
  effects. Unsupported single/multiple/partial/positioned/keyframed edits now
  refuse without changing the input; exact regression cases pass.

Additional failing regressions verified exclusive workspace locking and output
restoration after restart, then passed after corrections. No weakened checks.

## Browser blocker and exact resumption

`node apps/local-editor/browser-acceptance.mjs` actually returned:

```json
{"status":"BLOCKED","reason":"BROWSER_EXECUTABLE_UNAVAILABLE"}
```

Exit code2 (not PASS). Playwright package is available in the runtime, but its
Chromium executable does not exist. No chromium/chrome/firefox executable was
found in the inspected runtime/PATH locations. CDN connectivity probe
`curl -I --connect-timeout 3 --max-time 6 https://cdn.playwright.dev` failed with
`Proxy CONNECT aborted due to timeout`. HTML module syntax check passed.
No browser screenshot, touch test, codec playback or novice test is fabricated.

Resume in a runtime with a Chromium executable (or set AIVS_BROWSER_EXECUTABLE
to an existing Chrome), run the exact browser-acceptance script, fix any observed
failures, save its replay/download/decode evidence, then do real-device tests.
Do not repeat the same download failure or replace browser evidence with mocks.

## Still open

Full novice UI usability, advanced sound positioning/effects/preview parity,
native iPhone/Android, physical Windows/Mac, persisted Japanese TTS, real local
semantic models, 11GB/full-length performance and full-output repair are not
complete. Existing graph/engine work remains available for further independent
development; this blocker applies specifically to validating the new GUI.
Source and output remain private on the local computer. Product DoD not met.
