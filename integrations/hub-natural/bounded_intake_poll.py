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


def run_cycles(check_once, *, cycles=1, interval_seconds=60,
               require_later_arrival=False, sleep_fn=time.sleep):
    """Run bounded checks and optionally require a post-initial-check import.

    The first check might ingest historical backlog; a qualifying arrival
    must instead be observed on a later check. This is still not proof of
    the provider's original upload timestamp or real owner-host acceptance.
    Each check re-runs the existing private queue/state/source preflight.
    
    if type(cycles) is not int or not 1 <= cycles <= MAX_CYCLES:
        raise Hold("POLL_CYCLE_COUNT_INVALID")
    if (type(interval_seconds) is not int
            or not MIN_INTERVAL_SECONDS <= interval_seconds <= MAX_INTERVAL_SECONDS):
        raise Hold("POLL_INTERVAL_INVALID")
    if (type(require_later_arrival) is not bool
            or (require_later_arrival and cycles < 2)):
        raise Hold("POLL_LATER_ARRIVAL_GATE_INVALID")

    new_total = queued_total = later_imports = 0
    pending = 0
    for index in range(cycles):
        if index:
            sleep_fn(interval_seconds)
        report = check_once()
        _validate_result(report)
        new_total += report["newImports"]
        queued_total += report["newlyQueued"]
        if index > 0:
            later_imports += report["newImports"]
        pending = report["queuePending"]

    if require_later_arrival and later_imports == 0:
        raise Hold("POLL_NO_IMPORT_AFTER_FIRST_CHECK")

    return {
        "schema": SCHEMA,
        "status": "INTAKE_ONLY_REVIEW_REQUIRED",
        "checks": cycles,
        "newImports": new_total,
        "newImportsAfterFirstCheck": later_imports,
        "newImportTiming": "OBSERVED_ON_LATER_CHECK_NOT_PROVIDER_CREATION_PROOF",
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
    parser.add_argument(
        "--require-new-after-first-check", action="store_true",
        help="Refuse apparent success when only the initial backlog was imported",
    )
    args = parser.parse_args(argv)

    def check_once():
        # Never create OAuth or a Drive client here: the existing run_once
        # protects the local state first, then gets owner credentials.
        return run_once(None, args.folder_id, args.inbox,
                        args.state, args.catalog, args.review_queue)

    try:
        report = run_cycles(
            check_once, cycles=args.cycles,
            interval_seconds=args.interval_seconds,
            require_later_arrival=args.require_new_after_first_check,
        )
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
