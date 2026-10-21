# S1 local sync candidate -> explicit review -> saved camera output

TESTED_SYNTHETIC; full F2/product DoD NOT MET. Parent main
7fed306e67da59c59dadf03c1a89000a55b450d6/tree5436950433fda5df99a370fe5a22a59acde6e3ba
matched the local baseline. Reuses engine.core_v01.sync_sources and v1 project.

## Behavior and safeguards

One local analysis at a time, first300s per selected pair, no network or cloud.
Correlation needs100 envelope bins/10s common audio. Candidate report contains
project ID/revision and full source identities, confidence/uniqueness and an
explicit NOT_ESTIMATED drift label. A private journal records report SHA and
survives restart. CLI/common validation, selected-file hashes before/after,
standalone demux/protocol restrictions and Apply-time rehash protect the boundary.

Analyzing is read-only. Explicit confirmation is required to change only the
target offset/status; timeline and deliberate soundtrack remain unchanged.
Old revision/identity, already confirmed targets, low-confidence/silent inputs
or nonzero drift cannot be auto-applied. Existing manual adjustment is retained.
The local UI includes two common-scene play positions and manual fallback.
Actual browser DOM/media synchronization is not verified in this runtime.

Confirmed camera choice uses shared time instead of equal file time. An actual
render exposed a legacy boundary bug: filtering an unused master left the first
used camera at nonzero offset, which the legacy renderer rejects. Rebase both
source offsets and timeline shared starts together; preserve local source trims.
No safety gate was weakened. A delayed audio-stream regression also proved
envelope extraction must reconstruct initial PTS silence before correlation.

## Executed evidence

Full suite156 PASS =112 Node +31 engine/cloud +3 audio +10 legacy on Linux,
Node24.19.0/Python3.12.14/FFmpeg6.1.1. Independent reviewer ran8 edit/sync cases
and reported no Critical/Important findings; no deferred minors were listed.

| Actual generated fixture measurement | Observed |
|---|---|
| Relative offset / agreement / uniqueness | 2.0s / 0.998 / 0.591 |
| Master with shared offset3s | target candidate5s, project unchanged |
| Delayed audio stream | reconstructed lag -1s; regression RED -> GREEN |
| Missing master/silent target | UNVERIFIED; no applicable candidate |
| HLS disguised as MP4 / wrong hash / existing evidence | refused |
| HTTP analysis/restart/explicit confirm | PASS; same report restored |
| Confirmed camera-only actual MP4 | red pixels, whole decode, original RMS0.1537316 |
| Master input SHA256 | 08acdd4d14ecf7702c566a3d89a428f3ec543754823338d8d7cb3160b50be4cd |
| Target input SHA256 | 40b3ea5d6776b186febfefcaa8b942ba95211851ec1d0db64800d213c726d8b9 |
| Output SHA256 | c5af4a719d25674a8b551e2373a266ea9c2e3257ce96d9bf3446c75ebc742e33 |

The HTTP test calls the same camera-time helper then submits project editing;
it is not GUI-click evidence. Confidence is correlation, not a physical accuracy
guarantee. Files are generated at runtime; no media bytes/private paths committed.

```sh
node --test cloud/tests/*.test.mjs packages/edit-planner/*.test.mjs packages/project/*.test.mjs prototypes/device-lab/*.test.mjs apps/local-editor/*.test.mjs
python -m unittest engine.test_manifest engine.test_local_signals engine.test_autoplan_pipeline engine.test_project_pipeline engine.test_saved_project_audio engine.test_output_qa engine.test_saved_sync cloud.processor.test_r2_run -v
python -m unittest discover -s prototypes/audio -p 'test_*.py' -v
# From legacy/desktop-v0.1:
python -m unittest discover -s tests -v
```

Open GUI with apps/local-editor/README.md. Physical check: import two owned
same-session videos; analyze; play both indicated common scenes; listen/check
distinct common events twice; only then confirm. Restart, choose camera, export,
replay MP4 and inspect source audio/project reopening. Report errors/anonymous
device facts without sharing private media. Repeat separately on each platform.
This PC-source slice is not native iPhone/Android installation or acceptance.

Browser executable remains unavailable; earlier probe hit Proxy CONNECT timeout.
No identical failed downloads repeated. Native devices, drift estimation,
video-event sync, real11GB media/performance and semantic editing remain open.
No paid resources, new models/assets, public production deployment, original
footage upload, recurring task or other-product changes. Actions manual-only,
not run; the numbers above are actual local tests, not CI claims.
