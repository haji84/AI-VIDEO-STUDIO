# iPhone Safari browser Device Lab acceptance, 2026-10-21

## Evidence provenance

- Evidence origin: anonymized summary of a user-uploaded Device Lab v1 JSON collected on a physical iOS device. This is **user-provided browser-generated evidence**, not a cryptographically attested result.
- Test timestamp (UTC): `2026-10-21T04:15:38.681Z`.
- User-agent family: `iOS`; browser/OS version and exact hardware model were **not captured**.
- Test scope: `browser_only_not_native_app`.
- Raw private video and original evidence JSON are **not included in this public repository**.

## Observed reported results

| Test | Status / precise scope |
| --- | --- |
| Selected media | MP4 214.31 MiB, duration 111.09 s, `BROWSER_DECODE_PASS` |
| Video playback | `PLAYBACK_CONFIRMED`: media element playback advanced during short test; **NOT 111.09 s of continuous validated playback** |
| Frame sampling | 3 frames, mean relative brightness 0.247, sampled brightness spread 0.221; numerical values only |
| Speech | `PLAYBACK_FINISHED`, two Japanese voice candidates; **no speech audio file exported**, quality rating null |
| Animated caption | `PREVIEW_COMPLETED` on synthetic canvas animation; no composite export of selected footage |
| Synthetic MP4 | `SYNTHETIC_MP4_CREATED`, 178386 bytes; **independent file replay/decode NOT_RUN**, no native video mux |
| Browser feature probes | MediaRecorder, `captureStream`, MP4 recorder MIME, Speech Synthesis, WebCodecs reported present. Feature presence is not throughput/quality validation |

## Acceptance interpretation

**PASS only within browser smoke scope:** locally selecting source media; detecting playback advancement; sampling three frames; completing browser speech playback and synthetic caption preview; creating a small synthetic MP4 Blob.

**NOT VERIFIED:** complete input video decode/playback, native AVFoundation export, selected-source MP4 with baked captions/effects, voice file generation, BGM/SE/audio mix, synthesized MP4 replay/hash validation, multiple cameras, semantic understanding, actual long-duration editing, and offline guarantees.

## Next minimum reproducible test

1. In iPhone Safari choose an owned, non-sensitive 10-30 second MP4 and produce a **new output derived from that exact selected video**, with a visible animated caption. Compare source/output durations and verify output replay, with original bytes unchanged.
2. Record exported MP4 size, measured processing time, video/audio presence, error code, and output replay result. Keep files local; do not send footage to GitHub.
3. Separately test browser TTS audio capture feasibility; **do not assume** Web Speech playback can be saved as an audio file. Native iOS AVFoundation validation remains its own milestone.
4. Add BGM/SE mix and timing checks only after selected-video render/replay passes; ensure no unwanted remote upload.

A passing synthetic browser demo must never be reported as a full AI VIDEO STUDIO mobile editor acceptance.
