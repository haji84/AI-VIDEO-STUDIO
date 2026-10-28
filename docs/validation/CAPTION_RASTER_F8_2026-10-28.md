# Static caption raster candidate — 2026-10-28 UTC

Status: local reviewed candidate; not pushed, merged or deployed. Base main
`d849ab93daaa99ec5b7f4824bb810bbbaef6d7b5`, tree
`5e85e07d80216cbc4e429e429629754da78a61a7`. Product DoD remains unmet.

## Change and observed regressions

The existing compositor flattened newlines and placed unmeasured text on one
line. On an actual generated 640×360 MP4, 180 W characters reached x=0 and were
clipped; three explicit lines became one. A Japanese caption rendered missing
glyph boxes without reporting failure. Four initial real-output tests failed.

Only the static caption path now prepares a measured transparent PNG, checks
every drawn Unicode code point in the selected installed font, wraps long lines,
preserves explicit line breaks, and rejects overflow without dropping text or
reducing the font size. Existing FFmpeg video/audio composition consumes this
raster. The saved-project manifest accepts newlines; the final saved-project
report retains the font hash, face, raster hash, bounds and line count. This is
prepared-raster evidence, not OCR or a claim of semantic/physical output quality.

Pillow/fontTools imports are lazy. An actual caption-free MP4 also passed under
Python `-S`, with those site packages unavailable. The application does not bundle
or download fonts. A later verification-only font acquisition is recorded below.
`requirements-media.txt`, PC setup instructions, existing manual CI provisioning
and the optional processor image definition state the required dependencies.
Neither the manual workflow nor the optional container was run/deployed here.

## Independent review

Nonauthor reviewer `/root/fix_review` reproduced two important defects and a
placement issue in the first candidate: U+3000 skipped by `isspace()` could
render as a missing glyph; a Type1/bad font aborted discovery before later
usable fonts; 4:2:0 overlay rounded an odd origin by one pixel. All three received
recorded REDs and regression fixes. The reviewer then independently ran all nine
caption tests successfully. Final production source was unchanged afterward;
subsequent edits were setup/checkpoint/validation documentation only.

## Actual runtime and verification

Linux; Python 3.12.14; Node 24.22.1; FFmpeg 6.1.1; Pillow 12.3.0;
fontTools 4.61.1. Generated media only; no private video or cloud service.

Initial runs before a Japanese font was available:

| Executed group | Observed result |
| --- | --- |
| Caption raster | 9/9 PASS, including decoded pixel bounds, explicit newlines, missing Japanese/fullwidth-space glyph rejection, overflow rejection, bad-font fallback, even overlay origin, saved-project/audio/evidence persistence, and caption-free dependency isolation |
| Caption + saved audio + project + manifest + cloud boundary Python subset | 24 cases: 22 PASS, 2 ERROR from unavailable Japanese glyph font |
| Other engine tests: signals, auto-plan, output QA, saved first-cut, saved sync | 27/27 PASS |
| Portable Node project/planner/cloud contract/device diagnostic tests | 93/93 PASS |
| Local editor Node API/HTTP/edit tests | 29/29 PASS after permitted local-test sandbox escalation |
| Cloud media pipeline synthetic integration | 1 FAIL: unavailable Japanese glyph font |
| Audio prototype | 3/3 PASS |
| Legacy editor | 9 PASS + 1 localhost EPERM initially; that exact HTTP case subsequently PASS after permitted test escalation |

These disjoint groups covered 187 test cases: 184 passed, three were blocked
by Japanese font availability in this initial runtime. This was not an all-green suite
or CI acceptance. No failures were hidden/skipped. The initial wrong-directory
audio/legacy loader errors and an incomplete first full-engine run are retained
separately; corrected commands and the complete disjoint runs above supply the
reported results. Original sandbox HTTP failures are retained as environment
failures, not product defects.

