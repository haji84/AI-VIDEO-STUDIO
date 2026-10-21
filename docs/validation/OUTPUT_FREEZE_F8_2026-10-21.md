# F8-B: whole-output still/freeze and cadence evidence

Status TESTED_SYNTHETIC; F8 partial, product DoD NOT MET.
Runtime Linux / Node24.19.0 / Python3.12.14 / FFmpeg6.1.1; generated media only.
No paid services, cloud/deployment, private media, credentials or GORIQ operations.
Actual browser/novice/physical iPhone/Android/Windows/Mac acceptance NOT_RUN.

## Implementation / interpretation

Existing output_qa uses the same full-decode pass and file-backed diagnostic log
for blackdetect, audio silence/peak, freezedetect and vfrdet. New freeze threshold
is1s with noise ratio0.001. A static image can be intentional: findings use
STATIC_OR_FREEZE_INTERVAL/REVIEW, never automatic edits or causal diagnosis.
Events retain exact output times, clip IDs and the existing output SHA/project
revision. Pending frozen tails end at the actual video stream end. If this end
is unknown, only the minimum observed1s interval is reported, with that limitation.
They never extend throughout a longer audio-only tail.

Cadence records aggregate variable/constant output PTS-interval counts. Counts
must equal decodedFrames-1; missing/partial evidence fails inspection. A single
frame has zero intervals and INSUFFICIENT_FRAMES, not corrupted decode. Real VFR
produces a REVIEW warning, not a technical failure. This is not original-source
frame-drop detection, cadence correction or a full smoothness guarantee.

Existing strict whole decode, packet/frame-count, source/output hash, stream
start/end and selected-audio context gates remain. Findings cap256 while the
full scan continues. GUI labels allow replay and manual re-edit through the
existing exact-project navigation. Old saved reports do not acquire detector
coverage merely by reopening. No source or final MP4 is rewritten by inspection.

## Executed validation

Current177 cases PASS:122 Node +42 engine/cloud Python +3 audio +10 legacy.
Full commands are the same as FIRST_CUT_P1_2026-10-21.md, including new tests
from engine.test_output_qa and apps/local-editor/*.test.mjs.

- Actual moving ->2s held frame -> moving: warning near1.9–4.0s with exact clip
  references, unchanged input bytes/SHA and full decode PASS.
- Static video3s with audio6s: finding ends at3s; the existing short-video timing
  gate still fails. No frozen video is invented from3–6s.
- Moving CFR negative: no freeze/cadence warning. Actual variable-PTS MP4 positive:
  VARIABLE_INTERVALS warning with counts; full decode/timing gates pass.
- One-frame actual MP4: full decode PASS; cadence INSUFFICIENT_FRAMES/0 intervals.
- Existing intentional audio, packet corruption, shortened streams, whole-file
  count/identity, selected buses/fades/ducking regressions pass. The intentional
  static4s saved-audio fixture now correctly warns about still imagery without
  changing any audio assertions.
- Actual loopback import ->4s static video export -> warning -> restart ->
  restored identical report -> saved clip navigation -> explicit manual0.8s trim
  -> new MP4 -> CHECKED_LIMITED -> full independent FFmpeg decode. Old report
  navigation refuses the changed revision. Original media is byte-identical.

HTTP fixture evidence:

| Artifact | SHA256 |
|---|---|
| Generated source | de2429a5f5a8a6137e73d0235fa127a9430648a37e07536a0e4057e76f0eb50a |
| Original4s output | 1e888c0435f0f77a61358f12f42c19682e1ccc1f3efa5fff0e609828616e9207 |
| Explicitly re-edited output | 2b76db2ad86040e4121a63acaf668667b4a943d039c17c47d641478a59745faa |

Observed freeze0.020019–4.02002s (output clock), constant95 intervals/96 decoded
frames; manual replacement duration0.811687s, no findings. CHECKED_LIMITED does
not guarantee subtitles, speech, true peak, semantics or physical performance.

One independent final review APPROVE, no blocking findings. Reviewer separately
ran17 output/audio Python and5 QA/HTTP Node cases PASS. Test-layout nit fixed by
moving unittest.main() below the new class; direct module run now covers11 cases.
No repeated review loop. Full local logs /tmp/aivs-f8-full-{node,python}.log;
source-controlled tests and this report provide durable reproduction.

## Remaining acceptance / next work

Follow apps/local-editor/README.md on an authorized actual PC. Export a short
owned still/held shot and a moving shot, save inspection JSON locally, replay
warnings and deliberately retain an intentional still. Confirm Undo/Redo,
restart, exact clip navigation, re-edit and a newly downloaded MP4. Return only
anonymized outcome/runtime/hashes; never commit private footage/project JSON.
Existing browser automation remains blocked by missing executable; API/DOM tests
are not a GUI or physical-device pass. Phone full workflow needs native/mobile
completion separately. Caption safe bounds/glyphs, speech/true peak, source-frame
analysis, bounded repair and long-footage/device benchmarks remain unfinished.
