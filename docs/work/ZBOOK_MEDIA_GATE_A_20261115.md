# ZBook media preflight and recovery — implementation plan

Issue #37 and Draft PR #36 are the requirement and handoff. Main at inspection is
`e1bf222dfe0043e307e3fc3c122e2fe52423dac8`. The distributed v2.x ZIP and ZBook logs
are unavailable. This change repairs equivalent main paths; it cannot identify the
original ZIP call site or certify a physical ZBook.

## Goal and constraints

Make tool discovery consistent between HTTP import, numerical first-cut analysis
and rendering; reject missing/malformed probe JSON with bounded, useful errors;
keep fully received media available for explicit retry after a tool failure.
Use the existing project, renderer, analysis and loopback authorization. No remote
exposure, Tailscale changes, cloud service, private footage or semantic AI claim.
Do not merge or overwrite Draft #26 or the independent HUB NATURAL stack #27–#39.

## Task 1 — shared media boundary

- [x] RED: `engine/test_media_tools.py` reproduces None/empty/null/wrong-shaped
  probe output and inconsistent executable selection. Add real HTTP/process
  cases in `apps/local-editor/media-preflight.test.mjs`.
- [x] GREEN: add `engine/media_tools.py` with `resolve_tool`, `parse_probe_json`
  and a bounded JSON probe CLI. Core, local signals, output QA and HTTP import
  use that boundary. Resolve explicit `AIVS_FFMPEG_DIR`, bundled tools, PATH and
  scoped Windows WinGet installation locations without downloading or changing
  security settings. Errors expose stable codes, not raw stderr/private paths.
- [x] Verify targeted tests and the existing main regression commands.

## Task 2 — retain completed uploads for retry

- [x] RED: an actual completed HTTP upload whose probe fails survives restart;
  retry imports the identical bytes without another upload. Corrupted pending
  bytes, stale revisions and duplicate retry must not overwrite/edit silently.
- [x] GREEN: add a bounded local pending-import store, explicit authenticated
  retry, and a simple retry control. Keep partial transfers distinct from fully
  received files. Preserve existing source IDs, registry, undo and old outputs.
- [x] Verify recovery and protection tests against actual files and HTTP.

## Task 3 — evidence and GitHub checkpoint

- [x] Run a real-browser two-video import/recovery → numerical first-cut review
  and apply → MP4 replay/download/full decode → restart/readback acceptance.
  Record only synthetic hashes, tool versions and outcomes.
- [x] Run Node/Python regressions, existing three browser acceptance scripts,
  and a fresh code review; fix confirmed issues with regression tests.
- [x] Update `PROJECT_STATE.md`, `ROADMAP.md`, `docs/work/WORK_CHECKPOINT.md` and
  a validation record. Commit and push a dedicated implementation branch; link
  Issue #37 and PR #36. Never claim unavailable hosted CI ran.

## Remaining gates

ZIP-specific repair and Windows launch modes need the actual ZIP and a Windows
run. Chunked/resumable transfer, automatic unattended batching, private remote
phone access, Google Photos, ASR/TTS, one-hour/tens-of-GB and physical four-device
acceptance remain separate unfinished gates. Existing first-cut is numerical,
requires explicit review/apply, and is not semantic training-video editing.
