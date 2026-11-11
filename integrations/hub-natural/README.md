# HUB NATURAL: private media intake and 3-draft proof (not production)

This is an **optional** adaptation for @hub_natural84, not a replacement of the
existing AI VIDEO STUDIO offline-first editor. Google Photos, Instagram,
publication and any paid AI service are **not** connected. An optional,
owner-authorized read-only Google Drive v3 adapter can download from an explicitly
selected private INBOX, but no OAuth credentials are provided by this repository
and the connector is not automatically enabled. The source is public; **media,
labels, real filenames, real scene snapshots, location, secrets, and exported
MP4s must remain in a separate private location**.

## Realistic completion gates

1. **Media transfer:** The Google Photos API cannot enumerate previously uploaded
   arbitrary user media after 2025-03-31. Select/export once with Google Photos
   Picker or Takeout, and authorize an independent future sync to a private Drive
   `INBOX` or device folder. This adapter can read an explicit *local folder*.
2. **Intake:** `scan` produces SHA-256, duration, dimensions, audio presence,
   duplicate checks. It does **not** classify whether a snake is visible.
3. **Semantic gate:** `render` requires source-SHA-bound, timestamped segments with
   reviewed labels `discovery`, `capture`, `observation` or `closeup`. The current
   `engine/local_signals.py` is a numerical motion/contrast/audio sampler, not
   an animal classifier. Future classifier work must be separately evaluated on
   labeled actual footage; do not promote signal scores to semantic evidence.
4. **Three draft versions:** A (challenge), B (discovery) and C (wildlife) use
   different verified-shot ordering and caption treatment. They are real vertical
   H.264/AAC MP4s with original audio where present and silent AAC when absent.
   The script checks whole-file decode, media metadata, hash and receipt.
5. **Publication blocker:** Face/plate/GPS/unsafe-action checks have **not** been
   proven; generated MP4s always report `REVIEW_REQUIRED` and are never posted.
   A supplied owner-approved gorilla logo is overlaid; without one, output is
   a private visual proof with `GORILLA_LOGO_MISSING` gate. No song/SE is added
   without a verified license.
6. **Remaining integrations:** Google Drive continuous OAuth/new-file trigger, durable private
   output storage plus independent readback, iPhone playback, Instagram Insights
   OAuth and 24h/7d PDCA, model-based semantic event detection and measured
   competitor-based quality calibration are **not done**.
   Uploading drafts via a separate, permissioned tool does not prove an automated
   unattended pipeline.

## Commands

Requirements: Python 3.11+, FFmpeg/FFprobe, Japanese font (auto-discovered with
`fc-match` or explicitly supplied via `--font`). Media is opened read-only.

```bash
python integrations/hub-natural/pipeline.py scan \
  --root /private/habuvideo/INBOX \
  --out /private/habuvideo/catalog.json

python integrations/hub-natural/pipeline.py render \
  --root /private/habuvideo/INBOX \
  --labels /private/habuvideo/reviewed_clips.json \
  --logo /private/habuvideo/approved_gorilla.png \
  --out /private/habuvideo/drafts
  # optionally: --interest-reviews /private/habuvideo/reviewed-editorial.json

cd integrations/hub-natural && python -m unittest -v test_pipeline test_drive_intake test_new_arrival_job test_interest_eval
```

Private reviewed label example (never commit a real one):

```json
{"schema":"hub-natural-reviewed-segments-v1","clips":[
  {"file":"a.mp4","sha256":"<verified source SHA256>","start":1.0,"end":3.0,"tag":"discovery","reviewed":true},
  {"file":"b.mp4","sha256":"<verified source SHA256>","start":2.0,"end":4.0,"tag":"capture","reviewed":true},
  {"file":"c.mp4","sha256":"<verified source SHA256>","start":3.0,"end":5.0,"tag":"observation","reviewed":true}
]}
```

`reviewed:true` means an authorized reviewer actually inspected a specific scene;
it is never inferred from the filename or the numerical signal score.

**Never** consider passing synthetic tests proof of live Google Photos→Drive→render
or actual iPhone/Instagram acceptance. Existing AI VIDEO STUDIO code remains
unchanged. All source clips must be permissioned and safe to share, and an owner
must perform the actual publication action.

## Next gate: opt-in Drive INBOX intake (unattended *component*, not live service)

`drive_intake.py` is a separate, default-off **read-only** Drive v3 adapter to be
used only after the owner approves the host and grants narrowly scoped OAuth
access. It does **not** use the connected ChatGPT Drive credentials, and **will
not work unattended merely because this repository or the ChatGPT app is
connected to Drive**. It does not enable GitHub Actions media access.

Features:
- Lists files in one specified Google Drive INBOX folder, handles pagination,
  ignores non-video MIME types, refuses oversized or missing-integrity videos.
- Streams each file to a private `.partial-` file, checks Google-provided MD5,
  size, remote version and parent after download, then atomically saves under
  an opaque filename (never the original Drive filename).
- Preserves a separate private SHA-256 state JSON to skip exact reruns and
  HOLD changed or damaged media. **Different Drive file IDs require separate
  byte downloads and SHA-256 checks before deduplication**; provider MD5 alone
  is not trusted as proof that two videos are identical.
- Single-writer guard and atomic state; retry can recover a fully saved video
  whose state update was interrupted. No deletion or rewriting of originals.
- No scene detection, no captions, no posting, no network except Google Drive
  and the optional OAuth token-refresh endpoint; no tracking/analytics calls.

