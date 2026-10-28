# Manual audio-gain edit to a fresh true-peak report — 2026-10-29 JST

Status: **TESTED_SYNTHETIC**, existing HTTP/API and real MP4 path on Linux.
Base: integrated [PR #20](https://github.com/haji84/AI-VIDEO-STUDIO/pull/20),
main `80259d2f43c53254ac3b4ab7da87cef69e19a558`, tree
`d334434741245181ce251384f9ba08fd21156967`.
No product-code defect was reproduced; this change adds a repeatable acceptance
test and records the previously unrun follow-through. F8 and Product DoD remain open.

## Actual path exercised

Using generated media, the real loopback HTTP server imported a stereo MP4 and
rendered an output with a true-peak review warning. The existing explicit
audio-clip edit reduced its gain by 6 dB. Undo restored the original audio clip;
Redo restored the edited clip. The automatic disk save survived closing and
restarting the server. A separately saved session JSON also reopened through the
editor's existing `/api/open` route with the edited gain and history intact.

The next render created a new MP4 and a new inspection report. Both remained
available after another server restart. The original source, its imported copy,
the previous MP4 and the previous report retained their bytes. Rendering did not
change the saved editing state. Source selections, video cuts and bus settings
also remained unchanged by the explicit gain edit.

The original global peak result refused a specific clip target. Once the edit
revision changed, navigation using that older report was rejected as stale.
Inspection did not change either gain automatically or the earlier report.

## Measurements

Runtime: Linux, Node 24.22.1, Python 3.12.14, FFmpeg 6.1.1-3ubuntu5.
The configured Python environment has Pillow 13.0.0; this fixture has no captions.

The fixture is 0.5 seconds of generated test video and stereo 48 kHz audio:
quiet 440 Hz on the left, a phase-shifted 12 kHz tone with intersample overshoot
on the right, and gentle 10 ms end fades. It contains no voice or private media.

| Observation | Original output | After explicit -6 dB edit |
| --- | --- | --- |
| True peak, rounded FFmpeg estimate | +2.6 dBTP | -4.2 dBTP |
| Inspection status | NEEDS_REVIEW | CHECKED_LIMITED |
| True-peak reference warning | Present | Absent |
| Whole-file decode | PASS | PASS |
| Left-channel RMS, 0.15–0.35 s window | 0.0706309403 | 0.0354245935 |
| Right-channel RMS, same window | 0.8574079127 | 0.4250215123 |

Measured RMS ratios are 0.50154498 / 0.49570514, consistent with a 6 dB gain
reduction and lossy AAC encoding. The measured global peak changed by 6.8 dB;
the report does not assert exact linear peak scaling across encodes.
The PCM comparison covers only the stated window. Whole-file decode is a
separate check, not a claim of full-duration listening or intelligibility.

SHA256 values from the retained acceptance run:

- Source: `156bef8af275e06a503f610059c1cf103ca64e1026290cfaded496bdb11a0109`
- Original MP4: `28344aded8fccc55403fc82a905bca05b69d2dc299bec6ce3089e5a3b6888548`
- Edited MP4: `4eebedf10c2934adbec1cc6d8fca08b19506bbf04f59f8ada354206f5950def4`

The reusable test regenerates its source rather than bundling media or requiring
these hashes on other FFmpeg versions. It verifies identities within each run.
The retained scratch replay and the regenerated test produced these same three
media hashes in the runtime above. Scratch evidence is in
`verification/gain-evidence.json` with before/after reports and a retained
temporary workspace. No generated media or workspace is included in this change.

## Reproduction and results

From the repository root, with the normal local Node/Python/FFmpeg dependencies:

```sh
node --test --test-isolation=none apps/local-editor/true-peak-server.test.mjs apps/local-editor/qa.test.mjs
```

Set `AIVS_PYTHON` if the renderer's Python executable needs to be selected.
The new actual HTTP/media acceptance and the eight existing inspection/display
tests passed: **9/9 PASS**, no skips. A separate retained replay of the same
workflow also passed. This was a targeted run, not a new full suite or hosted CI.
The initial sandbox attempt could not bind 127.0.0.1; the narrowly authorized
local test execution then ran successfully. No external service was used.

## Limits and next bounded task

This validates the existing API/engine path. It does not validate browser clicks,
visual previews, device codecs, novice usability, real speech, a true-peak limiter
or automatic repair. GUI still lacks the browser executable; the blocked browser
download was not repeated. All platform and Product DoD gates remain unchanged.

Earlier output/report files remain on disk. The existing app restores only the
latest output into its UI/API index after restart; it does not yet offer a durable
history selector. Next bounded work is to restore and select previous verified
outputs/reports after restart, with output/report hash binding and explicit
failure for missing or changed evidence. This next work is **NOT_STARTED**.
Its acceptance must use at least two outputs and preserve stale-project checks;
it must not erase or overwrite old output files.

The PR carrying this acceptance change records its integration head/merge/tree
and postmerge verification; no future integration SHA is assumed here.
