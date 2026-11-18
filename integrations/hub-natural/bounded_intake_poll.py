#!/usr/bin/env python3
"""Owner-opt-in bounded repeat of the existing private Drive INBOX intake.

This is NOT a scheduler, public runner job, daemon, production deployment,
semantic classifier, video editor or publisher. It calls the existing one-shot
worker, preserving its private-state preflight and single-writer lock on every
check. Only an owner-approved private host with authorized OAuth can run live.
"""
from __future__ import annotations

import argparse
import json
import re
import time

from drive_intake import Hold
from new_arrival_job import run_once
import pipeline

SCHEMA = "hub-natural-bounded-poll-summary-v1"
MAX_CYCLES = 24
MIN_INTERVAL_SECONDS = 60
MAX_INTERVAL_SECONDS = 3600
_SAFE_REASON = re.compile(r"[A-Z][A-Z0-9_]{0,95}")


def _natural(value):
    return type(value) is int and value >= 0


def _validate_result(report):
    """Never treat an unreviewed or failed cycle as completed production work."""
    required = {
        "status", "newImports", "alreadyPresent", "held", "queuePending",
        "newlyQueued", "draftsMade", "publishing",
    }
    if (not isinstance(report, dict)
            or set(report) != required
            or report["status"] != "HOLD_REVIEW_REQUIRED"
            or report["publishing"] != "NOT_PERFORMED"
            or any(not _natural(report[key]) for key in (
                "newImports", "alreadyPresent", "held", "queuePending",
                "newlyQueued", "draftsMade"))
            or report["newlyQueued"] > report["queuePending"]
            or report["draftsMade"] != 0):
        raise Hold("POLL_CYCLE_RESULT_INVALID")
    if report["held"]:
        raise Hold("POLL_CYCLE_HELD_INPUTS")


def run_cycles(check_once, *, cycles=1, interval_seconds=60, sleep_fn=time.sleep):
    """Execute 1..24 checks on a chosen owner host; stop on first HOLD.

    Each cycle re-enters new_arrival_job.run_once, which validates all prior
    queue/state/original bytes before acquiring fresh OAuth/Drive access.
    Refuses unlimited loops and unexpected output; no retries on errors.
    """
    if type(cycles) is not int or not 1 <= cycles <= MAX_CYCLES:
        raise Hold("POLL_CYCLE_COUNT_INVALID")
    if (type(interval_seconds) is not int
            or not MIN_INTERVAL_SECONDS <= interval_seconds <= MAX_INTERVAL_SECONDS):
        raise Hold("POLL_INTERVAL_INVALID")

    new_total = queued_total = 0
    pending = 0
    for index in range(cycles):
        if index:
            sleep_fn(interval_seconds)
        report = check_once()
        _validate_result(report)
        new_total += report["newImports"]
        queued_total += report["newlyQueued"]
        pending = report["queuePending"]

    return {
        "schema": SCHEMA,
        "status": "INTAKE_ONLY_REVIEW_REQUIRED",
        "checks": cycles,
        "newImports": new_total,
        "newlyQueued": queued_total,
        "lastQueuePending": pending,
        "semanticRecognition": "NOT_PERFORMED",
        "draftGeneration": "NOT_PERFORMED",
        "publishing": "NOT_PERFORMED",
        "realHostVerified": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Owner opt-in, bounded Drive intake repeat; no scheduling or posting")
    parser.add_argument("--folder-id", required=True)
    parser.add_argument("--inbox", required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--review-queue", required=True)
    parser.add_argument("--cycles", type=int, default=1)
    parser.add_argument("--interval-seconds", type=int, default=60)
    args = parser.parse_args(argv)

    def check_once():
        # Never create OAuth or a Drive client here: the existing run_once
        # protects the local state first, then gets owner credentials.
        return run_once(None, args.folder_id, args.inbox,
                        args.state, args.catalog, args.review_queue)

    try:
        report = run_cycles(check_once, cycles=args.cycles,
                            interval_seconds=args.interval_seconds)
        print(json.dumps(report, sort_keys=True))
        return 0
    except (Hold, pipeline.Hold) as exc:
        # Only emit a known-shaped gate code. Never echo a source filename,
        # private local path, provider ID, OAuth token or FFmpeg stderr.
        value = str(exc)
        reason = value if _SAFE_REASON.fullmatch(value) else "POLL_CYCLE_FAILED"
        print(json.dumps({"status": "HOLD", "reason": reason}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