The two Python font errors are
`ManifestTests.test_one_camera_real_mp4` and
`ManifestTests.test_three_cam_split_real_mp4`. The Node font failure is
`cloud/tests/media-pipeline.test.mjs`'s R2-style synthetic pipeline. All fail
explicitly with `CAPTION_FONT_GLYPHS_MISSING`; these initial runs did not establish
Japanese rendering success. No tests were changed to accept missing-glyph boxes.

Reproduction commands (run from repo root except where shown):

```sh
python -m pip install numpy -r requirements-media.txt
python -m unittest engine.test_caption_raster engine.test_saved_project_audio engine.test_project_pipeline engine.test_manifest cloud.processor.test_r2_run -v
python -m unittest engine.test_local_signals engine.test_autoplan_pipeline engine.test_output_qa engine.test_saved_first_cut engine.test_saved_sync -v
node --test --test-isolation=none packages/project/*.test.mjs packages/edit-planner/*.test.mjs cloud/tests/worker.test.mjs prototypes/device-lab/*.test.mjs
node --test --test-isolation=none apps/local-editor/*.test.mjs
node cloud/tests/media-pipeline.test.mjs
# From prototypes/audio:
python -m unittest test_mix -v
# From legacy/desktop-v0.1:
python -m unittest discover -s tests -v
```

## Retained real MP4 evidence (synthetic content)

The local review folder contains before/after MP4s, PNG frames and JSON metrics.
All four outputs passed whole-file FFmpeg decode. Source SHA256:
`8baa675b21a3ce59cb3ae65068b74f8fd47e5c35a99fed2a45abd14d82370333`.
Original source hash remained unchanged. All outputs retained the actual 440 Hz
sound with RMS 0.0884944722. No compressed-MP4 byte equivalence is claimed.

| Case | Before, decoded white pixels | After, decoded white pixels |
| --- | --- | --- |
| 180 W characters | One line, clipped at left x=0 | Six lines, bounds x=53..584 and y=134..276 |
| Three explicit lines | One line | Three lines, bounds x=189..449 and y=212..276 |

After long-caption output SHA256:
`f7c28c6a654113aeac2361279833baec8974700f6d0ed5ae395cdb3b9bab17a0`.
After multiline output SHA256:
`58c0ffb501cd90d68a7b74e2975a301d94ed1d9f5a3c191298557e6a7d146cf5`.
Decoded visible-pixel bounds differ slightly from prepared antialias bounds;
both are inside the safe area. Actual output frames were visually inspected.

## Additional Japanese-font verification — 2026-10-28 UTC