Local command on a private persistent device (DO NOT use a public Git checkout
or place output files inside one):

```sh
export HUB_NATURAL_GDRIVE_ACCESS_TOKEN='...temporary-owner-consented-token...'
python integrations/hub-natural/drive_intake.py \
  --folder-id '<owner-private-Drive-INBOX-folder-ID>' \
  --inbox '/private/hub-natural/media' \
  --state '/private/hub-natural/state/drive-intake.json'
```

For offline unattended operation an authorized app must refresh tokens via
`HUB_NATURAL_GOOGLE_CLIENT_ID`, `HUB_NATURAL_GOOGLE_CLIENT_SECRET`, and
`HUB_NATURAL_GOOGLE_REFRESH_TOKEN`, all placed **only in a private secrets
store**. Never paste tokens in chat, documentation, GitHub issues or PRs. Grant
only the minimum Drive scopes required for the selected owner-controlled folder,
subject to Google's current scope/authorization restrictions.

**Cloud completion blockers:** GitHub-hosted runners are ephemeral and cannot
retain the private downloaded files/state automatically. Do not attach cloud
runner credentials or private video to this Public repo without a separate owner
approval of the processing location, scopes, retention, billing and private
state/output destination. End-to-end unattended arrival -> bytes -> hash ->
semantic labels -> 3 drafts -> private Drive readback -> iPhone replay is NOT
PROVEN. The synthetic GitHub PR test workflow uses **no credentials** and
uploads no media or build artifacts.

**PR safety improvements:** scanner catalog output must be outside source media
and uses atomic writing; render refuses an existing output folder, creates
complete files in a private staging directory, verifies source SHA again, then
moves the 3 drafts and REVIEW_REQUIRED receipt together. A failed render must
not leave a falsely passing receipt. Neither the PR tests nor the read-only
intake validate content meaning or privacy of real footage.

## Next gate: private new-arrival review queue, not fake semantic success

`new_arrival_job.py` combines the `drive_intake` authenticated read-only
component with actual FFprobe-based `pipeline.scan`. A valid new arrival is
stored immutably; its queue record says `NEEDS_SEMANTIC_REVIEW`, `NOT_EVALUATED`,
`NOT_PERFORMED` (privacy) and `NOT_PERFORMED` (posting). A second invocation on
the same stable Drive file must not download it again. Corruption and changed
source versions HOLD. No draft or post can be generated by this step.

Example on an **owner-approved private persistent host**, not a public runner:

```sh
python integrations/hub-natural/new_arrival_job.py \
  --folder-id '<private INBOX ID>' \
  --inbox /private/hub-natural/media \
  --state /private/hub-natural/state/drive-intake.json \
  --catalog /private/hub-natural/state/catalog.json \
  --review-queue /private/hub-natural/state/review-queue.json
```

This command does not make itself recurring. A separate scheduled process,
restricted OAuth credentials, persistent private state, owner-approved cloud
host/retention boundaries, success/failure monitoring, and real unattended
new-file proof are still required before production.

## Editorial-interest ranking (reviewed evidence only)

`interest_eval.py` adds a transparent, *subjective editorial* rubric:
`hook`, `clarity`, `action`, `payoff`, `surprise` (each 0..4). It produces
three independent ranked plans for the challenge, discovery and wildlife styles.
An objectively unclear subject is penalized even if the action was dramatic.
Only scenes explicitly declared `reviewed:true`, `eventEvidence:"human_checked"`,
`subjectVisible:true`, with source SHA+interval can enter the rankings. **This
boolean is a declaration by the file author, not cryptographic evidence**; an
independent human review workflow remains necessary for real footage. A model's
unverified guess is never silently promoted to confirmed snake behavior.

Use optional `--interest-reviews /private/.../editorial.json` with the
`pipeline.py render` command to rank the verified scene set. The original
source SHA, interval and event label must match the reviewed clips, otherwise
render HOLDs. Without this file the old preset tag ordering remains available
but receipts explicitly state `TAG_PRIORITY_FALLBACK_NO_MEASURED_INTEREST`.
The interest score is **not** a probability of going viral, and a score-based
edit is still always `REVIEW_REQUIRED` and never published automatically.

Private editorial file example (synthetic, do not commit real ratings):

```json
{"schema":"hub-natural-editorial-reviews-v1","scenes":[
  {"sourceSha256":"<verified 64-char SHA256>","start":2.0,"end":4.0,
   "event":"discovery","reviewed":true,"eventEvidence":"human_checked",
   "subjectVisible":true,
   "editorial":{"hook":4,"clarity":3,"action":3,"payoff":2,"surprise":1}}
]}
```

`evaluated_detections()` can compare future model suggestions with independently
human-checked positives *and negative/night footage*. It returns precision,
recall and F1 based on temporal IoU+event match, but marks insufficient datasets
`INSUFFICIENT_INDEPENDENT_HOLDOUT` rather than claiming validated semantics.
Actual model training, snake/capture detection and post-performance calibration
are **NOT implemented**.

## Scope and evidence for this PR

- Offline synthetic tests cover scan, renders, strong-hash-bound intake and
  negative/security behavior. Passing tests do not prove iPhone or Google OAuth.
- Actual owner footage may be inspected only in separate private storage and
  never checked into the Public repository or GitHub Actions artifacts.
- Commit/PR review, actual Drive OAuth proof, durable state on the chosen host,
  user iPhone playback, approved gorilla artwork, privacy/safety review and
  post-publication Instagram analysis are separate gates.
