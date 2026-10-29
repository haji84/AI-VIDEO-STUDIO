# Actual browser acceptance candidate — 2026-10-29 JST

## Status and source basis

**Latest diagnosis: existing-editor FAIL at video trim; source-relink NOT_RUN
(skipped). Product DoD: NOT MET.** PR24 run40803673614 identified the preserved
2-second soundtrack that the old test incorrectly expected to truncate implicitly.
Both hosted offline jobs passed. The explicit-audio-edit fixture correction below
is NOT_RUN in a browser. Earlier sections retain the initial candidate history;
no successful browser result or device PASS is inferred.

Base main is PR #23 `9bf5c9cf993df8ea4b93ee71b216dfb0f0b18209`, source tree
`77f8d8b5d04c9cddd9bbe5ba3a3b0d570b02354f`. Source relinking is integrated there;
its 108/108 affected gate, independent 29/29 subset and postmerge actual-HTTP 5/5
replay are separate existing evidence. The older baseline workflow has no actual
browser step, so even its successful completion cannot establish this acceptance.

The approved nine-file design and implementation plan are in
`docs/work/BROWSER_ACCEPTANCE_DESIGN_20261029.md`. Root reviews and publishes one
candidate PR, dispatches its exact branch through the existing manual GitHub UI,
and records the terminal run/head evidence before integration. This worker makes
no remote mutations or dispatches. No production module, schema, engine or product
dependency manifest is changed by the initial verification candidate.

## What the two scripts exercise

| Script | Actual actions and independent checks | Result |
|---|---|---|
| `apps/local-editor/browser-acceptance.mjs` | Existing UI import, manual sync, first-cut preview/confirm/apply, caption/trim, Undo/Redo, JSON download/reload, BGM timing/fades, render, QA download, Chrome MP4 playback, MP4 download and whole-file FFmpeg decode. All previous assertions retained; hashes/runtime and QA-to-output identity added. | NOT_RUN |
| `apps/local-editor/browser-relink-acceptance.mjs` | Real UI creates a session in A, downloads JSON, selects it in empty B, recovers three source IDs from two physical files, rejects wrong same-name bytes, restarts with partial copies, explicitly Opens, restores history-only BGM through Redo, edits gain, reloads/restarts, renders/downloads/plays/decodes and checks 880Hz BGM. Original media and all A project/registry/assets stay byte-identical. | NOT_RUN |

The new flow uses one audiovisual MP4 with a 440Hz source tone twice: first as
video, then as BGM, preserving separate IDs/roles. A generated 880Hz `music.wav`
is added and undone, so it is required only by the saved Redo snapshot. A separate
temporary directory contains a different 660Hz file also named `music.wav` with
the same duration. Selecting that real file must be refused without opening or
changing the current edit. One selected MP4 must restore both role IDs from one
stored copy. The final WAV completes readiness; only the explicit Open control
adopts the project. File-system reads assert identity and saved state; they do not
mutate the product or replace UI actions with direct API calls.

The historical audio check measures 880Hz amplitude in a bounded 0.1–0.6 second
window of decoded mono48kHz output, with a threshold of0.004. It establishes the
presence of this synthetic BGM after recovery/Redo/export; it does not establish
human intelligibility or subjective mix quality. Actual frequency amplitude and
output hash are logged only after successful execution.

## Bounded hosted execution

The existing `.github/workflows/manual-smoke.yml` retains `workflow_dispatch`
only and `contents: read`. Every original test step is retained. The initial
candidate preserved the original 2,728-byte prefix; the approved missing-FFmpeg
amendment adds only explicit media-tool installation and runtime checks to
`offline-prototype-smoke`, as recorded below. New independent job
`synthetic-browser-acceptance` uses standard `ubuntu-24.04`, a 12-minute timeout,
checkout without persisted credentials and no artifact/cache upload.

| Component | Candidate requirement |
|---|---|
| Node |24.22.1 |
| Python |3.12.14 |
| Playwright package |1.64.1, installed only in disposable test job; no lifecycle scripts or browser download |
| Python test libraries |Pillow13.0.0, fonttools4.61.1, NumPy2.3.5 |
| Browser |Runner's existing `google-chrome`; require actual executable, log actual version |
| FFmpeg/FFprobe |Explicit apt FFmpeg package installation in both jobs before use; require both commands and log actual versions |
| Font |Existing Noto CJK package; `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` |
| Temporary data |Dedicated job directory; generated media only; script finally cleanup plus `always()` job cleanup |

The Chrome/FFmpeg/runner image versions are observed at execution, not claimed
fully pinned. Logs contain named version/hash/result fields, not environment dumps
or authorization tokens. No paid/browser service, new secret, permission increase,
private footage, model call or public product deployment is introduced.

