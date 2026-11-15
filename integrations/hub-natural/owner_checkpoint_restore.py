#!/usr/bin/env python3
"""Explicit owner-approved restoration of a *metadata-only* checkpoint.

No Google OAuth or network access. No media download, source-content SHA-256,
media editing, polling or publishing. A previous independently retrieved
private transfer payload, its original trusted receipt, the owner's original
separately backed-up HMAC key and owner-pinned SHA-256 are ALL required.

An authentic old checkpoint and matching old receipt can still be replayed:
the owner-pinned digest is necessary but not an absolute anti-rollback proof.
"""
from __future__ import annotations

import argparse
import hmac
import json
import os
from pathlib import Path
import re
import stat

from drive_checkpoint_exchange import (
    prepare_private_upload, verify_private_readback,
)
from drive_checkpoint_store import (
    MAX_CHECKPOINT_BYTES, _load_locked, _target,
    initialize_owner_checkpoint,
)
from drive_intake import Hold, _assert_private, _single_writer, _valid_id
from drive_checkpoint_store import _unique_keys, _invalid_constant
from owner_baseline_bootstrap import read_owner_key, _separate_key_and_checkpoint

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_RECEIPT_MAX_BYTES = 4096


def restore_owner_checkpoint(blob, receipt, folder_id, *, key,
                             checkpoint_path, owner_pinned_sha256,
                             owner_confirmed=False):
    """Fail-closed offline restore into an *empty*, owner-private checkpoint.

    The trusted pin MUST have been obtained from an owner-approved receipt
    recorded outside the untrusted backup being restored. Never derive the
    trusted pin from the very same untrusted bytes at restoration time.
    """
    if not owner_confirmed:
        raise Hold("OWNER_CHECKPOINT_RESTORE_CONFIRMATION_REQUIRED")
    if not isinstance(owner_pinned_sha256, str) or not _SHA256.fullmatch(
            owner_pinned_sha256):
        raise Hold("OWNER_RESTORE_INDEPENDENT_SHA_REQUIRED")
    folder_id = _valid_id(folder_id)
    target = _target(checkpoint_path)
    if target.is_symlink() or target.exists():
        raise Hold("PRIVATE_CHECKPOINT_ALREADY_EXISTS")

    checkpoint, verification = verify_private_readback(
        blob, receipt, folder_id, key=key)
    if not hmac.compare_digest(verification["sha256"], owner_pinned_sha256):
        raise Hold("OWNER_RESTORE_INDEPENDENT_SHA_MISMATCH")

    # The current persistence implementation canonicalizes JSON. Reject
    # arbitrary reserializations so the on-disk bytes keep the pinned SHA.
    canonical, calculated = prepare_private_upload(
        checkpoint, folder_id, key=key)
    if blob != canonical or not hmac.compare_digest(
            calculated["sha256"], owner_pinned_sha256):
        raise Hold("OWNER_RESTORE_NONCANONICAL_PAYLOAD")

    initialize_owner_checkpoint(
        target, folder_id, key=key, checkpoint=checkpoint)
    # Read and authenticate the actual saved file with the same security and
    # process lock used by subsequent comparisons, without Drive access.
    with _single_writer(target):
        saved = _load_locked(target, folder_id, key)
    again, local_receipt = prepare_private_upload(
        saved, folder_id, key=key)
    if again != canonical or not hmac.compare_digest(
            local_receipt["sha256"], owner_pinned_sha256):
        raise Hold("OWNER_RESTORE_LOCAL_READBACK_MISMATCH")
    return {
        "status": "OWNER_METADATA_CHECKPOINT_RESTORED_LOCALLY",
        "checkpointSHA256": owner_pinned_sha256,
        "localReadbackSHA256": local_receipt["sha256"],
        "localReadbackVerified": True,
        "independentHostRestore": "NOT_VERIFIED",
        "mediaDownload": "NOT_PERFORMED",
        "videoContentSHA256": "NOT_COMPUTED",
        "newArrivalsAcknowledged": False,
        "publication": "NOT_PERFORMED",
    }


