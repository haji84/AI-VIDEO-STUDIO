# Portable local project v1

This is the common editing model, not a finished mobile application. No external
dependency, network request, media upload or model is used by this package.
`project.mjs` also runs in browser JavaScript. `local-store.mjs` and the manifest
bridge require Node; use platform adapters for native device storage/rendering.

## Persisted data

`aivs-project` version 1 contains a project ID, revision, source identities
(asset ID + SHA-256, media kind/duration/audio and sync clock), video clips,
clip-relative effects, independently timed audio clips, four bus gains/mutes
and output quality. It contains no media bytes, file paths, device bookmarks,
account credentials or automatic cloud consent. Names/caption text can still
be sensitive: save project and binding files locally, never in public GitHub.

Time units are seconds. `sourceInSec` and `durationSec` refer to original media.
`startSec` and `endSec` refer to the edited output. A video clip's output length
is `durationSec / speed`. An effect's times are relative to that output clip.
Audio clip times and duck intervals are global output times; `trimInSec` refers
to its source. Source sync mapping is
`shared = offsetSec + local * (1 + driftPpm / 1e6)`.

`EditSession` serializes current state plus up to 50 undo/redo snapshots. Loading
validates every snapshot and rejects unsupported versions. Applying edits is
transactional; callers only get detached copies. `saveSession` validates before
writing, writes a private uniquely named temporary file, fsyncs it, then renames
it atomically over the prior save. Pass all source/protected paths to guard
against aliases. Atomic replacement does not promise survival of a disk failure
or sudden power loss on every OS/filesystem; filesystem durability needs device
testing. No multi-process collaborative save or locking is implemented.

## API example (Node)

```js
import {createProject, EditSession} from './project.mjs';
import {hashFile, saveSession, loadSession} from './local-store.mjs';

// Metadata comes from a real local probe. Do not guess duration/codec support.
const source = {assetId: 'asset_' + '1'.padStart(32, '0'),
  sha256: await hashFile(selectedAbsolutePath), mediaKind: 'video',
  durationSec: probedDuration, hasAudio: probedHasAudio,
  offsetSec: 0, driftPpm: 0, syncStatus: 'master'};
const project = createProject({projectId: 'project_example', sourceRefs: [source]});
// Add validated timeline/audio clips before rendering. See behavioral tests.
const session = new EditSession(project);
await saveSession(projectFile, session, {protectedPaths: [selectedAbsolutePath]});
const reopened = await loadSession(projectFile);
```

Local bindings are a separate JSON array:
`[{"assetId":"asset_<32 lowercase hex>","path":"<absolute selected local file>"}]`.
`verifyBindings` streams each selected file through SHA-256. A moved file with
the same bytes can relink; another file with the same name cannot. Bindings are
not project-format migration, codec verification or trusted sync evidence.

## Existing FFmpeg engine handoff

From the repository root, with Node, Python and FFmpeg installed:

```sh
node tools/project-manifest.mjs --project /local/project.aivs.json --bindings /local/bindings.json --output /local/job.json
python -m engine.run_manifest --manifest /local/job.json --workspace /local/new-workspace --output /local/new-output.mp4
```

Use a new isolated workspace and a new output name. Keep all runtime files out
of the source checkout. The bridge currently supports contiguous single/split
video, constant speed, clip-wide static captions and the primary camera's
unmodified original audio. It refuses drift, unverified sync, gaps/overlaps,
non-default audio routing/mixing and unsupported effects; it does not discard
them. Additional audio/effect data remains in the project for later backends.
The original engine renders numeric/signal-assisted edits, not semantic AI.

## Connected four-bus local export

The M2 reference backend now consumes the entire saved audio plan:

```sh
python -m engine.render_saved_project --project /local/project.aivs.json --bindings /local/bindings.json --workspace /local/new-audio-job --output /local/new-mixed.mp4
```

Workspace and output must be new. This runs the checked bundle builder locally,
renders video with the existing engine, then ignores its intermediate audio and
mixes the project's explicitly selected audio tracks. An empty audio plan means
silence. Source/narration/BGM/SFX gains and mutes are independent. Audio trim,
constant speed, output timing, fades, repeated selected tails and saved duck
intervals are honored. Delayed audio stream starts keep their leading silence
before trim/speed/loop; the camera soundtrack is never implicitly added twice.

Only standalone local containers are accepted; playlist/reference demuxers are refused before following un-hashed dependencies. At most 64 audio clips are accepted by this reference backend. Loops are decoded
to temporary PCM on disk, so disk-space checks can refuse large jobs. Node,
Python 3.11+, FFmpeg and a filesystem supporting hard links are required. Final
output uses an exclusive temporary file and an atomic no-clobber install.
Repeated export uses a new workspace/output; automatic crash resume is pending.

This is a Linux-tested local command, not an installed beginner/native app.
It does not generate narration audio or detect speech intervals. Supply owned
audio files and explicit duck intervals. Sample limiting is not a measured
true-peak/loudness guarantee. Long-media performance, native devices and audio
preview parity still need separate verification.

`migrateLegacyProject` accepts `engine/core_v01.py` project JSON only alongside
explicit verified source identities. It strips old machine paths, converts
shared/source/output clocks and static captions, and preserves source audio.
Legacy 360-degree projection requires a separate adapter and is refused.
Unknown future project/session versions are never automatically downgraded.

## Repeatable verification

```sh
node --test packages/project/*.test.mjs
python -m unittest engine.test_project_pipeline -v
```

The integration test creates three short artificial camera videos with distinct
colors/tones, hashes files, saves/reopens history, moves/relinks a source, emits
a manifest, exports a real H.264/AAC MP4, decodes the whole file, checks camera
pixels/caption and sound frequencies, and checks original hashes again. It
proves the Linux reference slice only. iPhone/Android/Windows/Mac physical
acceptance and real long-video workloads remain unverified.