The job sets `AIVS_BROWSER_EXECUTABLE`, `AIVS_PYTHON` and `AIVS_CAPTION_FONT`, then runs:

```sh
timeout --signal=TERM --kill-after=10s 300s node apps/local-editor/browser-acceptance.mjs
timeout --signal=TERM --kill-after=10s 300s node apps/local-editor/browser-relink-acceptance.mjs
```

Missing prerequisites fail visibly. Both scripts use explicit scoped
`PASS_SYNTHETIC_BROWSER`, `BLOCKED` or `FAIL` output, with nonzero exit for
BLOCKED/FAIL. The job does not skip a failed assertion or use continue-on-error.
Successful evidence includes actual browser/Node/Playwright versions, generated
input hashes, saved project/QA/output hashes, output byte size, actual playback
progression and complete decode. The relink result additionally records recovery,
history, same-MP4 roles and historical BGM evidence. Physical acceptance stays
NOT_RUN even after a Linux synthetic browser PASS.

## Local preliminary checks, observed on this candidate

Local runtime: Node24.22.1, Python3.12.14, Pillow13.0.0, fonttools4.61.1,
NumPy2.3.5, FFmpeg/FFprobe6.1.1-3ubuntu5, verified Noto CJK test font.

| Check | Observed result | Scope |
|---|---|---|
| `node --check` for both browser scripts | PASS | Syntax only |
| Initial YAML/prefix check: exact original Git blob `901f90a79fe4a03c3160b8e05bacb2c8b55de5c1` | PASS before FFmpeg amendment | Historical configuration evidence; prefix changes only as recorded below |
| Amended YAML: all original test steps, triggers/permissions/bounds retained; exact prerequisite installation/runtime-check differences | PASS | Configuration review only |
| Existing audio suite with actual local FFmpeg/FFprobe |3/3 PASS,0 skips/errors/failures;1.419 seconds | Local generated-media regression; hosted dependency installation not yet executed |
| Both scripts with a deliberately unavailable browser path | `BLOCKED/BROWSER_EXECUTABLE_UNAVAILABLE`, exit2 | Fail-closed behavior; no browser/server started |
| Existing affected Node gate below |108 tests,108 pass,0 fail,0 skipped;24.780 seconds | Actual HTTP/generated media/files/FFmpeg and existing DOM doubles; no actual browser |
| Hosted candidate run | NOT_RUN | To be recorded after root's exact-candidate dispatch |
| Windows/macOS/iPhone/Android, novice and large-media acceptance | NOT_RUN | Separate device/product gates |

```sh
node --test --test-isolation=none apps/local-editor/*.test.mjs packages/project/project.test.mjs packages/project/local-store.test.mjs
```

The local gate used the existing Python/Pillow13 runtime and verified Japanese
font through the two environment variables. Loopback HTTP required the existing
approved local-test sandbox exception. It used generated files and no external
service. The local browser executable is still absent. The prior official browser
download returned195 bytes of HTML; this unchanged download was not repeated.

Overlapping API and browser scopes must not be summed as independent feature
coverage. Existing cancellation/committed-Open delayed-response regression remains
in the API/DOM gate; this new browser flow does not claim a separate delayed-response
race test. Hosted Linux Chrome does not prove native platforms, novice usability,
11GB performance, semantic AI accuracy, preview/export parity or full F1/F8/F9.

## Primary references

- Playwright browser/media-codec guidance: https://playwright.dev/docs/browsers
- Official pinned release: https://github.com/microsoft/playwright/releases/tag/v1.64.1
- Integrated source-relink evidence: `docs/validation/SOURCE_RELINK_F1_2026-10-29.md`

## Next evidence gate

Freeze and independently review this candidate, publish one PR, then manually run
that exact candidate branch. Record actual run URL/head, terminal job/step results,
observed runtime and each script's structured evidence. A concrete failure must be
investigated on the same PR without weakening acceptance. Any additional production
file requires root's scope review before modification. Until those logs exist,
the two browser results above stay NOT_RUN.

## Actual original-main failure and bounded repair

Original-main [run40788585989](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/40788585989)
completed FAILURE on `9bf5c9cf993df8ea4b93ee71b216dfb0f0b18209`, job123167857722.
The observed runner Python was3.13.17. At2026-10-28T23:37:01Z its Check runtime
step printed `ffmpeg: command not found`; the pipeline did not stop that step.
FFmpeg-dependent engine classes then skipped. At23:37:13Z the audio step ran3
tests,1 passed and2 errored with `FileNotFoundError: ffmpeg` from the existing
fixture-generation helper at `prototypes/audio/test_mix.py:12`, invoked by the
synthetic-mix and silent-video cases. Later workflow steps did not run. This
failed run contains no browser job and proves no browser acceptance.

