# AI VIDEO STUDIO — TOP-LEVEL PRODUCT GOAL
Status: ACTIVE PRODUCT GOAL; NOT FINISHED
Established: 2026-10-21
Repository: `haji84/AI-VIDEO-STUDIO` (Public source repository)
Product owner: repository owner
Execution: ChatGPT Work / cloud or supported coding environment
Language: Japanese UI and handoff preferred

## 0. Non-negotiable outcome

Develop AI VIDEO STUDIO into an **actually usable, offline/local-first, non-destructive video-editing product**, independently from GORIQ, available on **iPhone, Android, Windows and Mac**. The intended default journey is:

1. Select **1 or any number of videos**, including mixed GoPro/Insta360 views; choose a purpose (training material, documentary, TV-style, short-form).
2. Tap **AI automatic editing**. The application can analyze footage as supported, synchronize cameras with confidence/fallback, build a coherent editable timeline, choose defensible shots, place captions, effects, audio and licensed SFX/BGM, render output, detect technical faults and propose/re-run bounded corrections.
3. Play the produced **real selected footage** with **original audio preserved where selected**, captions/effects, optional Japanese narration and music/SFX, in an actual MP4 file.
4. Reopen the saved project at any future time and change edits manually, by one-tap presets, or by Japanese-language edit commands. Users without editing experience can operate it.
5. Edit and export normally without a permanent ZBook connection or mandatory cloud upload. Cloud is an **explicit opt-in fallback** after data-scope and cost disclosure.

A short artificial test MP4, a passing mock suite, a plan document or a browser demo **is not product completion**.

## 1. Canonical source hierarchy and boundaries

- Keep this file as the highest-level **outcome and acceptance contract**, *not* an override of security and legal constraints.
- Existing `AGENTS.md`, `docs/specs/PRODUCT_SPEC_v0.3.1.md`, `docs/specs/AUDIO_SPEC_v0.3.1.md`, `PROJECT_STATE.md`, `ROADMAP.md` provide current implementation constraints, feature detail and prior evidence. Start with latest `main`, resolve differences explicitly, never silently replace finished work.
- GORIQ is an independent product. Keep repos, permissions, credentials, runtime and product completion separate. A future development-task-only API adapter may be proposed after its own approval; it must not transfer private footage.
- GitHub repository remains **Public for source code**. **Do not** commit footage, voices from real people, personal details, raw footage-derived screenshots, exported media, tokens, credentials or assets with unverified redistribution rights.
- No R2, paid GPU, paid API, Stripe, subscriptions, production public editor or unrelated deployment without separate prior owner approval. Existing GitHub Pages static test-only site may be updated only for carefully scoped, no-upload device diagnostic changes after review.
- The later **subscription/commercial release and general product launch are DEFERRED**, not required for this Goal's present finish line. Architect extension points without enabling billing.
- Keep normal operation offline-first; opt-in remote analysis/rendering must never happen silently. Preserve byte-identical originals and avoid destructive mutation of source videos.

## 2. Scope of functional completion

**F1 Import and projects:** one, two and three-or-more sources; MP4/MOV where platform codec supported; Insta360 X3 360°/INSV conversion feasibility distinguished from proven support; source relinking, project file schema versioning, auto-save, undo/redo, robust reopening, multiple tracks, provenance and non-destructive timeline.

**F2 Multi-camera:** audio/time/video common-event alignment, offset and drift handling, missing/silent sources, confidence labels and manual correction; seamless camera switching, side-by-side, picture-in-picture, original audio choice and audio continuity. Reject unreliable automatic synchronization.

**F3 Local AI editing:** efficient scene/motion/audio cues, source-attributed transcript/subtitle and event time references; meaningful edit suggestions using actually tested models where feasible, not arbitrary time cuts. Preserve critical steps and chronology. Model capability and semantic accuracy must be measured and uncertainty shown; expert correctness must not be fabricated. Use proxies, caching, throttling and local inference to minimize cost.

**F4 Beginner manual editing:** mobile touch-first (also PC pointer/keyboard) timeline, large buttons, one-tap preset previews, trim/split/drag/drop, multi-lane sound/subtitles/effects, safe undo/redo, friendly error recovery. Optional Japanese natural-language changes must produce reversible explicit edits. Test actual novices performing tasks, not only screenshots.

**F5 Captions and video effects:** animated captions, lower-thirds, pop/fade/slide, typography, emphasis, arrows, split screens, picture-in-picture, zoom, slow motion, color/blur/mosaic, basic transitions and editable keyframes. Use a deterministic effect schema so preview timing and exported frames match; templates licensed for distribution.

**F6 Audio:** preserve original selected soundtrack; multiple camera sources with deliberate mix selection; four independently editable buses (source / narration / BGM / SFX), fades, loop, timed sound effects, ducking when narration/speech occurs, gain/limiting checks and no accidental muting. Support user-owned/licensed music/SFX and later a cleared built-in library.

**F7 Japanese speech:** text → audition available natural voices → pronounce names → generate and **persist actual audio file** → timeline alignment and caption sync; offline device voices/models when capable. Browser speech playback alone cannot count as TTS audio-file export. Voice rights and consent are required.

**F8 Output and self-QA:** local MP4 export with actual selected footage, original sound and effects; output replay/decode evidence, correct durations, source synchronization, captions inside safe bounds, audible speech, no black gaps, audio clipping or missing tracks. Review the whole output, not just sampled seconds. Bounded corrective render/verify iterations; no unsupported claim of technical/expert-quality evaluation.

