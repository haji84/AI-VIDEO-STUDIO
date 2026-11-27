# AI VIDEO STUDIO — Work continuation checkpoint
Updated: 2026-11-27 JST
Status: IN_PROGRESS. Physical ZBook, physical MacBook and Windows runner with generated media are TESTED_SYNTHETIC.

**Hosted Windows launcher and media checks, 2026-11-27 JST.** Draft #51 code
`7c0addc19a7011b1c81cd83e1eec0e00d2274464` passed all three
[manual smoke jobs](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45945991589).
The Windows job tested the cmd launcher, a Japanese fixture path, HTTP and
workspace checks, a real system-browser launch, and bounded cleanup. The test
disables browser autostart inside its temporary profile and verifies the browser
from the runner's normal profile. The Mac smoke used generated media for import,
editing, MP4 playback and reopening. Continue the transfer and device gates from
the roadmap. Live Photos requires the owner's policy and account consent. The
original v2.x call site and six exFAT symlink-fixture failures remain open.

**ZBook Google Photos authentication, 2026-11-25 JST.** The owner requested setup
and direct import. A dedicated project was created in the owner's existing Google
Cloud session; Photos Picker API is visibly enabled. Google Auth setup has app name
`AI VIDEO STUDIO`, external/testing audience and owner support/contact prepared.
The final user-data-policy agreement is unchecked and unsubmitted; an action-time
confirmation question is pending. Do not repeat project creation or API enablement.
No Desktop OAuth credential exists yet and the default local client JSON is absent.
Next: after policy confirmation, finish this form, prepare the Desktop OAuth client
and request the required credential-creation confirmation, register only the owner
as test user, save its JSON privately outside the repo, then safely restart the
existing editor against the same SSD workspace. Finish account consent and verify
an owner-selected short video actually downloads and enters a draft on the SSD.
Live import remains NOT_RUN. No billing/upgrade, private-media transfer or GORIQ
credential access occurred. Keep account/project IDs and secrets out of this public
repository. [Setup receipt](../validation/GOOGLE_PHOTOS_ZBOOK_SETUP_2026-11-25.md)

**Physical ZBook / external SSD, 2026-11-25 JST.** Main remains
`e1bf222dfe0043e307e3fc3c122e2fe52423dac8`; active implementation is Draft #51,
source `4253284038f2e49aeb4c8061b8459f97fe610235`. The native USB/exFAT target exposed
four defects: unsupported import hard links, unsupported final-output hard links,
changed file identity after rename, and cached-output verification with unchanged
timestamps. Regression-first fixes and independent static review are recorded in
[the physical ZBook report](../validation/ZBOOK_EXTERNAL_SSD_2026-11-25.md).

Everyday launch uses the desktop shortcut `AI VIDEO STUDIO - 外付けSSD` and
`D:\AI_VIDEO_STUDIO_DATA\editor`. Synthetic test data and media also remain on that
external SSD. Native Chrome passed retained two-upload recovery, reviewed first cut,
caption/source-audio MP4, full playback/decode/restart readback, simulated Google
Photos import and cross-workspace project recovery. Python 28 passed; native full
editor tests were 102 pass, 11 skip, 6 unsupported-symlink-fixture failures. Do not call
the full suite green. The new hosted CI is NOT_RUN: connected tools cannot dispatch
it, and the ZBook browser is signed out of GitHub. No new run was started.

The two original v2.x archives were found and their handoff digests verified; the
original failing call site and old-runtime repair are still unverified. The
2026-11-27 hosted verification above now covers the branch, and the native
fixture limitation remains open. Dedicated Photos Desktop OAuth setup needs owner
authorization and account consent. The current editor is running from the desktop
shortcut with the verified source and the external SSD workspace.
The optional running-editor desktop reopen helper was not created: local automatic
approval review rejected both the embedded-script shortcut and a passive URL-link
addition with only `blocked by policy` given as the reason. The existing startup
shortcut and running editor were preserved. Reopen the already-running editor in
the ZBook browser at `http://127.0.0.1:8765/`; do not claim same-shortcut reopen was verified.
Large-file replay cost, off-network phones, interrupted transfers and real-media
acceptance remain separate gates. Keep this checkpoint ahead of the historical notes below.

