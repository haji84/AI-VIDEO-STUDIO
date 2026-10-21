# M4-A: whole-output inspection and explicit re-edit

Status: TESTED_SYNTHETIC on Linux. F8 and the product are NOT COMPLETE.
Implementation parent: main912ba3aa8d422a535cb37fe55dcc4ae520636d7b
(M3 implementation fba046fedac395f0709c7c9faab615ce6cdc801f + checkpoint only).

## Implemented path

The saved-project renderer calls `engine/output_qa.py` on its actual mixed MP4.
Local FFmpeg scans every decoded video frame and first output audio stream.
It compares container/decoded video frame counts when available, checks video
start/end against the whole output, measures sample peak and timestamps dark
and silent intervals. Inspection reconstructs absent audio clock gaps/tails as
silence without modifying output. Unselected/muted audio does not become a
missing-sound warning. Near clipping is a review finding, not proof of true peak.

Reports bind MP4 SHA256, project ID/revision and timeline clip IDs. They survive
the actual local server restart and are available through protected `/api/qa`.
The portable response removes local output paths. Finding navigation is read-only
and refuses a stale project revision. A UI entry and report download are wired;
actual browser interaction remains BLOCKED, not tested by HTTP/pure functions.

`technical_ok` means metadata/decode conditions, while inspection has explicit
CHECKED_LIMITED / NEEDS_REVIEW / FAILED_TECHNICAL states. Old or unknown reports
are never displayed as a clean new inspection. Findings never delete footage,
invent audio or silently change a project. Diagnostic processing uses a temporary
file, not a full media buffer. Findings cap256; omissions are reported without
stopping the full scan. Timeout bounds scanning; input is hashed before/after.

## Actual synthetic observations

Fixture: 8s 320x180 blue/440Hz MP4, black and silent after6s.
SHA256 `de722a44122644bdba271fc706f932c9cd4b2b19240785d1e6bb6175b7944f36`,
67,578 bytes (FFmpeg6.1.1 fixture build). No fixture media committed.

| Measurement | Observed |
|---|---|
| Inspection | NEEDS_REVIEW; whole decode completed |
| Dark interval | 6.000000–7.966670s, clip_late |
| Selected silent interval | 6.016000–8.000000s, clip_late / audio_selected |
| Sample peak | -16.083210dBFS |
| Source bytes | Unchanged |

Additional real file regressions:

- Near0dBFS lossless PCM produces NEAR_SAMPLE_CLIPPING; true peak NOT_MEASURED.
- Empty/muted selected audio is intentional, while selected silence is REVIEW.
- Missing audio/corrupt containers fail; a corrupt2.8s video packet that FFmpeg
  silently skips no longer passes: actual decoded frames disagree with30 frames.
- 8s video / 1s audio with 0–8s audio selected flags the missing tail; selecting
  only0–1s deliberately does not. This was independently reproduced in review.
- 1s video / 8s audio fails video stream timing even when metadata duration is8s.
- HTTP import -> actual faulty render -> findings -> process restart -> same
  report -> explicit trim to0.8s -> new MP4 with CHECKED_LIMITED. Original source
  unchanged; new job/output ID; revision updated, complete decode verified.
- Independent review reproduced a false-clean legacy-report display. A shared
  function used by the UI and regression tests now handles old/failed/unknown
  reports explicitly; actual server legacy-journal recovery is also tested.

## Reproduction and scope

Runtime: Linux, Node24.19.0, Python3.12.14, FFmpeg6.1.1; local tools only.

```sh
node --test cloud/tests/*.test.mjs packages/edit-planner/*.test.mjs packages/project/*.test.mjs prototypes/device-lab/*.test.mjs apps/local-editor/*.test.mjs
python -m unittest engine.test_manifest engine.test_local_signals engine.test_autoplan_pipeline engine.test_project_pipeline engine.test_saved_project_audio engine.test_output_qa cloud.processor.test_r2_run -v
python -m unittest discover -s prototypes/audio -p 'test_*.py' -v
# From legacy/desktop-v0.1:
python -m unittest discover -s tests -v
```

HTML inline module and browser acceptance script have syntax checks. The actual
browser package is installed, but Chromium is absent; the existing CDN probe
timed out in Proxy CONNECT. No repeated installation attempt or browser PASS.
Run `node apps/local-editor/browser-acceptance.mjs` with an actual browser; this
now includes inspection-record download. Missing prerequisite still BLOCKED.

Not implemented/accepted: freeze/cadence or all packet-PTS discontinuities,
caption raster safe bounds, speech intelligibility, true peak, semantic/expert
quality, automatic bounded correction decisions, 11GB performance, actual GUI,
novice tasks and all four physical-platform E2E. Unknown frame-count/stream-time
metadata is explicitly UNAVAILABLE, not a verified comparison. Black and silence
can be intentional. This is a useful limited technical inspector and explicit
manual correction loop, not complete F8 or product acceptance.

No private media/voices, external model/assets, paid API, deployment, billing,
permission expansion or GORIQ operation was introduced. Actions remain manual;
local results do not imply a GitHub Actions run.