**F9 Device portability:** true device pipelines for iPhone, Android, Windows and Mac; independent support/evidence per platform. Use device-native codecs/rendering where necessary. No requirement that ZBook be powered on or that private video must leave the device. Detect unsupported codecs/sizes clearly and offer safe alternatives.

## 3. Product-wide acceptance gate (DoD)

Mark **COMPLETE** only when all in-scope requirements have independent evidence and the actual app is usable.

- **1 / 2 / 3+ camera input**, mixed start times, muted/missing audio, drift, resynchronization and manual fallback tested with reproducible fixtures and at least one authorized real sample where available.
- Each platform's **actual device** has a verified path: import → edit actual video → preserve selected audio → caption/effects → save MP4 → replay generated output → save project → reopen and re-edit. Android, Windows and Mac must be verified separately; simulations cannot substitute.
- Four-bus audio, Japanese TTS as a rendered track, accessible editing UI, preview/export parity and bounded technical QA individually verified on affected platforms.
- Real media performance (including a large multiview training-class workload where available), memory, storage, thermal/background behavior and fail/restart recovery measured. If user-provided private footage is not accessible, list exact physical acceptance as BLOCKED, continue unblocked features, and **do not label the whole product COMPLETE**.
- All tests and build/install instructions are reproducible and all required code is merged to authorized `main`. No unreviewed diff, orphaned PR or unpublished local-only code counted as finished.
- Maintain truthful separate states: `NOT_STARTED | IMPLEMENTING | TESTED_SYNTHETIC | VERIFIED_REAL_DEVICE | BLOCKED | COMPLETE`. Report uncertainties and genuine limitations.

## 4. Final milestone sequence (dependency-aware, not a rigid calendar)

**M0 — verify/repair the current baseline:** inspect `main`, tests, CI/PR state and user-supplied iPhone findings. Latest owner iPhone JSON proved `DECODED_BUFFER` Web Audio RMS nonzero and user checked audible original sound/Files replay, but **`replay.status=NOT_RUN`, `acceptance=INCOMPLETE`**. First close this specific short source-video + original-audio + caption repeatable browser acceptance without pretending it proves a native full product. Avoid repeatedly applying the same failed recorder fix.

**M1 — durable common editing model:** versioned JSON project schema, timeline, cross-platform effect/audio clip definitions, undo/redo, save/open/migrate, source hash/relink and deterministic render plan. Tests must use real file I/O and reload.

**M2 — genuinely usable local editing slice:** source selection, playhead/cut, effect preview, original-audio preserving output, project reopening and 4-bus mixing on a practical backend. iOS Safari prototype is an experiment; prefer native iOS path if browser codec limits prevent long reliable export. Do not block portable code work waiting for physical iPhone access.

**M3 — full editing experience:** mobile/desktop beginner UI, editable presets, BGM/SE/narration, Japanese TTS persisted audio file, sync with captions, multi-cam timelines.

**M4 — local AI and multi-camera semantics:** lightweight scene/transcript/subject models, confidence/evidence-based shot selection, fallback and goal-dependent proposals with real-data evaluation. No unsupported 'perfect editing' promise.

**M5 — verify and harden:** output full-duration QA, bounded re-edit loop, recovery, 1/N cameras and device matrix with physical tests; owner usability feedback incorporated and actual install/use path provided.

**M6 — present owner-ready product:** installable/reachable application for supported platforms, verified project/export samples, user guide, honest limitations, tracked remaining deferred commercial work. Finish only if DoD achieved; otherwise retain active Goal.

M0's unverified real-device replay **must not stall M1/M2 development**: log a specific external acceptance request, proceed to another safe high-impact task and return when evidence arrives.

## 5. Engineering and economic guardrails

- Prefer reuse of `engine/`, `cloud/`, `prototypes/audio/`, `packages/edit-planner/`, established tests and public frameworks. No unnecessary rewrite or gratuitous new orchestrator.
- FFmpeg/local media tools and deterministic tests handle bulk processing; invoke Work reasoning/strong models only for design and difficult problems. Cache results and limit retries. Do not spin up many unneeded workers/AI employees.
- Keep **one implementation PR actively moving to integration** at a time unless explicit evidence supports parallelism. Review code, run appropriate tests and real-output checks, integrate into `main` only after repository's existing checks/permissions pass. Never force merges, disable protection or weaken tests to get green.
- Check for licenses, secrets, PII and unauthorized third-party assets before every public push. Use generated synthetic media in public tests; do not share originals, even to help evaluation.
- User's target discretionary running spend: **JPY 500–1,000/month**. This is an operational goal, not a guaranteed cloud cap. Obtain explicit approval for any new paid service, usage commitment, credential, privacy-impacting third-party transmission or public production launch.

## 6. Agent mandate

In Work mode, treat this as the ongoing product Goal and `docs/work/AUTONOMOUS_EXECUTION.md` as the operating protocol. **Start real implementation**, do not stop after a plan or a message. Persist checkpoints and keep selecting the next independently verifiable task while the Work task is active and has execution capacity.

Only report "completed" when the whole DoD is independently satisfied. Human actions that genuinely require device access/approval may be requested with exact instructions and evidence. If the Work task pauses, its repository checkpoint allows an explicitly resumed or separately scheduled Work task to continue. A text instruction alone cannot guarantee endless operation, resume work without an active run, or bypass plan/permission/tool limits.
