# Issue #37 — media preflight and completed-import recovery

Date: 2026-11-15 JST. Status: **TESTED_SYNTHETIC / physical ZBook BLOCKED**.
Tested implementation commit: `f26002df4e5be8fe0d97dee56d36ceed1d85020b`. Base main: `e1bf222dfe0043e307e3fc3c122e2fe52423dac8`.
[Issue #37](https://github.com/haji84/AI-VIDEO-STUDIO/issues/37),
[handoff Draft PR #36](https://github.com/haji84/AI-VIDEO-STUDIO/pull/36).
Machine-readable receipt: [ZBOOK_MEDIA_GATE_A_2026-11-15.json](ZBOOK_MEDIA_GATE_A_2026-11-15.json).

## What was actually repaired

Main's HTTP import and numerical signal analysis searched PATH while rendering
partly honored `AIVS_FFMPEG_DIR`. A real HTTP import reproduced `spawn ffprobe
ENOENT` with a configured pair and a launch PATH missing the media tools. These
paths now share discovery, including the saved renderer's audio probe/mix commands.
An explicit incomplete pair fails clearly; scoped Windows WinGet locations can
recover a stale launch PATH without downloads or security-setting changes.
Windows path fixtures ran on Linux; the new native Windows CI fixture job has
**not run**. It is not physical ZBook acceptance.

Main's probe boundary reproduced `json.loads(None)` as a raw TypeError by
injecting a missing process stdout result. Empty, null, wrong-shaped, nested and
oversized/deep responses, invalid dimensions/tags and unlaunchable executables
are now domain errors. Nullable optional tags are treated as absent. A real
non-JSON probe process was also rejected through HTTP while retaining its bytes.
`subprocess.run(capture_output=True)` normally returns text: this injected None
contract failure does **not** establish the original ZIP's failure source.
The v2.x ZIP and its ZBook stack trace remain unavailable.

A fully received file is fsynced, hashed and journaled before probing. Failed
validation leaves it outside the project and outside media-serving routes. The
UI can explicitly retry the retained copy after restart without another upload.
Size/hash and metadata identities are checked. Duplicate completed retry does not
add a second source/revision; stale requests and modified bytes are refused.
Partial transfers are distinct and are not resumable. This is not chunked upload.

On filesystems without hard links, an exclusive-copy fallback checks additional
free space and output identity before releasing the staging copy. Unsupported-link
behavior was injected at the filesystem boundary; no physical exFAT/FAT32 drive
was available. Shutdown now stops connections, drains active import/retry mutations
and waits for owned jobs before releasing the workspace lock. Initial-import and
retry tests reproduced the old post-close commit race before the fix and verified
that a new project's edit survives after restart.

## Verification

- Main baseline this session: Node 188 and Python engine 63 passed.
- Final implementation: Node **196/196**, Python engine **75/75**, audio **3/3**;
  zero failure, cancellation or skip in the Linux runs.
- One independent code review found three Important defects (shutdown mutation,
  hard-link portability, nested JSON guards). Each was reproduced RED and fixed
  GREEN; the full regression suites were then repeated.
- Deferred minor: this acceptance script's PATH simulation requires an absolute
  `AIVS_PYTHON`, as stated in its documented command prerequisites.
- `git diff --check` and workflow YAML parsing passed.

All four existing/new real-browser scripts ran on the tested implementation:

| Scope | Result | Actual output MP4 SHA-256 |
|---|---|---|
| existing-editor | PASS | `21c040adeb35bd0407c0a6d50698d2105a4d6a4a948e66eda25eb85dd68c9141` |
| two-workspace-source-relink | PASS | `e44168427d02db5d90b2a541c0fdc6a215406b7cd815ec96ff67fb47fbb5c421` |
| saved-cut-preview | PASS | `4a375f84ffe4bde59c16ac1265ef0566893658949f90900618ade031bca2dc07` |
| import-recovery-first-cut | PASS | `9f80f38ca421538c0ccbc18316af5089cc4a3c11e4a6b5c5ab382947af0d7bcd` |

The new recovery flow generated only synthetic black/moving footage with distinct
440/660 Hz tones. It performed two actual browser uploads, forced both probes to
fail, restarted, clicked two retained retry controls, verified both source hashes,
confirmed the known synthetic sync, generated/reviewed/applied the numerical
first cut, added Japanese caption text, rendered and downloaded MP4/QA through the
UI, replayed, fully decoded, restarted and independently downloaded identical bytes.
There were exactly **2 upload requests + 2 retry requests**, with no media resend
on retry. The **416,596-byte, 960x540** output kept the selected master audio:
440 Hz amplitude 0.12427157424185052, 660 Hz amplitude
7.532996869989267e-07. Inputs, saved project and completed output hashes
survived readback. These measurements do not certify speech intelligibility or
training semantics. Media and screenshots were not committed or uploaded to GitHub.

Runtime: Node 24.22.1, Python 3.12.14, Chromium 156.0.8078.79,
Playwright 1.64.1, FFmpeg/ffprobe n6.1.2-9-g4571c80b40-20241023,
Pillow 13.0.0, NumPy 2.3.5, fonttools 4.61.1,
installed Noto Sans CJK. The cloud environment uses the separately prepared,
checksum-pinned FFmpeg 6.1 pair; distro FFmpeg 7.1 fixture incompatibility was
already isolated during onboarding. ZBook's reported FFmpeg 9.0.2 is untested.

Reproduce using the activated Node/Python/FFmpeg toolchain and the browser/font
variables in `apps/local-editor/README.md`:

```sh
node --test --test-concurrency=1 cloud/tests/*.test.mjs packages/edit-planner/*.test.mjs packages/project/*.test.mjs apps/local-editor/*.test.mjs prototypes/device-lab/*.test.mjs
python -m unittest engine.test_media_tools engine.test_manifest engine.test_caption_raster cloud.processor.test_r2_run engine.test_local_signals engine.test_autoplan_pipeline engine.test_project_pipeline engine.test_saved_project_audio engine.test_output_qa engine.test_saved_sync engine.test_saved_first_cut engine.test_preview_saved_clip -v
(cd prototypes/audio && python -m unittest test_mix -v)
node apps/local-editor/browser-import-recovery-acceptance.mjs
```

The other three browser commands remain in the README and in the manual workflow.

## GitHub state and unfinished acceptance

At inspection and before publication of this branch, main remained at the base
above. The latest observed main manual-smoke run
[40811805222](https://github.com/haji84/AI-VIDEO-STUDIO/actions/runs/40811805222)
was SUCCESS on that main. No new hosted result is claimed. The manual workflow now
includes the new regression/browser checks and a separate Windows discovery-fixture
job. REST and GraphQL requests to api.github.com are currently Forbidden in this
cloud environment; native Git read/push and public GitHub pages work.

PR #26 (audible preview) and the independent stacked HUB NATURAL Drafts #27–#35,
#38–#39 were inspected and left untouched. PR #36 is a documentation handoff, not
proof that the distributed app was repaired. No main merge, deployment, paid
service, remote access, account change or device-security change was performed.

- **Gate A partial:** the main equivalent now passes the local synthetic workflow.
  Obtain the exact app ZIP (verify the handoff SHA), locate its original exception
  with a redacted stack trace, review/adapt these fixes and run on the actual
  ZBook/Windows launch processes. No unreviewed ZIP overwrite of main.
- **Gate B unfinished:** chunked/reconnectable uploads, crash/power-loss recovery,
  broad batching/idempotency and tens-of-GB storage/performance acceptance.
- **Gate C unfinished:** consented private Tailscale Serve and iPhone/Android on
  separate Wi-Fi/4G/5G. No Funnel or public editor exposure.
- **Gates D/E unfinished:** learned Japanese ASR/semantics/TTS, important-action
  preservation, one-hour/tens-of-GB authorized real media and all four devices.
  Current numerical first-cut is limited to 8 verified zero-drift sources/20 min
  and requires explicit review/apply; it is not unattended semantic editing.
- Corrupted pending journals fail closed; identities are not guessed and retained
  media is not silently discarded. Journal recovery remains separate work.

Product DoD remains **NOT MET**. The next blocked acceptance requires the missing
ZIP source and access to actual Windows/owner devices, rather than another claim
based on these synthetic results.


## Follow-up: requested physical-device connection

The owner authorized investigating and connecting an absent private-device path.
Current managed-network status confirms the cloud Tailscale integration is disabled
and unconfigured. This does not establish whether Tailscale is installed or logged
in on ZBook. No existing external connection/SSH host configuration or remote-control
tool was available. Actual device verification remains BLOCKED.
A local Windows status/GUI-launch helper was prepared and its sanitization logic
checked on Linux; Windows execution and initial owner login remain pending. The
managed cloud VPN must also be enrolled through supported environment settings.
No public exposure, alternative VPN installation, account creation, credential
capture or device-security change was performed. No private endpoint or connection
report is published here.


Owner follow-up: the sanitized Windows helper report now shows Tailscale Running
and selfOnline=true. No device address, account or key is recorded here. Cloud
service requests were rejected with403, and the managed cloud VPN remains disabled.
A single-device allowance was saved only to the private environment draft; runtime
enrollment and publication are still pending. The owner confirmed a VPN/Tailscale
settings section is present. This is connectivity preparation, not real-device
application acceptance. No video was transferred to or from the physical device.
