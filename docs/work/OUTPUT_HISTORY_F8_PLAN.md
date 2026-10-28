# Retained output history implementation plan

> Native execution in an isolated snapshot; root performs independent review and
> remote integration. Base main `c0bdfaef9a91c8783c2f7bee1d3c78218c8e4c4a`, tree
> `11c156f4b3f1ba5e388aba018dd09e4b90a0b78a` (PR #21).

**Goal:** Select an earlier completed local MP4 and its verified inspection after
restart, without editing the project or replacing any previous output.

**Architecture:** A bounded atomic journal records successful render receipts.
Listing reads only that journal; selecting an output verifies its fixed local
files. The existing last-job journal remains the recovery source for the latest
render, even if the additional history journal cannot be saved.

**Tech stack:** Existing Node filesystem/HTTP APIs and browser modules; no new
dependency or service. Actual test media comes from local FFmpeg.

**Spec:** GOAL.md F1/F8, PRODUCT_SPEC_v0.3.1 section 9, the prior work checkpoint,
and the design below accepted for this bounded task by the integration agent.

## Design and decisions

- Prefer a completion journal over scanning export/job directories: orphaned
  files are not evidence of completed jobs. An in-memory list fails restart.
- Keep at most 50 recent receipts, matching the existing edit-history scale.
  The UI names this limit. Evicting a receipt never deletes its files.
- Strict schema, IDs, duplicate rejection and 64 KiB journal byte cap precede
  parsing/selection. Reports retain the existing 32 MiB JSON ceiling.
- Each receipt binds job ID, output SHA256, report SHA256, project ID/revision,
  finite observed output byte length and completion time (or explicit legacy).
- Use fixed paths under the workspace; reject symlink/non-regular components,
  path escapes, missing evidence, identity mismatches and content changes.
- Stream only up to the output's recorded finite length; never buffer its media
  into memory or scan the entire workspace. Listing does not hash media.
- Revalidate file identities/stats on each access. Cache at most two verified
  report/output pairs using device/inode/size/mtime/ctime fingerprints, so video
  range requests do not repeatedly hash a large unchanged selected file.
  These are bounded integrity observations, not filesystem atomicity or signed
  attestation against a malicious local writer.
- Save the existing last-job completion receipt before the history update.
  History-write failure is visible and does not discard that latest receipt.
  Failed, interrupted or partially recorded renders cannot become history entries.
- Migrate only the legacy last completed output, after checking its output hash
  and report identity. Its report digest starts at migration; earlier report
  authenticity is unknown. No unjournaled older files are auto-imported.
- GET listing/selection routes require the existing token and host/origin rules.
  Selection changes only the viewed output. The current project, its undo/redo,
  and a live render job remain untouched. Old report edit navigation stays stale.
- UI adds a recent-output selector and explicit open action, plus a selected-output
  label and visible failures. No automatic playback or quality guarantee.
- Actual browser/native/device acceptance remains blocked; no browser download.

## Review focus

1. Journal write failure after successful render must retain truthful last-job recovery.
2. Removed/edited reports, replaced video files and symbolic-link paths must not be served.
3. Large files must not be scanned by listing or loaded as an in-memory Buffer.
4. Selecting an earlier project revision must not make its edit navigation current.
5. Two asynchronous UI selections must not show the older response as the newer choice.

## Task 1: Bounded completion journal and checked file access

**Files:** `apps/local-editor/output-history.mjs` and
`apps/local-editor/output-history.test.mjs` and `output-history-latest.test.mjs`.

**Interfaces:** `createOutputHistory({folder,atomicJson})` returns `list()`,
`record(receipt)` and `open(id)`; shared `captureOutputReceipt` and
`openRecordedOutput` bind the server's latest-job recovery to the same checks.
Opening returns the checked portable report and an output file handle for
streaming; the caller closes it when not streaming.

- [x] RED: persistence/reload of two receipts, no orphan admission, bounded recent
  entries, invalid/oversized/duplicate journals, changed/missing/report/output/path
  evidence, bounded streaming and failure-safe atomic update tests.
- [x] Implement the smallest module satisfying these tests.
- [x] GREEN: run the actual filesystem tests and record results.

## Task 2: HTTP integration and actual two-output acceptance

**Files:** `apps/local-editor/server.mjs`, `output-history-server.test.mjs`,
and the affected legacy test in `server.test.mjs`.

**Interfaces:** authenticated GET `/api/outputs` returns the recent list;
GET `/api/outputs/:id` returns one verified view/report. `/exports/:id` streams
the same verified output handle. Existing `/api/job`, `/api/qa`, render and
project routes retain their meanings.

- [x] RED: generate/render two MP4s, restart, list/select/download both and verify
  reports plus unchanged project/history. Check stale navigation, unauthorized
  access, missing/edited evidence and unknown IDs. Test latest recovery when the
  separate history update cannot be written.
- [x] Connect completed receipts and new GET routes without changing editing choices.
- [x] GREEN: new actual HTTP tests and existing local-editor suite.

## Task 3: Explicit view selection and durable evidence

**Files:** `output-history-panel.mjs`, `output-history-panel.test.mjs`,
`index.html`, user README, validation record, state, roadmap and checkpoint.

- [x] RED: DOM-double checks require an explicit verified selection, keep the
  current job/project unchanged, present failures and ignore stale async results.
- [x] Add the small view-only selector and integrate it with current output/QA display.
- [x] GREEN: panel tests, inline module syntax, relevant existing editor tests.
- [x] Record actual synthetic media identities and limits, then provide frozen
  files for root review. No browser, device or whole-product completion claim.

## Integration

The root integration agent publishes only the reviewed changed source/doc files,
using the actual remote parent. The carrying PR records final tree/merge/postmerge
evidence. Generated media and temporary workspaces stay outside the source change.

Execution result: local-editor52/52 PASS; exact evidence and review finding repair
are in `docs/validation/OUTPUT_HISTORY_F8_2026-10-29.md`. Root reviews frozen files
and records integration separately. No new feature unit follows within this change.
