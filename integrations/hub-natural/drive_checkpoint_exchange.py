#!/usr/bin/env python3
"""Byte-exact checkpoint export and independently verified readback (opt-in).

This module makes NO network requests and never uploads, downloads or stores
video. The caller must use an owner-approved private remote store and treat
the returned receipt as separate trusted evidence. No OAuth permissions are
changed. HMAC integrity is not encryption or rollback protection.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re

from drive_blinded_baseline import _canonical, _secret, _verify
from drive_checkpoint_store import MAX_CHECKPOINT_BYTES, _invalid_constant, _unique_keys
from drive_intake import Hold, _valid_id

SCHEMA = "hub-natural-private-checkpoint-transfer-v1"
_HEX = re.compile(r"^[0-9a-f]{64}$")
_RECEIPT_FIELDS = frozenset(("schema", "sha256", "sizeBytes", "dataKind",
                             "contentSHA256", "newArrivalsAcknowledged"))


def prepare_private_upload(checkpoint, folder_id, *, key):
    """Return (bytes, receipt) for a separate, private write-once upload.

    Does not automatically establish or update a new baseline. The caller must
    separately confirm the owner-approved original checkpoint first.
    """
    secret = _secret(key)
    folder_id = _valid_id(folder_id)
    _verify(checkpoint, folder_id, secret)
    payload = _canonical(checkpoint) + b"\n"
    if len(payload) > MAX_CHECKPOINT_BYTES:
        raise Hold("PRIVATE_CHECKPOINT_TOO_LARGE")
    receipt = {
        "schema": SCHEMA,
        "sha256": hashlib.sha256(payload).hexdigest(),
        "sizeBytes": len(payload),
        "dataKind": "BLINDED_METADATA_CHECKPOINT_ONLY",
        "contentSHA256": "NOT_COMPUTED",
        "newArrivalsAcknowledged": False,
    }
    return payload, receipt


def verify_private_readback(blob, receipt, folder_id, *, key):
    """Validate exact remote bytes independently before any later Drive list.

    Fail closed for missing/malformed receipt or content, wrong folder/key,
    duplicated JSON keys, corrupted bytes and altered SHA/size. This method
    deliberately never mutates the baseline or acknowledges arrivals.
    """
    secret = _secret(key)
    folder_id = _valid_id(folder_id)
    if (not isinstance(receipt, dict) or set(receipt) != _RECEIPT_FIELDS
            or receipt.get("schema") != SCHEMA
            or receipt.get("dataKind") != "BLINDED_METADATA_CHECKPOINT_ONLY"
            or receipt.get("contentSHA256") != "NOT_COMPUTED"
            or receipt.get("newArrivalsAcknowledged") is not False
            or not isinstance(receipt.get("sha256"), str)
            or _HEX.fullmatch(receipt["sha256"]) is None
            or not isinstance(receipt.get("sizeBytes"), int)
            or isinstance(receipt["sizeBytes"], bool)
            or not (1 <= receipt["sizeBytes"] <= MAX_CHECKPOINT_BYTES)):
        raise Hold("PRIVATE_CHECKPOINT_RECEIPT_INVALID")
    if (not isinstance(blob, bytes)
            or len(blob) > MAX_CHECKPOINT_BYTES
            or len(blob) != receipt["sizeBytes"]):
        raise Hold("PRIVATE_CHECKPOINT_READBACK_SIZE_MISMATCH")
    actual = hashlib.sha256(blob).hexdigest()
    if not hmac.compare_digest(actual, receipt["sha256"]):
        raise Hold("PRIVATE_CHECKPOINT_READBACK_SHA_MISMATCH")
    try:
        checkpoint = json.loads(
            blob.decode("utf-8"),
            object_pairs_hook=_unique_keys,
            parse_constant=_invalid_constant,
        )
    except (UnicodeError, ValueError, TypeError) as exc:
        raise Hold("PRIVATE_CHECKPOINT_READBACK_INVALID_JSON") from exc
    _verify(checkpoint, folder_id, secret)
    report = {
        "status": "PRIVATE_METADATA_CHECKPOINT_READBACK_VERIFIED",
        "bytesVerified": len(blob),
        "sha256": actual,
        "contentSHA256": "NOT_COMPUTED",
        "newArrivalsAcknowledged": False,
        "mediaDownload": "NOT_PERFORMED",
        "publication": "NOT_PERFORMED",
    }
    return checkpoint, report
