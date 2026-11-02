# AI VIDEO STUDIO development rules

0. **Highest product outcome:** read `GOAL.md` first and follow `docs/work/AUTONOMOUS_EXECUTION.md` for Work sessions. These do not weaken any security, copyright, owner approval or testing rules below. Update `docs/work/WORK_CHECKPOINT.md` after each verified change. Work cannot claim endless background execution merely from a text instruction.

## Owner-approved reviewer/tool exclusions (2026-11-02)

- **Never invoke, request, auto-enable or rely on GitHub Copilot or CodeRabbit for coding, design review, PR review, security review, approval or automated quality gates.** Prior skipped/inactive integrations are not evidence of review. Do not suggest either as a default fallback.
- Prefer existing authorized local/hosted **non-Copilot/non-CodeRabbit** review engines after checking actual availability, coverage, source/model independence, running cost and evidence quality. GORIQ AI-09 and the experimental HUB Qwen reviewer are potential reusable codebases, **not automatic approval of another repository**.
- Do not call a checklist, author's own re-reading, a green CI run, a prompt-only review, or a second pass by the same author an independent review. Require actual separate-model/reviewer execution plus source-SHA-bound findings and reproducible validation; if unavailable, record `INDEPENDENT_REVIEW_BLOCKED` and leave the PR unmerged.
- Respect required repository approvals; model comments do not impersonate formal GitHub `APPROVED` events. No new paid provider, permission increase, external code transfer, untrusted runner execution or security-policy change without the owner's specific approval.
- Fix existing feature/PR in place; no duplicate PR for the same defect.

1. Treat `docs/specs/PRODUCT_SPEC_v0.3.1.md`, `docs/specs/AUDIO_SPEC_v0.3.1.md`, `PROJECT_STATE.md`, and `ROADMAP.md` as the present draft product source of truth. This repository is independent of GORIQ.
2. Before coding, determine current implementation and limitations. Do not fabricate test results, mobile support, deployment status, or video understanding ability.
3. Prefer existing code reuse (`engine/`, `cloud/`, `prototypes/audio/`) but never force the optional cloud architecture on the offline-first product.
4. Work in bounded changes: implementation, tests, review, integration, export evidence, and verified state update as one unit. Record input hash, runtime/version, observed result, and limitations.
5. All editing non-destructive. Do not commit or upload private source footage, user identifiers, secrets, raw sensor data or unlicensed media. Keep cloud off unless approved.
6. A successful simulated test proves only the simulated environment; iOS native device, Android native device, and actual 11 GB media each require independent evidence.
7. Cost: no external paid service, new account, billing setup, deployment, permission escalation or device management changes without explicit owner approval.
8. GORIQ is a separate product. Do not modify its repository/runtime or use its credentials from here. Future integration requires a reviewed API scope and owner approval.
9. Keep changes reviewed through PRs as appropriate; do not accumulate unintegrated PRs. Match the protected base and never weaken safety gates to make CI green.
10. Save successful completed requirements and active blockers in `PROJECT_STATE.md`, and plan remaining work in `ROADMAP.md`.
