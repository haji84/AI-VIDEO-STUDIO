# Hosted browser acceptance for the local editor

Date: 2026-10-29 JST. Root approved the original design on this date.
Approved original design SHA256:
`ee5c4297fcc56c2a78fc642495fadd89044718f37a0afbc28987a3eb5c3527ab`.
Execution: this worker implements locally; root independently reviews, publishes
one candidate PR and dispatches it through the observed GitHub workflow UI.
Base main: `9bf5c9cf993df8ea4b93ee71b216dfb0f0b18209`.
Base tree: `77f8d8b5d04c9cddd9bbe5ba3a3b0d570b02354f`.

## Intent and current evidence

PR23 integrated source relinking and verified it through actual loopback HTTP,
generated media and DOM doubles. The existing browser acceptance script has not
run in the current executor because its browser executable is absent. That script
covers import, first-cut preview/apply, editing, save/download, reload, audio edits,
output playback/download and FFmpeg decode. It does not select a saved JSON or
operate the relink panel. These are two separate acceptance scopes.

Root has now observed a signed-in GitHub manual workflow control. This unit uses
that established UI dispatch route. The worker does not dispatch, publish, merge,
inspect credentials or modify trigger policy. A missing dispatch route is never
replaced by a new push/PR/schedule trigger.

## Approaches considered

1. Retry the same local Chromium download. Rejected: the unchanged download
   already returned an HTML error, and the executor has no browser executable.
2. Use the existing standard GitHub runner and its installed Google Chrome.
   Recommended: the product emits H.264/AAC MP4, and the official Playwright
   browser guidance explicitly distinguishes branded-browser media codecs.
   Manual-only CI and read-only repository permissions stay unchanged.
3. Add a new remote browser service or publish the editor. Rejected: unnecessary
   new service, credentials/exposure and data boundaries for this acceptance test.

The implementation choice is the worker's proposal under the existing owner
development mandate; approval of this exact design is recorded by root.

## Exact scope: nine files

1. `.github/workflows/manual-smoke.yml`: append one independent synthetic browser
   job; preserve existing triggers, permissions, timeouts and all original test
   steps. The approved missing-FFmpeg amendment below adds prerequisite
   installation and explicit runtime checks to the original job.
2. `apps/local-editor/browser-acceptance.mjs`: retain all existing assertions and
   add compact actual-browser/runtime and input/project/report/output hashes.
3. `apps/local-editor/browser-relink-acceptance.mjs`: a new real-browser flow over
   two temporary workspaces, using the existing product APIs through the UI.
4. `apps/local-editor/README.md`: both browser commands and honest scope.
5. `PROJECT_STATE.md`: integrate PR23 facts and record this bounded acceptance.
6. `ROADMAP.md`: distinguish existing editor browser scope, relink browser scope
   and physical-device/novice acceptance.
7. `docs/work/WORK_CHECKPOINT.md`: current base, observed evidence and next gate.
8. `docs/validation/BROWSER_ACCEPTANCE_2026-10-29.md`: exact commands, runtimes,
   fixture/output hashes, actual results, failures and limitations when observed.
9. This design document, with the approved implementation sequence appended.

No production source, schema, history/render engine, runtime dependency manifest,
privileged permission, account, deployment, model inference or private media change.
Any real product bug exposed by the browser is a separate smallest repair on the
same PR, proposed to root before adding source files to this scope.

## Hosted job

- Existing `workflow_dispatch` only and `permissions: contents: read` remain.
- Standard `ubuntu-24.04`, `timeout-minutes: 12`; no larger/self-hosted runner.
- Checkout without persisted credentials. Node24.22.1 and Python3.12.14; npm
  installs Playwright1.64.1 only in the disposable job with `--no-save`, no package
  lock write and lifecycle scripts disabled. No Playwright browser download.
