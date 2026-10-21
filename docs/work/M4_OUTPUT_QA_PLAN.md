# M4-A full-output technical inspection and re-edit handoff

Continue independently while actual browser/device acceptance remains blocked.
This bounded slice reuses the existing renderer, project plan and job journal.

1. Test first: actual synthetic late black/silent faults, intentional silence,
   near-clipping PCM, missing audio/corrupt decode, report identity and re-edit
   references. Include faults outside the opening seconds to require full scans.
2. Inspect all decoded video/audio with local FFmpeg, bounded diagnostic memory,
   measured sample peak and timestamped black/silence findings. Store output
   checksum and revision. Do not call uncertain visual/speech quality a pass.
3. Attach findings to saved timeline clips and preserve export/job reports over
   restart. Provide authorized report retrieval and UI replay/re-edit entry.
   Never automatically delete black footage, invent sound or change a project.
4. Independently review, fix verified issues, run existing relevant suites plus
   actual MP4 output/HTTP/restart checks, integrate one PR and verify main tree.

Acceptance: a late synthetic fault is found with correct output time and clip
reference; selected silent audio is reviewed but intentional empty/muted audio
is not called missing sound; output/report hashes and revisions agree after
restart; selecting re-edit references cannot modify project history. Reports
say CHECKED_LIMITED or NEEDS_REVIEW, never semantic/physical product PASS.

Freeze/gap cadence, true peak, speech intelligibility, caption raster safe bounds,
semantic quality, automatic bounded corrections and physical devices remain
separate unfinished requirements. No new paid service, network, asset or deploy.
