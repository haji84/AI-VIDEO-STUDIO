# Saved-cut visual preview — synthetic evidence, 2026-10-29

Status **at initial candidate freeze**: **TESTED_SYNTHETIC locally; new browser acceptance BLOCKED/NOT_RUN; integration pending**.
Base main: `c6bbd8d6f72d2653f350d6a01f9daf1d5ab31a13`, tree
`2175c9bde1a35ab6629c9d8cda95a939ee709dd5` (194 source entries).
The new candidate's exact commit/tree and hosted/main results belong to its implementation PR;
this pre-publication record does not invent them. Subsequent exact-head/main acceptance is recorded in that PR and its receipts; the local results below remain a dated record.

## Existing integrated baseline is separate

PR24 is merged. [Actual main run40806270812](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/40806270812),
attempt1, completed SUCCESS for offline job123225852969 and browser job123225853218.
Its existing-editor and two-workspace-relink flows both passed with actual Chrome playback and
whole-file decode. Node167/Python60 cases had no failures or skips. Their112,392-byte and42,074-byte
outputs and earlier failure history are recorded in PR24 and
`BROWSER_ACCEPTANCE_2026-10-29.md`. Those results do not cover this new preview path.

## Implemented boundary

A separate, explicitly requested player shows at most7 output seconds of a saved single-camera
cut and zero/one full-cut static caption. The checked project bundle, saved export profile and
existing compositor are reused. Source-clock offsets and rate are preserved; the encoded result
plays at1×. The current raw-source player/split action remains material inspection.

The preview does not modify the session, Undo/Redo, audio clips/buses, registry, completed exports
or output history. Its camera audio is not the saved four-bus final mix; the result starts muted
and the UI identifies the visual-only scope. Unsupported layouts/effects and invalid ranges fail.

Only the new Linux path is enabled. A180-second absolute lifetime includes preflight/hashes,
rendering, full decode and adoption/media verification. There is one owned worker group and
at most four held-or-opening media descriptors (one active hash validation and at most one queued validation). Media is verified
and read from the same open descriptor, with before/after identity checks. Current saved state
and source bytes are checked at adoption and every media request. Replaced output/source bytes
are refused; a pathname replacement after opening cannot substitute a different descriptor.

A two-second outer bound limits the cleanup attempt and failure reporting, including TERM/KILL,
process-group inspection, descriptor close, pending operations, directory removal and queue wait.
Ambiguity remains fail-closed/busy. This is not a guarantee that an uninterruptible OS/filesystem
operation completes within two seconds, or a hard CPU percentage quota. SIGINT/SIGTERM call one
guarded CLI close path; unconfirmed cleanup keeps the parent alive. Forced SIGKILL, crashes,
power loss and Windows/macOS descendant cleanup are not proven. Leftover preview data after
abnormal termination blocks new preview work until safe recovery; originals/exports are not removed.

## Actual local verification at initial candidate freeze

Runtime: Linux, Node24.22.1, Python3.12.14, FFmpeg/FFprobe6.1.1-3ubuntu5,
Pillow13.0.0, fontTools4.61.1, NumPy2.3.5. A local installed Noto CJK font was used;
no media, font or model download was added by the feature.

| Command / scope | Actual result |
|---|---|
| `node --test apps/local-editor/*.test.mjs` | **91/91 PASS**,0 failure/cancel/skip;11.740s |
| `python -m unittest engine.test_preview_saved_clip -v` | **6/6 PASS**,0 failure/error/skip;19.680s |
| `python -m unittest engine.test_caption_raster engine.test_saved_project_audio engine.test_project_pipeline -v` | **17/17 PASS**,0 failure/error/skip;15.996s |
| Node module/inline editor syntax | PASS |
| `node apps/local-editor/browser-preview-acceptance.mjs` in this workspace | **BLOCKED**, exit2 at `require-browser-executable`: `BROWSER_EXECUTABLE_UNAVAILABLE` |

The91 editor cases include the existing81 plus10 new API/process/descriptor/DOM cases.
The6 new Python cases and17 existing cases are distinct invocations; earlier REDs, reruns,
DOM checks and browser flows are not added as extra feature counts.

Actual faults and preservation checks include:

- Authenticated read-only preview, actual MP4 download/range/decode, invalid request/path/range
  refusal and mutual exclusion with completed-video rendering.
- Changed source/project before adoption/media, output replacement before HTTP view, and
  replacement after a verified open descriptor. Only verified original descriptor bytes are read.
- A worker and descendant that both ignore TERM: absolute deadline stops both and unlocks the
  editor. Direct parent close also stops them. A separately spawned real CLI receives SIGTERM
  and exits only after its detached group is stopped and the workspace lock removed.
- Four held real output descriptors exhaust the cap; a fifth is refused, and closing one admits
  another. This is a resource/lifecycle assertion, not a mock counter check.
- DOM-double checks for explicit window request, no session mutation, stale selection/revision
  replies and recovery reasons. These do not prove browser layout or playback.
- Actual saved JSON/bindings/media, original hashes, previous exports and output history remain
  unchanged by preview. The worker covers non-master camera clocks, strict/duplicate JSON fields,
  huge numeric input, unsupported split/effects, near-end ranges and destination races.

## Actual preview/export frame comparison

The generated2-second source contains one blue second, one red second and a440Hz tone.
Input SHA256: `b84a64827e98729c0e5ee8c093154a32cd50e0555d122fa107396d512e2afc32`.
Tests use nonzero source trim and preview start, a non-master camera, English/Japanese explicit
newlines, wrapping and overflow rejection. Preview and completed MP4 both pass full-file decode.
Canonical caption raster hash and placement match between each preview and its final export.

| Speed | Saved profile | Aligned transition difference | Maximum (one profile frame) |
|---|---|---:|---:|
| 0.5× | review | 25.977 ms | 41.667 ms |
| 1× | hd | 0.000 ms | 33.333 ms |
| 2× | review | 0.977 ms | 41.667 ms |
| 4× | fullhd | 8.334 ms | 33.333 ms |

Maximum sampled pixel mean absolute difference: **0.035223**, against a fixed limit of2.
The fraction of channels differing by more than20 also stayed below the fixed0.005 limit.
These are actual sampled-frame and transition measurements, not arbitrary subframe identity
or complete pixel equality for every frame/codec/physical platform.

Exact output and canonical-raster hashes:

- 0.5× / review: preview `0b9830ae4c628c6e6e7be65192288a938b653f39fd1c3551f143329bd18db884`; final export `099e2660a9caf2667f7ac790abe4f104ce2181dd72417251019cffefe95775d9`; canonical caption raster `6808e905c0a6f82752cfeaa0c800f46eaddda025257d90734808ef1d3622c089`.
- 1× / hd: preview `7ee3ac4220e8f46c67e0938f17b355286fa4e9f027c1c5d19b2006dfa8ba8549`; final export `94ec54fb2cf4c1393313ee9cc0c8f928029b2fa73ab16d2466b87f9de72a503a`; canonical caption raster `1ffee8dd9df9bf11edbca09d5e5f9a559debeaa613acbff244aea22c47276cf9`.
- 2× / review: preview `b9fef5dca44e1b9f13b0b7166a63dcaaab3a4269673fd331ca56b8e0753e3171`; final export `650b0653c6e4ae04225e1a7e08808b9a82a0f7b507507a61853908c52e949be0`; canonical caption raster `6808e905c0a6f82752cfeaa0c800f46eaddda025257d90734808ef1d3622c089`.
- 4× / fullhd: preview `6640f35d3471ecaaf545ecea559694be0ddc06f66c41ff84aaea27c48650e614`; final export `af1e2344f597792e482b6cc8c615143f69f06d0d878efb4a9d782a3030a37a67`; canonical caption raster `093ca64732b0c61e64da0af31c4a90c217d63eb131165139e06c14fadf0bba16`.

## Failures retained and corrected

Initial API RED: five real HTTP flows returned404 instead of the required202, before the route
and manager existed. Initial Python RED: six missing-worker assertions. A501-digit start value
exposed OverflowError and was corrected to a clean invalid-request failure.

The first4× comparison failed because FFmpeg input seeking selected the next frame rather than
the frame presented at the requested time. Actual PTS inspection found the existing AAC/concat
start offset and frame quantization. The test now chooses the PTS-floor frame and separately
bounds the transition difference to one profile frame; image thresholds and source/rate arithmetic
were not loosened. The shared renderer was not modified.

