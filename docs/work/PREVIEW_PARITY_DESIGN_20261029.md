# Saved-cut visual preview parity — bounded design

Date: 2026-10-29 UTC. Status at candidate freeze: APPROVED DESIGN; IMPLEMENTED CANDIDATE; INDEPENDENT REVIEW / HOSTED BROWSER ACCEPTANCE PENDING. Subsequent exact-head/main acceptance belongs to the carrying implementation PR and its receipts.
Repository: haji84/AI-VIDEO-STUDIO. Existing requirement: GOAL F5/F8 and ROADMAP P0 deterministic preview/export timing and visible effects.

## 1. Outcome and proven gap

Add an explicit preview of the **saved selected cut** whose static caption, source interval, speed and picture composition use the same renderer and export profile as the completed MP4. Keep the current raw-source player, labelled **素材を確認**, for fast source inspection and the existing split action. Add a separate **保存したカットを確認** control and player. The new player is a bounded visual check; the completed output remains the place to assess the saved four-bus audio mix.

The design base is actual merged main `c6bbd8d6f72d2653f350d6a01f9daf1d5ab31a13`, tree `2175c9bde1a35ab6629c9d8cda95a939ee709dd5` (194 non-tree entries), independently read back through GitHub Git data. PR24 is merged; the final PR head passed both jobs in run `40805679780`. Actual main run `40806270812` completed both jobs successfully; its terminal metadata was independently read back. This isolated directory contains a Git-blob-verified partial materialization, the complete remote tree and the implementation candidate described here. The earlier probe used the identical product code at `a767cc976a719cf325f0e717a3eab4d32e768b9c`.

Current `index.html:38–40` loads the entire source, seeks to `sourceInSec`, sets `playbackRate`, and overlays a CSS span. It has no main-player trim-end boundary. The span uses system font and normal whitespace. Export instead applies `trim`/`setpts`, verified-font measured caption rasterization and FFmpeg composition. These are separate paths.

The read-only probe generated a 2 s blue→red source with a 440 Hz tone and rendered source interval [0.5, 1.5] s. Both 1 s MP4s decoded fully; English and Japanese explicit newlines produced two visible caption rows. At output times 0.25 and 0.75 s, decoded colors were blue and red respectively. Source bytes remained identical. The full source pins, commands, runtime and hashes are in `verification/next-preview-parity-gap.json` in the prior workspace (SHA256 `7f5d9b11d415cf5452bc708afadc7fc403856c964536a9866bad09fd035dd890`). This establishes actual export behavior and the code gap; it is not a new browser acceptance result.

## 2. Approaches and selected decision

| Approach | Reuse and benefit | Cost or limit |
|---|---|---|
| Canonical PNG over raw source with playback guards | Reuses `render_caption`; low latency and little rendering work | Must duplicate FFmpeg aspect-fit/pad geometry and independently handle browser sampling, projection/rotation, trim end and asynchronous seeks. Does not establish complete frame composition parity by itself. |
| **Explicit saved-cut MP4 through the existing compositor — selected** | Reuses actual crop, rate, profile, frame cadence, caption PNG and composition path. Native player boundaries follow the rendered interval. | A short render is required after an explicit action; bounded local work and stale-result handling are necessary. |

Root selected the second approach. Actual renderer inspection supports it: `_video_filter` applies output fps, scale-to-fit, pad and square pixels; `_segment_render` applies source trim, speed and the canonical raster; `process_manifest` calls the same `render_project` used by saved-project export. Existing `core.preview_clip` silently caps **source** duration at 7 s and fixes the review profile, so it will not be exposed unchanged.

This unit supports the editor's existing **single-camera cut and zero/one full-cut static caption**. It does not add effects, mixed-audio preview, animation, TTS, native support or product completion claims. Unsupported saved paths receive a clear error; effects are never silently discarded.

## 3. Read-only render contract

The request contains only a clip ID and a finite preview start in **cut output seconds**, together with the existing revision header. The server owns every filesystem path. No client-supplied manifest, binding, profile, font, media path or output path is accepted.

