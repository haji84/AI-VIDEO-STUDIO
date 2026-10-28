# Retained output history — 2026-10-29 JST

Status: **TESTED_SYNTHETIC** on Linux. This closes the bounded output-history
slice, not F8 or Product DoD. Base: [PR #21](https://github.com/haji84/AI-VIDEO-STUDIO/pull/21),
main `c0bdfaef9a91c8783c2f7bee1d3c78218c8e4c4a`, tree
`11c156f4b3f1ba5e388aba018dd09e4b90a0b78a`.

## Resulting behavior

The editor now keeps a journal of its **50 most recent completed outputs**. After
restart, a user can explicitly select an earlier MP4 and its inspection in
「以前の完成動画」. This changes the displayed output only. The current project,
undo/redo history and render-job identity retain their existing meanings.
Old report navigation still rejects a changed project revision.

Listing reads the small journal, not every video. Selecting an entry checks the
recorded output/report identities and exposes the matching MP4 and report. Missing,
changed, linked or unjournaled evidence is refused. Evicting an old journal entry
does not delete its output or report files. No arbitrary directory scan is used.

The existing last-job completion receipt is saved before the additional history
journal. If only the history update fails, the latest completed output retains
its independently recoverable receipt and the app displays the history failure.
Failed or interrupted render metadata cannot admit orphaned output files.

An old-version workspace can migrate **only its last completed output** after
verification. Such a receipt is `LEGACY_LATEST` with unknown completion time
(`createdAt: null`). Its report digest begins at migration; pre-migration report
authenticity is unknown. Older unjournaled files are not automatically admitted.
Editing a report that already has a new completion digest is rejected, rather
than being treated as a legacy report.

## Bounds and integrity scope

- At most 50 receipts and 64 KiB for the history journal; strict schema, field
  types, identifiers and uniqueness. Latest-job metadata also has a 64 KiB cap.
- Reports keep the existing 32 MiB JSON ceiling. Media is streamed only through
  its recorded finite byte length, never collected into a media Buffer.
- Output/report locations derive from the validated job ID. Non-regular files,
  symbolic links, hard-link aliases and unsafe ancestor paths are rejected.
- Opened handles and file identities/stats are checked before and after reads.
  Only the two most recently verified pairs are cached. Every access rechecks
  their path/device/inode/size/mtime/ctime fingerprints; changed pairs are rehashed.
  This avoids rescanning a large unchanged video for every range request.
- A selection does not run a new FFmpeg decode or change prior inspection coverage.
  Digests bind saved evidence to the selected bytes; they are not signed
  attestations or a guarantee against an adversarial concurrent local writer.
  No atomic-filesystem or physical-device guarantee is claimed.

## Actual verification

Runtime: Linux, Node 24.22.1, Python 3.12.14, Pillow 13.0.0 environment,
FFmpeg 6.1.1-3ubuntu5. Media is generated locally; no private footage or voice.

Initial RED on the previous implementation: the actual two-output/restart test
received 404 from the missing history route, and no history-write failure warning
existed. A strict string-hash regression also received its own RED before repair.

Final complete **local-editor suite: 52/52 PASS**, no failures or skips. This
includes actual HTTP/render tests, history filesystem bounds, UI DOM doubles and
the existing editing, sync, first-cut, audio and inspection regressions. It is not
a new entire-repository engine suite, hosted CI or actual-browser acceptance.
The inline browser module also passed `node --check`.

The actual history acceptance rendered a two-second generated blue video with
440 Hz sound, changed the selected source gain by -6 dB, and rendered again.
After restart, both output/report pairs were listed and explicitly selected.
Both full downloads matched their recorded SHA256; byte-range downloads matched
the original first 32 bytes; both MP4s passed whole-file FFmpeg decode.
The current saved project/history and latest-job bytes did not change during
selection. An older report's edit navigation was refused for the newer revision.

| Artifact | SHA256 |
| --- | --- |
| Generated input | `ddcffb2ec80664d5f4b35e0a704f5b722dcf5f6ee8bc48a36fb82d753c8a9650` |
| First output | `6595e4676f03534d5228648326e3e93bd1bd29b3140b618941ed12f96e632bcd` |
| Second output | `e3d904a99b2a40d5dc1920c347aca3461ea5bce997bac74cfb5d576d6f932bf5` |

Separate checks rejected report edits, video edits after cache use, missing
reports, unknown job IDs, unauthorized/cross-origin requests and uncommitted
failed/interrupted artifacts. A real filesystem obstruction of the history file
proved that latest-job recovery still works after restart. A genuine old-format
fixture migrated one legacy output while ignoring an older otherwise valid pair.

Independent review found a latest-job read gap: a prior stat checked 133 bytes,
but the old reader could subsequently read 131,205 bytes after growth. The
replacement bounded handle reader consumed only the original 133 bytes and
rejected the changed file. The focused regression and independent rerun passed.
The completed-render path also obtains its output hash from the bounded report
reader before verifying the actual video; legacy migration still requires a
separately stored valid output hash. Both branches have focused regressions.
A separate reviewer probe replaced a verified output's ancestor with a symlink
to the same bytes; the cached access still refused it. These are filesystem
boundary checks, not media or browser acceptance. Final advisory review is
recorded in the carrying PR after the frozen files are reviewed.

## Reproduction and evidence

From the repository root with the normal local dependencies:

```sh
node --test --test-isolation=none apps/local-editor/*.test.mjs
```

Set `AIVS_PYTHON` to the configured Python and `AIVS_CAPTION_FONT` to a verified
font when required by existing caption tests. Only temporary loopback servers
and generated files are used. Test cleanup removes generated workspaces; no
media, fonts, journals or private source data is bundled in this source change.
The scratch `verification/` directory retains RED/GREEN logs, the review growth
probe and result, an extracted inline-module syntax check, and the frozen
change manifest. These scratch files are not published in the repository.

## Remaining acceptance

Actual browser operation/playback remains blocked by the absent browser binary;
the previous blocked download was not repeated. Windows, macOS, iPhone, Android,
novice usability, real speech and large-media performance remain unverified.
The history feature adds neither automatic repair nor new limiter/semantic QA.
Source relinking in a new workspace remains a separate unfinished requirement.

The carrying PR records the exact candidate, merge/tree and postmerge checks.
No future integration SHA is assumed in this document.
