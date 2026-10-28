# Saved-project source relinking: bounded local-editor design

Status: IMPLEMENTED CANDIDATE, synthetic verification complete after code-review fixes.
Final frozen-file audit and integration are recorded outside this source document.
Root approved the original proposal SHA256
`9ed7be2765317ebaefd8d063ce4e98e88453e7104952de8aa0559432219d2d21`.
Base main: `8f335b12ac0624e870b7187eaf24b04325c750bf`
Base tree: `2547d991dc338d771d415241ec2615858260ea2d`
Verified on 2026-10-29 JST: main unchanged, no open VIDEO PR.

## User outcome and existing behavior

A user saves an edit-session JSON, starts the local editor with a new dedicated
workspace, selects that JSON and the original media files, explicitly opens the
restored edit, then edits/undoes/redoes/exports it. Original files stay unchanged.

The existing portable project and local-store binding layer already supports
hash-checked moved media. The local editor does not expose it: normal import
creates a new random asset ID, while /api/open requires the old asset ID and
matching immutable metadata in the workspace registry. Reimporting the same
bytes therefore does not satisfy a saved project's identities.

Source references can also exist only in Undo/Redo snapshots. A successful
reopen must account for those sources before accepting the whole session.

## Approaches considered

1. Let users edit an absolute-path bindings JSON. This reuses the CLI core but
   introduces an inappropriate browser path surface and is not a beginner flow.
2. Recommended: prepare the saved session, receive only explicitly selected file
   bodies, verify identities and retain copied media, then explicitly open.
   This reuses the existing local registry and file-copy/probe conventions.
3. A project-plus-media ZIP importer would add archive parsing, duplicate media
   packaging and a substantially larger change; defer it.

Root approved the recommended choice under the repository's existing
autonomous-work mandate. This document now includes the implementation's
reviewed role-compatibility clarification below.

## Exact flow

1. Selecting saved JSON performs a bounded read-only prepare operation. Reuse
   EditSession.open and the existing 4 MiB HTTP JSON ceiling. Keep one in-memory
   plan containing that exact validated session, a random plan ID, and the
   current workspace session's projectId + revision. New prepare invalidates
   the previous plan. Prepare does not replace the editor session.
2. Collect the union of source references in current + undo + redo. Require
   consistent immutable identity for each assetId (SHA256, media kind,
   duration, audio presence). Preserve mutable offsets/drift/sync flags in
   their original snapshots. Reject more than 100 unique source identities,
   or a proposed registry union exceeding the existing 100-entry limit.
3. Display missing/available media in a small recovery panel. File names are
   not identity proof; v1 saved JSON does not retain original names. Offer
   multi-file selection and identify expected items by type/duration, with
   optional source ID detail. Avoid asking users to understand hashes.
4. Upload each selected File body to the existing loopback origin/token guard.
   The server receives it into a newly created workspace-local temporary file,
   streams SHA256, checks the declared/received finite length, and probes it
   through the same local FFprobe restrictions. Match it against the plan's
   expected SHA256 and immutable metadata. Reject unmatched files before
   registry admission. A single verified copy may satisfy multiple source IDs
   having the same physical identity, while preserving each saved ID.
   `mediaKind` is the immutable role of each saved asset ID, not an intrinsic
   property shared by every ID with the same SHA. Existing import can use an
   audiovisual MP4 both as video and as BGM. Across such IDs require equal
   SHA/duration/audio presence and check the actual probe supports every requested
   role. When reusing a registered copy, validate the new target's role as well
   as the registered entry; audio-only bytes cannot satisfy a video reference.
5. Successfully verified copies are retained in the workspace registry, without
   changing the current project, Undo/Redo or active job. This permits retry and
   restart after a later file fails. No source entry with an existing conflicting
   identity is overwritten. Existing matching registered bytes may be reused
   after fresh verification; never infer success from a matching label.
6. Only the explicit Open button commits the stored candidate session. Recheck
   plan ID, current projectId/revision, all required source identities and file
   bindings (including historical-only sources) immediately before opening.
   Keep the existing open behavior of advancing the workspace revision; preserve
   candidate project ID, source IDs, timeline, buses and Undo/Redo snapshots.
   Any stale/invalid/missing source stops Open and retains the current session.
   Once final Open starts, disable and guard cancellation/new JSON selection until
   its response completes. A server may have committed before its UI response
   arrives; that response must not be discarded by a misleading local cancel.
7. Restart does not implicitly open a pending project. Reselecting its saved JSON
   creates a new plan and can reuse already verified retained copies. Cancelling
   drops the pending plan; successfully copied media remains local and reusable.
   The UI explains this storage effect briefly.

## Bounds and failure behavior

