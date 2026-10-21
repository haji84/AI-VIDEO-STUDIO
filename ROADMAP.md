# AI VIDEO STUDIO | Roadmap

Evaluation is based on verified, usable product requirements, not number of commits / PRs / AI calls.

## P0 Local-first mobile foundation

- [ ] iPhone: capability and performance test with owned footage, Japanese speech and effects.
- [ ] Portable local non-destructive project schema (sources, cameras, offsets, timeline, effect keyframes, narration, four audio buses, history).
- [ ] iPhone prototype: import -> timeline -> caption/effect -> preview -> local MP4 export -> reopen.
- [ ] Deterministic renderer: preview and exported MP4 have matching timing and visible effects.
- [ ] Four-bus audio mixing: source, narration, BGM, SE; ducking, fade, repeat and timeline persistence.
- [ ] Japanese offline voice generation with reusable file output and device performance evidence.
- [ ] Beginner UI: one-tap effects, thumbnails, clear undo/redo and recoverable state.

## P1 Multi-device / AI

- [ ] Android Media3 native adapter, benchmark parity.
- [ ] Windows and macOS desktop adapters; do not require ZBook uptime.
- [ ] 1–N camera synchronization, drift/silence handling and confidence gating.
- [ ] Per-device local ASR and light scene/pose/object analysis, real measurements.
- [ ] Content-based edit proposal and bounded independent quality checks.
- [ ] Multi-source real-world acceptance with actual GoPro/Insta360 footage when accessible, including 360-degree source constraints.

## P2 Optional cloud (future consent required)

- [ ] Opt-in private sync / CPU or GPU background job.
- [ ] Per-job cost quote, owner acceptance and safe budget gates; optional R2 storage.

## Deferred product commercialization

- [ ] Stripe, user accounts, subscription tiers and billing.
- [ ] Public commercial launch, support, rights and privacy compliance.
- [ ] GORIQ integration for development workflow only, separately authorized.

No item becomes checked merely because a design document or test stub exists.

## L0 baseline added in development (2026-10-21)

- [x] Dependency-free numerical **first-cut proposal** on 1/2/3+ synthetic cameras, tested in Node (10 cases). This is not semantic AI editing.
- [x] Genuine FFmpeg short synthetic 3-camera signal extraction -> proposal -> video export -> full decode integration test in Linux container.
- [ ] Review proposal quality against actual owned multi-camera footage and establish timing/semantic metrics.
- [ ] iPhone / Android / Windows / Mac real-device evidence from `prototypes/device-lab/DEVICE_LAB.html` and future native app; **all physical devices still pending**.