Root review exposed an uncapped held-descriptor count; the real fifth-open RED failed with
“Missing expected rejection”, then passed after adding held-plus-opening reservations. A spawned
CLI SIGTERM RED demonstrated the detached worker surviving; guarded SIGINT/SIGTERM close fixed it.
A recovery-message RED demonstrated a Linux-only message incorrectly hiding leftover-file failure;
the UI now shows the actual recovery reason. The initial restricted-runner attempt for that last
case did not execute the assertion and is not counted as a RED result.

## Actual hosted browser gate at candidate freeze

The new script exercises UI import/save/preview requests and responses, muted playback progression,
repeat playback/end bounds, intrinsic canvas frames at matched presentation timestamps, final
MP4 hash/decode, selection/revision response races, Undo/Redo/save/reopen, and unchanged original
/session/export/history bytes. Browser pixel thresholds are explicit: mean difference<3,
fraction of channels differing by>24 below0.005, caption-bound displacement<=2 pixels and
presentation-time allowance<=one profile frame. These assertions had **not run locally at candidate freeze**; subsequent hosted execution belongs to the carrying PR acceptance record.

The manual workflow adds the new Python test and one browser step, retains all previous commands,
manual-only trigger, read-only permissions and12-minute job budgets, and keeps browser execution
at300 seconds. No artifact upload, public editor deployment, private footage or paid service was added.
Independent review and actual hosted exact-head acceptance must precede integration. Physical
native devices, separate-PC portability, novice use, real11GB media, full-timeline audio/effect
parity and the overall Product DoD remain open.

## PR25 review and first hosted failure — amendment freeze, 2026-10-29 UTC

The initial candidate was published as PR25 head
`08a751ba2d641d4d58f18f15678bae0f2d519e06`, tree
`b3a2062abaaffd5bc1c1c9481402c36d400d7fab`. Preserve that candidate and the earlier
local results above as historical evidence.

Independent review reproduced a real ready-result expiry race. After `ready` was
cleared, delayed close of an actual rendered-output descriptor left `busy()` false.
A second preview was admitted; the old cleanup failure could then overwrite its
status. The manager now retains disposal ownership in its busy/start/close paths
until successful cleanup, and retains a fail-closed state after cleanup ambiguity.
Expiry failure callbacks only update the matching current job. Concurrent close
calls join the same bounded attempt.

Three real-descriptor regression cases first failed with the original manager,
then passed after correction: successful delayed cleanup followed by a new render;
cleanup deadline failure that still blocks new work after late close settlement;
and close during retirement, including repeated close calls. Focused GREEN:3/3,
0 skips,18.762s. The complete editor suite then passed **94/94**,0 failures/cancel/skips,
29.825s. Its new3 cases are not added again to the full-suite count. Python worker,
Python tests, shared renderer and the workflow are unchanged from the initial
candidate; their earlier6+17 results were not rerun or relabelled as new executions.

[Actual hosted run40810377968](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/40810377968)
passed offline CI and the two existing browser flows. The new saved-cut flow
**FAILED**, browser job123239010400, at `staleRace` line144 / stage
`delayed-adoption-selection-and-revision`. It had reached this stage after the
preview playback/replay, completed export and frame-comparison assertions. The
failure is not a completed-flow PASS. Safe UI diagnostics showed selection changed,
`video.hidden=true`, `paused=true`, cleared source and readyState0, but Playwright
`isHidden()` returned false. The page's existing author `video{display:block}` rule
was overriding the hidden attribute's presentation.

The correction adds only `#saved-cut-preview [hidden]{display:none}` to the new
panel's scope, also covering its hidden clear button. Removing that one rule yields
the identical initial-candidate HTML. Actual Playwright visibility assertions,
all browser scripts, their timeouts and all previous workflow steps remain unchanged.
Static scope and syntax checks passed; **the corrected browser flow is NOT_RUN at
this amendment freeze**, pending actual hosted Chrome. PR25 and its receipts carry
subsequent exact-head/main results. The180-second lifetime,2-second cleanup attempt,
Linux/visual-only boundary and open physical/novice/11GB/Product DoD gates remain.
