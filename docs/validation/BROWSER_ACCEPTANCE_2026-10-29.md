# Actual synthetic browser acceptance — 2026-10-29 UTC/JST

## Status and source basis

**Both scopes: PASS_SYNTHETIC_BROWSER. Product DoD: NOT MET.**
[PR24](https://github.com/haji84/AI-VIDEO-STUDIO/pull/24) remains pending integration. Last-tested implementation head
`a767cc976a719cf325f0e717a3eab4d32e768b9c`, tree `3b0f6429e16277256e48a6a9ee272975538a2d22`, passed
[run40804733070](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/40804733070), attempt1, on2026-10-29 UTC.
Final documentation-head CI, actual integration SHA and main-run verification are
recorded in PR24 when observed; none is inferred from this earlier code-head run.
The older failure and NOT_RUN checkpoints below remain historical evidence.

Base main is PR #23 `9bf5c9cf993df8ea4b93ee71b216dfb0f0b18209`, source tree
`77f8d8b5d04c9cddd9bbe5ba3a3b0d570b02354f`. Source relinking is integrated there;
its 108/108 affected gate, independent 29/29 subset and postmerge actual-HTTP 5/5
replay are separate existing evidence. The older baseline workflow has no actual
browser step, so even its successful completion cannot establish this acceptance.

The approved nine-file design and implementation plan are in
`docs/work/BROWSER_ACCEPTANCE_DESIGN_20261029.md`. The same PR24 now contains the
reviewed workflow, diagnostic and explicit-audio fixture corrections. The final
amendment updates existing documentation only. No product module, schema, engine,
runtime dependency manifest or permission policy is changed by this verification unit.

## Actual successful hosted execution

Both jobs completed **SUCCESS** on the exact head above: browser123220852085 and
offline123220852236. Every step in both terminal job records succeeded, including
temporary-file cleanup. Browser runtime: standard Ubuntu24.04 image20261026.354.1,
Chrome156.0.8078.47,Playwright1.64.1,Node24.22.1,Python3.12.14,
FFmpeg/FFprobe6.1.1-3ubuntu5,Pillow13.0.0,fonttools4.61.1,NumPy2.3.5.

| Actual browser scope | Output bytes | Playback | Full decode | MP4 SHA256 |
|---|---:|---|---|---|
| Existing editor |112392 |Time advanced;960px width |PASS |`ef867951a413ebca67a511c21f05cc048bd810a3516a7ac6fa1bcd0a95df572c` |
| Two-workspace relink |42074 |Time advanced;960px width |PASS |`3884487a5752a6a3c0c77a083767efb4257cf2eef1ece2baf2019e84424f4288` |

Both downloaded MP4s match their own QA record hashes. The existing-editor flow
explicitly preserves the selected original source/bus/gain while editing its end
before video trim, then retains that audio through Undo/Redo and saved JSON.
The relink flow recovered3 source IDs from2 physical files, dual MP4 roles,
current/Undo/Redo and historical BGM; wrong same-name content preserved the prior
edit, restart retained partial copies but still required explicit Open, and manual
gain survived another restart. The exported880Hz BGM amplitude was
`0.08796487420197949`. Original media and workspace A were unchanged.
These are actual generated-media browser actions, not DOM-double inference.

### Actual input and saved-evidence hashes

| Scope | Artifact | SHA256 |
|---|---|---|
| Editor | videoSha256 |`72c3035f71fbd42928646b43727055b40e21548be45bb41e6ee783529709f84a` |
| Editor | clearVideoSha256 |`be1d5959033c26b659de637ebe56c07a91006e62bab5784da9c8bd6ad108b45c` |
| Editor | bgmSha256 |`04cc48bd406484c1e294e955a27a2e98cfaa4ebb9da93515fdede613e1bf0229` |
| Editor | savedProjectSha256 |`54b1ce7ba635fef19e48b0be37e14a48059b5d179311a00ce245fb728786e1af` |
| Editor | qaSha256 |`d8772da864196565e8aa097086e7226c9605eb6cdccc5eefd959cbc78af56720` |
| Relink | videoSha256 |`6d95a5452de77ba83fd42b387f615e214af70ebbe0de87b12129ae731abca26f` |
| Relink | historicalBgmSha256 |`deb08de94c3711c321523c48f98f535bd6d44ba825bccee5e26f1ada2ed30e9f` |
| Relink | wrongSameNameBgmSha256 |`81349aa4f33e24937778dfdc4e178b3105bf692d74e71aca91a6234f883d4c37` |
| Relink | savedProjectSha256 |`3af5224f0fedfdd04a7ac8e533d10164553c35d9dad56831d7678b7a2f5a8a6a` |
| Relink | previousWorkspaceSha256 |`34f53664b9a45b4cf9fc9bb4fa501caab5e23828bbc18fc7c92b231ea701afa0` |
| Relink | recoveredProjectSha256 |`f91bda77247ef7b616627e2dff6012be978a80724783409b451547437f018e73` |
| Relink | qaSha256 |`5f874d73aea78df61bbdabae69c969013a69448a8c543cab18ac9fbf90764c85` |

### Existing offline regression job

Distinct executed command groups were checked against the workflow and terminal
log. Node ran167 cases in6 invocations; Python ran60 cases in8 invocations.
All227 test-case executions passed,0 skipped/failures/errors. The two overlapping
browser flows and earlier108-case local gate are not added to this total.

| Runtime | Distinct command target | Passed |
|---|---|---:|
| Node |`cloud/tests/*.test.mjs` |21 |
| Node |`packages/edit-planner/auto-edit.test.mjs` |11 |
| Node |`packages/project/*.test.mjs` |30 |
| Node |`apps/local-editor/*.test.mjs` |81 |
| Node |`prototypes/device-lab/audio-mix.test.mjs` |14 |
| Node |`prototypes/device-lab/audio-compat.test.mjs` |10 |
| Python |`engine.test_manifest engine.test_caption_raster cloud.processor.test_r2_run` |16 |
| Python |`prototypes/audio/test_mix.py` |3 |
| Python |`engine.test_local_signals engine.test_autoplan_pipeline` |7 |
| Python |`engine.test_project_pipeline` |2 |
| Python |`engine.test_saved_project_audio` |6 |
| Python |`engine.test_output_qa` |17 |
| Python |`engine.test_saved_sync` |5 |
| Python |`engine.test_saved_first_cut` |4 |

Windows/macOS/iPhone/Android and native pipelines, novice usability, authorized
real11GB performance, intelligibility, semantic AI and full Product DoD remain
open. The next existing safe requirement after integration is static-caption and
trim preview/export parity (ROADMAP P0,GOAL F5/F8): compare actual preview/export
frames at matched project times using generated media before proposing a repair.
No next-unit implementation is part of this PR.

## What the two scripts exercise

| Script | Actual actions and independent checks | Result |
|---|---|---|
| `apps/local-editor/browser-acceptance.mjs` | Existing UI import, manual sync, first-cut preview/confirm/apply, caption/trim, Undo/Redo, JSON download/reload, BGM timing/fades, render, QA download, Chrome MP4 playback, MP4 download and whole-file FFmpeg decode. All previous assertions retained; hashes/runtime and QA-to-output identity added. | PASS_SYNTHETIC_BROWSER on run40804733070 |
| `apps/local-editor/browser-relink-acceptance.mjs` | Real UI creates a session in A, downloads JSON, selects it in empty B, recovers three source IDs from two physical files, rejects wrong same-name bytes, restarts with partial copies, explicitly Opens, restores history-only BGM through Redo, edits gain, reloads/restarts, renders/downloads/plays/decodes and checks 880Hz BGM. Original media and all A project/registry/assets stay byte-identical. | PASS_SYNTHETIC_BROWSER on run40804733070 |

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

## Historical local preliminary checks before hosted execution

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
| Successful code-head hosted run |40804733070 SUCCESS |Exact `a767cc976a719cf325f0e717a3eab4d32e768b9c`; final documentation-head/main checks recorded separately in PR24 |
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

## Final integration gate

Root independently reviews the final documentation-only amendment on the same
[PR24](https://github.com/haji84/AI-VIDEO-STUDIO/pull/24), verifies its exact-head run, integrates safely and manually verifies
actual main. PR24 carries the resulting SHA/tree/run evidence. These documents
retain the last-tested implementation head and do not require an endless sequence
of commits to name their own later hashes. Product/device gates remain open.

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
PR. At that checkpoint the amended hosted workflow and both browser scopes were
**NOT_RUN**; local audio success did not establish hosted success. Run40804733070
above supplies the later actual hosted result. Preserve the failed baseline.

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
the original browser flow passed; its then-NOT_RUN diagnostic execution is
recorded in the following section, with later success recorded above.

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
This local HTTP/FFmpeg result did not establish browser PASS. The later corrected
exact-head run40804733070 above supplies both actual browser successes; physical
acceptance remains unverified.
