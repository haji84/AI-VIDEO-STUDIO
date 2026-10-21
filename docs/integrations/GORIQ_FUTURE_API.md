# GORIQ optional integration contract (DESIGN ONLY)

GORIQ and AI VIDEO STUDIO are distinct products, release processes, data stores and security principals. Their repositories never automatically sync or merge. This is **not implemented** and creates no network service.

## Allowed future interaction

Only explicitly approved **software development work** may be exchanged. GORIQ may create/review code changes in this repository through existing repository permissions, or accept a low-risk development-goal request from the owner. GORIQ is not part of the end-user video editing runtime.

Proposed adapter messages (not executable protocol):

- `submit_development_goal`: product ID, repository commit, bounded task, acceptance criteria, idempotency key, explicit authority scope.
- `get_development_status`: accepted Goal ID, last verified step, branch/commit/PR ref, blocker, next action.
- `get_development_evidence`: evidence IDs and integrity digests; **no raw media**.
- `pause_development`: approval-scoped pause signal.

## Must never be sent automatically

Raw video/audio, user names, phone gallery, local file paths, project media keys, user-account records, tokens, payment data, private access URLs and model-generated interpretations of protected footage.

## Integration acceptance (deferred)

Authenticated owner authorization, replay/idempotency proof, least privilege, privacy review, independent verification, explicit sandbox boundaries, and real E2E evidence. No direct connection to existing GORIQ ports/services or AI employees is authorized by this document.
