# Work operating protocol — AI VIDEO STUDIO
Canonical product target: `GOAL.md`. Current evidence: `PROJECT_STATE.md`; priorities: `ROADMAP.md`.
Work task: owner-authorized implementation and verification in **this repo only**. Do not modify GORIQ.

## A. First operation each Work run

1. Access authorized `haji84/AI-VIDEO-STUDIO` GitHub. If access denied, ask only for essential GitHub connection/permission; do not fabricate changes.
2. Read `GOAL.md`, `AGENTS.md`, `PROJECT_STATE.md`, `ROADMAP.md`, product/audio specs, active PRs, `docs/validation/`, current `main` SHA. Reconcile open PRs before creating more.
3. Examine previous checkpoint `docs/work/WORK_CHECKPOINT.md` and unresolved blockers, classify each requirement and verify true starting state. Do not repeat resolved analysis.
4. Use an available actual code execution environment to run tests/render fixtures. GitHub read/write alone is not the same as having a machine to compile, preview or execute video code. If unavailable, mark test BLOCKED and make valuable verifiable progress that can be done.

## B. Work iteration

1. Pick **one** next smallest requirement that unblocks the most validated product features; state its exact acceptance test.
2. Read only relevant sources and establish baseline. Before any significant refactor prove the actual issue with a failing test where possible.
3. Implement the change with minimal scope, including documentation/schema upgrade as needed. Existing features and originals stay intact.
4. Run specific unit tests, integration tests, a real (synthetic/authorized) MP4 render and output replay/decode, and security/licenses checks as appropriate. Tag synthetic vs physical evidence.
5. If failing, fix only verified root cause; do not repeat the same attempt without changing hypothesis. After 2 identical failures, record a BLOCKED detail and choose another independent task.
6. Review and integrate: use branch+PR, required checks and safe merge into current `main`; respect all branch protections/required approvals. Do not accumulate PRs or leave usable changes stranded. If merging not authorized, leave one ready-to-review PR with evidence, then work on non-conflicting next tasks.
7. **Commit checkpoint updates to main** (or to the PR if merge blocked): `PROJECT_STATE.md` for facts, `ROADMAP.md` for requirement progress, `docs/work/WORK_CHECKPOINT.md` for exact next step. Cite commit SHA, PR/CI IDs, fixture hashes, outputs and execution environment.
8. Continue automatically to the next unblocked unfinished requirement **during the active Work session**. No empty 'progress' reports or repeated request for permission to perform ordinary safe development.

## C. Safety and human intervention

Request the owner's explicit action **only** for: physical iPhone/Android/PC acceptance that Work genuinely cannot access; new paid service, billable API/GPU/R2 or cloud resource; payment/identity/login verification; private/source footage upload or permission broadening; public production deployment; security-sensitive policy change; protected merge approval.

For device validation, generate a **small static no-upload** diagnostic as needed, provide its URL and a precise reproducible test; user returns only anonymized JSON. Keep code and asset license checks. When physical results unavailable, do not mark PASS; continue independent platform/schema/engine tasks.

No secrets or personal videos in Public GitHub, Issues, PR descriptions, test artifacts or published Pages. No model hallucinates training procedure or person roles.

## D. Session cost and continuation policy

- Conserve Work / Codex usage with scoped file reads, local fixtures and targeted tests. Use lightweight deterministic tools before expensive model calls. Disable unnecessary agents or infinite autoretry loops.
- Persist durable checkpoints at every completed change and **before** a tool/session/token/time limit.
- Work Cloud Browser may continue after user closes phone, but can pause for sign-in/confirmation and does not guarantee unlimited sessions. If the active task ends, do **not** claim invisible background progress. Resume only via a new Work task or separately authorized schedule/trigger, loading the persisted checkpoint.
- Do not create any recurring Work automation, paid compute, notifications or recurring cloud test jobs without approval.
- User does not need to approve normal safe code changes or each progress step. Do not ask "next?" while independently executable tasks remain.

## E. Status model and report

For each feature: `NOT_STARTED`, `IMPLEMENTING`, `TESTED_SYNTHETIC`, `VERIFIED_REAL_DEVICE`, `BLOCKED`, or `COMPLETE`.

Checkpoint contains:
- `mainSHA`, active PR(s), current milestone and next exact bounded task
- Source of truth/version and acceptance tests required
- Verified evidence (actual command, tool runtime, artifacts and reproducible fixture)
- What is still only simulated or owner reported; real-device gating
- Blocker, impact, workaround and whether owner action is truly needed
- Time/compute/cost impact; no inferred completion percentage unless count is stable

Short owner update after material integration. Final report only on actual DoD attainment; otherwise explicitly report `IN_PROGRESS` or `BLOCKED`.
