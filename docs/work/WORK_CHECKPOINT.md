# AI VIDEO STUDIO — Work continuation checkpoint
Updated: 2026-10-29 JST (2026-10-28 UTC)
Status: IN_PROGRESS. Current slice: F8 true-peak measurement, TESTED_SYNTHETIC.
Product DoD NOT MET. Actual GUI/native/physical acceptance NOT_RUN/BLOCKED.
previousIntegratedMainSHA (caption PR #19): `e79e5163759c31dd10e7adbe6af9bb55953f945e`
previousIntegratedSourceTree: `f8fa30b1f68b5426e738b52027118b2fca0d480a`
Goal: GOAL.md; protocol: docs/work/AUTONOMOUS_EXECUTION.md; tracking Issue #10.

## Current true-peak slice — 2026-10-29 JST

Implemented on the previous integrated source above: existing FFmpeg full-output
scan now measures intersample true peak and persists value/method/unit/coverage.
The -1.0 dBTP reference is a REVIEW threshold on 0.1 dB rounded measurements,
not a limiter or quality guarantee. Global findings offer whole-output playback;
they cannot identify a specific clip. Old/unavailable evidence stays unmeasured.
Tests: 24 targeted Python and 8 Node PASS; separate review found no unresolved
blocker after the global-navigation regression fix. Actual before/after AAC MP4
bytes match, while missed overshoot now produces a +2.6 dBTP review warning.
Details and exact scope: `docs/validation/TRUE_PEAK_F8_2026-10-29.md`.
The PR carrying this change is the integration record for its head/merge/tree
and postmerge checks; no future merge SHA is assumed here. Refresh those records
on resume. Hosted CI, GUI and physical-device acceptance are not asserted.

## Previous integrated static caption slice — 2026-10-29 JST

[PR #19](https://github.com/haji84/AI-VIDEO-STUDIO/pull/19) was squash-merged into
the main/tree above. All 172 source blobs were compared with the tested source,
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
static captions and verified font coverage. Evidence in docs/validation/.
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

## Exact next bounded task: existing manual audio edit to fresh QA acceptance

1. Refresh main/active PRs and the true-peak integration record. Use the
   real remote parent; never push fabricated local snapshot history.
2. Use the retained synthetic overshoot fixture with the existing local editor
   audio-gain edit/API. Explicitly reduce the selected gain, then exercise
   Undo/Redo, save and restart without changing the original source.
3. Render a fresh MP4 and verify its measured peak, output hash and persisted
   report. Keep the prior output/report intact and reject stale project-based
   navigation. This connects the existing A1 manual edit to the F8 warning;
   it does not add automatic correction or infer a peak's location.
4. Record the actual output/PCM and any observed defect before further code.
   This specific follow-through is NOT_RUN. Speech intelligibility, limiter
   guarantees, automatic repair and complete F8 remain open.

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
`node apps/local-editor/browser-acceptance.mjs`. It tests only temporary local
synthetic media, first-cut preview/apply, edits/history and MP4 playback/download.
API/DOM-stub/FFmpeg results are not browser/device PASS.
PC startup/recovery and exact owned-media checks: apps/local-editor/README.md;
S1/P1/F8 evidence documents have acceptance steps. Historical phone replay still
NOT_RUN. Do independent code work while physical acceptance is pending.

## Remaining product gates / boundaries

Physical iPhone/Android/Windows/Mac full flow, GUI/novice tasks, native adapters,
drift/video-event sync, Japanese persisted natural TTS, semantic AI/model metrics,
effects/audio preview parity, device caption acceptance, intelligibility/true peak, source
frame analysis, authorized real11GB performance and bounded automatic repair.
Not all independent tasks are blocked; resume the manual re-edit acceptance above.
Unfinished requirements must not be reported COMPLETE. No paid/R2/GPU/billing,
credential change, public production deployment, recurring task, private footage
upload or GORIQ operation. This checkpoint does not create background execution.
