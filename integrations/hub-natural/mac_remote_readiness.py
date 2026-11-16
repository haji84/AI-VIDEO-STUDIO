#!/usr/bin/env python3
"""HUB NATURAL M1 remote-access readiness probe (read-only, zero-media).

Checks only whether the local host is a plausible macOS metadata controller.
It does NOT install remote desktop software, grant permissions, start services,
inspect private credentials, open network ports, collect identifiers, or
confirm an actual iPhone session. An off-network iPhone-to-Mac test is required.

A readiness scan passing is NEVER evidence that remote control works.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import platform
import shutil
import stat
import sys

SCHEMA = "hub-natural-m1-remote-readiness-v1"
TESTS = (
    "OWNER_APPROVES_REMOTE_DESKTOP_HOST_AND_PERMISSIONS",
    "IPHONE_CONNECTS_FROM_DIFFERENT_NETWORK",
    "IPHONE_CAN_CONTROL_MOUSE_AND_KEYBOARD",
    "IPHONE_CAN_DISCONNECT_AND_RECONNECT",
    "MAC_AC_POWER_SLEEP_AND_LOCK_TESTED",
    "OWNER_REVIEWS_GOOGLE_ACCOUNT_AND_REMOTE_PIN_SECURITY",
)



def check_private_metadata_root(root):
    """Read-only candidate check. Never creates storage, probes media or ACLs.

    The final approval and durable-write/restore test must run on the actual
    owner Mac. Even a successful check is only an unactivated candidate.
    """
    if root is None:
        return "NOT_INSPECTED", False
    if not isinstance(root, (str, os.PathLike)) or not str(root).strip():
        return "OWNER_METADATA_ROOT_INVALID", False
    try:
        requested = Path(root).expanduser()
        if not requested.is_absolute():
            return "OWNER_METADATA_ROOT_ABSOLUTE_PATH_REQUIRED", False
        # Resolve no links: check each path component before any path lookup
        # that would follow links. This is a diagnostic, not an ACL guarantee.
        for part in (requested, *requested.parents):
            if part.is_symlink():
                return "OWNER_METADATA_ROOT_SYMLINK", False
            if (part / ".git").exists():
                return "OWNER_METADATA_ROOT_INSIDE_GIT", False
        if not requested.is_dir():
            return "OWNER_METADATA_ROOT_MISSING_OR_NOT_DIRECTORY", False
        info = requested.stat()
        if not stat.S_ISDIR(info.st_mode):
            return "OWNER_METADATA_ROOT_MISSING_OR_NOT_DIRECTORY", False
        if os.name != "posix":
            return "OWNER_METADATA_ROOT_ACL_NOT_VERIFIED", False
        if info.st_uid != os.getuid() or info.st_mode & 0o077:
            return "OWNER_METADATA_ROOT_NOT_OWNER_ONLY", False
        if not os.access(requested, os.R_OK | os.W_OK | os.X_OK):
            return "OWNER_METADATA_ROOT_NOT_ACCESSIBLE", False
    except (OSError, RuntimeError, ValueError, TypeError):
        return "OWNER_METADATA_ROOT_UNVERIFIABLE", False
    return "PRIVATE_METADATA_ROOT_CANDIDATE_NOT_ACTIVATED", True


def inspect(*, system=None, arch=None, python_version=None, launchctl=None, metadata_root=None):
    """Return sanitized capability flags and unverified acceptance gates.

    Callers may inject synthetic platform facts to test this on public CI.
    No host path, username, email, IP address, token or provider ID is returned.
    """
    system = platform.system() if system is None else system
    arch = platform.machine() if arch is None else arch
    py = sys.version_info[:2] if python_version is None else python_version
    launchctl = bool(shutil.which("launchctl")) if launchctl is None else bool(launchctl)
    mac = system == "Darwin"
    arm_native = mac and arch == "arm64"
    python_ready = (
        isinstance(py, (tuple, list))
        and len(py) == 2
        and all(type(part) is int and part >= 0 for part in py)
        and tuple(py) >= (3, 11)
    )
    blockers = []
    if not mac:
        blockers.append("NOT_RUNNING_ON_OWNER_MAC")
    if mac and not arm_native:
        # An M1 may be running Intel Python through Rosetta. Don't falsely
        # identify hardware from a single Python process architecture.
        blockers.append("ARM64_PYTHON_OR_ROSETTA_REVIEW_REQUIRED")
    if not python_ready:
        blockers.append("PYTHON_311_REQUIRED")
    if not launchctl:
        blockers.append("LAUNCHD_NOT_DISCOVERED")
    root_status, root_candidate = check_private_metadata_root(metadata_root)
    if metadata_root is not None and not root_candidate:
        blockers.append(root_status)
    return {
        "schema": SCHEMA,
        "status": "HOLD_REMOTE_IPHONE_TEST_NOT_VERIFIED",
        "macOSProcess": mac,
        "nativeArm64Process": arm_native,
        "python311OrNewer": python_ready,
        "launchdCommandAvailable": launchctl,
        "metadataPrivateRootReadOnlyCheck": root_status,
        "metadataPrivateRootCandidate": root_candidate,
        "metadataHostActivated": False,
        "remoteHostInstalled": "NOT_INSPECTED",
        "remoteControlOffNetwork": "NOT_TESTED",
        "ownerApprovalOfRemoteScreenPermissions": "NOT_RECORDED",
        "backgroundStateManagement": "NOT_CONNECTED",
        "actualHmacKeyAndDriveOAuth": "NOT_CONNECTED",
        "localVideoIngest": "DISABLED",
        "localVideoRender": "DISABLED",
        "localVideoRetention": "DISABLED",
        "productionRemoteVerified": False,
        "requiredOwnerTests": list(TESTS),
        "environmentBlockers": blockers,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Read-only macOS M1 metadata/remote-control readiness report")
    parser.add_argument("--metadata-root", help=(
        "Optional existing owner-only directory outside Git. Read-only check; "
        "the path is never printed or saved."))
    args = parser.parse_args(argv)
    report = inspect(metadata_root=args.metadata_root)
    print(json.dumps(report, sort_keys=True))
    # Never return production PASS; real cross-network iPhone test isn't
    # measurable from the host-only process.
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