def _read_owner_private_blob(path, maximum):
    """POSIX owner-only read, refusing links, Git locations and oversized data.

    The actual owner Windows host remains HOLD until NTFS ACLs are verified.
    """
    if os.name != "posix" or not hasattr(os, "O_NOFOLLOW"):
        raise Hold("OWNER_BACKUP_ACL_NOT_VERIFIED")
    try:
        raw = Path(path).expanduser()
        if any(p.is_symlink() for p in (raw, *raw.parents)):
            raise Hold("OWNER_BACKUP_PATH_SYMLINK")
        src = _assert_private(raw)
        parent = src.parent
        info = parent.stat()
        if (not parent.is_dir() or info.st_uid != os.getuid()
                or info.st_mode & 0o077):
            raise Hold("OWNER_BACKUP_DIRECTORY_UNSAFE")
        fd = os.open(src, os.O_RDONLY | os.O_NOFOLLOW)
    except Hold:
        raise
    except (OSError, TypeError, ValueError, RuntimeError) as exc:
        raise Hold("OWNER_BACKUP_READ_UNAVAILABLE") from exc
    try:
        opened = os.fstat(fd)
        if (not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1
                or opened.st_uid != os.getuid() or opened.st_mode & 0o077
                or opened.st_size < 1 or opened.st_size > maximum):
            raise Hold("OWNER_BACKUP_FILE_UNSAFE")
        with os.fdopen(fd, "rb") as source:
            data = source.read(maximum + 1)
        fd = None
        if len(data) > maximum:
            raise Hold("OWNER_BACKUP_FILE_UNSAFE")
        return data
    finally:
        if fd is not None:
            os.close(fd)


def _separate_restore_locations(key_file, checkpoint, backup, receipt):
    _separate_key_and_checkpoint(key_file, checkpoint)
    try:
        dirs = [Path(p).expanduser().resolve().parent for p in
                (key_file, checkpoint, backup, receipt)]
        paths = [Path(p).expanduser().resolve() for p in
                 (key_file, checkpoint, backup, receipt)]
    except (OSError, TypeError, RuntimeError, ValueError) as exc:
        raise Hold("OWNER_RESTORE_PATHS_INVALID") from exc
    # Different files and a distinct owner-managed key directory; neither
    # backup input is a replacement for the authenticated checkpoint itself.
    if len(set(paths)) != 4 or dirs[0] in dirs[1:] or dirs[1] in dirs[2:]:
        raise Hold("OWNER_RESTORE_STORAGE_NOT_SEPARATED")


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Offline owner-confirmed restoration of a blinded metadata checkpoint")
    parser.add_argument("--folder-id", required=True)
    parser.add_argument("--key-file", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--backup-payload", required=True)
    parser.add_argument("--backup-receipt", required=True)
    parser.add_argument("--owner-pinned-sha256", required=True)
    parser.add_argument("--owner-confirms-restore", action="store_true")
    args = parser.parse_args(argv)
    try:
        if not args.owner_confirms_restore:
            raise Hold("OWNER_CHECKPOINT_RESTORE_CONFIRMATION_REQUIRED")
        if not _SHA256.fullmatch(args.owner_pinned_sha256):
            raise Hold("OWNER_RESTORE_INDEPENDENT_SHA_REQUIRED")
        _valid_id(args.folder_id)
        _separate_restore_locations(
            args.key_file, args.checkpoint, args.backup_payload,
            args.backup_receipt)
        # Verify destination existence before reading either owner artifact.
        target = _target(args.checkpoint)
        if target.exists() or target.is_symlink():
            raise Hold("PRIVATE_CHECKPOINT_ALREADY_EXISTS")
        key = read_owner_key(args.key_file)
        data = _read_owner_private_blob(
            args.backup_payload, MAX_CHECKPOINT_BYTES)
        raw_receipt = _read_owner_private_blob(
            args.backup_receipt, _RECEIPT_MAX_BYTES)
        try:
            receipt = json.loads(
                raw_receipt.decode("utf-8"), object_pairs_hook=_unique_keys,
                parse_constant=_invalid_constant)
        except (UnicodeError, ValueError, TypeError) as exc:
            raise Hold("OWNER_RESTORE_RECEIPT_INVALID_JSON") from exc
        report = restore_owner_checkpoint(
            data, receipt, args.folder_id, key=key,
            checkpoint_path=target, owner_pinned_sha256=args.owner_pinned_sha256,
            owner_confirmed=True)
        print(json.dumps(report, sort_keys=True))
        return 0
    except Hold as exc:
        # Only constant gate code; never echo file paths, IDs or secrets.
        print(json.dumps({"status": "HOLD", "reason": str(exc)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
