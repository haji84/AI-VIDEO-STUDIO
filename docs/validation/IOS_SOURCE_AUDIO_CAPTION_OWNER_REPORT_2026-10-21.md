# iPhone Safari source-video + original-audio + caption report, 2026-10-21

## Evidence and classification

**Status: USER-REPORTED BROWSER PASS (4-second prototype).** This is not independent codec/audio verification or a native iOS product acceptance.

Evidence is one owner-provided iPhone Safari screenshot, viewed during this conversation, showing the audio diagnostic's output video player and four checked confirmation items. **The screenshot and video are not added to the public GitHub repository.** A machine-readable JSON result and the produced MP4 file have not been submitted for this milestone.

## Owner-confirmed acceptance checklist

- Checked: saved output visibly contains footage from the selected original video.
- Checked: the generated video shows the `AI VIDEO STUDIO 音声テスト` caption.
- Checked: the original selected video's sound is audible in the generated output, not merely added narration.
- Checked: the MP4 was saved and replayed from the iPhone Files app.
- Screenshot shows an approximately four-second output with the playhead near the end, and the selected footage behind the test caption. No original media or identifying file names are reproduced in this report.

## What this does not establish

- This is **user-reported**, not an independent review of output audio bytes, FFprobe codec data, or 4-second A/V synchronization.
- An iPhone browser recording with a four-second, 640×360 test effect is not long-form 4K processing, a reusable editable timeline, or a native AVFoundation editor.
- The generated MP4's exact audio codec, size, full playback duration, background performance and stability over many runs are **NOT VERIFIED**.
- BGM/SE mixed-audio output on iPhone and generated Japanese AI narration saved as an audio file remain **NOT VERIFIED**.
- The actual GoPro/Insta360 11 GB source, multiple cameras, semantic AI editing and quality/self-repair remain **NOT TESTED**.
- A checked user confirmation is not proof of broad device compatibility; the report is specific to this test.

## Next evidence

1. Receive the page's anonymized `aivs-audio-mix-results.json`; compare `export.mode`, `export.status`, `replay.status`, and user acceptance fields. Do not upload the original video or audio.
2. Re-run with a small licensed/owned BGM and SE, confirming each is audible in the saved MP4 while the source remains intelligible. Record a separate JSON.
3. Implement/verify actual reusable project saving, output codec checks and direct AI narration file creation before claiming general video editing ability.

No Cloudflare R2, commercial publishing, payments, GORIQ modification or raw source-media upload is authorized by this report.


## Correction from later machine-readable evidence

A subsequent owner-submitted Device Lab JSON from iPhone Safari (generated UTC 2026-10-21T08:37:53Z) reports **originalSoundAudible=false**, **originalSignalPeakRms=0** and **outputSignalPeakRms=0** for the source-only recording. Therefore the earlier screenshot's checked original-sound item is only a **provisional historical user report** and should **not** be treated as the latest audio acceptance. The current original-sound milestone is **FAIL/INCOMPLETE** pending retest. See `docs/validation/IOS_ORIGINAL_AUDIO_ZERO_2026-10-21.md`.
