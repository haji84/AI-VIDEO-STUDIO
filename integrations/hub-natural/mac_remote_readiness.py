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
import platform
import shutil
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


def inspect(*, system=None, arch=None, python_version=None, launchctl=None):
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
    return {
        "schema": SCHEMA,
        "status": "HOLD_REMOTE_IPHONE_TEST_NOT_VERIFIED",
        "macOSProcess": mac,
        "nativeArm64Process": arm_native,
        "python311OrNewer": python_ready,
        "launchdCommandAvailable": launchctl,
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
    parser.parse_args(argv)
    report = inspect()
    print(json.dumps(report, sort_keys=True))
    # Never return production PASS; real cross-network iPhone test isn't
    # measurable from the host-only process.
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
