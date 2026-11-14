#!/usr/bin/env python3
"""HUB NATURAL: explicit, two-step owner baseline bootstrap (default OFF).

No source-media download, video editing, publishing, scheduling, or automatic
baseline advancement. Never prints source IDs, filenames, metadata, or keys.

The real host, OAuth access and separately protected key must first be
explicitly chosen and configured by the owner. Synthetic public CI must not
receive or use any of these real values.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat

from drive_blinded_baseline import _secret, observe_blinded
from drive_checkpoint_exchange import prepare_private_upload
from drive_checkpoint_store import _target, initialize_owner_checkpoint, compare_with_saved_checkpoint
from drive_intake import DriveHTTP, Hold, _assert_private, _valid_id, oauth_token_from_env

_SHA = re.compile(r"^[0-9a-f]{64}$")
_MAX_KEY_BYTES = 4096


def read_owner_key(key_path):
    """Read, never generate or store, the separately owner-managed HMAC key.

    POSIX-only until an actual Windows host can independently validate its
    NTFS ACLs. The caller must back up the random key outside the checkpoint
    storage; losing it makes the checkpoint unverifiable.
    """
    if os.name != "posix" or not hasattr(os, "O_NOFOLLOW"):
        raise Hold("OWNER_KEY_ACL_NOT_VERIFIED")
    try:
        raw = Path(key_path).expanduser()
        if any(p.is_symlink() for p in (raw, *raw.parents)):
            raise Hold("OWNER_KEY_SYMLINK_REFUSED")
        key = _assert_private(raw)
        parent = key.parent
        owner = parent.stat()
        if (not parent.is_dir() or owner.st_uid != os.getuid()
                or owner.st_mode & 0o077):
            raise Hold("OWNER_KEY_PARENT_NOT_PRIVATE")
        fd = os.open(key, os.O_RDONLY | os.O_NOFOLLOW)
    except Hold:
        raise
    except (OSError, TypeError, RuntimeError, ValueError) as exc:
        raise Hold("OWNER_KEY_UNAVAILABLE") from exc
    try:
        opened = os.fstat(fd)
        if (not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1
                or opened.st_uid != os.getuid() or opened.st_mode & 0o077
                or not (32 <= opened.st_size <= _MAX_KEY_BYTES)):
            raise Hold("OWNER_KEY_FILE_UNSAFE")
        with os.fdopen(fd, "rb") as source:
            content = source.read(_MAX_KEY_BYTES + 1)
        fd = None
        return _secret(content)
    finally:
        if fd is not None:
            os.close(fd)


def _separate_key_and_checkpoint(key_path, checkpoint_path):
    try:
        key = Path(key_path).expanduser().resolve()
        target = Path(checkpoint_path).expanduser().resolve()
    except (OSError, TypeError, ValueError, RuntimeError) as exc:
        raise Hold("OWNER_PATHS_INVALID") from exc
    if key == target or key.parent == target.parent:
        raise Hold("OWNER_KEY_MUST_BE_STORED_SEPARATELY")


def preview_owner_baseline(client, folder_id, *, key):
    """Observe Drive metadata only; return a human-confirmation digest.

    Does not save the resulting checkpoint and never calls client.media().
    """
    _secret(key)
    _valid_id(folder_id)
    report, checkpoint = observe_blinded(client, folder_id, key=key)
    _payload, receipt = prepare_private_upload(checkpoint, folder_id, key=key)
    return {
        "status": "OWNER_CONFIRMATION_REQUIRED",
        "videoCandidates": report["videoCandidates"],
        "unsupportedEntries": report["unsupportedEntries"],
        "checkpointPreviewSHA256": receipt["sha256"],
        "contentSHA256": "NOT_COMPUTED",
        "mediaDownload": "NOT_PERFORMED",
        "newCandidates": None,
        "newArrivalsAcknowledged": False,
        "publication": "NOT_PERFORMED",
    }


def confirm_owner_baseline(client, folder_id, *, key, checkpoint_path,
                           expected_preview_sha256, owner_confirmed=False):
    """Initialize the never-overwritten baseline iff a fresh preview matches.

    The caller must have inspected the earlier preview and explicitly
    confirmed. If the remote metadata changed, this call fails closed.
    Existing checkpoints are never overwritten or silently rebaselined.
    """
    _secret(key)
    _valid_id(folder_id)
    if not owner_confirmed:
        raise Hold("OWNER_BASELINE_CONFIRMATION_REQUIRED")
    if (not isinstance(expected_preview_sha256, str)
            or _SHA.fullmatch(expected_preview_sha256) is None):
        raise Hold("OWNER_PREVIEW_SHA256_REQUIRED")
    target = _target(checkpoint_path)
    if target.exists() or target.is_symlink():
        raise Hold("PRIVATE_CHECKPOINT_ALREADY_EXISTS")
    _report, checkpoint = observe_blinded(client, folder_id, key=key)
    _payload, receipt = prepare_private_upload(checkpoint, folder_id, key=key)
    if receipt["sha256"] != expected_preview_sha256:
        raise Hold("OWNER_PREVIEW_CHANGED_CONFIRM_AGAIN")
    saved = initialize_owner_checkpoint(
        target, folder_id, key=key, checkpoint=checkpoint)
    # An independent process/host must still read the persistent state.
    return {
        "status": saved["status"],
        "checkpointSHA256": receipt["sha256"],
        "newArrivalsAcknowledged": False,
        "mediaDownload": "NOT_PERFORMED",
        "publication": "NOT_PERFORMED",
        "independentRestore": "NOT_VERIFIED_ON_OWNER_HOST",
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Opt-in owner-confirmed, metadata-only baseline bootstrap")
    parser.add_argument("command", choices=("preview", "initialize", "compare"))
    parser.add_argument("--folder-id", required=True)
    parser.add_argument("--key-file", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--expected-preview-sha256")
    parser.add_argument("--owner-confirms-initial-baseline", action="store_true")
    args = parser.parse_args(argv)
    try:
        _separate_key_and_checkpoint(args.key_file, args.checkpoint)
        # Never accept key material from CLI flags, logs or the Git checkout.
        key = read_owner_key(args.key_file)
        _valid_id(args.folder_id)
        if args.command == "initialize":
            if not args.owner_confirms_initial_baseline:
                raise Hold("OWNER_BASELINE_CONFIRMATION_REQUIRED")
            if (not isinstance(args.expected_preview_sha256, str)
                    or _SHA.fullmatch(args.expected_preview_sha256) is None):
                raise Hold("OWNER_PREVIEW_SHA256_REQUIRED")
            _target(args.checkpoint)
        elif args.command == "compare":
            _target(args.checkpoint)
        client = DriveHTTP(oauth_token_from_env())
        if args.command == "preview":
            result = preview_owner_baseline(client, args.folder_id, key=key)
        elif args.command == "initialize":
            result = confirm_owner_baseline(
                client, args.folder_id, key=key,
                checkpoint_path=args.checkpoint,
                expected_preview_sha256=args.expected_preview_sha256,
                owner_confirmed=True,
            )
        else:
            result = compare_with_saved_checkpoint(
                client, args.folder_id, key=key, path=args.checkpoint)
        print(json.dumps(result, sort_keys=True))
        return 0
    except Hold as exc:
        # Only predefined gate codes; no owner path, title, token or key.
        print(json.dumps({"status": "HOLD", "reason": str(exc)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