- Python test-only pins: Pillow13.0.0, fonttools4.61.1, NumPy2.3.5. They were
  observed in the existing successful synthetic environment. Product requirement
  ranges remain unchanged. Install FFmpeg/FFprobe and the existing Noto CJK test
  font through apt. The original smoke job also explicitly installs FFmpeg before
  its first use; it no longer assumes the runner image includes these commands.
- Require the actual `google-chrome` executable, an actual FFmpeg/FFprobe and the
  installed font. Log their versions plus runner image/Node/Python/library versions.
  Chrome/FFmpeg/image packages are observed, not claimed fully pinned.
- Set `AIVS_BROWSER_EXECUTABLE` to that Chrome path and `AIVS_PYTHON`/font to the
  known job paths. Run each browser command with an outer 300-second timeout and
  a ten-second termination grace. Missing prerequisites are failures, not skips.
- Use a dedicated temporary root and clean it in an `always()` step. Browser
  scripts also close browser/server and remove their temporary fixtures in finally.
- No artifact/cache upload, no secret, no deployed service and no real footage.
  Evidence is small structured log output; exact run/head bind it to source.

## New browser acceptance

All actions whose acceptance is claimed use real controls, file selectors and
downloads. Test-side reads of temporary project/registry bytes establish state
and identity; they do not replace a tested UI action with a direct mutation API.

1. Generate a short audiovisual MP4, an880Hz BGM WAV and a different660Hz WAV.
   Hash the originals. Start workspace A on loopback and launch actual Chrome.
2. Use UI video import, trim/caption edit, then import the same MP4 through BGM.
   This gives identical bytes separate video/audio IDs and exercises the supported
   dual-role case. Add the880Hz BGM and undo its addition so it exists only in Redo.
3. Use the UI project-download control to save JSON. Assert the actual saved
   current/Undo/Redo structure and record every original source ID. Snapshot A's
   project/registry/copied-media hashes. Close A before using the other workspace.
4. Open an empty workspace B. Select JSON with `#open-project`; assert missing
   identities, disabled final Open, and unchanged current project bytes.
5. Select the original MP4 via the relink file input. Assert both original role
   IDs become available from one stored copy while the historical BGM stays missing.
6. Select the wrong WAV under the correct filename using a real File selector.
   Assert the rejection message, disabled Open and unchanged current project.
7. Close and restart B, reload its page, select JSON again, and assert the verified
   MP4 copy is reused. Select the correct880Hz WAV. Assert ready state and that
   the old edit still remains until the explicit Open button is clicked.
8. Explicitly Open; compare saved project, source IDs, edits and both history
   arrays, except for the documented current-revision advance. Redo restores the
   historical BGM through the UI. Undo/Redo and a manual gain edit must persist.
9. Reload/restart, render through the UI, download QA and MP4, play the real output
   in Chrome and require advancing playback time plus nonzero video dimensions.
   Independently decode the entire downloaded file, match its hash to QA and use
   a bounded PCM frequency check to establish historical880Hz BGM in that output.
10. Assert no page errors, all originals and A's snapshot unchanged, and record
    fixture/project/output hashes, byte size, actual browser version and acceptance
    scope. Cleanup all test-owned resources on ordinary failure/success.

The existing HTTP/DOM regression for committed-Open cancellation remains in the
unchanged full local-editor gate. This browser unit does not claim an additional
delayed-network-race reproduction unless it is actually implemented and executed.

## Result semantics and gates

Each script returns explicit `PASS_SYNTHETIC_BROWSER`, `BLOCKED` or `FAIL` and a
nonzero exit for BLOCKED/FAIL. Each scope has its own structured result. A job or
script not executed is NOT_RUN. The two scripts and overlapping unit/API cases
must not be summed as independent feature coverage.

