# M3 beginner local desktop slice

Reuse common session/storage and M2 renderer. No public hosting, new dependency
install, external upload, cloud or paid service. The owner authorized continuing
implementation; another design/permission pause is unnecessary.

- Node loopback-only server: private managed workspace, streamed local-file
  copies, verified media metadata/hash, atomic session save, protected requests,
  immutable source registry, range playback and bounded one-job rendering.
- Japanese touch-friendly local UI: choose footage/audio, trim/speed/caption,
  ordered clips, camera choice/manual sync confirmation, four-bus gain/mute,
  undo/redo, auto-save, project download/reopen and actual MP4 replay/download.
- All project operations use packages/project; rendering uses
  engine.render_saved_project. No duplicate media rendering implementation.
- Behavioral API tests first; full synthetic browser flow using existing
  Playwright runtime. Verify export with FFmpeg, restart/reopen and HTTP access
  controls. Independent review -> fix -> main integration -> post-merge check.
- This is a PC local app, not proof of native mobile support, real-user ease,
  semantic AI, persisted Japanese TTS or long/4K performance. Preserve those gates.
