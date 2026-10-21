# iPhone Safari original sound silent: reported failure and local fallback, 2026-10-21

## Evidence provenance (user-supplied anonymous JSON)

The user sent `aivs-audio-mix-results.json`, generated 2026-10-21T08:37:53.009Z on iOS Safari. The raw file is not published because this repository is public. Reported **failure of original sound in the exported MP4** supersedes the earlier provisional owner screenshot with four boxes checked. This report refers to the latest detailed machine-readable evidence.

- Selected video: 46.96 MiB; 60.82 seconds; 1170 × 1984 pixels. Filename, footage and audio not recorded here.
- MP4 Blob was created: `SOURCE_AUDIO_MIX_MP4_CREATED`, `SOURCE_ONLY`, 613,669 bytes, about 3.43 seconds of source advancement, elapsed 4,263 ms.
- MIME string **reported** `video/mp4; codecs=avc1.42000a,mp4a.40.2`. The stream's actual codec has **not** been independently checked; do not treat the MIME as an audio decode guarantee.
- Audio capture graph: 241 sampled frames, `originalSignalPeakRms = 0`, `outputSignalPeakRms = 0`. An audio track object was attached, but no nonzero signal was measured.
- Replay: `REPLAY_ADVANCED`, which proves short **video** advancement only.
- Owner checks: source visible=true, caption visible=true, original audio audible=**false**, Files saved replay=true. Result: `INCOMPLETE`.
- Other files: BGM was rejected as too large for the 12 MiB prototype limit; SE decode rejected as longer than its 90-second cap. **No extra track was actually included** in the `SOURCE_ONLY` result.

## Diagnosis

**Observed:** the original-sound Web Audio graph was silent for the measured interval, and the owner heard no original sound. This is a browser/audio-route failure *or* an audio-silent opening segment; the file/codec is unavailable for independent diagnosis.

**Hypothesis (not proven):** iOS Safari's `createMediaElementSource` or local file's audio track failed to feed Web Audio even though the video frames advanced. WebKit has related audio-routing issues, but they do not prove this exact case. Changing the `MediaRecorder` MIME string alone is not a fix.

## Patch: isolated local audio-buffer fallback

- New `prototypes/device-lab/AUDIO_COMPAT_LAB.html` uses a **default-on, iOS-only** opt-in compatibility switch for the source-only test. It attempts `decodeAudioData(await file.arrayBuffer())` of the owner's MP4 and routes the decoded audio through `AudioBufferSourceNode` instead of `MediaElementAudioSourceNode`.
- This reads **only on device**, caps video file size at **96 MiB** for memory safety, requires signal in the opening four seconds, and intentionally does not upload media or change the original source file.
- When audio decode fails or either capture-meter RMS remains zero, the exporter now reports `AUDIO_MIX_EXPORT_FAILED` with an explicit code; it does **not** report success merely because a video Blob was generated or MediaStream audio track existed. The prior non-iOS media-element mode remains a diagnostic comparator.
- Four manual checks plus playback advancement and nonzero source/output meter values remain necessary; even then success is **USER-REPORTED**, not independent PCM/mux/native evidence.
- Browser silence detection is not an exhaustive QA of the output file's encoded audio and might classify a genuinely silent opening as a failure. Select a short clip with an audible sound in its first four seconds.
- The original `audio.html` remains intact. This is a **new experimental /audio-compat.html page only**, not the product editor.

## Independent desktop development tests (NOT physical iOS)

- 10/10 dependency-free Node static checks; inline script Node syntax PASS.
- Linux Chromium headless, generated 7-second MP4 (H.264 video, AAC 440 Hz tone): local buffer decode succeeded, produced a **553,903-byte**, approx 3.97-second MP4. Output stream: H.264 + Opus (not necessarily iOS-compatible). Browser replay advanced; FFmpeg decoded the output audio. Independently measured PCM RMS about **0.17665**. Original route meters: source 0.090851, output 0.128576.
- First four seconds deliberately silent + later audible track: export correctly failed with `FIRST_FOUR_SECONDS_SOURCE_AUDIO_SILENT`; no falsely successful completed MP4.
- Simulated **iOS user-agent in Chromium** selects compatibility mode by default and exported a short source-audio clip. This is **not** real Safari/WebKit validation.

## Pending

1. Test the new static `audio-compat.html` page on **actual iPhone Safari**, using an owned MP4 under 96 MiB with audible original audio in the first four seconds.
2. Save the output to Files, replay and listen, and submit *only* the anonymous result JSON. The new telemetry contains `audioSourceMode`, `sourceBufferPeakRms`, `originalSignalPeakRms` and `outputSignalPeakRms`.
3. If Safari `decodeAudioData` fails or audio still vanishes, this approach has failed on the physical iPhone; next route is a native AVFoundation audio/video composer, not endless MediaRecorder retries.
4. BGM file size and SE length restrictions are **prototype safeguards**, not evidence that local mixing is generally unsupported. Revisit after original sound acceptance and memory benchmarks.

No R2, paid cloud processing, billing, public video editing service, GORIQ modification, real footage or unlicensed audio is included.

References: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData ; https://bugs.webkit.org/show_bug.cgi?id=306493 ; https://caniuse.com/mdn-api_htmlmediaelement_capturestream