**Google Photos on Windows and ZBook, 2026-11-24 JST.** Tested source
`fd52522abea17595d3273245fa3ef7b26405cce2` in Draft #51 includes a Windows launcher
and uses the default browser for the editor and Google sign-in. On Windows Server
2025, the native launcher, tool discovery, saved local file and simulated Picker
imports, automatic draft, Chrome playback, full decode and restart hash match passed.
The physical test starts from a Codex chat with the ZBook selected as its host.
Launch this branch with `start-windows.cmd`, verify the installed FFmpeg pair and
use synthetic video in an approved workspace on the external SSD. Complete the
live Picker test after the app's Desktop OAuth setup and the owner's consent.
[Windows Google Photos evidence](../validation/WINDOWS_GOOGLE_PHOTOS_2026-11-24.md)

**Google Photos on the MacBook, 2026-11-24 JST.** Implementation
`678485710ed22574b41144fb82668d1afa87bbfe` adds a Google Photos entry to the
everyday editor. The download and local file route is ready. Chrome with a
simulated Google account and Picker passed actual import, reviewed first cut,
captioned export, whole-file decode, playback and restart SHA-256 readback.
For live direct import, configure the Photos Picker API and the app's Desktop
OAuth JSON, then verify owner-selected video with the owner's consent.
[Google Photos verification](../validation/MACOS_GOOGLE_PHOTOS_2026-11-24.md)

**Automatic first-cut follow-up.** Implementation
`600d50b1b409f1513b363240b398acdc853f6d46` waits for the user's Picker selection,
imports under the existing workspace lock and starts a first-cut candidate on
the running Mac app. The downloaded-file route also starts a draft if it adds
an eligible video. Actual Chrome with simulated Google responses and the full
Mac Node suite passed. The everyday editor is running with the updated panel.

**MacBook everyday launch, 2026-11-24 JST.** Tested implementation
`80a38688062f5883548ce2699ed7020fdbbc98d4` in Draft #51. Finder's
`start-mac.command` opens the local editor. The everyday project uses
`~/AI_VIDEO_STUDIO_DATA`. The app-local FFmpeg/ffprobe 8.0.3 pair and the
repository `.venv` work from a system-only launch PATH. A normal synthetic
one-input edit, Japanese-captioned MP4, full playback, restart hash readback,
and the separate two-input recovery flow passed. [MacBook launch evidence](../validation/MACOS_LOCAL_EDITOR_2026-11-24.md)

## Windows runner checkpoint — 2026-11-24 JST

