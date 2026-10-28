# F1 explicit source relinking — synthetic validation

Date: 2026-10-29 JST (2026-10-28 UTC).
Status: TESTED_SYNTHETIC candidate after code-review fixes; final frozen-file audit
and integration are recorded by the carrying PR.
Base main: `8f335b12ac0624e870b7187eaf24b04325c750bf`.
Base tree: `2547d991dc338d771d415241ec2615858260ea2d`.
No remote publication, merge or hosted CI is claimed by this evidence.

## Outcome and exact scope

The local editor can prepare a saved session JSON in a new dedicated workspace,
accept explicitly selected file bodies, verify and retain those copies without
editing the current session, then open the saved edit only after an explicit
action. Verification includes sources found only in Undo/Redo snapshots.
The saved project ID, source IDs, edits, audio and history survive; the current
workspace revision advances according to the existing Open behavior.

One in-memory random plan ID binds the exact validated candidate to the current
project ID and revision. A newer edit/project, superseding prepare or restart
invalidates that plan. Wrong content is rejected even when the filename matches.
Existing matching registered bytes are freshly hashed and probed before reuse.
An existing conflicting asset ID is never overwritten.

The implementation uses existing Node/FFprobe APIs and local storage conventions.
No schema, core project/history, render engine, output-history, dependency,
workflow, service, private footage or credential change is part of this unit.
No path, URL, archive or folder-scan API was added. UI accepts File bodies only.

## Bounds and persistence

- Saved JSON: existing 4 MiB HTTP ceiling and existing session schema validation.
- Current/Undo/Redo source union and combined workspace registry: at most 100 IDs.
- Media: existing extension whitelist, 16 GiB/file, four hours, 600 MiB disk reserve.
- Media copying and SHA256 use bounded chunks. Reads observe a fixed finite
  size and compare file identity before/after; whole media is not buffered.
- Portable v1 source refs do not contain original byte length or filename. The
  implementation does not invent those historical values. It checks declared
  versus received extent, observed stable size, SHA and actual media information.
- Successful registry additions are saved before acknowledgement. Current
  project/history persistence occurs only at explicit Open.
- A failed registry write after rename may leave an **unregistered copied file**.
  It is not acknowledged success or automatically reused; no directory scan
  admits it. Retrying may create another copy. It is not deleted after an
  ambiguous write failure because it could have reached durable registry storage.
- Acknowledged registered copies can be reused after cancellation/restart, after
  the user selects the JSON again. Neither action automatically opens a project.
- This does not promise a multi-file atomic transaction or power-loss recovery.

## Actual runtime

| Component | Observed version |
|---|---|
| OS | Linux 6.18.55 x86_64, glibc 2.39 |
| Node | 24.22.1 |
| Python used by editor render | 3.12.14 |
| Pillow in that isolated runtime | 13.0.0 |
| FFmpeg / FFprobe | 6.1.1-3ubuntu5 |
| Caption font for existing regressions | Previously verified NotoSansCJK-Regular.ttc, face 0; no new font download/install |

The ordinary sandbox refused loopback listen with EPERM. A narrowly authorized
local test execution supplied temporary 127.0.0.1 servers using only generated
media. The EPERM run is not counted as a product-test RED or a pass. No external
network, persistent service, browser download or user footage was needed.

## Meaningful RED / GREEN evidence

1. Before the module existed, all 12 initial filesystem cases failed at missing
   exported API assertions. After implementation, a removed retained file
   exposed an unhelpful ENOENT; it now produces a bounded recovery error.
2. Additional tests caught a same-hash intrinsic-metadata contradiction and
   reuse of incorrect registry metadata. Fresh actual probe checks were added.
3. Before server integration, all three initial actual HTTP cases failed on the
   missing prepare route (404). After integration, the two-workspace export,
   stale/authentication guards and real final-write fault cases passed.
4. Before the panel existed, eight DOM-double cases failed at the missing API.
   They now exercise missing lists, streaming File requests, progress, retry,
   explicit Open, cancellation and stale asynchronous results.
5. The public static-module route first failed (403); after adding it to the
   existing module allowlist, the fetched JavaScript imports successfully.
   Node syntax checks pass for the server, new modules and extracted inline HTML
   module. These checks are not actual browser execution.
6. Root review identified a valid compatibility case: existing import sets
   mediaKind by role, so an audiovisual MP4 can be video and BGM under different
   IDs. The actual existing API reproduced SOURCE_IDENTITY_CONFLICT before the
   fix. It now recovers both IDs/roles from one copy. Across different IDs only
   SHA/duration/audio presence must agree; every new target role is independently
   checked against the fresh probe. An actual registered WAV claimed as video
   is refused. The per-ID immutable mediaKind rule remains strict.
7. Independent review reproduced an actual server Open commit whose response was
   delayed before reaching the UI. Cancel previously hid the panel and discarded
   the committed response, leaving the displayed edit stale. The same real-HTTP /
   DOM-double regression failed before the fix and passes afterward: final Open
   disables and guards Cancel/new JSON selection; the response updates the editor.
   The reviewer independently reran the reproduction and observed client/server
   project identity agree with exactly one onOpen callback. Preparation/upload
   cancellation and genuinely stale project/revision replies remain covered.

The affected regression command is:

