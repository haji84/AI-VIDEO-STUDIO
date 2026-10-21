# F8-B: warning-only freeze / cadence output evidence

Reuse current full-output FFmpeg pass: add freezedetect (1s, noise0.001) and
vfrdet. Parse events and aggregate interval counts from the existing file-backed
log. Retain full decode/frame count/hash/audio/timing gates and finding cap256.
Open freeze tails end at actual video end, never at a longer audio-only tail.
Static scenes and variable cadence can be intentional: REVIEW warnings only,
no rewrite, no automatic repair, no claim of semantic/caption/audio acceptance.
Expose names and detector coverage in GUI; preserve legacy report honesty.

RED/GREEN actual synthetic tests: moving -> held frame -> moving with time/clip
links, still through EOF, normal CFR negative, true variable PTS positive;
retained corruption/short-stream gates. Full regression, one independent final
review, PR/main tree equality, postmerge real output/QA. Physical/browser NOT_RUN.

Completed implementation and177 local passing cases. Independent final review APPROVE; direct-run test-layout nit fixed. Main integration/postmerge verification pending.
