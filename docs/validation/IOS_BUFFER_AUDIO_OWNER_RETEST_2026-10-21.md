# iOS Safari original sound: local decoded-buffer retest (2026-10-21)

## Classification

**PARTIAL PASS: browser Web Audio source/output signal is now nonzero and owner checked audible original audio.**
**FINAL ACCEPTANCE STILL INCOMPLETE**: page-level replay diagnostic was NOT_RUN and the generated MP4 bytes were not submitted for independent codec/audio verification.

This summary is based on an owner-provided anonymous results JSON, generated UTC `2026-10-21T09:04:32.348Z` on an iOS browser, test scope `BROWSER_ONLY_4SEC_NOT_NATIVE`. No raw media, image, device identifier, or original JSON is committed.

## Observed JSON fields

| Signal | Value |
| --- | --- |
| Source video | 23.72 sec; 39.66 MiB; 1170 x 2532 |
| Mode | `SOURCE_ONLY`; `DECODED_BUFFER` |
| Output | `SOURCE_AUDIO_MIX_MP4_CREATED`; 394937 bytes; attempted source advance 3.88 sec; elapsed 4524 ms |
| Original audio route | `originalTrackRequested=true`; `audioTrackAttached=true`; no extra audio tracks |
| Audio signal | `sourceBufferPeakRms=0.00454`; `originalSignalPeakRms=0.048032`; `outputSignalPeakRms=0.060492` |
| Safari-recorder declared MIME | `video/mp4; codecs=avc1.42000a,mp4a.40.2` (declared, not independently probed) |
| On-page playback | `replay.status=NOT_RUN` |
| Owner checklist | sourceVisible=true; captionVisible=true; originalSoundAudible=true; savedFileReplay=true |
| Final app flag | `acceptance.status=INCOMPLETE`, browserReplayConfirmed=false |

The earlier iOS source-only test reported a silent audio route (original/output RMS both 0; originalSoundAudible=false). This newer test shows nonzero Web Audio signals when using the separate MP4 audio-buffer approach. This supports a **browser audio-routing improvement**, not independent proof of MP4 audio samples or exact synchronization.

SE file was rejected with `AUDIO_DURATION_INVALID_OR_TOO_LONG` by the prototype's 90-second decode guard. No SE was included in this `SOURCE_ONLY` output. No BGM or narration were included.

## Remaining acceptance work

1. On the same `audio-compat.html` page, run `出力MP4を再生して検査` after the short export. User gesture may be needed for Safari playback. Then save a new anonymous results JSON.
2. Verify `replay.status=REPLAY_ADVANCED`, `acceptance.browserReplayConfirmed=true`, and the four owner checklist items. Even then classify it as **USER-REPORTED BROWSER PASS**, not as independent native/media QA.
3. For stronger technical proof, independently inspect *a non-sensitive exported sample* for the actual audio codec and PCM output; do not upload real private training media to public GitHub.
4. Only afterward begin a separate limited test of appropriately sized owned BGM/SE tracks. Do not call the 4-second browser proof a reusable production video editor.

The actual MP4 bytes were not made available to the reviewer. iOS native AVFoundation, full-duration export, 4K, N-camera editing, semantic AI, generated Japanese TTS files, cloud jobs and publication remain outside this acceptance.
