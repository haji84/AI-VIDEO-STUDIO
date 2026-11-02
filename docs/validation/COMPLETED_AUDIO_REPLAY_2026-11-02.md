# Completed-export audible cut replay: scoped verification (2026-11-02 JST)

State: **TESTED_SYNTHETIC (isolated code and generated media only)**; no full repository CI, Chrome browser acceptance, real-device verification, or independent nonauthor review. This is **not** the independently rendered seven-second four-bus audio preview.

## Finding and design decision

The existing `engine/preview_saved_clip.py` renders the saved video picture/static caption, but not the four-bus audio graph from `engine/render_saved_project.py`. Simply unmuting the visual preview would silently play the wrong sound. Shortening the four-bus mix independently also risks different loop phase, mid-clip fade and ducking envelopes, and lookahead limiter behavior. A full-project audio render per short window would break large-media performance expectations. These findings are from **author-side critical inspection, not independent review**.

The limited implementation instead offers an explicit `完成済みMP4で音付き確認` button. It checks the latest integrity-verified output report through existing authenticated `/api/qa`, requires the exact same project ID/revision, then seeks and plays the **existing completed MP4** at selected cut project time `clip.startSec + cutLocalStartSec`. Existing original, history, Undo/Redo, visual preview and four-bus settings are not changed. It rejects stale output, late network response, changed selection and old output-navigation state. Source video stays unaltered.

**Limitations:** User must first render the full current project; this provides no pre-export audible preview. The HTML video player's `timeupdate` pauses approximately at cut end, not at sample/frame precision. Browser autoplay with sound may require manual Play. The already completed mix is used unchanged; this does not prove its acoustic or native quality.

## Exact local evidence

Node v22.16.0, FFmpeg 7.1.5, Git 2.47.3. In a scratch source subset, syntax checks passed for the new JavaScript module and both tests; `node --test apps/local-editor/completed-audio-preview.test.mjs apps/local-editor/completed-audio-preview.media.test.mjs` returned **13/13 PASS**, zero failures or skips. Twelve pure/DOM-double tests cover global clock, speed, tails, invalid windows, current-revision report identity, delayed/stale replies, metadata loading, finished-file eligibility. A separate 16-second synthesized four-tone AAC/MP4 (300, 600, 900, 1200 Hz) passed frequency checks at project-global moments and full-file FFmpeg decode. Temporary synthetic media was deleted.

The locally tested source files exactly matched GitHub blob SHAs:
- `apps/local-editor/completed-audio-preview.mjs`: `8826ba618a1e21052149e08f3c252982887f99d9`.
- `apps/local-editor/completed-audio-preview.test.mjs`: `0aa61cb0ef5ca68c439460b27414f53526dae143`.
- `apps/local-editor/completed-audio-preview.media.test.mjs`: `040a2f76fa5b8ad3948a21fbb2ff8438475ee0eb`.

The current PR's `index.html` and `server.mjs` wiring were separately read back via GitHub and checked for module route, panel, output invalidation and cleanup. **No full repo checkout, `server.mjs` run, browser interaction or app-created four-bus export was executed here**. The last successful Actions main run 40811805222 covers previous PR #25 only.

## Mandatory gates before integration

1. An actual different reviewer must independently assess the new source and ambitious original mixer design. Author checks do not count as independent review.
2. Run existing `.github/workflows/manual-smoke.yml` on the exact feature PR HEAD. Read both full offline and Chrome results; no changes to workflow triggers.
3. Prove genuine Chrome interaction with an actual editor-exported four-bus MP4, latest/old project revision, long/short cut, delayed metadata, history change, clip-end and repeat playback; fix any failures on the same PR.
4. Confirm branch protections/required reviews at that HEAD, then safely integrate and rerun on actual main. Do not merge this candidate based on the isolated 13 tests.
5. Independently generated **short** four-bus preview remains NOT_IMPLEMENTED; design draft `docs/work/AUDIO_PREVIEW_PARITY_DESIGN_20261102.md` still governs its future correctness criteria.

No third-party service, paid model/review/compute, cloud transfer, or source media was added.