Let the saved cut have source start `s`, source duration `d`, speed `v`, and cut duration `D=d/v`. For requested cut time `u`, the rendered window is `[u, min(D,u+7)]`, with at least the renderer's supported 0.2 s source span. The UI shows the actual interval and total cut duration before and after rendering, for example **カット 2.0–9.0秒 / 全20.0秒（保存済み）**. A cut of at most 7 output seconds can be checked completely. Longer cuts require another explicit interval; no hidden truncation. The worker uses source start `s+u*v` and source duration `windowDuration*v`; the player itself runs at 1x because speed is already encoded.

Capture the current session and bindings into a newly created private preview job directory. Use the existing `tools/project-manifest.mjs --format bundle` validation and source identity checks, then select the one manifest segment and adjust its source interval. Preserve the checked manifest's source list and clock offsets so a non-master camera does not acquire a new clock origin. Pass the original saved export profile to `process_manifest`; keep the existing video compositor and canonical caption raster unchanged. Independent saved audio records remain untouched; intermediate camera audio does not prove final-mix parity.

The result binds project ID, revision, clip ID, source identities, requested and actual intervals, rate, profile, output SHA256, full-decode status and caption raster evidence. The preview uses its own job state and files. It must never call `session.apply`, modify undo/redo, overwrite project/registry/bindings, append output history, or change `last-job.json` or a completed export receipt.

## 4. Bounded work, adoption and UI

Reuse the current single-heavy-job gate: a preview cannot overlap export, sync or first-cut processing, and those jobs cannot start while preview rendering runs. One preview worker is allowed. Keep existing renderer subprocess timeouts and disk preflight (600 MiB normally; 2 GiB for fullhd), and bound preview output to 7 s. Add a preview-owned **180,000 ms absolute budget** starting before snapshot/preflight, covering hashes, rendering, full decode and result adoption/media validation. This is shorter than the existing minimum 300 s segment timeout and is deliberately adequate only for short local previews; large inputs may fail with a retryable timeout. A ready result expires at the same absolute deadline. It does not receive a fresh timer. Abort pending hash/read work and terminate only the owned Linux process group at expiry. An outer 2,000 ms deadline bounds the cleanup attempt, including group inspection, descriptor close, directory removal and queue wait. If cleanup cannot be confirmed by then, return an explicit fail-closed busy state; do not start another job. Kernel/filesystem operations that become uninterruptible cannot be forced to complete by this application, so the bound is on the attempt and failure reporting, not a guarantee that every OS operation has completed. Do not reset the deadline between stages. The new path fails closed on platforms whose descendant cleanup has not been tested (initially Windows/macOS), while existing editing/export remains available. No hard CPU percentage quota or universal platform cleanup is claimed. No encoder/dependency change or existing timeout increase is proposed.

Use a separate `previews/<server-generated-id>/` subtree outside source. Retain at most one complete preview plus the in-flight job; remove superseded owned preview jobs and incomplete outputs. Preserve current workspace startup/lock rules. Output and report must be regular files inside that subtree, with safe exclusive creation and checked hashes; follow the current protected-path and no-original-overwrite checks. Preview media is opened once without following a final symlink; verify identity and content using that **same file descriptor**, then stream from that descriptor. Never hash a pathname and reopen it for delivery. Verify descriptor identity before and after hashing. Recheck saved project and actual sources both before adoption and each media request. A replaced output/source is rejected; pathname replacement after the verified descriptor is opened cannot substitute unverified bytes. Render failure, deadline expiry or normal parent close must terminate the owned process group, clean its incomplete files and release the busy state within the bounded cleanup allowance. If descendants cannot be confirmed stopped, retain a fail-closed cleanup-error state rather than starting another worker. At most four media descriptors may be held or opening, including adoption checks; a fifth reader is refused until a slot closes. At most two validation requests may be active/queued in total: one hashes while the other waits. The cap is per preview and uses opening reservations, not only a count of validations that have already finished. The CLI uses one guarded shutdown for SIGINT and SIGTERM, calling the same close path; ambiguous cleanup keeps the parent alive. Forced SIGKILL, power loss and parent crashes cannot be intercepted and are not covered by that claim. No shared analysis-manager refactor is permitted.

Before advertising a result as current, check current project/revision, clip content and used source identities against the snapshot, and revalidate actual source hashes. On edit, open, undo/redo, source change or selected-clip change, the UI immediately invalidates the shown result. Each request has a local generation counter; stale responses cannot replace a newer view. The server rejects stale adoption, including unchanged revision with changed media bytes. Selection is client state, so the panel checks the selected clip independently. A delayed response test must cover the interval between completed render and UI adoption.

