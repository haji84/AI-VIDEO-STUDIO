# M2 persisted four-bus rendering

Owner goal/specs and M1 remain authoritative. Execute inline, test first,
one PR, independent review, safe main integration, post-merge validation.

- Extend the checked Node manifest CLI with `--format bundle`. Bundle contains
  original full audio plan plus an explicitly video-only composition manifest.
  Reject unsupported visual effects, preserve all desired audio separately.
- Add `engine/render_saved_project.py`: local session+bindings -> checked bundle
  -> existing video composition -> FFmpeg four-bus audio -> real MP4 -> full
  decode. No model, cloud, network, deployment or private media transmission.
- Honor explicit audio selection (including deliberate silence), bus mute/gain,
  source trim/speed, global timing, fades, repeated trimmed audio and ducking.
  Use disk-based loop segments to avoid whole-file PCM memory accumulation.
- Safely bound processing, verify every audio/video hash/capability, reserve a
  new workspace, refuse output/session/source/report overwrites and install
  output atomically without clobbering existing files.
- Test distinct synthetic 440/660/880/990 Hz tracks, source selection, timing,
  BGM repeat and measured ducking, gain/mute/fade, source hashes unchanged,
  wrong metadata/hash, unsupported visuals and output alias refusal.
- Physical natural voice quality/mobile performance and preview parity stay
  unverified. Persist exact commands, measured evidence and next UI task.