```sh
node --test --test-isolation=none apps/local-editor/*.test.mjs packages/project/project.test.mjs packages/project/local-store.test.mjs
```

`AIVS_PYTHON` selected the Python/Pillow runtime above; `AIVS_CAPTION_FONT` selected
the existing verified Japanese font. All test output was retained in the local
verification logs. The final gate after all reviewed code fixes passed **108/108**,
zero failures, zero skips, in **25.306 seconds**. This comprises 81 local-editor
cases (including 16 source-manager, 8 panel and 5 actual HTTP cases) and 27
project/local-store cases. Earlier pre-review and post-role-fix gates passed
104/104 and 107/107; neither substitutes for the final cancellation coverage.
Whole-engine tests were not gratuitously repeated
because the engine is unchanged and actual export/full-decode acceptance passes.

## Real two-workspace acceptance

Workspace A imported a generated two-second blue video with 440 Hz audio,
trimmed it to 1.5 seconds and imported a distinct 880 Hz BGM WAV. Undo left that
BGM only in Redo history. The complete saved JSON contains both history stacks.

Workspace B started with an empty project. Ordinary Open refused the missing
original IDs. Prepare reported two required identities. One correct video upload
was retained; Open still refused missing historical BGM. A different 660 Hz WAV
given the expected filename was rejected. The current session object and saved
project bytes remained unchanged.

After B restarted, the old plan ID was invalid and the original current session
was still open. Reselecting JSON reused the registered video copy; selecting the
correct WAV completed the identities. The project still did not change until
explicit Open. The resulting session equals the saved one except for the
documented current-revision increment. Both history arrays compare exactly.

Redo restored the historical BGM; Undo/Redo, automatic save/restart and a manual
gain edit worked. Rendering produced an actual 40,618-byte MP4. The report's hash
matched the downloaded bytes and current project/revision. FFmpeg decoded the
whole file with `-xerror`. A decoded PCM frequency check found the expected 880 Hz
BGM above the test threshold, proving historical-only audio reached the export.

Before/after comparisons verified:

- All generated originals stayed byte-identical, including the rejected file.
- Workspace A's saved session, registry and every imported copy stayed identical.
- Workspace B's original session bytes stayed identical through prepare, the
  successful partial copy, wrong-file failure and restart, until explicit Open.
- B's recovered registry retained both saved source IDs and their exact hashes.
- Rendering did not change B's saved session, and no upload `.tmp` remained.

### Exact identities from the final post-review-fix gate

| Artifact | SHA256 |
|---|---|
| Generated video with 440 Hz audio | `ddcffb2ec80664d5f4b35e0a704f5b722dcf5f6ee8bc48a36fb82d753c8a9650` |
| Correct 880 Hz BGM WAV | `deb08de94c3711c321523c48f98f535bd6d44ba825bccee5e26f1ada2ed30e9f` |
| Wrong same-name 660 Hz WAV | `81349aa4f33e24937778dfdc4e178b3105bf692d74e71aca91a6234f883d4c37` |
| Saved Workspace A session | `5532a628446aa9f7983d21ef1f1f30d0185872274e191b88486645fd5300ca49` |
| Workspace B's original session | `e8f2cd52b86bdccb3ffb2282a656809eda08d406993e3e21de794d459f2c6e9e` |
| Recovered actual MP4, 40,618 bytes | `d3e8a44e2fa580452f4befc0d93b7ba8961e92472b258ad780d35ac8028f476c` |

Project/source IDs are random, so saved-session hashes identify this run rather
than all repeated runs. The fixed generated media and rendered MP4 hashes are
stable across the initial and post-review acceptance runs.

## Refusal and failure coverage

The tests also cover inconsistent source identity across snapshots, existing-ID
conflict, contradictory same-hash duration, actual probe mismatch, missing /
modified / symlinked retained files, registry capacity, oversized / short / long
uploads, extension refusal, insufficient disk reserve and stale project/revision
before any media consumption. Origin/token guards and forged/superseded plan IDs
retain the same existing server protection. No filenames prove source identity.

Real filesystem unit tests make registry/session commit callbacks fail and
verify saved copies and current state. Disk assertions distinguish retained
registered copies from an unregistered residual file. A separate actual HTTP
test injects an unreplaceable directory at the final project path, keeps the
old file as a test backup, confirms the in-memory session and backup bytes stay
unchanged, restores the path and proves restart/retry/Open still work. It is a
controlled persistence fault, not a claim to have reproduced an OS crash.

The independent reviewer also injected an actual `media.json` destination
directory failure over HTTP: upload returned 400/EISDIR, one renamed verified but
unregistered copy remained, and both the current session and saved project bytes
stayed identical. After restoring the original registry and restarting, prepare
reported zero available sources, proving the orphan was not automatically
admitted. This separate review probe confirms the documented residual-file limit;
it does not request unsafe cleanup or claim crash-atomic persistence.

## Remaining acceptance

Actual browser, beginner usability, Windows/macOS/iPhone/Android operation,
large-media performance and preview/export parity remain unverified. The earlier
browser-executable/download blocker was not retried. No HTML/API/DOM-double result
is labelled GUI or device PASS. This unit completes one synthetic source-relink
flow only; full F1, F8, F9 and Product DoD remain open. Final independent review,
frozen candidate and any later integration belong in the carrying PR record.