The panel displays the interval, busy/failure/current state and a plain explanation: **映像とテロップの確認用です。音の仕上がりは完成動画で確認できます。** The separate result player starts muted. It does not replace `#preview`, change raw-source playhead/split semantics, or set an additional playback rate. There is no automatic render while typing. Replaying or seeking inside the result cannot play beyond its encoded interval. Closing or changing selection stops and clears obsolete playback.

## 5. Acceptance and evidence

1. Establish a focused RED against the unchanged baseline: actual local HTTP has no saved-cut preview route and current preview cannot supply the requested read-only result. Keep the already successful PR24 evidence separate.
2. Real API tests must verify authentication, finite/range validation, stale revision, unsupported effect/layout, source hash mismatch, no path injection, job mutual exclusion, failure cleanup and bounded owned-file retention. Add real-process faults for a hanging worker with a descendant, parent close during work and actual spawned-CLI SIGTERM, source/output replacement between ready and view, and replacement after the verified output descriptor is open; assert bounded termination/unlock and no substituted response bytes. Hold four real descriptors and prove a fifth is refused, then close one and prove a new reader is admitted. Compare saved session, undo/redo, source, registry, output-history and latest-export bytes before/after a successful preview.
3. Use the generated blue→red fixture at nonzero source trim and rates 0.5/1/2 (plus the existing 4x editor option where the minimum duration is valid). Compare actual preview and final export at matched cut times. Check duration/fps and full-file decode of both MP4s, original hashes, canonical caption raster hash/placement and actual decoded glyph rows. Include English/Japanese explicit newlines, wrapping and visible overflow rejection.
4. In **actual hosted Chrome**, operate the UI, observe the authenticated preview request/response, check the visible saved interval, replay until time advances, seek and reach the encoded end. After `seeked`/video-frame readiness, capture intrinsic video pixels at matched times and compare against exported frames. Verify color order, caption geometry and legibility with explicit compression/frame-time tolerances; do not claim general pixel identity from lossy encoding or arbitrary screenshots.
5. Exercise a delayed ready response followed by clip selection/revision/source change; no stale preview may be adopted. Save, undo, redo and reopen must require or display the correct revision-bound result. Preserve existing editor and two-workspace relink browser assertions. Confirm no raw-source preview parity claim has appeared.

Record input/output hashes, actual profile/runtime, request/response identity, observed frame timestamps, playback, full decode and byte-preservation results. The final evidence claim is only this synthetic saved-cut visual path. Physical iPhone/Android/Windows/macOS, novice use, 11 GB media and full product DoD remain open.

## 6. Exact proposed file scope

| Files | Purpose |
|---|---|
| `apps/local-editor/index.html`, `server.mjs` | Mount separate result preview; authenticated read-only routes and shared heavy-job gate |
| `apps/local-editor/preview-job.mjs` (new), `preview-panel.mjs` (new) | Private bounded worker/result lifecycle and revision-aware UI |
| `engine/preview_saved_clip.py` (new) | Validated snapshot → selected bounded manifest → existing compositor, current profile and report |
| `apps/local-editor/preview.test.mjs` (new), `engine/test_preview_saved_clip.py` (new) | Actual API/state/resource boundaries and generated-MP4 parity checks |
| `apps/local-editor/browser-preview-acceptance.mjs` (new) | Actual hosted UI/request/replay/matched-frame acceptance |
| `.github/workflows/manual-smoke.yml` | Add this Python test and browser acceptance; preserve all existing steps/assertions |
| `docs/work/PREVIEW_PARITY_DESIGN_20261029.md` (new), `docs/validation/PREVIEW_PARITY_2026-10-29.md` (new) | Approved design and separate actual evidence |
| `apps/local-editor/README.md`, `PROJECT_STATE.md`, `ROADMAP.md`, `docs/work/WORK_CHECKPOINT.md` | Compact usage, proven status and remaining limits |

Exactly 15 proposed files; no project-schema, shared renderer, audio contract, dependency or existing browser-test change. If reuse requires any additional source path, seek root scope review before editing it.

## 7. Integration gate

