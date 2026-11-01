# Audio saved-cut preview/export parity — design candidate (2026-11-02 JST)

Status: **DESIGN DRAFT / NOT REVIEWED / NOT IMPLEMENTED / NOT TESTED**. This document does not approve a schema, backend or policy change. The canonical goal remains `GOAL.md` and the current integrated baseline is main `e1bf222dfe0043e307e3fc3c122e2fe52423dac8` (PR #25; main run 40811805222 SUCCESS).

## 1. Verified current behavior and missing result

- `engine/preview_saved_clip.py` uses the checked `tools/project-manifest.mjs --format bundle` plan, selects a saved visual cut, limits it to 7 output seconds, runs `process_manifest`, and publishes an MP4/report. It does **not** run the saved four-bus mixer. Intermediate camera audio in the visual renderer must never be represented as the saved audio mix.
- `engine/render_saved_project.py` performs full saved export: `process_manifest` picture, then FFmpeg graph over all saved `audioClips`, `audioBuses`, fades, loop, gain, ducking, limiter and AAC mux; it runs full-file QA. The rendered video is copied into the final mixed MP4.
- `packages/project/project.mjs` validates each video cut's global `startSec`, `sourceInSec`, `durationSec` and `speed`; each audio clip's `startSec/endSec` are on the **project's common timeline**. A cut-preview request's `startSec` is instead **within the selected cut's output duration**. These are not interchangeable.
- `apps/local-editor/preview-job.mjs` binds the source hashes/project revision/output hash, owns a Linux process group, caps the work at 180 s and a 7 s result, and refuses stale media. Windows/macOS cleanup remains unsupported in this code path.

## 2. First scope and non-goals

Deliver an **explicitly enabled audible preview** of one saved `layout='single'` cut with the same saved source/narration/BGM/SFX mix as the full exported MP4 for the inspected time window. Retain the existing fast source player and the PR #25 visual preview. Do not silently unmute previously visual-only results, change video/caption behavior, or assert an unimplemented audio mix. A no-audio project may be audibly silent by design; distinguish it from missing sources or rendering failures.

Out of scope for this first slice: native device export, all-effect preview, cross-cut montage UI, voice-file generation, ASR/semantic AI, lossless/sample-identical AAC encoding, automatic audio repair, and unlimited-duration preview. The first backend remains Linux-only until verified otherwise.

## 3. Clock and rendering contract

For selected saved video clip `c` with project start `c.startSec`, request cut-local output time `u`, clip output length `T=c.durationSec/c.speed` and preview span `D=min(7,T-u)`:

- Validate `0 <= u < T`, finite inputs and minimum 0.2 source-second render span under existing rules.
- Video source interval is `[c.sourceInSec+u*c.speed, c.sourceInSec+(u+D)*c.speed]` with the existing saved export profile and caption compositor.
- **Global audio mix interval** is `[W,W+D]` where `W=c.startSec+u`. Audio clip `a` intersects only at `[max(W,a.startSec), min(W+D,a.endSec)]`. The preview placement offset is `max(W,a.startSec)-W`.
- Preserve the original audio clip's source-time selection `a.trimInSec`, `a.speed`, source clock (including delayed stream beginning), audio bus gain/mute, clip gain, fades, ducking intervals and loop **phase** relative to `a.startSec`. If a loop is already running at W, restarting the shortened tail as a new loop is **wrong**. Likewise restarting fades or ducking time at zero is wrong.
- The reference is the actual existing **full-export audio graph evaluated over [W,W+D]**, not a new ad-hoc simplified mixer. Prefer factoring the common audio graph/window logic from `render_saved_project.py` so preview and saved export share tested behavior. Full-project render then crop is only a test oracle for short fixtures, **not** an acceptable default preview algorithm for large projects under the 180 s budget.
- Preserve the project's original bus contents and order, audio clipping policy, FFmpeg input safety restrictions and bounded resource accounting. Inability to preserve any active effect precisely must fail closed with an explicit unsupported/error result, not a success report with missing sound.

## 4. Output, security and lifecycle invariants

- Opt-in audible mode needs explicit UI labeling; a genuinely mixed preview's report must identify `audioScope`, selected global interval, actual decoded audio stream, audio processing method and limitations. Reject unknown/legacy report schema rather than treating it as audio-verified.
- No modification to originals, source hashes, project/history/Undo/Redo/audio settings, bindings, last completed output, inspection receipts or output history. Preview files remain owned, private temporary artifacts.
- Source identity verified before render and before serving; final preview MP4/report hashes must still bind to the exact current revision and output descriptor. Discard late/expired/stale results.
- Keep one-heavy-job concurrency, 7-second maximum window, 180-second absolute deadline and guarded Linux descendants/cleanup. Preview should not temporarily generate full-length output for a short window. Preserve 128 MiB output and validated-handle limits; avoid unbounded loop buffering and accidental decode-to-RAM.
- Do not create any external service, license-unknown bundled audio, third-party upload or cloud fallback. Never upload private audio to public CI artifacts.

## 5. Acceptance tests to implement before merge

1. Generate local synthetic 1-, 2- and 3-video projects, including a selected cut starting after project time zero. Verify local cut time `u` maps to global `W=c.startSec+u` and correct underlying video source time.
2. Four distinct generated audio tones in `source/narration/bgm/sfx` buses with nonidentical starts. Compare preview PCM frequency energy/presence to the same global window of the **actual saved MP4**. Validate absence outside each bus's window.
3. Non-zero `trimInSec` and `speed` (0.5× and 2×); verify tone placement and offset against full saved export, including sub-second boundaries.
4. Bus mute and per-clip/bus gain; inspect a before/after numerical RMS ratio for a fixture where the limiter does not engage, and verify unrelated buses persist.
5. Mid-clip entry and exit during fade-in/fade-out and ducking; check volume envelope at multiple timepoints, not merely overall loudness.
6. Preview window crossing a **loop cycle boundary**; verify cycle origin and phase match actual full export. If exact loop semantics cannot be preserved, test an explicit safe refusal and leave feature unapproved.
7. Intentional digital silence, missing stream, unsupported codec, changed source/hash, expired/replaced output and stale session/revision all must be distinguished, and no invalid audio should be called PASS.
8. Both generated preview and reference MP4 must fully decode. Compare aligned decoded PCM within documented resampling/AAC encoder-delay tolerances; do not require byte-for-byte identical MP4s or invent a universal audio-quality score.
9. Real Chrome UI tests: explicit audible choice, muted visual default, start/end boundary playback, repeated selection, cancellation, change while rendering, expiry, download/206 and full-file decode, no UI false-positive.
10. Run affected Node/Python tests, FFmpeg renders, independent nonauthor design/code review, then exact-head CI. Required checks, branch protection and authorized merge precede main-based rerun. Record exact source SHA, runtime, generated fixture hashes and failure history.

## 6. Review and execution gate

Independent reviewer should specifically challenge clock-domain mistakes, AAC delay, the original loop phase and full-export limiter/dynamic mix semantics; resource/deadline and process-owner races; report verification and stale-selection behavior. Revise the design on substantiated findings before touching renderer code. The previous PR #25 reviewer and successful CI do **not** constitute a review or test of this new audio design. No code or CI result is claimed in this document.
