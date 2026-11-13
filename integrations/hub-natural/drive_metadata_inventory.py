#!/usr/bin/env python3
"""Drive INBOX metadata-only audit for storage-constrained owner systems.

No video download, FFmpeg, local media file, queue write, or publishing.
A Drive metadata MD5 is not an independently verified content SHA-256.
Snapshots are private in-memory values; this module never persists them.
"""
from __future__ import annotations

import argparse
import json

from drive_intake import (DriveHTTP, Hold, MAX_ENTRIES, MIME_TO_EXT,
                          _parsed_video, _valid_id, oauth_token_from_env)

SCHEMA = "hub-natural-drive-metadata-observation-v1"
FIELDS = ("bytes", "md5", "mimeType", "version", "modifiedTime")


def _check_baseline(baseline, folder_id):
    if baseline is None:
        return None
    if (not isinstance(baseline, dict) or baseline.get("schema") != SCHEMA
            or baseline.get("folder") != folder_id
            or not isinstance(baseline.get("items"), dict)):
        raise Hold("PRIVATE_BASELINE_INVALID_OR_WRONG_FOLDER")
    items = baseline["items"]
    if len(items) > MAX_ENTRIES:
        raise Hold("PRIVATE_BASELINE_TOO_LARGE")
    for key, item in items.items():
        _valid_id(key)
        if (not isinstance(item, dict) or set(item) != set(FIELDS)
                or not isinstance(item["bytes"], int)
                or isinstance(item["bytes"], bool)
                or item["bytes"] <= 0
                or any(not isinstance(item[field], str) for field in FIELDS[1:])):
            raise Hold("PRIVATE_BASELINE_INVALID")
    return items


def observe(client, folder_id, *, baseline=None):
    """Observe candidate uploads, without storing media or trusting remote MD5.

    Return (sanitized report, private snapshot). Snapshot includes provider IDs
    and weak MD5 metadata, so callers must NEVER publish or log it. A baseline
    must be owner-validated and privately persisted by a *separate* component.
    """
    folder_id = _valid_id(folder_id)
    previous = _check_baseline(baseline, folder_id)
    items, seen = {}, set()
    unsupported = new = unchanged = total_bytes = 0

    for raw in client.list_files(folder_id):
        if not isinstance(raw, dict):
            raise Hold("DRIVE_ENTRY_INVALID")
        file_id = _valid_id(raw.get("id"))
        if file_id in seen:
            raise Hold("DRIVE_DUPLICATE_ID_IN_PAGE")
        seen.add(file_id)
        if len(seen) > MAX_ENTRIES:
            raise Hold("DRIVE_INBOX_TOO_LARGE")
        if raw.get("mimeType") not in MIME_TO_EXT:
            unsupported += 1
            continue
        parsed = _parsed_video(raw)
        if parsed["bytes"] <= 0:
            raise Hold("DRIVE_VIDEO_EMPTY")
        data = {field: parsed[field] for field in FIELDS}
        items[file_id] = data
        total_bytes += data["bytes"]
        if previous is not None:
            old = previous.get(file_id)
            if old is None:
                new += 1
            elif old == data:
                unchanged += 1
            else:
                # A version, timestamp or MD5 change cannot be a safe
                # duplicate. Require separate verified-content review.
                raise Hold("DRIVE_METADATA_CHANGED_SINCE_BASELINE")

    if previous is not None and set(previous) - set(items):
        # Could be removed, moved, unsupported or invisible due to OAuth.
        # Do not silently treat a missing original as processed/archived.
        raise Hold("PREVIOUS_VIDEO_NO_LONGER_VISIBLE")

    snapshot = {
        "schema": SCHEMA, "folder": folder_id,
        "items": {key: items[key] for key in sorted(items)}
    }
    report = {
        "schema": SCHEMA,
        "status": "METADATA_ONLY_UNVERIFIED",
        "videoCandidates": len(items),
        "unsupportedEntries": unsupported,
        "providerReportedBytes": total_bytes,
        "newCandidates": new if previous is not None else None,
        "unchangedCandidates": unchanged if previous is not None else None,
        "newness": ("COMPARED_TO_PRIVATE_BASELINE"
                    if previous is not None else "UNKNOWN_NO_PRIVATE_BASELINE"),
        "contentSHA256": "NOT_COMPUTED",
        "mediaDownload": "NOT_PERFORMED",
        "mediaWrite": "NOT_PERFORMED",
        "drafts": "NOT_GENERATED",
        "publication": "NOT_PERFORMED",
    }
    return report, snapshot


def main():
    parser = argparse.ArgumentParser(
        description="List Drive video candidate metadata only, never download or store videos")
    parser.add_argument("--folder-id", required=True)
    args = parser.parse_args()
    try:
        client = DriveHTTP(oauth_token_from_env())
        report, _private_snapshot = observe(client, args.folder_id)
        # Never print provider file IDs, filenames, access tokens or snapshots.
        print(json.dumps(report, sort_keys=True))
    except Hold as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc)}))
        raise SystemExit(2)


if __name__ == "__main__":
    main()
