# AI VIDEO STUDIO development rules

0. **Highest product outcome:** read `GOAL.md` first and follow `docs/work/AUTONOMOUS_EXECUTION.md` for Work sessions. These do not weaken any security, copyright, owner approval or testing rules below. Update `docs/work/WORK_CHECKPOINT.md` after each verified change. Work cannot claim endless background execution merely from a text instruction.

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
