#!/usr/bin/env python3
"""Read-only owner-host readiness probe. No credentials, media or network are read.

This is a candidate check, NOT proof of an OAuth grant, durable storage, ACL
correctness on Windows, scheduled execution or a completed unattended cycle.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys

from drive_intake import Hold, _assert_private


def assess(root, *, environ=None):
    """Return only sanitized booleans and gate codes, never file paths or tokens."""
    env = os.environ if environ is None else environ
    blockers = []
    warnings = []
    storage_candidate = False
    requested = Path(root).expanduser()
    try:
        if requested.is_symlink():
            raise Hold("PRIVATE_ROOT_SYMLINK")
        private = _assert_private(requested)
        if not private.is_dir():
            raise Hold("PRIVATE_ROOT_MISSING")
        if not os.access(private, os.R_OK | os.W_OK):
            raise Hold("PRIVATE_ROOT_NOT_ACCESSIBLE")
        if os.name == "posix":
            st = private.stat()
            if st.st_uid != os.getuid() or st.st_mode & 0o077:
                raise Hold("PRIVATE_ROOT_POSIX_PERMISSIONS_UNSAFE")
        else:
            # Python's os.access does not prove Windows NTFS ACL safety.
            warnings.append("WINDOWS_ACL_OWNER_VERIFICATION_REQUIRED")
        storage_candidate = True
    except (OSError, RuntimeError, Hold) as exc:
        # Do not serialize arbitrary OS exceptions: these may contain paths.
        blockers.append(str(exc) if isinstance(exc, Hold) else "PRIVATE_ROOT_UNVERIFIABLE")

    media_tools = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
    if not media_tools:
        blockers.append("FFMPEG_OR_FFPROBE_MISSING")
    if sys.version_info < (3, 11):
        blockers.append("PYTHON_311_REQUIRED")

    has_oauth_env = bool(env.get("HUB_NATURAL_GDRIVE_ACCESS_TOKEN")) or all(
        bool(env.get(key)) for key in (
            "HUB_NATURAL_GOOGLE_CLIENT_ID",
            "HUB_NATURAL_GOOGLE_CLIENT_SECRET",
            "HUB_NATURAL_GOOGLE_REFRESH_TOKEN",
        )
    )
    if not has_oauth_env:
        blockers.append("OWNER_OAUTH_SETUP_REQUIRED")

    # Presence is not authentication. The user must explicitly approve/grant
    # the scope; and actual access must be verified privately, not in public CI.
    return {
        "schema": "hub-natural-private-host-preflight-v1",
        "status": "NOT_PRODUCTION_VERIFIED",
        "privateStorageCandidate": storage_candidate,
        "mediaToolsAvailable": media_tools,
        "oauthConfigPresentButUnverified": has_oauth_env,
        "realDriveRead": "NOT_ATTEMPTED",
        "scheduledExecution": "NOT_VERIFIED",
        "unattendedNewArrival": "NOT_VERIFIED",
        "blockers": sorted(blockers),
        "warnings": sorted(warnings),
    }


def main():
    parser = argparse.ArgumentParser(description="Local read-only privacy and runtime preflight")
    parser.add_argument("--private-root", required=True, help="Owner-private, existing directory outside Git")
    args = parser.parse_args()
    outcome = assess(args.private_root)
    print(json.dumps(outcome, ensure_ascii=False, sort_keys=True))
    if outcome["blockers"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
