# Source Relinking Implementation Plan

> **For agentic workers:** Native execution by this worker under root's approved
> design; use superpowers:executing-plans, then independent whole-change review.
> Root publishes the reviewed candidate; this worker performs no remote mutations.

**Goal:** Restore a saved session in another local workspace with user-selected,
verified media while keeping the current edit unchanged until explicit Open.

**Architecture:** One bounded in-memory plan owns the validated saved session and
the current projectId/revision. Verified streaming uploads preserve source IDs
through the existing durable media registry. Explicit Open rechecks the complete
current/undo/redo source union before adopting the candidate.

**Tech Stack:** Existing Node filesystem/HTTP APIs, FFprobe/FFmpeg and browser
modules; no new dependency, service, workflow or portable-schema change.

**Spec:** docs/work/SOURCE_RELINK_F1_DESIGN.md, approved by root on 2026-10-29 JST.

## Global constraints

- Candidate JSON at most 4 MiB; existing EditSession validation.
- At most 100 unique session source identities and 100 workspace registry entries.
- Existing 16 GiB/file, four-hour media duration and 600 MiB disk reserve.
- Only selected File bodies, no arbitrary filesystem path/URL API.
- Immutable identity includes assetId/SHA256/mediaKind/durationSec/hasAudio.
- Full current/undo/redo union; preserve each snapshot's mutable edit fields.
- Wrong/missing/stale media never causes implicit Open or changes the current edit.
- Registered verified copies may remain and be reused after cancellation/restart.
- Existing source/history/engine bytes remain outside this implementation.

## Review focus

1. One physical file may represent several saved asset IDs, but every immutable
   per-ID field must agree with its actual probe; IDs must not be silently
   remapped. Different IDs may use an audiovisual MP4 as video and as BGM;
   intrinsic SHA/duration/audio presence agree and each target role is probed.
2. A historical-only source must exist before Open so Undo/Redo remains usable.
3. A registry addition failure must not change the current session or falsely
   acknowledge a durable media copy.
4. A second tab can edit/open another project while a plan is pending; every
   later upload/Open must reject the stale projectId/revision binding.
5. Out-of-order prepare/upload replies must not enable Open for another JSON.

## Task 1: Source identity and bounded relink manager

Files: source-relink.mjs, source-relink.test.mjs in apps/local-editor.

Interfaces:
- collectSessionSources(document) -> {session, refs}; validates all snapshots,
  immutable identity consistency and unique-source bounds.
- createSourceRelinkManager({folder, getSession, getRegistry, commitRegistry,
  probe, commitSession}) -> prepare(document), status(id), receive(id, body,
  {label, length}), open(id), cancel(id).
- Methods return public progress with planId/name/counts/missing source metadata,
  never raw filesystem paths. The manager retains only one active plan.
- commitRegistry(nextMap) persists before replacing the server's Map.
- commitSession(candidate) adopts via the existing safe session persistence path.

- [x] RED: real files and edit-session histories prove missing module/API,
  union consistency, repeated-source reuse, rejection of conflicting IDs and
  wrong same-name bytes, finite-length copy, stale session, failed registry
  callback and failed session callback.
- [x] Implement the module with streamed copy/hash, bounded stable file reads,
  probe checks and complete-source rechecks; no live editing mutation on upload.
- [x] GREEN: 16 source-manager cases under node --test --test-isolation=none.
- [x] Record exact local evidence and checkpoint this independently testable unit.

## Task 2: HTTP flow and two-workspace acceptance

Files: server.mjs and new source-relink-server.test.mjs.

Routes under the existing token/origin/mutation/revision guards:
- POST /api/relink/prepare with saved edit-session JSON.
- POST /api/relink/media?id=planId with selected raw File body and X-File-Name.
- POST /api/relink/open with {planId}.
- POST /api/relink/cancel with {planId}.

- [x] RED against the previous server: actual two-workspace flow cannot prepare
  or relink; same-byte normal import does not satisfy saved original source IDs.
- [x] Connect the manager, persist only verified registry additions during upload,
  and adopt the session only from the explicit Open operation.
- [x] Generate real video/audio; preserve historical-only source, saved JSON,
  original hashes and active session. Exercise one good upload followed by a wrong
  file, restart, reprepare/reuse, complete, explicit Open, Undo/Redo, restart,
  edit/render and whole-file FFmpeg decode.
- [x] Negative HTTP checks: unknown/forged plan, stale revision or project,
  untrusted Origin/token, wrong media, missing historical source and persistence
  failure. Existing uploads/edit/render/output history must retain behavior.
- [x] GREEN: new HTTP suite and existing local-editor suite; role finding reproduced
  RED against real import, then fixed with positive dual-role and audio-only refusal.

## Task 3: Explicit recovery UI and evidence

Files: source-relink-panel.mjs, source-relink-panel.test.mjs, index.html.
Documentation: README, PROJECT_STATE, ROADMAP, WORK_CHECKPOINT, this plan,
design and docs/validation/SOURCE_RELINK_F1_2026-10-29.md.

Interface:
mountSourceRelink({container, fileInput, current, request, onOpen, notice})
returns invalidate()/show() for current-session changes.

- [x] RED DOM doubles: JSON size check; prepare response creates missing list;
  upload shows per-file progress; explicit Open only when ready; cancel leaves
  the editor; stale replies/changed session cannot open the wrong candidate.
- [x] Connect existing Open file selection to the small panel; no browser media
  buffering, implementation-jargon prompts or automatic Open.
- [x] GREEN: eight panel tests, static module route and inline module syntax.
- [x] Independent review reproduced a committed-Open/delayed-response cancellation
  race through real HTTP + DOM doubles. A committing flag now disables and guards
  Cancel/new JSON selection; the exact regression is GREEN and other cancellation
  and genuinely stale-response behavior remains.
- [x] Run project/local-store regressions and the relevant full local-editor
  suite once the final source is stable. No browser/device claim.
- [x] Record observed runtimes and synthetic SHA256/MP4/decode evidence.
- [ ] Final handoff gate: freeze exactly the approved 14 files, create patch/manifest against base
  main8f335…, verify Git blobs/size/SHA and unchanged baseline sources, then
  obtain root's independent frozen-file audit before any remote publication.
  Final manifest and the carrying PR record this gate outside the source files.
