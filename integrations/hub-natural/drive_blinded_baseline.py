#!/usr/bin/env python3
"""Private, blinded comparison tokens for metadata-only Drive INBOX observations.

No video downloads, disk writes, OAuth grants, scheduling or publishing.
An owner-managed private store and an unpredictable 32+ byte key are required
before these tokens can be durably used. Tokens are NOT processed receipts.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re

from drive_intake import Hold, MAX_ENTRIES, _valid_id
from drive_metadata_inventory import _check_baseline, observe

SCHEMA = "hub-natural-blinded-metadata-checkpoint-v1"
_HEX = re.compile(r"^[0-9a-f]{64}$")


def _secret(secret):
    if not isinstance(secret, bytes) or len(secret) < 32:
        raise Hold("PRIVATE_CHECKPOINT_KEY_REQUIRED")
    return secret


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def _tag(secret, domain, value):
    return hmac.new(secret, b"HUB-NATURAL-CHECKPOINT-v1\x00"
                    + domain + b"\x00" + value, hashlib.sha256).hexdigest()


def _seal(snapshot, secret):
    """Only hashes of identifiers/metadata leave this in-memory snapshot."""
    folder = _valid_id(snapshot.get("folder"))
    entries = _check_baseline(snapshot, folder)
    blinded = {}
    for file_id, metadata in entries.items():
        identity = _tag(secret, b"source-id", file_id.encode("ascii"))
        if identity in blinded:
            raise Hold("PRIVATE_CHECKPOINT_COLLISION")
        blinded[identity] = _tag(secret, b"source-metadata", _canonical(metadata))
    value = {
        "schema": SCHEMA,
        "folderTag": _tag(secret, b"folder", folder.encode("ascii")),
        "entries": {k: blinded[k] for k in sorted(blinded)},
    }
    value["mac"] = _tag(secret, b"checkpoint", _canonical(value))
    return value


def _verify(checkpoint, folder_id, secret):
    """Reject corrupt/wrong-folder checkpoints BEFORE making any Drive call."""
    if not isinstance(checkpoint, dict) or set(checkpoint) != {
            "schema", "folderTag", "entries", "mac"}:
        raise Hold("PRIVATE_CHECKPOINT_INVALID")
    entries = checkpoint["entries"]
    if (checkpoint["schema"] != SCHEMA
            or not isinstance(entries, dict) or len(entries) > MAX_ENTRIES
            or not all(isinstance(k, str) and _HEX.fullmatch(k)
                       and isinstance(v, str) and _HEX.fullmatch(v)
                       for k, v in entries.items())
            or not isinstance(checkpoint["mac"], str)
            or not _HEX.fullmatch(checkpoint["mac"])
            or not isinstance(checkpoint["folderTag"], str)
            or not _HEX.fullmatch(checkpoint["folderTag"])):
        raise Hold("PRIVATE_CHECKPOINT_INVALID")
    folder_tag = _tag(secret, b"folder", _valid_id(folder_id).encode("ascii"))
    if not hmac.compare_digest(checkpoint["folderTag"], folder_tag):
        raise Hold("PRIVATE_CHECKPOINT_WRONG_FOLDER_OR_KEY")
    signed = {k: v for k, v in checkpoint.items() if k != "mac"}
    correct_mac = _tag(secret, b"checkpoint", _canonical(signed))
    if not hmac.compare_digest(checkpoint["mac"], correct_mac):
        raise Hold("PRIVATE_CHECKPOINT_TAMPERED")
    return entries


def observe_blinded(client, folder_id, *, key, baseline=None):
    """Return (sanitized report, blinded checkpoint), with NO media or file I/O.

    A baseline must be an owner-confirmed prior observation from a private
    store. NEVER advance it automatically after discovering a new candidate:
    an observation is not an ingest, a verified SHA-256 or an approval.
    """
    secret = _secret(key)
    folder_id = _valid_id(folder_id)
    previous = None if baseline is None else _verify(baseline, folder_id, secret)

    report, transient_snapshot = observe(client, folder_id)
    current = _seal(transient_snapshot, secret)
    if previous is not None:
        now = current["entries"]
        if set(previous) - set(now):
            raise Hold("PREVIOUS_VIDEO_NO_LONGER_VISIBLE")
        if any(now[k] != value for k, value in previous.items()):
            raise Hold("DRIVE_METADATA_CHANGED_SINCE_BASELINE")
        report["newCandidates"] = len(set(now) - set(previous))
        report["unchangedCandidates"] = len(previous)
        report["newness"] = "COMPARED_TO_OWNER_PRIVATE_BLINDED_BASELINE"
    # No automatic baseline commit, files, media, remote write, or publish.
    return report, current