The initial 184/187 result and all three failure logs above are retained. One
subsequent public download obtained Ubuntu Noble's `fonts-noto-cjk` package,
version `1:20230817+repack1-3`, from the
[official Ubuntu archive](https://archive.ubuntu.com/ubuntu/pool/main/f/fonts-noto-cjk/fonts-noto-cjk_20230817+repack1-3_all.deb).
The file's 61,229,778 bytes and SHA256 matched the
[official package metadata](https://packages.ubuntu.com/noble/all/fonts-noto-cjk/download):
`7d64b985f6fe128c99eae5610d5c047338e572bdcfb2bb09736be01b824a7f6c`.
`dpkg-deb --extract` unpacked it only into the scratch verification directory;
there was no system package install and no font is included in this change.

`AIVS_CAPTION_FONT` selected the extracted `NotoSansCJK-Regular.ttc`, face 0
(`Noto Sans CJK JP`), SHA256
`b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a`.
Without code or test changes, the two previously failing Python manifest cases
passed (2/2, 1.971 s), and the previously failing Node R2-style media integration
passed (1/1, 1.081 s, zero skips). Therefore all 187 enumerated cases now have
passing evidence across the recorded runs. This was a targeted rerun of the
three blocked cases, not a new single full-suite run or a CI execution.

Two further actual 640×360 MP4s used the same unmodified generated source.
Every drawn code point mapped to a nonzero glyph ID in the exact font bytes used
by the renderer. Both outputs passed whole-file decode and visual inspection of
the extracted frames; the prepared bounds and decoded visible bounds remain
within the five-percent safe area.

| Japanese caption | Actual decoded lines | Checked unique code points | Decoded white-pixel bounds (inclusive) |
| --- | --- | --- | --- |
| 130 characters of continuous Japanese text | 5 | 25 | x=51..586, y=135..274 |
| Three explicit Japanese lines | 3 | 31 | x=195..443, y=197..275 |

Both MP4s retain the 440 Hz source tone with RMS 0.0884944722 (source RMS
0.0885888860), and the source SHA256 remains the value recorded above. Long
output SHA256: `d49a909593f0c49aabd2dd18a40aeab530366e644abf9bb319199e7fff06bcf9`.
Multiline output SHA256:
`160b7f39cdd9e0e667e33c458ffb93a0be4e83e861a6d6b9ba7e760ca7cb33f5`.
This is synthetic Linux Japanese raster/audio evidence, not native device,
GUI preview parity, semantic quality, or all-font acceptance.

Scratch evidence: `verification/fonts/source.json`,
`verification/japanese-font-python.log`, `verification/japanese-font-node.log`,
and `verification/japanese-media/evidence.json` with MP4s and extracted frames.
The font package and extracted fonts are excluded from the commit/deliverable.
Targeted reproduction with a separately installed compatible Japanese font:

```sh
export AIVS_CAPTION_FONT=/absolute/path/to/NotoSansCJK-Regular.ttc
python -B -m unittest engine.test_manifest.ManifestTests.test_one_camera_real_mp4 engine.test_manifest.ManifestTests.test_three_cam_split_real_mp4 -v
node cloud/tests/media-pipeline.test.mjs
```

## Pillow 13 security and compatibility follow-up

The initial candidate allowed Pillow below 13. The upstream
[Pillow 13.0.0 release notes](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html)
document security fixes, and its
[published Python requirement](https://pypi.org/project/pillow/13.0.0/)
is Python 3.11 or newer. `requirements-media.txt` now requires
`Pillow>=13.0,<14`. Both setup READMEs state Python 3.11 or newer. The existing
manual workflow selects Python 3.13 and the processor image uses Python 3.12,
so their declared runtimes satisfy the new requirement. Neither workflow
execution nor container build is claimed.

An isolated environment actually imported Pillow 13.0.0 from its own site
packages, on Python 3.12.14 with NumPy 2.3.5 and fontTools 4.61.1. The existing
nine caption tests and the two Japanese manifest tests passed together (11/11,
3.912 s). The unchanged Node media integration also passed while its Python
child used that environment (1/1, 1.210 s, zero skips). This includes explicit
missing-glyph refusal, caption-free dependency isolation, actual pixel placement,
saved history and preserved audio; no production-code or test change was needed
for Pillow 13 compatibility.

Both Japanese MP4s were regenerated under Pillow 13. Their output SHA256 and
caption raster SHA256 exactly match the earlier Japanese artifacts, with the
same safe pixel bounds, glyph coverage, line counts and 440 Hz audio. Runtime
and result records are `verification/pillow13-runtime.log`,
`verification/pillow13-caption-python.log`,
`verification/pillow13-caption-node.log`, and
`verification/japanese-media-pillow13/evidence.json`. The targeted reruns do not
assert a fresh 187-case full-suite run or overall dependency-audit acceptance.

## Remaining acceptance

The local Japanese font blocker is resolved by the additional evidence above.
Perform the existing formal PR/CI/main integration gates. Native iPhone/Android,
Windows/macOS, GUI preview parity, real long video, large footage, novice tasks,
semantic editing, natural TTS and full product acceptance remain unverified.
This change does not reduce any product Goal or enable cloud/billing/public release.
