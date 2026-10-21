# P1 — explicit local first-cut proposal

Source: GOAL F3/F4, existing local_signals + auto-edit planner. TESTED_SYNTHETIC; full171 local tests PASS; independent review2 P2 fixed RED/GREEN; main integration pending.
This is deterministic contrast/motion/audio scoring, not learned scene meaning.

1. Portable report + pure explicit apply: bind project revision and full video identities;
   only confirmed zero-drift cameras; master at shared zero. Reject gaps, incomplete
   signals, >8 eligible cameras, >1200s input/event span. Keep audio/buses unchanged;
   reject replacement of effects/split layouts and audio truncation.
2. Checked source bundle + private worker: hash before/after, standalone local
   decode allowlists, bounded existing extractor/planner. No automatic synchronization.
3. Reuse background analysis lifecycle for sync/first-cut; persisted hash-checked
   report, interrupted recovery, mutual exclusion. Explicit revision-checked apply.
4. Browser panel: mode, evidence, blocked cameras, cut list + individual source
   preview; checkbox explicitly replaces video cuts. Undo/redo/save/restart.
5. RED/GREEN pure/worker/actual HTTP-to-MP4 tests, full existing regressions, one
   independent final review, fix important findings, PR/main integration and
   postmerge real export. Record honest browser/physical NOT_RUN.

Acceptance: generated dark master + clear verified camera + excluded unverified
video -> real signal extraction -> durable proposal -> explicit apply -> undo/redo
-> restart -> real selected-footage MP4, four-bus preservation, full decode/QA.
Old report, false confirm, incomplete/gap/unsafe input, effects/audio truncation
refused. No source/private data committed. No paid/cloud/deployment operations.
