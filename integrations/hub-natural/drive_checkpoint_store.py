#!/usr/bin/env python3
"""Optional private, durable *metadata* baseline store; never stores media.

This is deliberately NOT connected to a scheduler, OAuth, Google Drive writes,
or the video pipeline. The first checkpoint must be explicitly owner-confirmed.
Future observations NEVER advance that checkpoint or acknowledge processing.

A HMAC seals integrity, not confidentiality against file/count observation,
rollback protection, or independent video SHA-256. Keep the 32+ byte key in
separate owner-controlled private storage; never log it or publish it.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import tempfile

from drive_blinded_baseline import _canonical, _secret, _verify, observe_blinded
from drive_intake import Hold, _assert_private, _single_writer, _valid_id

MAX_CHECKPOINT_BYTES = 4 * 1024 * 1024


def _target(path):
    """Require a pre-existing owner-private directory outside any Git checkout.

    Reject symlinks in the supplied path before resolving it. Windows ACL
    security cannot be proven by this portable check and requires owner review.
    """
    try:
        raw = Path(path).expanduser()
        if any(candidate.is_symlink() for candidate in (raw, *raw.parents)):
            raise Hold("PRIVATE_CHECKPOINT_PATH_SYMLINK")
        target = _assert_private(raw)
        if target.suffix.lower() != ".json":
            raise Hold("PRIVATE_CHECKPOINT_PATH_INVALID")
        parent = target.parent
        if not parent.is_dir():
            raise Hold("PRIVATE_CHECKPOINT_DIRECTORY_MISSING")
        info = parent.stat()
        if os.name == "posix" and (
                info.st_uid != os.getuid() or info.st_mode & 0o077):
            raise Hold("PRIVATE_CHECKPOINT_DIRECTORY_NOT_OWNER_ONLY")
        return target
    except (OSError, ValueError, TypeError, RuntimeError) as exc:
        # Never echo underlying private paths in public logs.
        raise Hold("PRIVATE_CHECKPOINT_PATH_UNVERIFIABLE") from exc


def _check_opened(info):
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise Hold("PRIVATE_CHECKPOINT_NOT_SINGLE_REGULAR_FILE")
    if os.name == "posix" and (
            info.st_uid != os.getuid() or info.st_mode & 0o077):
        raise Hold("PRIVATE_CHECKPOINT_FILE_NOT_OWNER_ONLY")
    if info.st_size > MAX_CHECKPOINT_BYTES:
        raise Hold("PRIVATE_CHECKPOINT_TOO_LARGE")


def _unique_keys(pairs):
    doc = {}
    for key, value in pairs:
        if key in doc:
            raise ValueError("Duplicate JSON key")
        doc[key] = value
    return doc


def _invalid_constant(value):
    raise ValueError("Nonfinite JSON number")


def _load_locked(target, folder_id, key):
    """Caller must hold the persistent per-path OS process lock."""
    if target.is_symlink():
        raise Hold("PRIVATE_CHECKPOINT_PATH_SYMLINK")
    try:
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(target, flags)
    except FileNotFoundError as exc:
        # No silent re-baselining when the prior owner checkpoint disappears.
        raise Hold("PRIVATE_CHECKPOINT_MISSING") from exc
    except OSError as exc:
        raise Hold("PRIVATE_CHECKPOINT_UNREADABLE") from exc
    try:
        with os.fdopen(fd, "rb") as source:
            _check_opened(os.fstat(source.fileno()))
            data = source.read(MAX_CHECKPOINT_BYTES + 1)
        if target.is_symlink():
            raise Hold("PRIVATE_CHECKPOINT_PATH_SYMLINK")
        if len(data) > MAX_CHECKPOINT_BYTES:
            raise Hold("PRIVATE_CHECKPOINT_TOO_LARGE")
        try:
            checkpoint = json.loads(
                data.decode("utf-8"), object_pairs_hook=_unique_keys,
                parse_constant=_invalid_constant,
            )
        except (UnicodeError, ValueError, TypeError) as exc:
            raise Hold("PRIVATE_CHECKPOINT_INVALID_JSON") from exc
        _verify(checkpoint, folder_id, key)
        return checkpoint
    except OSError as exc:
        raise Hold("PRIVATE_CHECKPOINT_UNREADABLE") from exc


def _sync_parent_directory(parent):
    # POSIX: sync the directory entry after the hardlink no-replace publish.
    # Windows directory fsync is not supported by this portable implementation.
    if os.name == "posix":
        fd = os.open(parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def initialize_owner_checkpoint(path, folder_id, *, key, checkpoint):
    """Explicit one-time owner-confirmed initialization, never a poll action.

    Create atomically without overwriting any existing checkpoint. If a process
    dies before publish, no baseline exists; if it dies after publish, the
    complete HMAC-signed checkpoint is available for the next process.
    """
    secret = _secret(key)
    folder_id = _valid_id(folder_id)
    _verify(checkpoint, folder_id, secret)  # before any filesystem write
    target = _target(path)
    payload = _canonical(checkpoint) + b"\n"
    if len(payload) > MAX_CHECKPOINT_BYTES:
        raise Hold("PRIVATE_CHECKPOINT_TOO_LARGE")

    with _single_writer(target):
        if target.is_symlink():
            raise Hold("PRIVATE_CHECKPOINT_PATH_SYMLINK")
        if target.exists():
            raise Hold("PRIVATE_CHECKPOINT_ALREADY_EXISTS")
        pending = None
        try:
            with tempfile.NamedTemporaryFile(
                    mode="wb", dir=target.parent,
                    prefix=".hub-natural-checkpoint-pending-",
                    suffix=".tmp", delete=False) as file:
                pending = Path(file.name)
                os.chmod(pending, 0o600)
                file.write(payload)
                file.flush()
                os.fsync(file.fileno())
            # Atomic no-replace publication: never erase a previous baseline,
            # even if another instance created it in the meantime.
            try:
                os.link(pending, target)
            except FileExistsError as exc:
                raise Hold("PRIVATE_CHECKPOINT_ALREADY_EXISTS") from exc
            except OSError as exc:
                raise Hold("PRIVATE_CHECKPOINT_ATOMIC_PUBLISH_UNSUPPORTED") from exc
            try:
                _sync_parent_directory(target.parent)
            except OSError as exc:
                # A fully published file may exist. Do not retry blindly.
                raise Hold("PRIVATE_CHECKPOINT_DIRECTORY_SYNC_UNVERIFIED") from exc
        finally:
            if pending is not None:
                pending.unlink(missing_ok=True)

    return {"status": "PRIVATE_BASELINE_INITIALIZED_UNACKNOWLEDGED",
            "mediaStored": False, "videoContentSHA256": "NOT_COMPUTED",
            "newArrivalsAcknowledged": False, "publication": "NOT_PERFORMED"}


def compare_with_saved_checkpoint(client, folder_id, *, key, path):
    """Read a verified checkpoint BEFORE Drive listing; never update the file.

    Crash, replay, and repeat polling keep all unprocessed new candidates new.
    This module cannot claim a verified media download or finished draft.
    """
    secret = _secret(key)
    folder_id = _valid_id(folder_id)
    target = _target(path)
    with _single_writer(target):
        checkpoint = _load_locked(target, folder_id, secret)
        report, _uncommitted_snapshot = observe_blinded(
            client, folder_id, key=secret, baseline=checkpoint)
    report["checkpointState"] = "OWNER_BASELINE_UNCHANGED"
    report["newArrivalsAcknowledged"] = False
    return report
