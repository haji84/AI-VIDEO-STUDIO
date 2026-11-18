#!/usr/bin/env python3
"""One bounded Drive-INBOX -> verified-media-catalog -> private review-queue cycle.

This is *not* a daemon or an automatic publisher. It can be scheduled by an owner-
authorized persistent host with Drive read-only OAuth. With no semantic evidence it
stops at a review queue, rather than inventing a snake event or exporting footage.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat

from drive_intake import (DriveHTTP, Hold, MAX_ENTRIES, MIME_TO_EXT,
                          ID_RE, SCHEMA as INTAKE_SCHEMA, _assert_private,
                          _atomic_json, _single_writer, oauth_token_from_env,
                          sync_once)
import pipeline

SCHEMA="hub-natural-private-review-queue-v1"
_MAX_QUEUE_BYTES = 4 * 1024 * 1024
_MAX_STATE_BYTES = 8 * 1024 * 1024
_MD5 = re.compile(r"[0-9a-f]{32}")
_INTAKE_COUNTS = {"imported", "already_present", "duplicate", "unsupported", "hold"}
_INTAKE_ASSET_FIELDS = {
    "id", "bytes", "md5", "mimeType", "version", "modifiedTime",
    "local", "sha256", "status",
}
_INTAKE_STATE_FIELDS = {
    "schema", "folder", "assets", "holdReasons", "lastSuccessfulCheckUnix", "summary",
}
_SHA256 = re.compile(r"[0-9a-f]{64}")
_LOCAL = re.compile(r"owner_[0-9a-f]{24}[.](?:mp4|mov|m4v|mkv)")
_COUNTS = {"imported", "already_present", "duplicate", "unsupported", "hold"}
_RECORD_FIELDS = {
    "assetId", "sha256", "local", "seconds", "width", "height",
    "hasAudio", "sceneStatus", "editorialQuality", "privacyCheck",
}
_QUEUE_FIELDS = {
    "schema", "status", "assets", "sourceCount", "newlyQueued", "intake",
    "scanHolds", "semanticRecognition", "draftGeneration", "publishing",
}


def _unique_object(pairs):
    obj = {}
    for name, value in pairs:
        if name in obj:
            raise ValueError("Duplicate JSON property")
        obj[name] = value
    return obj


def _reject_json_constant(_value):
    raise ValueError("Nonfinite JSON number")


def _count(value):
    return type(value) is int and value >= 0


def _load_previous_queue(queue):
    """Fail closed on a damaged review queue BEFORE any OAuth/Drive/media call.

    Only an absent queue may start a first review cycle. Existing queues are
    read under the job lock; readback never repairs or replaces an invalid file.
    """
    if queue.is_symlink():
        raise Hold("PREVIOUS_REVIEW_QUEUE_UNSAFE")
    try:
        fd = os.open(queue, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except FileNotFoundError:
        return {}
    except OSError as exc:
        raise Hold("PREVIOUS_REVIEW_QUEUE_UNSAFE") from exc
    try:
        with os.fdopen(fd, "rb") as source:
            info = os.fstat(source.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                    or (os.name == "posix" and
                        (info.st_uid != os.getuid() or info.st_mode & 0o077))):
                raise Hold("PREVIOUS_REVIEW_QUEUE_UNSAFE")
            if info.st_size == 0 or info.st_size > _MAX_QUEUE_BYTES:
                raise Hold("PREVIOUS_REVIEW_QUEUE_UNREADABLE")
            raw = source.read(_MAX_QUEUE_BYTES + 1)
    except OSError as exc:
        raise Hold("PREVIOUS_REVIEW_QUEUE_UNREADABLE") from exc
    if not raw or len(raw) > _MAX_QUEUE_BYTES:
        raise Hold("PREVIOUS_REVIEW_QUEUE_UNREADABLE")
    try:
        prior = json.loads(
            raw.decode("utf-8"), object_pairs_hook=_unique_object,
            parse_constant=_reject_json_constant,
        )
    except (UnicodeError, ValueError, TypeError) as exc:
        raise Hold("PREVIOUS_REVIEW_QUEUE_UNREADABLE") from exc
    if (not isinstance(prior, dict) or set(prior) != _QUEUE_FIELDS
            or prior["schema"] != SCHEMA
            or prior["status"] != "HOLD_REVIEW_REQUIRED"
            or prior["semanticRecognition"] != "NOT_PERFORMED"
            or prior["draftGeneration"] != "NOT_RUN_NO_VERIFIED_SCENES"
            or prior["publishing"] != "NOT_PERFORMED"
            or not isinstance(prior["assets"], list)
            or len(prior["assets"]) > MAX_ENTRIES
            or not _count(prior["sourceCount"])
            or prior["sourceCount"] != len(prior["assets"])
            or not _count(prior["newlyQueued"])
            or prior["newlyQueued"] > prior["sourceCount"]
            or not _count(prior["scanHolds"])
            or not isinstance(prior["intake"], dict)
            or set(prior["intake"]) != _COUNTS
            or not all(_count(v) for v in prior["intake"].values())):
        raise Hold("PREVIOUS_REVIEW_QUEUE_INVALID")

    previous = {}
    for item in prior["assets"]:
        if not isinstance(item, dict) or set(item) != _RECORD_FIELDS:
            raise Hold("PREVIOUS_REVIEW_QUEUE_INVALID")
        sha, local = item["sha256"], item["local"]
        if (not isinstance(sha, str) or _SHA256.fullmatch(sha) is None
                or sha in previous or not isinstance(local, str)
                or _LOCAL.fullmatch(local) is None
                or item["assetId"] != "asset_" + sha[:32]
                or item["sceneStatus"] != "NEEDS_SEMANTIC_REVIEW"
                or item["editorialQuality"] != "NOT_EVALUATED"
                or item["privacyCheck"] != "NOT_PERFORMED"
                or type(item["hasAudio"]) is not bool
                or type(item["width"]) is not int or item["width"] <= 0
                or type(item["height"]) is not int or item["height"] <= 0
                or type(item["seconds"]) not in (int, float)
                or not math.isfinite(item["seconds"])
                or not 0 < item["seconds"] <= 14400.001):
            # Preserve the pre-existing status/tamper HOLD code.
            if item.get("sceneStatus") != "NEEDS_SEMANTIC_REVIEW":
                raise Hold("PREVIOUS_QUEUE_SOURCE_OR_STATUS_CHANGED")
            raise Hold("PREVIOUS_REVIEW_QUEUE_INVALID")
        previous[sha] = item
    return previous


def _preflight_intake_state(state_path, folder_id, previous):
    """Validate saved intake receipts and the queue relationship, offline.

    A missing state is valid ONLY if there is no previously committed queue:
    a crash after media rename but before writing state must remain recoverable.
    Extra valid state assets are allowed because state commits before queue;
    they can be pending recovery after a hard stop.
    """
    if state_path.is_symlink():
        raise Hold("PREVIOUS_INTAKE_STATE_UNSAFE")
    try:
        fd = os.open(state_path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except FileNotFoundError:
        if previous:
            raise Hold("PREVIOUS_INTAKE_QUEUE_STATE_MISMATCH")
        return {}
    except OSError as exc:
        raise Hold("PREVIOUS_INTAKE_STATE_UNSAFE") from exc
    try:
        with os.fdopen(fd, "rb") as source:
            info = os.fstat(source.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                    or (os.name == "posix" and
                        (info.st_uid != os.getuid() or info.st_mode & 0o077))):
                raise Hold("PREVIOUS_INTAKE_STATE_UNSAFE")
            if info.st_size == 0 or info.st_size > _MAX_STATE_BYTES:
                raise Hold("PREVIOUS_INTAKE_STATE_UNREADABLE")
            raw = source.read(_MAX_STATE_BYTES + 1)
    except OSError as exc:
        raise Hold("PREVIOUS_INTAKE_STATE_UNREADABLE") from exc
    if not raw or len(raw) > _MAX_STATE_BYTES:
        raise Hold("PREVIOUS_INTAKE_STATE_UNREADABLE")
    try:
        doc = json.loads(raw.decode("utf-8"),
                         object_pairs_hook=_unique_object,
                         parse_constant=_reject_json_constant)
    except (UnicodeError, ValueError, TypeError) as exc:
        raise Hold("PREVIOUS_INTAKE_STATE_UNREADABLE") from exc
    if (not isinstance(doc, dict)
            or not {"schema", "folder", "assets"} <= set(doc)
            or not set(doc) <= _INTAKE_STATE_FIELDS
            or doc["schema"] != INTAKE_SCHEMA or doc["folder"] != folder_id
            or not isinstance(doc["assets"], dict)
            or len(doc["assets"]) > MAX_ENTRIES):
        raise Hold("PREVIOUS_INTAKE_STATE_INVALID")
    if "lastSuccessfulCheckUnix" in doc and not _count(doc["lastSuccessfulCheckUnix"]):
        raise Hold("PREVIOUS_INTAKE_STATE_INVALID")
    if "summary" in doc and (not isinstance(doc["summary"], dict)
                             or set(doc["summary"]) != _INTAKE_COUNTS
                             or not all(_count(v) for v in doc["summary"].values())):
        raise Hold("PREVIOUS_INTAKE_STATE_INVALID")
    if "holdReasons" in doc and (not isinstance(doc["holdReasons"], dict)
                                 or any(not isinstance(k, str) or not _count(v)
                                        for k, v in doc["holdReasons"].items())):
        raise Hold("PREVIOUS_INTAKE_STATE_INVALID")

    imported_by_sha = {}
    imported_by_local = {}
    duplicates = []
    for remote_id, item in doc["assets"].items():
        if not isinstance(remote_id, str) or ID_RE.fullmatch(remote_id) is None:
            raise Hold("PREVIOUS_INTAKE_STATE_INVALID")
        if not isinstance(item, dict):
            raise Hold("PREVIOUS_INTAKE_STATE_INVALID")
        status = item.get("status")
        required = _INTAKE_ASSET_FIELDS | ({"duplicateOf"} if status == "DUPLICATE" else set())
        if (status not in ("IMPORTED", "DUPLICATE") or set(item) != required
                or item["id"] != remote_id
                or type(item["bytes"]) is not int or not 0 <= item["bytes"] <= 4*1024**3
                or not isinstance(item["md5"], str) or not _MD5.fullmatch(item["md5"])
                or not isinstance(item["mimeType"], str)
                or item["mimeType"] not in MIME_TO_EXT
                or not isinstance(item["version"], str)
                or not (isinstance(item["modifiedTime"], str)
                        or item["modifiedTime"] is None)
                or not isinstance(item["sha256"], str)
                or _SHA256.fullmatch(item["sha256"]) is None
                or item["local"] != "owner_" + hashlib.sha256(remote_id.encode()).hexdigest()[:24] + MIME_TO_EXT[item["mimeType"]]):
            raise Hold("PREVIOUS_INTAKE_STATE_INVALID")
        if status == "IMPORTED":
            if (item["local"] in imported_by_local
                    or item["sha256"] in imported_by_sha):
                raise Hold("PREVIOUS_INTAKE_STATE_INVALID")
            imported_by_local[item["local"]] = item
            imported_by_sha[item["sha256"]] = item
        else:
            duplicates.append(item)
    for item in duplicates:
        if not isinstance(item["duplicateOf"], str):
            raise Hold("PREVIOUS_INTAKE_STATE_INVALID")
        original = imported_by_local.get(item["duplicateOf"])
        if (original is None or original["sha256"] != item["sha256"]
                or original["bytes"] != item["bytes"]):
            raise Hold("PREVIOUS_INTAKE_STATE_INVALID")
    receipts = {}
    for sha, queued in previous.items():
        original = imported_by_sha.get(sha)
        if (original is None or original["local"] != queued["local"]):
            raise Hold("PREVIOUS_INTAKE_QUEUE_STATE_MISMATCH")
        receipts[sha] = original
    return receipts


def _verify_queued_sources(inbox, previous, receipts):
    """Hash each pending original locally before OAuth, Drive or catalog writes.

    The queue SHA belongs to a real owner-private source file. Using a file
    descriptor and O_NOFOLLOW where available avoids hashing a redirected path.
    This guards accidental corruption, not an attacker who can forge both the
    queue and the original. Existing intake/scan checks remain in force too.
    """
    for record in previous.values():
        source = inbox / record["local"]  # strict basename checked in queue loader
        if source.is_symlink():
            raise Hold("PREVIOUS_QUEUED_SOURCE_MISSING_OR_CHANGED")
        try:
            fd = os.open(source, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        except OSError as exc:
            raise Hold("PREVIOUS_QUEUED_SOURCE_MISSING_OR_CHANGED") from exc
        try:
            with os.fdopen(fd, "rb") as stream:
                before = os.fstat(stream.fileno())
                if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1
                        or (os.name == "posix" and
                            (before.st_uid != os.getuid() or before.st_mode & 0o077))):
                    raise Hold("PREVIOUS_QUEUED_SOURCE_MISSING_OR_CHANGED")
                hasher = hashlib.sha256()
                md5 = hashlib.md5()
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    hasher.update(chunk)
                    md5.update(chunk)
                after = os.fstat(stream.fileno())
                receipt = receipts[record["sha256"]]
                if (hasher.hexdigest() != record["sha256"]
                        or md5.hexdigest() != receipt["md5"]
                        or after.st_size != receipt["bytes"]
                        or before.st_size != after.st_size
                        or before.st_mtime_ns != after.st_mtime_ns
                        or before.st_ctime_ns != after.st_ctime_ns):
                    raise Hold("PREVIOUS_QUEUED_SOURCE_MISSING_OR_CHANGED")
        except OSError as exc:
            raise Hold("PREVIOUS_QUEUED_SOURCE_MISSING_OR_CHANGED") from exc


def _assert_paths(inbox, state, catalog, queue):
    paths=list(map(_assert_private,(inbox, state, catalog, queue)))
    if len(set(paths))!=len(paths):
        raise Hold("PRIVATE_PATHS_MUST_BE_DISTINCT")
    media=paths[0]
    if any(p.is_relative_to(media) for p in paths[1:]):
        raise Hold("REPORTS_MUST_BE_OUTSIDE_MEDIA_INBOX")
    if any(p.suffix.lower() in ('.mp4','.mov','.mkv','.m4v') for p in paths[1:]):
        raise Hold("REPORT_PATH_MUST_NOT_BE_VIDEO")
    return paths


def run_once(client, folder_id, inbox, state, catalog, queue, *, max_bytes=None):
    # _assert_private resolves paths; reject a supplied symlink before resolving.
    if Path(queue).expanduser().is_symlink():
        raise Hold("PREVIOUS_REVIEW_QUEUE_UNSAFE")
    if Path(state).expanduser().is_symlink():
        raise Hold("PREVIOUS_INTAKE_STATE_UNSAFE")
    inbox,state,catalog,queue=_assert_paths(inbox,state,catalog,queue)
    # Hold the job-level guard through intake, scan and queue commit. Without
    # this, two concurrent invocations can each overwrite the other's queue.
    with _single_writer(queue):
        return _run_once_locked(client,folder_id,inbox,state,catalog,queue,max_bytes=max_bytes)


def _run_once_locked(client, folder_id, inbox, state, catalog, queue, *, max_bytes=None):
    # Validate locally persisted queue first, before listing Drive, downloading
    # video, or even refreshing an owner OAuth token.
    previous = _load_previous_queue(queue)
    receipts = _preflight_intake_state(state, folder_id, previous)
    _verify_queued_sources(inbox, previous, receipts)
    if client is None:
        client = DriveHTTP(oauth_token_from_env())
    options={"max_bytes":max_bytes} if max_bytes is not None else {}
    result=sync_once(client,folder_id,inbox,state,**options)
    # `scan` checks source SHA and actual FFprobe data, and writes catalog atomically.
    assets=pipeline.scan(inbox,catalog)
    # Queue is review-only; no external status may certify a scene.
    entries=[]; held=0; newly_queued=0
    for a in assets:
        if 'hold' in a:
            held+=1;continue
        if a['duplicate_of'] is not None:
            continue
        # This id never carries real names or footage outside private output.
        sid='asset_'+a['sha256'][:32]
        prior = previous.get(a['sha256'])
        if prior is not None:
            # A reviewed scene belongs in a separate, independently audited
            # source-hash-bound label store. This queue only tracks arrivals.
            if (prior.get('assetId') != sid or prior.get('local') != a['relative_name'] or
                    prior.get('sceneStatus') != 'NEEDS_SEMANTIC_REVIEW'):
                raise Hold('PREVIOUS_QUEUE_SOURCE_OR_STATUS_CHANGED')
            item = prior
        else:
            newly_queued += 1
            item = {'assetId':sid,'sha256':a['sha256'],
                    'local':a['relative_name'],'seconds':round(a['duration'],3),
                    'width':a['width'],'height':a['height'],
                    'hasAudio':a['audio'],
                    'sceneStatus':'NEEDS_SEMANTIC_REVIEW',
                    'editorialQuality':'NOT_EVALUATED',
                    'privacyCheck':'NOT_PERFORMED'}
        entries.append(item)
    # A partial scan, vanished original, or newly unreadable/corrupt source
    # MUST NOT silently erase an already pending review item on replay.
    # Clearing a queued original requires a separate owner-audited action.
    if set(previous) - {item['sha256'] for item in entries}:
        raise Hold('PREVIOUS_QUEUED_SOURCE_NOT_VISIBLE')
    entries.sort(key=lambda x:x['assetId'])
    record={'schema':SCHEMA,'status':'HOLD_REVIEW_REQUIRED',
            'assets':entries,'sourceCount':len(entries),
            'newlyQueued':newly_queued,
            'intake':result,'scanHolds':held,
            'semanticRecognition':'NOT_PERFORMED',
            'draftGeneration':'NOT_RUN_NO_VERIFIED_SCENES',
            'publishing':'NOT_PERFORMED'}
    # derived file is safe to overwrite, but never allow source or state overwrites
    _atomic_json(queue,record)
    return {'status':record['status'],'newImports':result['imported'],
            'alreadyPresent':result['already_present'],'held':result['hold']+held,
            'queuePending':len(entries),'newlyQueued':newly_queued,
            'draftsMade':0,'publishing':'NOT_PERFORMED'}


def main():
    ap=argparse.ArgumentParser(description='Private unattended component: Drive arrival to semantic review queue')
    ap.add_argument('--folder-id',required=True)
    ap.add_argument('--inbox',required=True)
    ap.add_argument('--state',required=True)
    ap.add_argument('--catalog',required=True)
    ap.add_argument('--review-queue',required=True)
    a=ap.parse_args()
    try:
        # Credentials are not refreshed until the locked local queue passes
        # its preflight. None selects the owner OAuth-backed client afterward.
        result=run_once(None,a.folder_id,a.inbox,a.state,a.catalog,a.review_queue)
        print(json.dumps(result))
        if result['held']:
            raise SystemExit(2)
    except (Hold,pipeline.Hold) as exc:
        # Exception messages only contain predefined non-sensitive gate codes.
        print(json.dumps({'status':'HOLD','reason':str(exc)}))
        raise SystemExit(2)

if __name__=='__main__':main()
