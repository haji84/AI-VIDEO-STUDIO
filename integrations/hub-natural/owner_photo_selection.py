#!/usr/bin/env python3
"""Offline owner-selected exported-video receipt. No Photos API, Drive or posting."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat

SCHEMA = "hub-natural-owner-photo-selection-v1"
RECEIPT_SCHEMA = "hub-natural-owner-photo-selection-receipt-v2"
MAX_SELECTION_BYTES = 65536
MAX_SELECTED_FILES = 100
MAX_VIDEO_BYTES = 4 * 1024**3
EXTENSIONS = frozenset((".mp4", ".mov", ".m4v", ".mkv"))
SHA = re.compile(r"[0-9a-f]{64}\Z")


class Hold(Exception):
    """Safe fixed gate code only."""


class _RedactingParser(argparse.ArgumentParser):
    def error(self, message):
        raise Hold("PHOTO_SELECTION_ARGUMENTS_INVALID")


def _no_duplicate_properties(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Hold("PHOTO_SELECTION_INVALID")
        result[key] = value
    return result


def _private_path(path, *, exists=True):
    """POSIX only. Fail closed on symlinks, nonprivate parents or Git checkout."""
    if os.name != "posix" or not hasattr(os, "O_NOFOLLOW"):
        raise Hold("PHOTO_SELECTION_OWNER_ACL_NOT_VERIFIED")
    source = Path(path).expanduser()
    if not source.is_absolute():
        raise Hold("PHOTO_SELECTION_PATH_INVALID")
    if any(part.is_symlink() for part in (source, *source.parents)):
        raise Hold("PHOTO_SELECTION_PATH_UNSAFE")
    if any((part / ".git").exists() for part in source.parents):
        raise Hold("PHOTO_SELECTION_INSIDE_GIT")
    try:
        parent = source.parent.stat()
        if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid()
                or parent.st_mode & 0o077):
            raise Hold("PHOTO_SELECTION_PARENT_NOT_PRIVATE")
        if exists and not source.is_file():
            raise Hold("PHOTO_SELECTION_FILE_UNAVAILABLE")
    except OSError as exc:
        raise Hold("PHOTO_SELECTION_PATH_UNSAFE") from exc
    return source


def _read_selection(filename):
    path = _private_path(filename)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as source:
            info = os.fstat(source.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                    or info.st_uid != os.getuid() or info.st_mode & 0o077
                    or not 1 <= info.st_size <= MAX_SELECTION_BYTES):
                raise Hold("PHOTO_SELECTION_FILE_UNSAFE")
            raw = source.read(MAX_SELECTION_BYTES + 1)
        doc = json.loads(raw.decode("utf-8"), object_pairs_hook=_no_duplicate_properties,
                         parse_constant=lambda _: (_ for _ in ()).throw(Hold("PHOTO_SELECTION_INVALID")))
    except Hold:
        raise
    except (OSError, UnicodeError, ValueError, TypeError) as exc:
        raise Hold("PHOTO_SELECTION_INVALID") from exc
    if (not isinstance(doc, dict) or set(doc) != {"schema", "ownerSelected", "selectedFiles"}
            or doc["schema"] != SCHEMA or doc["ownerSelected"] is not True
            or not isinstance(doc["selectedFiles"], list)
            or not 1 <= len(doc["selectedFiles"]) <= MAX_SELECTED_FILES
            or any(not isinstance(p, str) or not p for p in doc["selectedFiles"])):
        raise Hold("PHOTO_SELECTION_INVALID")
    return path, doc["selectedFiles"]


def _fingerprint(source):
    path = _private_path(source)
    suffix = path.suffix.lower()
    if suffix not in EXTENSIONS:
        raise Hold("PHOTO_SELECTION_UNSUPPORTED_VIDEO")
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as stream:
            before = os.fstat(stream.fileno())
            if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1
                    or before.st_uid != os.getuid() or before.st_mode & 0o077
                    or not 1 <= before.st_size <= MAX_VIDEO_BYTES):
                raise Hold("PHOTO_SELECTION_VIDEO_UNSAFE")
            digest, size = hashlib.sha256(), 0
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
                size += len(chunk)
                if size > MAX_VIDEO_BYTES:
                    raise Hold("PHOTO_SELECTION_VIDEO_UNSAFE")
            after = os.fstat(stream.fileno())
            if (size != before.st_size or size != after.st_size
                    or before.st_mtime_ns != after.st_mtime_ns
                    or before.st_ctime_ns != after.st_ctime_ns):
                raise Hold("PHOTO_SELECTION_VIDEO_CHANGED")
    except Hold:
        raise
    except OSError as exc:
        raise Hold("PHOTO_SELECTION_VIDEO_UNAVAILABLE") from exc
    return {"sha256": digest.hexdigest(), "bytes": size, "extension": suffix}


def preview(selection_file):
    """Read-only SHA of exactly the files the owner listed, never a folder scan."""
    selection, filenames = _read_selection(selection_file)
    seen, by_sha, selected_fingerprints = set(), {}, []
    for filename in filenames:
        path = _private_path(filename)
        if path == selection or path in seen:
            raise Hold("PHOTO_SELECTION_DUPLICATE_PATH")
        seen.add(path)
        item = _fingerprint(path)
        selected_fingerprints.append((item["sha256"], item["bytes"], item["extension"]))
        original = by_sha.get(item["sha256"])
        if original is None:
            by_sha[item["sha256"]] = item
        elif original["bytes"] != item["bytes"]:
            raise Hold("PHOTO_SELECTION_INCONSISTENT_HASH")
    assets = sorted(by_sha.values(), key=lambda entry: entry["sha256"])
    # Freeze every explicitly selected asset, not just distinct content hashes.
    # Filenames and paths remain absent; ordering is immaterial to consent.
    canonical = json.dumps(sorted(selected_fingerprints), separators=(",", ":")).encode("utf-8")
    return {
        "schema": RECEIPT_SCHEMA,
        "status": "OWNER_SELECTION_PREVIEW_NOT_IMPORTED",
        "selectedCount": len(filenames),
        "uniqueContentCount": len(assets),
        "duplicateContentCount": len(filenames) - len(assets),
        "selectionSHA256": hashlib.sha256(canonical).hexdigest(),
        "assets": assets,
        "mediaTransfer": "NOT_PERFORMED",
        "publishing": "NOT_PERFORMED",
    }


def confirm(selection_file, receipt_file, expected_sha256):
    """Freshly rehash selection; never replace any pre-existing receipt."""
    if not isinstance(expected_sha256, str) or SHA.fullmatch(expected_sha256) is None:
        raise Hold("PHOTO_SELECTION_CONFIRM_SHA_REQUIRED")
    destination = _private_path(receipt_file, exists=False)
    selection = _private_path(selection_file)
    if destination == selection:
        raise Hold("PHOTO_SELECTION_RECEIPT_PATH_INVALID")
    if destination.exists() or destination.is_symlink():
        raise Hold("PHOTO_SELECTION_RECEIPT_ALREADY_EXISTS")
    proposal = preview(selection)
    if proposal["selectionSHA256"] != expected_sha256:
        raise Hold("PHOTO_SELECTION_CHANGED_CONFIRM_AGAIN")
    receipt = {**proposal, "status": "OWNER_SELECTION_FROZEN_NOT_IMPORTED"}
    payload = (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode("utf-8")
    try:
        fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as out:
            out.write(payload)
            out.flush()
            os.fsync(out.fileno())
    except FileExistsError as exc:
        raise Hold("PHOTO_SELECTION_RECEIPT_ALREADY_EXISTS") from exc
    except OSError as exc:
        raise Hold("PHOTO_SELECTION_RECEIPT_WRITE_FAILED") from exc
    return {"status": receipt["status"], "selectionSHA256": receipt["selectionSHA256"],
            "selectedCount": receipt["selectedCount"],
            "uniqueContentCount": receipt["uniqueContentCount"],
            "mediaTransfer": "NOT_PERFORMED", "publishing": "NOT_PERFORMED"}


def verify_readback(source_file, readback_file, expected_sha256):
    """Compare separately stored bytes to an independently pinned expected SHA.

    This checks local bytes only. It cannot establish that a copy came from
    Drive, that a remote object is new, or that the producer was unattended.
    """
    if not isinstance(expected_sha256, str) or SHA.fullmatch(expected_sha256) is None:
        raise Hold("PHOTO_READBACK_EXPECTED_SHA_REQUIRED")
    original = _private_path(source_file)
    downloaded = _private_path(readback_file)
    try:
        if original == downloaded or os.path.samefile(original, downloaded):
            raise Hold("PHOTO_READBACK_NOT_SEPARATE")
    except OSError as exc:
        raise Hold("PHOTO_READBACK_FILE_UNAVAILABLE") from exc
    source = _fingerprint(original)
    if source["sha256"] != expected_sha256:
        raise Hold("PHOTO_READBACK_SOURCE_SHA_MISMATCH")
    copy = _fingerprint(downloaded)
    if copy["sha256"] != expected_sha256 or copy["bytes"] != source["bytes"]:
        raise Hold("PHOTO_READBACK_COPY_SHA_MISMATCH")
    try:
        if os.path.samefile(original, downloaded):
            raise Hold("PHOTO_READBACK_NOT_SEPARATE")
    except OSError as exc:
        raise Hold("PHOTO_READBACK_FILE_UNAVAILABLE") from exc
    return {
        "status": "LOCAL_READBACK_BYTES_MATCH",
        "verifiedCopies": 1,
        "providerProvenance": "NOT_VERIFIED",
        "unattendedArrival": "NOT_VERIFIED",
        "publishing": "NOT_PERFORMED",
    }


def main(argv=None):
    parser = _RedactingParser(description="Offline opt-in exported-video owner selection")
    parser.add_argument("command", choices=("preview", "confirm", "verify-readback"))
    parser.add_argument("--selection-file")
    parser.add_argument("--source-file")
    parser.add_argument("--readback-file")
    parser.add_argument("--receipt-file")
    parser.add_argument("--expected-sha256")
    try:
        args = parser.parse_args(argv)
        if args.command == "verify-readback":
            if (not args.source_file or not args.readback_file
                    or args.selection_file or args.receipt_file):
                raise Hold("PHOTO_SELECTION_ARGUMENTS_INVALID")
            result = verify_readback(args.source_file, args.readback_file, args.expected_sha256)
        elif not args.selection_file or args.source_file or args.readback_file:
            raise Hold("PHOTO_SELECTION_ARGUMENTS_INVALID")
        elif args.command == "confirm":
            if not args.receipt_file:
                raise Hold("PHOTO_SELECTION_RECEIPT_PATH_INVALID")
            result = confirm(args.selection_file, args.receipt_file, args.expected_sha256)
        else:
            result = preview(args.selection_file)
            result.pop("assets")
        print(json.dumps(result, sort_keys=True))
        return 0
    except Hold as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc)}, sort_keys=True))
        return 2
    except Exception:
        print(json.dumps({"status": "HOLD", "reason": "PHOTO_SELECTION_FAILED"}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