PR24 is merged and the prior workspace remains frozen. The new base commit/tree is verified above; main CI has completed. Root approved the design and its watchdog/descriptor amendments before implementation. Reconcile any later main update before integration. Keep one active implementation PR, with actual hosted acceptance and main readback before advancing the requirement state. The implementation is locally verified as recorded in the validation document; hosted acceptance and integration of this new unit are pending at candidate freeze. The carrying implementation PR and its receipts record subsequent exact-head/main acceptance.

## 8. Approved implementation sequence

Root approved approach B and the exact 15-file scope, with the watchdog and descriptor requirements above, on 2026-10-29. Main run `40806270812` completed both jobs successfully; terminal metadata was independently read back; root also verified the job logs. The implementation plan below is kept in this document so no extra plan file is required.

# Saved-cut preview implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Explicitly preview a bounded saved cut with the existing visual render path, unchanged project/history and verified source/output identity.

**Architecture:** A read-only snapshot worker produces a bounded MP4 and report. A Linux-only manager owns its absolute deadline and process group, validates current content, and serves a verified open descriptor. A separate revision-aware panel handles requests and playback.

**Tech Stack:** Existing Node modules, Python/FFmpeg/Pillow/fontTools and hosted Playwright; no new dependency.

**Spec:** This document, sections 1–7.

### Global constraints and review focus

Preserve the raw-source player/split behavior, all existing tests, source bytes and four-bus records. Use at most 7 output seconds, a 180,000 ms lifetime and at most a 2,000 ms cleanup attempt; Linux is the only new-path platform claimed. Focus tests on: deadlines during hashing/child work; stale UI/media adoption; output replacement around opening; unsupported or near-end ranges; non-master source clocks and rate mapping. No new PR or remote writes by workers.

### Task 1 — Actual renderer worker

Files: `engine/preview_saved_clip.py`, `engine/test_preview_saved_clip.py`.
Interface: CLI `--project --bindings --request --workspace --output --report`; strict request `{clipId,startSec}`; output report `aivs-saved-clip-preview-v1` with saved identity, window/profile, source identities, output hash/bytes, caption rasters and whole-file-decode result.

- [x] Write and run meaningful RED tests using actual generated color/tone media, saved session and nonzero trim.
- [x] Implement checked-bundle selection and source/rate mapping through unchanged `process_manifest`; preserve original clock offsets/profile and recheck sources.
- [x] Verify bounded window, unsupported/range rejection, English/Japanese caption lines and matched exported frames/full decode; record exact results.

### Task 2 — Bounded manager and API

Files: `preview-job.mjs`, `preview.test.mjs`, `server.mjs`.
Interface: `createPreviewManager({folder,root,getSession,getBindings,...})` exposes `state()`, `busy()`, `start(request)`, `adopt(id)`, `open(id)` returning an owned verified handle/size, and `close()`; API POST `/api/preview`, GET `/api/preview`, GET `/api/preview/<id>`, GET `/previews/<id>`.

- [x] Run baseline HTTP RED (preview route absent) and manager tests for timeout/descendant shutdown, stale source and file replacement.
- [x] Implement Linux-owned process group, 180 s absolute deadline, abortable descriptor hashing, <=2 s cleanup attempt, bounded directories, and read-only state.
- [x] Wire authenticated routes, the existing heavy-job gate and parent close; verify source and output replacement faults and unchanged session/history bytes.

### Task 3 — Separate actual preview UI and browser acceptance

Files: `preview-panel.mjs`, `index.html`, `browser-preview-acceptance.mjs`, workflow.
Interface: panel receives current saved state, selected clip, existing API helper and media URL builder; request generation/revision guard controls the separate result video, interval label and clear/failure state.

- [x] Implement explicit preview start, visible actual interval and original material label; preserve existing raw-player IDs/actions.
- [x] Add actual hosted-browser assertions for click/request/response, playback, bounded end, caption/frame parity and stale response rejection; missing browser is BLOCKED, never PASS.
- [x] Add the new Python test and browser step without changing existing commands/assertions; locally run syntax and relevant API/engine regressions, leaving actual browser execution to root.

### Task 4 — Evidence, docs and freeze

Files: the existing scope's README, state/roadmap/checkpoint, design and new validation record.

- [x] Record actual local results, failures corrected, explicit limitations and untouched previous browser evidence.
- [x] Run only remaining relevant gates; verify exact 15-file scope and all unchanged materialized base blobs.
- [x] Freeze bytes, patch, full 194-entry-derived candidate tree and author receipt for independent root review. No remote mutation.
