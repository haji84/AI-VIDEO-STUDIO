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

### Local restart/crash consistency (synthetic CI only)

- Intake uses a process-owned **private file lock** instead of a removable
  directory lock. On POSIX, the OS releases the flock on an abrupt exit;
  a Windows msvcrt fallback exists but needs separate Windows CI evidence.
  The .lock file remains on disk deliberately. **Never remove it while any
  process may be running**; deleting an active lock can enable split-brain.
- A pre-existing **directory** named state.json.lock or queue.json.lock
  (created by an older build) is held rather than automatically deleted.
  Owner must verify no older worker runs before migrating that legacy lock.
- The full intake -> probe -> queue write is guarded against parallel job
  invocations. Once a worker exits, the next invocation can verify and reuse
  an already-committed original even when the state write was interrupted;
  interrupted queue generation can be safely retried without duplicate media
  download or scene approval. Corrupted/changed media still HOLD.
- This lock works only with a single owner's local persistent filesystem.
  **It does not prove distributed/cloud-drive locking, multi-host coordination,
  full process supervision or real unattended scheduling.** Never store private
  state under a public checkout or ephemeral runner.
- CI injects a hard process exit plus state/scan interruptions using synthetic
  bytes only. Real owner Drive OAuth, new genuine arrival, cross-host restore,
  semantic scenes, independent Drive draft readback and iPhone playback remain
  blocked until their separate approved/proven gates.


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

`measure_plan_diversity()` also compares exact shot identities across the three
drafts, records pairwise Jaccard overlap and warns if all three reuse the same
shot inventory or if opening scenes are not distinct. This is **structural QA**:
it catches an old weak-edit pattern, but does not prove any edit is interesting.
A "3 MP4 files exist" result can never be counted as creative readiness.
Each genre also requires a genuine confirmed central event: capture for A,
discovery for B, and observation/other wildlife for C. A batch with no reviewed
discovery cannot be miscaptioned as a discovery video merely because it
contains closeups. The job HOLDs instead of fabricating the story.

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

## 2026-11-11 security and unattended-intake hardening

- The test workflow was split into a quick no-network/no-FFmpeg security job and a separate actual synthetic-MP4 job. The previous run #43033409657 was cancelled before tests due to Ubuntu Azure apt mirror DNS failures. The media job no longer calls `apt-get` and obtains FFmpeg+FFprobe (if absent) from a public GitHub release with a SHA-256 checksum of that release, plus a temporary Noto CJK font. Downloads may still fail; if so the job is **FAILED/BLOCKED**, never silently skipped or green. No font files or footage enter Git.
- `DriveHTTP` now refuses redirects rather than forwarding the bearer token to an arbitrary redirect target. Legitimate provider redirects, if they occur, will result in `DRIVE_REDIRECT_REQUIRES_REVIEW` until a separately reviewed allowlisted no-credential-forwarding handler is implemented. This fail-closed behavior must be checked with actual OAuth only on the owner-approved private host.
- Repeated `new_arrival_job` runs preserve the list of known immutable sources and report `newlyQueued=0` on unchanged content. A queue with unrecognized schema or tampered status stops. This is still NOT a durable independent semantic approval store; it only records `NEEDS_SEMANTIC_REVIEW` and never writes a publishable file.
- Latest code was reviewed locally for static failure modes and exercised with 37 synthetic tests; the author of this code is not an independent human reviewer. Actual GitHub Actions HEAD success are separate checks; third-party code review is optional, not a gate.

## Private host readiness gate (2026-11-13, default OFF)

The owner may choose a persistent, private Windows (e.g. personal ZBook) or
macOS host. No host has been authorized or installed by this PR.

Run the **read-only** local probe on the chosen host after creating an existing
owner-only local folder *outside* the Git checkout, synced folders or public
runners:

```powershell
py -3.12 integrations/hub-natural/private_host_preflight.py --private-root "$env:LOCALAPPDATA\HUB_NATURAL_PRIVATE"
```

Use Python 3.11+ with FFmpeg and FFprobe installed on that machine. The probe
does **not** create the directory, change ACLs, set a schedule, access OAuth,
connect to Drive or upload videos. Its JSON intentionally contains no private
paths, OAuth values or media names. On Windows it explicitly warns that NTFS
ACLs must still be checked on the owner device; the temporary Windows GitHub
runner cannot prove the owner's actual machine security.

- Public GitHub Actions run offline/FFmpeg *synthetic* tests only. A separate
  Windows test job validates local lock/restart behavior without credentials.
- For files continuously added to a pre-existing Drive folder by other apps,
  `drive.file` only grants per-file access to files opened/shared with the app;
  it should not be assumed to permit unattended enumeration of every future
  arrival. Google's `drive.readonly` covers all files and is a **restricted**
  scope, **not folder-limited**. Any broader grant must be explicitly explained
  and approved by the owner, with Google authorization requirements checked.