Root approved installing the missing prerequisite explicitly in both jobs.
The existing smoke job gains an apt FFmpeg installation before its first use and
`command -v ffmpeg` / `command -v ffprobe` checks before version output. The browser
job adds FFmpeg to its existing apt font installation. Original tests/assertions,
skip conditions, runtime selections, triggers, permissions and timeouts are kept.
No product module, requirements range or model service is changed.

The same unchanged audio tests were then run locally with actual FFmpeg/FFprobe:

```sh
cd prototypes/audio
python -m unittest test_mix -v
```

Observed result: **3 tests,3 PASS,0 SKIP,0 failures/errors**,1.419 seconds,exit0.
Runtime: Python3.12.14,NumPy2.3.5,FFmpeg/FFprobe6.1.1-3ubuntu5. The file SHA256 was
`c2b7adf45f6086d0201276b745ddb49c12b891a7504ee55edef958ff7ef49852` both before and
after this run. The original108-case API gate was not unnecessarily repeated;
those tests and both browser scripts are unchanged by this amendment.

The initial candidate manifest/patch/frozen files/review were preserved. Its
manifest SHA256 was `0b96888c84fa0330cf45b869f5cbd67b110f7df98a4f483307c9d8479d05677a`
and tree `b6fd208b2381b28d6cd656b144e7abe062e4f4d3`. Root must independently review
the replacement manifest and the small amendment before publishing one candidate
PR. The amended hosted workflow and both browser scopes are still **NOT_RUN**;
local audio success is not a claim that GitHub prerequisite installation or the
full workflow has succeeded. Preserve the failed baseline as evidence.

## First actual PR24 browser run and diagnostic amendment

[Run40802909769](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/40802909769)
used exact head `bd730e16a776a91de2b208f73aa21547eb08f16a`.
`offline-prototype-smoke` job123214955544 completed **SUCCESS**, including every
original test step. The FFmpeg prerequisite repair therefore passed hosted CI.
Browser job123214955448 passed dependency installation and preflight with Chrome
156.0.8078.47,Node24.22.1,Playwright1.64.1,Python3.12.14 and FFmpeg/FFprobe6.1.1.
The existing-editor step started01:52:02 UTC and failed01:52:36 with
`page.waitForFunction: Timeout 30000ms exceeded.` Source-relink was **SKIPPED**,
not attempted or passed. Cleanup succeeded.

The old catch output omitted the source line and operation, so that timeout does
not identify its cause. Static review found no proven incorrect wait condition.
The approved diagnostic-only amendment adds named operation markers, bounded
redacted error stack/source location, the first10 bounded page errors and selected
UI values/media readiness flags on failure. The failure snapshot has a1-second
upper wait; it omits requests, URLs, full page HTML and environment data, and
redacts the local server token. No product code, original assertions, action order,
existing Playwright timeout or workflow setting changes.

Both script syntax and the missing-browser failure path are checked locally.
The next exact-head hosted run must establish which condition failed before any
product repair or timeout change is considered. This amendment does not claim
the original browser flow passed, and its hosted result is **NOT_RUN**.

## Actual diagnosis and explicit-audio fixture correction

Diagnostic [run40803673614](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/40803673614)
used head `809a94e2492a6e6ca99127738e13ec2ad1c54212`. The offline job123217440294
again passed. Browser job123217440584 failed at `wait-trim-saved` with visible
`AUDIO_EXCEEDS_VIDEO_TIMELINE`: selected video duration1second, preserved original
audio0–2seconds,0 page errors. Source-relink was skipped. This is separate from
the first unlocalized browser failure; both failure records are retained.

First-cut intentionally preserves the original soundtrack while replacing video
clip IDs. The old test then shortened only the video, and the app correctly
refused implicit truncation of independent audio. The approved fixture correction
explicitly changes the original soundtrack end to1second through existing UI
controls before the unchanged video trim/caption/Undo/Redo/export flow. Actual
saved audio is compared field-for-field except that end time; source identities,
buses, gains and video timeline must remain unchanged by the audio edit. No
product code, assertion, timeout or workflow setting is relaxed.

An actual generated-media HTTP reproduction confirmed client rejection and
HTTP400 for the invalid video-only edit, with byte-identical saved state. The
explicit audio edit followed by video trim succeeded; Undo restored2-second
video and Redo1second while retaining the selected1-second audio. The112,376-byte
MP4 fully decoded, with original440Hz amplitude0.1248186030; input bytes were
unchanged. Output SHA256:
`b789d7f7a88112422f638eb65e234bbfb028b16f327e1c794dd98b658348c6f5`.
This local HTTP/FFmpeg result is not browser PASS. The corrected exact-head hosted
run, both browser scopes and physical acceptance remain unverified.
