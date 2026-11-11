# HUB NATURAL: private media intake and 3-draft proof (not production)

This is an **optional** adaptation for @hub_natural84, not a replacement of the
existing AI VIDEO STUDIO offline-first editor. It does **not** access Google Photos,
Google Drive, Instagram or GitHub on its own; it never publishes a post, calls
an external model, or consumes paid inference. The source is public; **media,
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
6. **Remaining integrations:** Private Google Drive INBOX watcher, durable private
   output storage plus independent readback, mobile playback, Instagram Insight
   OAuth and 24h/7d PDCA, and competitor-based quality ranking are **not done**.
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

cd integrations/hub-natural && python -m unittest -v test_pipeline
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
- Preserves a separate private SHA-256 state JSON to skip exact reruns, avoid
  downloading duplicate video contents, and HOLD changed or damaged media.
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