Tracking [Issue #37](https://github.com/haji84/AI-VIDEO-STUDIO/issues/37) and
[Draft #51](https://github.com/haji84/AI-VIDEO-STUDIO/pull/51). Main remains
`e1bf222dfe0043e307e3fc3c122e2fe52423dac8`.
Tested source and workflow `d763e9e1507ae2b42fd9bc8245a34f06599b9183`.
[Manual CI run 45213580681](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45213580681)
passed all three jobs, including four Linux Chrome flows and the offline regression suite.

The Windows 2025 runner used the exact WinGet Gyan.FFmpeg 9.0.2 package. Both
executables were detected under a restricted launch PATH. Fixes preserve Japanese
error JSON under CP932 and read intermediate JSON as UTF-8 in the first-cut and
sync workers.
Chrome processed two synthetic uploads with no resends, applied a reviewed numerical
proposal and played an H.264/AAC MP4 through to the end on both sides of restart.
Full decode and SHA-256 readback passed. [Windows evidence](../validation/WINDOWS_MEDIA_GATE_A_2026-11-24.md)

**Next Gate A task on the physical ZBook:** identify the authorized device and
find the handoff's exact v2.x ZIP and the original exception location. Mac-side
Tailscale is running. Confirm the device connection before running any physical
acceptance. On the owner-approved external drive, reproduce the two-input flow
under its actual launch methods and save only synthetic evidence. Gate A on the
ZBook, Gates B–E and product acceptance remain open.

## MacBook checkpoint — 2026-11-23 JST

Status: IN_PROGRESS. Local Gate A on a physical MacBook is TESTED_SYNTHETIC.
Tracking Issue #37, documentation Draft #36, and implementation
[Draft #51](https://github.com/haji84/AI-VIDEO-STUDIO/pull/51) on `fix/zbook-media-preflight-20261115`.
Current main `e1bf222dfe0043e307e3fc3c122e2fe52423dac8`.
Tested Mac source `de9d303f13500cd4be390748ea8fd57020c236e6` follows inherited
branch head `7aff6b3bd0043c6873ee4c6328da61d45c3112ad`.

At resume, retain the 2026-11-15 media-tool, JSON and pending-import implementation.
The Mac fix resolves the workspace path at startup so aliases use the same
lock, write location and output verification. Chrome ran the normal editor,
relink and two-upload recovery flows. The 423,828-byte 960×540 H.264/AAC recovery
output played to the end before and after restart, decoded fully, and had SHA-256
`7d695213dd8e99dc333011b4f1ad8cefde445fb8e6abe90136672b4b3364da76` on readback.
FFmpeg/ffprobe 8.0 discovery and probe error boundaries were exercised on the Mac.
Regression used 8.0.3 for corrected multichannel true-peak measurement.
Evidence: [MacBook validation](../validation/MACOS_MEDIA_GATE_A_2026-11-23.md).
The same source passed all three hosted manual-smoke jobs.
[Hosted CI](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/45177252481)

**Next Gate A task on ZBook:** obtain the exact v2.x ZIP specified in the handoff
and redacted exception location. In the actual Windows launch environments verify
FFmpeg and ffprobe 9.0.2 discovery and JSON behavior. Use a consented external
storage folder, verify retained input hashes, then repeat no-resend import through
output, full decode, playback and independent restart readback. Record the Windows
result separately from Mac/hosted tests. Product DoD and Gates B–E remain open.

## Prior Issue #37 checkpoint — 2026-11-15 JST

Status: IN_PROGRESS. Issue #37 bounded main-equivalent fix is TESTED_SYNTHETIC.
Product DoD NOT MET. Exact ZIP, physical Windows/ZBook and remote device gates remain blocked/unverified.
mainSHA observed at resume/final base check: `e1bf222dfe0043e307e3fc3c122e2fe52423dac8`.
Implementation: `f26002df4e5be8fe0d97dee56d36ceed1d85020b`, branch `fix/zbook-media-preflight-20261115`.

### Verified current unit

Shared configured media tools/Windows installation discovery; None/malformed probe
response guards; completed upload retention and explicit no-resend retry; shutdown
mutation drain and exclusive-copy fallback. Final regression: Node196, Python75
engine +3 audio, zero failures/skips. Four real Chromium flows pass on this code.
New two-input recovery output416,596bytes SHA256
`9f80f38ca421538c0ccbc18316af5089cc4a3c11e4a6b5c5ab382947af0d7bcd` replays and fully decodes; independent restart
readback matches. All media is generated synthetic and remains outside Git.

### Next exact work

Obtain the app ZIP named/hashed by Issue #37 / Draft #36 and a redacted ZBook stack
location; review/adapt the bounded fixes to that separate source, then verify the
actual Windows process and complete Gate A. Do not replace main with the ZIP.
The manual CI has new checks but new hosted/Windows results are NOT_RUN; API calls
are Forbidden in this environment. Preserve Draft26 and HUB NATURAL27–35,38–39.
Chunked/resumable upload, unattended batches, Tailscale/phones on separate networks,
Google Photos, ASR/TTS/semantics and one-hour/tens-of-GB remain open.

Evidence: `docs/validation/ZBOOK_MEDIA_GATE_A_2026-11-15.md` and matching JSON.
Deferred minor: browser recovery acceptance needs explicit AIVS_PYTHON for its PATH
simulation. Corrupt pending journals remain fail-closed and need separate recovery.

### Connection bootstrap investigation — 2026-11-15 JST

The owner asked to investigate existing device access and connect if absent.
The managed network's live status reports Tailscale configured=false/state=disabled.
No configured external identity/connection or SSH host configuration was available
in this task. ZBook-side installation/login state remains unknown: it cannot be
inferred from the cloud-side finding. No device endpoint was guessed or scanned.
The available environment tools cannot enroll the managed VPN, and no desktop or
existing remote-device control tool is attached. No alternate VPN client, public
Funnel, port opening or Windows security-setting change was attempted.

A standalone local Windows connection-check helper was prepared for owner execution
and delivered in chat. It reads Tailscale status, can open the official local GUI or
Windows download page for owner action, and filters the report to this device's
state/private connection coordinates. It does not transmit media, raw logs, keys,
accounts or peers. Linux checks verified report filtering, malformed/disconnected
states and explicit WINDOWS_REQUIRED on the cloud machine. Windows GUI is NOT_RUN.
The helper alone does not connect the cloud: initial owner login/device enrollment
and managed cloud VPN binding remain external prerequisites for actual ZBook access.
No secret, private host address or device report is stored in this public repository.

### Device helper delivery failure — 2026-11-15 JST

Owner terminal output establishes the immediate failure: Python started but could
not open the helper at the suggested Downloads location (file not found). No
Windows username/path is retained here. The helper itself had not executed, so
this is not evidence of a Python/Tkinter, Tailscale or product failure.

Published the already prepared helper as `tools/zbook_connection_check.py` for
reproducible delivery. Its SHA-256 is
`b5dc07f469863a4abc903078f605b75ae322c5ce08859bd3b3c474c5e470b815`.
A commit-pinned HTTPS download plus SHA-256 check can execute its existing
`--check` mode from a unique user temporary path without assuming Downloads or
using the working directory. It does not change execution policy/security
settings. Linux report-filtering and explicit WINDOWS_REQUIRED checks pass;
actual Windows execution and private connectivity remain pending.

### Owner-side private-network status confirmed — 2026-11-15 JST

After verified helper delivery, the owner supplied its Windows report showing
Tailscale detected, Running and selfOnline=true. This is owner-reported device VPN
status only; no editing, ZIP repair or completed real-device MP4 acceptance follows.
Private device coordinates were supplied in chat and are intentionally omitted
from GitHub. The helper's Codex connectivity field remained NOT_TESTED.

Read-only cloud requests to the owner-supplied HTTPS and editor endpoints were
rejected (proxy CONNECT403 / HTTP403). Live managed-cloud status still showed VPN
configured=false/state=disabled, so no target service response was established.
An exact device-host HTTP allowance was saved/read back in the private environment
draft (revision3), preserving existing package presets and install/start instructions.
The running instance still uses its earlier policy: draft saving did not enroll VPN
or publish/apply the changes. No credential requirement was fabricated or collected.
The owner confirmed that the environment settings expose a VPN/Tailscale section.
Next: owner configures that section for the same tailnet through the secure UI,
saves/publishes the environment, then Codex verifies live enrollment and retries
the actual device service. No secret value should be sent through chat or GitHub.

## Historical checkpoint (preserved)

Updated: 2026-10-29 JST / 2026-10-29 UTC
Status: IN_PROGRESS. At candidate freeze, PR24 is integrated and actual main verified; saved-cut visual-preview candidate awaits independent review/hosted browser acceptance. Subsequent exact-head/main acceptance is recorded in the carrying implementation PR and its receipts.
Product DoD NOT MET. Physical/native/novice acceptance remains NOT_RUN/BLOCKED.
mainSHA (PR24): `c6bbd8d6f72d2653f350d6a01f9daf1d5ab31a13`
mainTree: `2175c9bde1a35ab6629c9d8cda95a939ee709dd5`
Goal: GOAL.md; protocol: docs/work/AUTONOMOUS_EXECUTION.md; tracking Issue #10.

## Integrated browser slice — 2026-10-29 UTC/JST

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

[PR24](https://github.com/haji84/AI-VIDEO-STUDIO/pull/24) is merged at the main SHA/tree above.
Final-head run40805679780 and [main run40806270812](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/40806270812) both passed both jobs.
Main offline job123225852969 repeated167 Node +60 Python cases without skip;
browser job123225853218 repeated both scopes with actual playback/full decode.
The new saved-cut-preview browser path below is separate and has no PASS at candidate freeze.
Evidence: `docs/validation/BROWSER_ACCEPTANCE_2026-10-29.md`.
Physical/native devices, novice usability, real11GB media and Product DoD remain open.

## Active saved-cut visual-preview unit

Base is verified main c6bbd8d6f72d2653f350d6a01f9daf1d5ab31a13. Scope is exactly
15 files in `docs/work/PREVIEW_PARITY_DESIGN_20261029.md`; no shared renderer,
project-schema, audio-contract or dependency change. The existing source player
and split action remain. The new explicitly requested MP4 is capped at7 output
seconds and rendered at the saved profile, with read-only revision/source binding.

Local tests cover actual generated video/captions/rates, source/output replacement,
owned worker/descendant timeout and parent close, verified-descriptor delivery,
and media-handle limits. Resource bounds describe a180-second lifetime and2-second
cleanup attempt; ambiguous kernel/filesystem cleanup remains fail-closed, and only
Linux is enabled. No permanent background execution or universal cleanup guarantee.

Next at candidate freeze: finish independent frozen-candidate review, run the new UI acceptance on
actual hosted Chrome alongside the unchanged two existing browser flows, and
integrate only after exact-head checks. Keep the new browser result NOT_RUN until
actual terminal evidence. Detailed commands, hashes, frame timing and limits:
`docs/validation/PREVIEW_PARITY_2026-10-29.md`.

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

1. PR24 integration and main verification are complete as recorded above.
2. At candidate freeze, complete the15-file saved-cut visual-preview unit through
   independent review, actual hosted acceptance, exact-head checks and safe integration.
   Read the carrying PR and its receipts for subsequent acceptance/integration before
   repeating any completed gate.
3. Preserve original media, saved audio/history, earlier failures and both actual
   PR24 synthetic successes. Keep physical/native/novice/11GB acceptance open.

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