- `DriveHTTP` currently only reads. To upload finished private MP4s to
  `DRAFTS`, a separately owner-approved, write-capable destination and OAuth
  scope are required. Read-only OAuth alone cannot complete the requested
  end-to-end proof.
- Once the owner approves the specific host, OAuth scopes, persistence and
  private write destination, connect one safe local invocation of
  `new_arrival_job.py`, verify hashes and durable state, then *separately*
  approve/enable local scheduled polling. The full review/3-draft export still
  requires verified semantic labels and privacy QA and must HOLD otherwise.
- Third-party code review is optional. Code/security CI, private readback,
  real restart/idempotency and actual unattended cycle are mandatory.
- No automatic post/publish or permission changes occur in this PR.

## No-local-video inventory candidate (2026-11-13, opt-in only)

The owner reports that **ZBook has insufficient free storage for private video
copies**. Do not select ZBook as the intake, render, or archival media host.
The existing `drive_intake.py` / `new_arrival_job.py` still download local
originals and MUST NOT be scheduled on ZBook without an entirely separate,
owner-approved storage architecture. Google Drive remains the private source
and destination; being the storage destination does not mean Drive can run
FFmpeg or AI editing by itself.

`drive_metadata_inventory.py` is a **read-only, media-free candidate inventory**.
It can execute on a future authorized private runner even with no local video
storage. It lists only metadata with the existing fixed-host DriveHTTP transport.
It neither downloads video bytes nor creates local state, scans, edits, saves
drafts, or posts. It prints only aggregate counts, never private file names,
provider IDs, credentials or the returned private in-memory snapshot.

```bash
# Only after the owner has separately approved/configured OAuth on a
# private runtime. Never run with real tokens on public GitHub Actions.
python integrations/hub-natural/drive_metadata_inventory.py --folder-id YOUR_PRIVATE_INBOX_FOLDER_ID
```

With no private, trusted baseline, the first run reports
`newCandidates: null` / `UNKNOWN_NO_PRIVATE_BASELINE`.
`observe(client, folder_id, baseline=owner_verified_private_snapshot)` can
compare in-memory metadata snapshots without media, reporting changed
candidate counts. **This snapshot contains Drive IDs and provider MD5**
and must stay private; the module deliberately does not persist or print it.
A separate owner-approved secure storage mechanism is required before
scheduled new-arrival history can be guaranteed. Missing prior sources,
provider-version changes, duplicate IDs and malformed metadata HOLD rather
than silently accepting an unchanged source. The provider MD5 is not a
content SHA-256, so neither a real duplicate nor a verified original may
be claimed from this step alone.

The genuine end-to-end workflow still needs a private compute host with
adequate transient storage for real input and output; a secure remote
store, completed OAuth permissions and the independent SHA-256 readback
test. No such host, OAuth grant, new real arrival or three-draft export
is connected in this candidate PR. Public GitHub CI uses synthetic
metadata only, with tests that assert **zero video downloads**.

Drive API reference: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list


## Blinded metadata checkpoint candidate (2026-11-14; no automatic deployment)

`drive_blinded_baseline.py` adds `observe_blinded(client, folder_id,
key=owner_private_32_plus_random_bytes, baseline=optional_previous_checkpoint)`.
It uses the existing **metadata-only** `observe()` function. There is no video
download, local video storage, disk/network write, draft, post, or scheduler.

- The returned checkpoint holds HMAC-SHA-256 tags for the folder, source IDs
  and source metadata, plus an integrity HMAC. The public output report is
  aggregate-only. Neither raw Drive IDs, original filenames nor provider MD5
  enter the serialized checkpoint.
- A stable, unpredictable owner-private **at least 32-byte** secret is
  mandatory. It must never be committed, logged or stored alongside the
  checkpoint in this Public repository. The key is provided by a separate,
  owner-approved private secrets mechanism, **not** by this code.
- A wrong key, wrong folder, malformed/tampered checkpoint, missing existing
  source, or changed existing metadata fails closed. Validation of the
  checkpoint happens **before** any Drive list request.
- New items remain candidates on repeated observations against the same
  baseline. **Never automatically advance the baseline in response to
  observing a new item.** This is an inventory token, not a completed ingest,
  SHA-256 proof, duplicate proof, edit approval or posting receipt.
- This is **not** an encrypted media store or an automatic private state
  persistence mechanism: approximate counts and schema remain visible, and a
  key must be provided separately. Durable atomic checkpoint storage/restore
  and owner-approved OAuth/host still need distinct implementation and
  verification. In particular, it does **not** make ZBook a video host.

Synthetic tests: `python -m unittest -v test_drive_blinded_baseline` from
`integrations/hub-natural`; both Linux and Windows workflow jobs run them
without any real private metadata, credentials, or media.
