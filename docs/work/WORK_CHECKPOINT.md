# AI VIDEO STUDIO — Work continuation checkpoint
Updated: 2026-10-29 JST / 2026-10-29 UTC
Status: IN_PROGRESS. Both bounded Ubuntu Chrome browser scopes PASS_SYNTHETIC_BROWSER; PR24 final documentation/integration pending.
Product DoD NOT MET. Physical/native/novice acceptance remains NOT_RUN/BLOCKED.
previousIntegratedMainSHA (source-relink PR #23): `9bf5c9cf993df8ea4b93ee71b216dfb0f0b18209`
previousIntegratedSourceTree: `77f8d8b5d04c9cddd9bbe5ba3a3b0d570b02354f`
Goal: GOAL.md; protocol: docs/work/AUTONOMOUS_EXECUTION.md; tracking Issue #10.

## Verified browser slice; same PR24 pending integration — 2026-10-29 UTC/JST

Last-tested implementation head `a767cc976a719cf325f0e717a3eab4d32e768b9c`, tree
`3b0f6429e16277256e48a6a9ee272975538a2d22`. [Run40804733070](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/40804733070), attempt1, is **SUCCESS**:
browser job123220852085 passed both actual UI scripts; offline job123220852236
passed all existing steps (167 Node +60 Python test-case executions,0 skips/errors).
Do not add overlapping browser/API runs to a single feature count.

Actual browser runtime: standard Ubuntu24.04 image20261026.354.1,
Chrome156.0.8078.47,Playwright1.64.1,Node24.22.1,Python3.12.14,
FFmpeg/FFprobe6.1.1-3ubuntu5. Both outputs advanced in Chrome at960px width,
matched their QA hashes and passed whole-file decode:

- Existing editor112,392bytes: `ef867951a413ebca67a511c21f05cc048bd810a3516a7ac6fa1bcd0a95df572c`.
- Two-workspace relink42,074bytes: `3884487a5752a6a3c0c77a083767efb4257cf2eef1ece2baf2019e84424f4288`.

The relink flow preserves source IDs/current/Undo/Redo, requires explicit Open,
rejects wrong same-name bytes, reuses partial copies after restart, retains manual
gain and restored880Hz BGM (amplitude0.0879648742), and preserves originals/workspace A.
The editor flow explicitly trims preserved original audio before shortening video;
actual saved audio differs only at that chosen end time, including after Undo/Redo.

Keep the failure history distinct:40788585989 lacked FFmpeg;40802909769 failed an
unlocalized browser wait;40803673614 showed AUDIO_EXCEEDS_VIDEO_TIMELINE. The
original2-second soundtrack was correctly protected. The fixture now explicitly
edits it through the UI before the1-second video trim. No product source or original
assertion/timeout was weakened. Earlier files and diagnostic logs remain evidence.

[PR24](https://github.com/haji84/AI-VIDEO-STUDIO/pull/24) is still pending integration. Root independently reviews this final
bounded documentation amendment, checks its exact head, integrates the same PR,
and verifies actual main. PR24 is the record for the final SHA and main CI; no
future result or self-referential documentation hash is invented here.
Evidence: `docs/validation/BROWSER_ACCEPTANCE_2026-10-29.md`.
Physical/native devices, novice usability, real11GB media and Product DoD remain open.

## Integrated source-relinking slice — 2026-10-29 JST

Bounded saved JSON prepare -> selected raw media bodies -> verified durable
registry copies -> explicit Open. The plan binds random ID and current projectId /
revision; current+Undo+Redo identities must all agree and exist. Ordinary import
still uses new IDs and edits the current project, so recovery uses a separate
copy/probe/registry path with no edit until Open. SHA/probe validation retains
original IDs, including separate video/BGM roles for one audiovisual file.

Actual generated two-workspace recovery retained one good upload through a wrong
same-name audio failure and restart; historical-only BGM returned through Redo
and was audible in the exported, fully decoded MP4. First workspace/session and
original media/copies stayed unchanged. Final gate: 108/108 affected Node cases
PASS, no skips, after all code review fixes. Root review's cross-role compatibility
finding is fixed and tested against actual existing import. Independent review's
committed-Open/delayed-response cancellation race is fixed with a committing guard
and verified through real HTTP regression plus independent replay. No additional
code blocker remained before the final gate. PR #23 integrated at the current
main/tree above; independent subset 29/29 and postmerge actual-HTTP replay 5/5 pass.
The seven code/test and seven documentation files are the complete unit.
No schema/core/history/engine/dependency/workflow or remote change by this worker.

Registry write failure can leave a renamed unregistered copy, which is not
acknowledged or admitted by folder scanning; it is not claimed automatically
reusable. Registered verified copies remain usable after cancellation/restart
and still require explicit Open. No crash-atomic multi-file promise.
Evidence: `docs/validation/SOURCE_RELINK_F1_2026-10-29.md`.
Plan/design: `docs/work/SOURCE_RELINK_F1_PLAN.md` and `SOURCE_RELINK_F1_DESIGN.md`.
PR #23 records review, final manifest/tree and integration. Do not repeat this
integrated implementation. Root owns publication; this worker has no remote writes.

## Integrated retained-output history slice — 2026-10-29 JST

Completed-output journal, 50 recent entries, metadata-only listing and explicit
output/report verification on selection. No workspace scan or deletion of older
files. Saved project/history and live-job identity are not changed by viewing.
A separate history-write failure preserves the completed latest-job receipt;
legacy migration covers only that last old completed output, with unknown old
time and report integrity beginning at migration.

Two actual generated MP4/report pairs were restored after restart, selected,
downloaded (including byte ranges) and fully decoded. Tamper/missing/link/orphan
cases fail closed. Complete local-editor suite: 52/52 PASS, no skips; inline
module syntax and DOM-double selection tests pass. Independent review found a
latest-job size-check/read gap, now fixed by bounded handle reads and independently
retested. Actual GUI/native/device acceptance remains unverified.
Evidence: `docs/validation/OUTPUT_HISTORY_F8_2026-10-29.md`.
The carrying PR is the record for frozen-file review and exact integration /
postmerge checks. Do not repeat this implementation after it is integrated.

## Integrated manual gain acceptance — 2026-10-29 JST

Existing HTTP import/render -> explicit audio gain -6 dB -> Undo/Redo -> save/
restart -> saved JSON reopen -> new MP4/report -> restart passed on generated
media. Peak +2.6 -> -4.2 dBTP; source/imported copy/prior output/report unchanged.
PCM RMS ratios in the documented 0.15–0.35 s window are 0.501545 / 0.495705;
both outputs fully decode. Existing history/revision/global-findings safeguards
passed. No product-code fix was required. New self-generated HTTP/media test +
8 inspection/display cases: 9/9 PASS, no skips. Details, hashes and limitations:
`docs/validation/TRUE_PEAK_MANUAL_EDIT_2026-10-29.md`.
PR #21 records its exact integration and postmerge checks.
The prior implementation came from PR #20 at main
`80259d2f43c53254ac3b4ab7da87cef69e19a558`.

## Integrated true-peak slice — 2026-10-29 JST

Implemented in PR #20 on the prior caption checkpoint: existing FFmpeg full-output
scan now measures intersample true peak and persists value/method/unit/coverage.
The -1.0 dBTP reference is a REVIEW threshold on 0.1 dB rounded measurements,
not a limiter or quality guarantee. Global findings offer whole-output playback;
they cannot identify a specific clip. Old/unavailable evidence stays unmeasured.
Tests: 24 targeted Python and 8 Node PASS; separate review found no unresolved
blocker after the global-navigation regression fix. Actual before/after AAC MP4
bytes match, while missed overshoot now produces a +2.6 dBTP review warning.
Details and exact scope: `docs/validation/TRUE_PEAK_F8_2026-10-29.md`.
PR #20 records its head/merge/tree and postmerge checks. Refresh those records
on resume. Hosted CI, GUI and physical-device acceptance are not asserted.

## Previous integrated static caption slice — 2026-10-29 JST

[PR #19](https://github.com/haji84/AI-VIDEO-STUDIO/pull/19) was squash-merged into
main `e79e5163759c31dd10e7adbe6af9bb55953f945e`, tree
`f8fa30b1f68b5426e738b52027118b2fca0d480a`. All 172 source blobs matched the tested source,
including the 14 reviewed changed files. The planned static-caption safe-bounds
and glyph slice is TESTED_SYNTHETIC on Linux; F8 and Product DoD remain incomplete.
Postmerge, the integration agent reran the 9 caption and 2 Japanese manifest
tests under Pillow 13.0.0: 11/11 PASS. Hosted CI and Docker build were NOT_RUN.

Historical premerge results: initial disjoint regression groups covered 187
cases with 184 passes and 3 Japanese-font-unavailable failures. Explicit missing
glyph refusal was verified; actual Japanese rendering was blocked at that point.
See `docs/validation/CAPTION_RASTER_F8_2026-10-28.md` for exact scope/runtime,
real synthetic MP4 evidence, observed failures and remaining acceptance.

Additional verification on 2026-10-28: one SHA256-verified official Ubuntu
fonts-noto-cjk package was extracted into scratch only. With its Noto Sans CJK JP
font explicitly selected, the three unchanged blocked tests all passed. New
actual MP4s prove 130 Japanese characters wrap to 5 safe lines and 3 explicit
Japanese lines remain 3, with all requested glyphs present, full decode and
440 Hz audio. The original 184/187 result remains recorded; all 187 cases now have
passing evidence across separate runs, not a new full-suite/CI pass. No system
font install, font redistribution, production code or test change was needed.

Dependency follow-up: requirements now select Pillow >=13.0,<14 for its upstream
security fixes; setup requires Python >=3.11 (CI uses 3.13, Docker uses 3.12).
An isolated Pillow 13.0.0 environment passed the unchanged 9 caption + 2 Japanese
manifest cases and 1 Node media case. Regenerated Japanese MP4/raster hashes
match the earlier artifacts exactly. No full-suite, CI or image-build claim.

The implementation is integrated, not an outstanding local candidate. Do not
repeat the caption implementation. Product DoD is unchanged; use the exact next
task below. Older dated checkpoints and their test totals remain historical.

## Integrated milestones

PR #11 project/history/relink; #12 saved four-bus renderer; #13 local editor/API;
#14 output inspector/re-edit; #15 per-audio controls; #16 sync candidates/shared
clock; #17 first-cut proposals; #18 output freeze/cadence warnings; #19 measured
static captions and verified font coverage; #20 whole-output true-peak estimates
and correctly global review results; #21 manual-gain-to-fresh-QA acceptance;
#22 retained completed-output history and checked explicit selection after restart.
Evidence in docs/validation/.
Do not repeat finished work.
Current source is tested synthetic Linux, not accepted on all product devices.

## Historical P1 and F8-B — 2026-10-21

P1 PR #17: mainbb872b8f9aeb9b85659d88cff59719ddd56d909c,
tree381d740874cfe93a44287ee8644f1f0d7e3d1b8f matched tested source.
Explicit source/revision-bound candidate -> restart -> confirm -> Undo/Redo ->
manual caption -> actual selected-camera MP4. All four saved audio buses kept.
Owned440Hz0.1242775 + extra880Hz0.02352985; unwanted660Hz0.00000432.
Two independent-review P2s (fractional tail and tiny verified boundaries) fixed
RED/GREEN without weakening real-gap/missing-video-tail refusal. Full171 PASS,
postmerge27 editor +11 actual extractor/proposal/output PASS. Evidence:
docs/validation/FIRST_CUT_P1_2026-10-21.md. P1 checkpoint0be8e706a8c42486706e5a854d9ae70ecdcd6ce2.

F8-B PR #18 merged expected heade6049ea39fd4487e574155f46b167bc5d70acd6c.
At that checkpoint, main `1348c88bd9b482d0b501da918b3561a909aa16f4` /
tree `4655cea34ebfc5f3ce17e3e8250a5cb00d02816f` matched the tested source.
At that time 177 cases passed:
122 Node +42 engine/cloud Python +3 audio +10 legacy. Final independent review
APPROVE/no blockers; reviewer separately ran17 Python +5 Node PASS. Test-layout
nit fixed, direct module now11 PASS. Postmerge29 editor +17 actual output/audio
QA PASS. Logs /tmp/aivs-f8-full-{node,python}.log and
/tmp/aivs-f8-postmerge-{node,python}.log. Durable commands and fixture evidence:
docs/validation/OUTPUT_FREEZE_F8_2026-10-21.md.
Real4s static export -> persisted warning -> restart -> exact clip -> explicit
manual0.8s trim -> new inspected MP4 -> full FFmpeg decode. Input unchanged.
InputSHA de2429a5f5a8a6137e73d0235fa127a9430648a37e07536a0e4057e76f0eb50a
FirstOutputSHA 1e888c0435f0f77a61358f12f42c19682e1ccc1f3efa5fff0e609828616e9207
NewOutputSHA 2b76db2ad86040e4121a63acaf668667b4a943d039c17c47d641478a59745faa
Freeze0.020019–4.02002s,95 constant intervals/96 frames. New duration0.811687s.
Freeze/cadence are REVIEW warnings; intentional stills/VFR are not auto-repaired.
Audio-only absent video tails are not labelled frozen. Old reports retain their
original detector coverage. Clean merge/protectionfalse/check-runs0/statuses[]
observed; no policies changed. Actions manual-only NOT_RUN, not a CI PASS.

## Continuation after this bounded slice

1. Finish [PR24](https://github.com/haji84/AI-VIDEO-STUDIO/pull/24) with reviewed documentation, actual final-head CI and safe
   merge; verify the merged main through the existing manual workflow. Record the
   actual main SHA/tree/run in PR24 rather than inventing it in this earlier file.
2. After integration, investigate the existing P0/GOAL F5/F8 static-caption and
   trim preview/export parity gap. Compare actual browser preview and exported
   frames at matched project times using generated media, then propose the smallest
   correction supported by a reproduced discrepancy. No next-unit code exists yet.
3. Preserve these actual synthetic successes and both earlier browser failures.
   Physical iPhone/Android/Windows/macOS, novice tasks, native adapters and real11GB
   performance remain separate acceptance. Continue safe portable work while those
   external observations are unavailable.

## Browser/device blocker and replay

On 2026-10-29 JST, the existing browser command again returned
BLOCKED/BROWSER_EXECUTABLE_UNAVAILABLE, exit 2, before browser/server startup.
Playwright 1.62.1 exists; its Chromium 151.0.7922.34 / revision 1234 is absent.
One permitted download from the official URL returned a 195-byte HTML
"Site Unavailable" page, not a ZIP; this was not an approval rejection. No retry,
system install or persistent service followed. See the caption validation doc.
Do not repeat this unchanged download. When an actual compatible Chromium is
available, set AIVS_BROWSER_EXECUTABLE to its path, AIVS_PYTHON to an executable
using Python >=3.11 and Pillow 13, and AIVS_CAPTION_FONT to a verified Japanese font; run
both `node apps/local-editor/browser-acceptance.mjs` and
`node apps/local-editor/browser-relink-acceptance.mjs`. The candidate's manual CI
job uses the runner's installed Chrome instead of downloading another browser.
Both scripts use temporary synthetic media; their actual hosted execution now
passes in run40804733070. The local missing executable does not block that established
hosted route. Physical-device and novice acceptance remain separate.
API/DOM-stub/FFmpeg results are not browser/device PASS.
PC startup/recovery and exact owned-media checks: apps/local-editor/README.md;
S1/P1/F8 evidence documents have acceptance steps. Historical phone replay still
NOT_RUN. Do independent code work while physical acceptance is pending.

## Remaining product gates / boundaries

Physical iPhone/Android/Windows/Mac full flow, GUI/novice tasks, native adapters,
drift/video-event sync, Japanese persisted natural TTS, semantic AI/model metrics,
effects/audio preview parity, device caption acceptance, intelligibility/true peak, source
frame analysis, authorized real11GB performance and bounded automatic repair.
Not all independent tasks are blocked; the next independent gap is recorded above.
Unfinished requirements must not be reported COMPLETE. No paid/R2/GPU/billing,
credential change, public production deployment, recurring task, private footage
upload or GORIQ operation. This checkpoint does not create background execution.