Local checks validate syntax, YAML/job invariants and unchanged affected API
behavior; they do not substitute for browser execution. Root publishes the
independently reviewed candidate to one PR, dispatches that exact candidate branch,
reads the terminal logs and fixes a concrete failure on the same PR if needed.
Only actual successful browser logs may promote either scope to synthetic browser
PASS. Exact head/tree/file hashes, independent review and ordinary integration
checks precede main merge; postmerge evidence must name actual main.

Linux Chrome acceptance is not Windows/macOS/iPhone/Android device acceptance,
novice usability,11GB performance, semantic AI accuracy or full Product DoD.

## Primary references read for this design

- Playwright browser/codecs guidance: https://playwright.dev/docs/browsers
- Fixed package release: https://github.com/microsoft/playwright/releases/tag/v1.64.1
- Current repository GOAL, AGENTS and AUTONOMOUS_EXECUTION; manual-smoke workflow
  blob `901f90a79fe4a03c3160b8e05bacb2c8b55de5c1`.

## Hosted browser acceptance implementation plan

> For agentic workers: use `superpowers:executing-plans` for native execution of
> this bounded unit, then root's independent whole-change review. No worker remote
> mutation or workflow dispatch. The approved nine-file scope remains exact.

Goal: make existing editor and source-relink browser acceptance independently
executable on the existing manual GitHub workflow.

Architecture: keep the current browser script and add one separate relink script.
Both drive the real local server with generated media. A new bounded job in the
existing workflow installs only test tools, uses its installed Chrome and records
small machine-readable evidence. Product modules remain untouched.

Tech stack: existing Node/FFmpeg/Python editor, Playwright1.64.1, Google Chrome,
ordinary GitHub-hosted Linux runner. Spec: this document above.

### Global constraints and review focus

- Manual dispatch only; `contents: read`; standard runner; 12-minute job timeout.
- Each browser command: 300 seconds plus ten-second termination grace.
- Missing browser/codec must fail visibly; no skip or continue-on-error.
- All fixtures are generated within a fresh dedicated test directory; no real data.
- Preserve every existing workflow test step and browser acceptance assertion;
  add only the explicitly approved FFmpeg prerequisite installation/checks.
- Wrong same-name content must not open or change the current saved edit.
- One physical audiovisual file must recover both immutable source IDs/roles.
- Historical-only BGM must survive restart and be present in the decoded output.
- Completed partial uploads are reusable, but readiness does not imply Open.
- Real DOM actions, page errors, actual playback and clean resource termination
  must remain observable; API state reads cannot replace a claimed UI action.

### Task1: existing flow evidence and hosted execution

Files: `.github/workflows/manual-smoke.yml`,
`apps/local-editor/browser-acceptance.mjs`.

- [x] Preserve the existing flow; add SHA256 for generated input, saved JSON,
  downloaded QA/MP4 and actual Chrome version to its successful result.
- [x] Append a separate `synthetic-browser-acceptance` job with the exact runtime,
  permissions, version pins, preinstalled Chrome/font checks and bounds above.
- [x] Set a dedicated job TMPDIR and remove only that directory in always cleanup.
- [x] Validate Node syntax and parsed YAML invariants. The initial candidate
  preserved the original job/prefix byte-for-byte. After the approved FFmpeg
  amendment, verify all original test steps plus only the recorded prerequisite
  installation/runtime-check differences; do not claim an unchanged prefix.

### Task2: actual relink browser flow

File: new `apps/local-editor/browser-relink-acceptance.mjs`.
Input: existing `startServer({workspace,port:0})`, actual Playwright browser.
Output: one scoped JSON PASS/BLOCKED/FAIL result and a corresponding process exit.

- [x] Generate MP4/880Hz WAV/wrong660Hz WAV in separate fixture directories. Wrong
  WAV has the same basename as the correct WAV, with its own actual file bytes.
- [x] Use import/edit/Undo/download UI in workspace A to construct the exact
  three-ID/two-file saved session. Snapshot original and A registry/project hashes.