- No arbitrary path, URL, folder-scan, external upload or archive endpoint.
- Existing token, Host/Origin, mutation lock and active render/sync/first-cut
  refusal apply to new mutation routes. Every plan operation is bound to the
  original current projectId and revision; another tab's edit/open makes it stale.
- Keep existing media extension whitelist, 16 GiB/file, 100 registry entries,
  four-hour duration, declared-length verification and 600 MiB disk reserve.
- Never buffer whole media. Copy/hash through bounded chunks; verify the observed
  finite file extent and identity before/after filesystem reads. v1 project JSON
  has no saved byte-length field, so do not invent a historical size; newly
  observed size participates in transfer/read stability checks with SHA256.
- Workspace paths derive only from server-generated IDs and whitelisted
  extensions. Refuse escapes/nonregular or changed source files before admission.
- Persist a verified registry addition before acknowledging it. Failed/unmatched
  uploads do not enter the registry. No unverified file is accepted on restart.
- An upload is renamed before the registry commit. A failed registry write can
  leave an unregistered copied file; no folder scanning admits it. Do not delete
  this final file after an ambiguous commit failure, which could delete a copy
  that did reach durable registry storage. Retry may leave that residual file
  beside the newly acknowledged copy. Temporary upload files are removed.
- Current session persistence remains last during explicit Open. Failure before
  it succeeds leaves the previous project/history bytes usable. Verified copied
  media can remain; do not claim a multi-file atomic filesystem transaction or
  power-loss-proof behavior.
- No automatic replacement of conflicting IDs, silent media trimming,
  re-timing, altered gain/sync, filename-based relinking, history deletion or
  arbitrary legacy-format conversion.

## Proposed implementation boundaries

New files:
- apps/local-editor/source-relink.mjs
- apps/local-editor/source-relink.test.mjs
- apps/local-editor/source-relink-server.test.mjs
- apps/local-editor/source-relink-panel.mjs
- apps/local-editor/source-relink-panel.test.mjs

Existing source/UI files:
- apps/local-editor/server.mjs
- apps/local-editor/index.html

Documentation/state files:
- apps/local-editor/README.md
- PROJECT_STATE.md
- ROADMAP.md
- docs/work/WORK_CHECKPOINT.md
- docs/work/SOURCE_RELINK_F1_DESIGN.md
- docs/work/SOURCE_RELINK_F1_PLAN.md
- docs/validation/SOURCE_RELINK_F1_2026-10-29.md

The exact route names are an implementation choice within this scope:
prepare, raw-media upload and explicit open/cancel under /api/relink.
The portable project schema, core history semantics, output-history module,
render engine, workflow, dependencies, credentials and other repositories remain
outside this unit. If investigation requires changing those boundaries, report
the reason to root before expanding the change.

## Required meaningful acceptance

1. Generate real video and distinct audio; create/save an edited session with
   Undo/Redo and at least one historical-only source. In a second empty workspace,
   ordinary Open initially fails; prepare/relink preserves original asset IDs.
   After explicit Open: edit, Undo/Redo, save, restart, reopen, render MP4 and
   whole-file decode succeed. Compare project/history excluding the documented
   workspace revision change, and compare original/copy SHA256.
2. One correct upload followed by wrong same-name media leaves current session
   and saved bytes unchanged. Restart/reselect can reuse the first verified copy,
   accepts the remaining correct file, and never opens automatically.
3. Contradictory identity across history, conflicting existing asset ID,
   nonmatching SHA/metadata, missing historical source and capacity/length limits
   refuse before opening. Existing media and current session remain intact.
4. Another tab changes current revision or opens another project after prepare:
   upload/final Open is stale and cannot overwrite that newer session.
5. Missing/tampered/linked retained files, interrupted upload, failed registry or
   session persistence do not produce a successful Open. Test actual disk effects.
6. DOM-double tests cover prepare -> missing list -> progress -> explicit Open,
   cancellation, wrong files and stale asynchronous results. Verify static module
   serving and inline browser module syntax.
7. Run the affected module/HTTP tests, existing local-editor regressions and core
   project/local-store tests. No gratuitous full-engine rerun if engine bytes stay
   unchanged and the actual export/decode acceptance passes.
8. Reproduce a valid existing-API import of identical MP4 bytes as video and BGM;
   recover both original IDs/roles from one copy. Refuse a saved video role when
   the freshly probed reused file actually has audio only.
9. Defer the UI response after an actual HTTP Open commit; cancellation stays
   disabled and its handler cannot hide the committed result. The response must
   update the displayed editor. Cancellation during prepare/uploads still works.

## Evidence limits

All planned automated media is locally generated. Actual browser and physical
Windows/macOS/iPhone/Android operation, novice usability and large-media
performance remain unverified until independently exercised. This completes one
source-relinking flow only, not F1, F8, F9 or Product DoD.
