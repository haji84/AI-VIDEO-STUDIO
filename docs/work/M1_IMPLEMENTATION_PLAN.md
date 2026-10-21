# M1 durable local project and render handoff

Scope: implement GOAL M1 against the existing product/audio specifications.
The owner explicitly authorized design, tests, review, PR and safe integration
without another planning approval. Execute inline; use one independent final
reviewer. Do not deploy an editor or activate cloud resources.

## Design

- `packages/project/project.mjs`: dependency-free, browser-compatible versioned
  JSON, source identity, source versus output time, four audio buses, effects,
  validation, immutable bounded undo/redo, and deterministic render plan.
- `packages/project/local-store.mjs`: Node-only streaming SHA-256 identity,
  explicit local media bindings, mismatch refusal and atomic file save/load.
  Portable JSON stores asset identities, not machine paths or media bytes.
- `tools/project-manifest.mjs`: fail-closed bridge to the existing FFmpeg
  manifest engine for contiguous single/split clips and static captions.
  Unsupported effects, audio routing, drift and gaps must cause an explicit
  error instead of disappearing. Preview/export backends can later consume
  the full deterministic plan.
- Tests: actual disk save/reload, history after reopen, source movement and
  hash mismatch, malformed times/versions/references, migration from existing
  engine project data, and source hash -> saved/reopened project -> manifest
  -> real synthetic MP4 -> whole decode plus independent audio/frame checks.

## Task 1: portable project model

- [x] Write behavioral tests in `packages/project/project.test.mjs`; run RED.
- [x] Implement strict project validation, render plan and edit session.
- [x] Test 1/2/3+ source input, speed/trim/time mapping, four buses, effects,
      malformed references/times, version rejection and legacy migration.
- [x] Run Node project tests; inspect output.

## Task 2: local persistence and existing renderer connection

- [x] Write file-I/O and fail-closed adapter tests; run RED.
- [x] Implement Node store and manifest CLI; retain source hashes and require
      explicit per-device bindings. Atomic replacement keeps last good save.
- [x] Run integration with generated source videos only; inspect source/output
      hashes, decoded audio and full-output decode. Never publish media.
- [x] Run all existing Node/Python/audio/legacy suites from their correct cwd.

## Task 3: review, integration and continuation

- [x] Independently review scope, unsupported-feature failures, path/overwrite
      safety, history integrity, malformed files and accurate evidence labels.
- [x] Fix material findings with regression tests.
- [x] Save current facts, requirement matrix, remaining gates and next task in
      `PROJECT_STATE.md`, `ROADMAP.md`, and `docs/work/WORK_CHECKPOINT.md`.
- [ ] Create one PR against current main, inspect check/merge state, safely
      merge, verify the resulting remote tree and run integration on it.
- [ ] Select the next unblocked requirement. Physical device tests remain
      separate; synthetic success cannot close product acceptance.

## Review focus

Corrupt/future JSON must not overwrite good saves. Wrong same-name media must
not relink. Invalid references/history cannot hide in saved files. Unsupported
effects/audio cannot render silently. Output/workspace may not overwrite any
source, project or binding file; no path/URL is a portable media identity.

## Execution evidence

Baseline remote main: `64cfb20c86a6abcf445124566ff873e887b27dee`.
Git clone transport is unavailable in this execution environment. Authenticated
GitHub connector read all 106 blobs at that exact SHA; blob SHA-1 checks and
`git write-tree` reproduced `5369333092704f9a4b20059cdad9d4cc9f6aace3`.
Local snapshot history is not remote history. Push/PR integration must use the
remote commit as parent through GitHub's Git API, preserving unchanged blobs.