- [x] Use the real open-JSON/relink controls in B for partial success, wrong-file
  refusal, restart/reuse, ready-but-not-open and explicit final Open assertions.
- [x] Exercise Undo/Redo/manual gain/reload, UI render, QA/MP4 downloads and Chrome
  playback; assert full FFmpeg decode, QA hash, expected880Hz PCM and original/A
  byte preservation. Record bounded hashes/runtime/result without tokens.
- [x] Close pages/browser/servers and remove only test-owned temporary fixtures.
- [x] Run Node syntax plus the unchanged affected API tests. Actual browser
  outcome stays NOT_RUN until the candidate workflow executes this file.

### Task3: truthful evidence, review and integration handoff

Files: README, PROJECT_STATE, ROADMAP, WORK_CHECKPOINT, validation doc and this
design/plan. Source implementation remains exactly the three files above.

- [x] Record current PR23 main/tree and the new commands, scope and prerequisites.
- [x] Record local syntax/YAML/API results separately from hosted/browser results;
  do not populate future run IDs, hashes, counts or PASS results.
- [x] Check all nine changed paths, text-only/public-source scope, source blobs,
  no unexpected edits and the unchanged base entries. Freeze a candidate manifest.
- [ ] Root independent review precedes one PR publication and exact-branch manual
  execution. Any actual failure is investigated on that same PR without reducing
  assertions or expanding product scope before root's review.
- [ ] After real execution, record actual run/head/runtime/hash outcomes and
  remaining physical/novice/product gates; root verifies actual merge/main.

Plan self-review: all design goals have a task; no unimplemented product API or
new service is assumed. Tests are the deliverable, so artificial tests of their
assertion strings are not introduced. The meaningful browser gate is the actual
hosted execution, with local syntax and existing API regression as preliminary
checks only.

Implementation checkpoint: the checked implementation items above mean the test
code/configuration is present, not that the browser actions have executed. Local
syntax and YAML invariants pass, both missing-browser paths return BLOCKED/2, and
the unchanged affected API gate passes108/108 (zero failures/skips,24.780 seconds).
Both browser scopes remain NOT_RUN. Root's independent review, actual candidate
execution and later integration remain the unchecked gates.

## Approved amendment: explicitly provision missing media tools

The actual original-main run [40788585989](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/40788585989),
job123167857722, failed on main `9bf5c9cf993df8ea4b93ee71b216dfb0f0b18209`.
Its runtime step printed `ffmpeg: command not found`, but the existing pipeline
continued. FFmpeg-dependent engine classes skipped, and the unchanged audio suite
ran3 cases with2 `FileNotFoundError: ffmpeg` errors. This is an observed dependency
failure, not a newly reproduced product defect or a browser result.

Root approved this bounded amendment before editing: the original job gains one
apt FFmpeg installation step before Check runtime and explicit `command -v` checks
for both FFmpeg and FFprobe; the browser job includes FFmpeg in its existing apt
font installation. All original test commands/assertions, trigger policy,
permissions, runtime selections and timeouts stay intact. Product requirements and
test skip criteria do not change. FFmpeg versions remain observed, not pinned.

The original candidate manifest, patch, frozen files and independent review are
preserved separately before this repair. This reviewer authored only the amended
workflow/documentation and cannot independently approve its own amendment; root
reviews it before publication. The nine-file total scope remains unchanged.

Validation: the actual hosted failure above is RED evidence. The unchanged local
`prototypes/audio/test_mix.py` suite passes3/3,0 skips/errors/failures,1.419 seconds
with Python3.12.14, NumPy2.3.5 and FFmpeg/FFprobe6.1.1-3ubuntu5. The original test
source SHA256 remains `c2b7adf45f6086d0201276b745ddb49c12b891a7504ee55edef958ff7ef49852`.
This local run does not establish that the amended GitHub job succeeds; hosted
repair and both browser scopes remain NOT_RUN until exact-candidate execution.
