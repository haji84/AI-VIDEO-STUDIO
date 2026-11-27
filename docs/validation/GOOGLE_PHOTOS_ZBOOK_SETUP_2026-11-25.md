# ZBook Google Photos authentication setup — 2026-11-25 JST

Status: **IMPLEMENTING; owner policy consent pending. Live import NOT_RUN.**

The owner requested direct Google Photos import on the physical ZBook, with
media stored on the external SSD. The existing editor implementation remains
unchanged; this receipt records configuration progress separately from the
previous simulated Picker tests.

## Observed configuration

- The owner's existing Google Cloud session is available in native Chrome.
- A dedicated project named `AI VIDEO STUDIO Photos` was created and selected.
  No existing project's credentials were reused or modified.
- Only `photospicker.googleapis.com` was enabled for this task. Its service
  details show **Google Photos Picker API / status: enabled**.
- Google Auth setup is prepared with the app name `AI VIDEO STUDIO`, the signed-in
  owner's account as support/contact, and the external **testing** audience.
- The final setup screen requires agreement to the Google API Services User Data
  Policy. That checkbox and the final creation step remain unsubmitted pending
  the owner's action-time confirmation.
- No billing account was linked, no upgrade was accepted, and no paid resource
  was created in this setup.

Account email, project identifiers, OAuth secrets and screenshots are omitted
from this public receipt. No private Photos item was listed or downloaded.

## Local environment and input

Physical HP ZBook / Windows 11 Pro; Chrome 158.0.8127.37. Existing source is
`4253284038f2e49aeb4c8061b8459f97fe610235` in Draft #51, with documentation head
`6c20e6c6120f4fac2af5af8d26b6606025098b2f` before this receipt.
SHA-256 of the actual local input files:

| File | SHA-256 |
| --- | --- |
| `apps/local-editor/google-photos.mjs` | `a3cc2ee17309665751e8793ecaba6c98639ede3ba973ea5012d4096354ee5d59` |
| `start-windows.cmd` | `1c110f4154c21d1cbe91957a376e6b15af32aed05cea0cd87fbc98ab5acbf1b8` |

The editor is reachable locally at `http://127.0.0.1:8765/`. Its everyday media
workspace is `D:\AI_VIDEO_STUDIO_DATA\editor` on the owner-requested USB/exFAT SSD.
The default Desktop OAuth JSON was absent when inspected. Existing synthetic
import/export evidence remains in the [external SSD report](ZBOOK_EXTERNAL_SSD_2026-11-25.md).

## Remaining acceptance

1. Obtain the owner's confirmation for the displayed policy agreement and finish
   the prepared Google Auth setup.
2. Prepare a Desktop OAuth client and obtain the required action-time confirmation
   before credential creation. Add only the owner as a test user; request only
   `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`.
3. Download its JSON without exposing its contents, and save it outside the source
   repository at `%LOCALAPPDATA%\AI VIDEO STUDIO\google-photos-client.json`.
4. Verify the current editor is idle before restarting it with the same SSD workspace.
   Confirm the configuration is detected, complete account consent, and let the
   owner select a short authorized video in Picker.
5. Verify actual download, local import and draft creation on the SSD. Record only
   anonymized outcome/counts in public evidence. Live OAuth, selected-video
   download and real-media export remain **NOT_RUN** until observed independently.

No implementation change or new regression run is claimed by this configuration
receipt. No main merge or deployment was performed.

Official setup references: [configure the app](https://developers.google.com/photos/overview/configure-your-app),
[Picker authorization](https://developers.google.com/photos/overview/authorization),
[displayed user data policy](https://developers.google.com/terms/api-services-user-data-policy?hl=ja).
