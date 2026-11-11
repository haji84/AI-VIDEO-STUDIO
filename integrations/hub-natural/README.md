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
