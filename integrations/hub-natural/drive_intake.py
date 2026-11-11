#!/usr/bin/env python3
"""HUB NATURAL: read-only Drive INBOX -> private immutable local intake.

Opt-in only. No Instagram publishing, public GitHub uploads, automatic Google
Photos import, or unreviewed scene labels. No Google tokens in logs or state.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from urllib import error, parse, request

SCHEMA = "hub-natural-drive-intake-v1"
BASE = "https://www.googleapis.com/drive/v3/files"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ID_RE = re.compile(r"^[A-Za-z0-9_-]{10,200}$")
MIME_TO_EXT = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-m4v": ".m4v",
    "video/x-matroska": ".mkv",
}
MAX_ENTRIES = 10000
DEFAULT_MAX_BYTES = 512 * 1024 * 1024


class Hold(Exception):
    """Fail closed. Messages never contain credentials, names, or file IDs."""


def _valid_id(s):
    if not isinstance(s, str) or not ID_RE.fullmatch(s):
        raise Hold("INVALID_DRIVE_ID")
    return s


def _md5_sha(path):
    md5, sha = hashlib.md5(), hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            md5.update(chunk)
            sha.update(chunk)
    return md5.hexdigest(), sha.hexdigest()


def _atomic_json(path, doc):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=".state-", suffix=".tmp", delete=False) as f:
            tmp = Path(f.name)
            os.chmod(f.name, 0o600)
            json.dump(doc, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)


def _assert_private(path):
    path = Path(path).expanduser().resolve()
    for ancestor in (path, *path.parents):
        if (ancestor / ".git").exists():
            raise Hold("PRIVATE_STORAGE_CANNOT_BE_INSIDE_GIT")
    return path


@contextmanager
def _single_writer(state_path):
    lock = Path(str(state_path) + ".lock")
    try:
        lock.mkdir(mode=0o700)
    except FileExistsError as exc:
        raise Hold("INTAKE_ALREADY_RUNNING") from exc
    try:
        yield
    finally:
        lock.rmdir()


def _new_state(folder_id):
    return {"schema": SCHEMA, "folder": folder_id, "assets": {}}


def _load_state(state_path, folder_id):
    if not Path(state_path).exists():
        return _new_state(folder_id)
    try:
        doc = json.loads(Path(state_path).read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        raise Hold("PRIVATE_STATE_UNREADABLE") from exc
    if doc.get("schema") != SCHEMA or doc.get("folder") != folder_id or not isinstance(doc.get("assets"), dict):
        raise Hold("PRIVATE_STATE_INVALID_OR_WRONG_FOLDER")
    return doc


class DriveHTTP:
    """Fixed-host Google Drive v3 client. Caller must supply a scoped OAuth token."""

    def __init__(self, token, opener=None):
        if not token or not isinstance(token, str):
            raise Hold("OAUTH_NOT_CONNECTED")
        self.__token = token
        self._opener = opener or request.urlopen

    def _open(self, url, *, data=None):
        if not url.startswith(BASE) and url != TOKEN_URL:
            raise Hold("UNEXPECTED_REMOTE_HOST")
        req = request.Request(url, headers={"Authorization": "Bearer " + self.__token,
                                              "User-Agent": "HUB-NATURAL-private-intake/1"}, data=data)
        try:
            return self._opener(req, timeout=60)
        except error.HTTPError as exc:
            raise Hold(f"DRIVE_HTTP_{exc.code}") from exc
        except (error.URLError, TimeoutError) as exc:
            raise Hold("DRIVE_REQUEST_FAILED") from exc

    def _json(self, url):
        with self._open(url) as res:
            raw = res.read(4 * 1024 * 1024 + 1)
        if len(raw) > 4 * 1024 * 1024:
            raise Hold("DRIVE_METADATA_TOO_LARGE")
        try:
            return json.loads(raw)
        except ValueError as exc:
            raise Hold("DRIVE_METADATA_NOT_JSON") from exc

    def list_files(self, folder_id):
        folder_id = _valid_id(folder_id)
        page, found, seen = None, [], set()
        while True:
            params = {
                "q": f"'{folder_id}' in parents and trashed = false",
                "pageSize": "1000", "fields": "nextPageToken,incompleteSearch,files(id,mimeType,size,md5Checksum,modifiedTime,version)",
                "supportsAllDrives": "true", "includeItemsFromAllDrives": "true",
            }
            if page is not None:
                params["pageToken"] = page
            doc = self._json(BASE + "?" + parse.urlencode(params))
            if doc.get("incompleteSearch"):
                raise Hold("DRIVE_SEARCH_INCOMPLETE")
            fs = doc.get("files")
            if not isinstance(fs, list):
                raise Hold("DRIVE_FILES_INVALID")
            found.extend(fs)
            if len(found) > MAX_ENTRIES:
                raise Hold("DRIVE_INBOX_TOO_LARGE")
            page = doc.get("nextPageToken")
            if not page:
                return found
            if not isinstance(page, str) or page in seen:
                raise Hold("DRIVE_PAGINATION_INVALID")
            seen.add(page)

    def file_metadata(self, file_id):
        id_ = _valid_id(file_id)
        params = parse.urlencode({"fields": "id,mimeType,size,md5Checksum,modifiedTime,version,trashed,parents"})
        return self._json(f"{BASE}/{id_}?{params}")

    def media(self, file_id):
        return self._open(f"{BASE}/{_valid_id(file_id)}?alt=media")


def oauth_token_from_env():
    # Never print tokens or any credential. Refreshed offline credentials must be
    # provisioned by the owner in an independent private secrets store.
    direct = os.environ.get("HUB_NATURAL_GDRIVE_ACCESS_TOKEN")
    if direct:
        return direct
    vals = [os.environ.get(k) for k in (
        "HUB_NATURAL_GOOGLE_CLIENT_ID", "HUB_NATURAL_GOOGLE_CLIENT_SECRET", "HUB_NATURAL_GOOGLE_REFRESH_TOKEN")]
    if not all(vals):
        raise Hold("OWNER_OAUTH_OFFLINE_AUTH_REQUIRED")
    data = parse.urlencode({"client_id": vals[0], "client_secret": vals[1],
                            "refresh_token": vals[2], "grant_type": "refresh_token"}).encode()
    try:
        with request.urlopen(request.Request(TOKEN_URL, data=data, method="POST"), timeout=30) as res:
            raw = res.read(4096)
        token = json.loads(raw).get("access_token")
        if not isinstance(token, str) or not token:
            raise Hold("OAUTH_REFRESH_FAILED")
        return token
    except (error.HTTPError, error.URLError, TimeoutError, ValueError) as exc:
        raise Hold("OAUTH_REFRESH_FAILED") from exc


def _parsed_video(file):
    if not isinstance(file, dict):
        raise Hold("DRIVE_ENTRY_INVALID")
    id_ = _valid_id(file.get("id"))
    extension = MIME_TO_EXT.get(file.get("mimeType"))
    if extension is None:
        return None
    size = file.get("size")
    md5 = file.get("md5Checksum")
    if not isinstance(size, str) or not size.isdecimal() or not isinstance(md5, str) or not re.fullmatch(r"[0-9a-f]{32}", md5):
        raise Hold("DRIVE_VIDEO_INTEGRITY_METADATA_MISSING")
    version = str(file.get("version", ""))
    # Opaque local name, never use Drive title/filename in output path/logs.
    local = "owner_" + hashlib.sha256(id_.encode()).hexdigest()[:24] + extension
    return {"id": id_, "bytes": int(size), "md5": md5, "mimeType": file["mimeType"],
            "version": version, "modifiedTime": file.get("modifiedTime", ""), "local": local}


def _stable(before, after, folder_id):
    if not isinstance(after, dict) or after.get("trashed") is True or folder_id not in after.get("parents", []):
        return False
    for key in ("id", "size", "md5Checksum", "mimeType", "version", "modifiedTime"):
        before_value = ("bytes" if key == "size" else "md5" if key == "md5Checksum" else key)
        a = str(before.get(before_value, ""))
        b = str(after.get(key, ""))
        if a != b:
            return False
    return True


def sync_once(client, folder_id, inbox, state_path, *, max_bytes=DEFAULT_MAX_BYTES):
    folder_id = _valid_id(folder_id)
    inbox, state_path = _assert_private(inbox), _assert_private(state_path)
    if inbox == state_path or state_path.is_relative_to(inbox):
        raise Hold("PRIVATE_STATE_MUST_BE_OUTSIDE_MEDIA_INBOX")
    if not (1 <= max_bytes <= 4 * 1024 ** 3):
        raise Hold("INVALID_FILE_SIZE_LIMIT")
    inbox.mkdir(parents=True, exist_ok=True, mode=0o700)
    state_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    counts = {"imported": 0, "already_present": 0, "duplicate": 0, "unsupported": 0, "hold": 0}
    reasons = {}  # Private aggregate error codes, never names/IDs or tokens.
    with _single_writer(state_path):
        state = _load_state(state_path, folder_id)
        assets = state["assets"]
        seen = set()
        for raw in client.list_files(folder_id):
            if not isinstance(raw, dict) or not isinstance(raw.get("id"), str):
                raise Hold("DRIVE_ENTRY_INVALID")
            file_id = _valid_id(raw["id"])
            if file_id in seen:
                raise Hold("DRIVE_DUPLICATE_ID_IN_PAGE")
            seen.add(file_id)
            if raw.get("mimeType") not in MIME_TO_EXT:
                counts["unsupported"] += 1
                continue
            try:
                f = _parsed_video(raw)
                if f["bytes"] > max_bytes:
                    raise Hold("SOURCE_TOO_LARGE")
                previous = assets.get(file_id)
                if previous is not None:
                    if previous["md5"] != f["md5"] or previous["bytes"] != f["bytes"]:
                        raise Hold("IMPORTED_ORIGINAL_CHANGED")
                    if previous["status"] == "DUPLICATE":
                        source = inbox / previous["duplicateOf"]
                        if source.is_symlink() or not source.exists() or _md5_sha(source)[1] != previous["sha256"]:
                            raise Hold("DUPLICATE_SOURCE_NOT_VERIFIABLE")
                        counts["duplicate"] += 1
                        continue
                    original_path = inbox / previous["local"]
                    if original_path.is_symlink() or not original_path.exists() or _md5_sha(original_path)[1] != previous["sha256"]:
                        raise Hold("LOCAL_ORIGINAL_MISSING_OR_CHANGED")
                    counts["already_present"] += 1
                    continue
                duplicate = next((asset for asset in assets.values()
                                  if asset.get("sha256") and asset.get("md5") == f["md5"]
                                  and asset.get("bytes") == f["bytes"] and asset.get("status") == "IMPORTED"), None)
                if duplicate:
                    existing = inbox / duplicate["local"]
                    if existing.is_symlink() or not existing.exists() or _md5_sha(existing)[1] != duplicate["sha256"]:
                        raise Hold("DUPLICATE_SOURCE_NOT_VERIFIABLE")
                    assets[file_id] = {**f, "sha256": duplicate["sha256"],
                                       "status": "DUPLICATE", "duplicateOf": duplicate["local"]}
                    _atomic_json(state_path, state)
                    counts["duplicate"] += 1
                    continue
                target = inbox / f["local"]
                if target.is_symlink():
                    raise Hold("UNSAFE_LOCAL_SYMLINK")
                if target.exists():
                    m, sha = _md5_sha(target)
                    if m != f["md5"] or target.stat().st_size != f["bytes"]:
                        raise Hold("UNTRACKED_LOCAL_FILE_COLLISION")
                else:
                    tmp = None
                    try:
                        with tempfile.NamedTemporaryFile(mode="wb", dir=inbox, prefix=".partial-",
                                                         suffix=".tmp", delete=False) as dst:
                            tmp = Path(dst.name)
                            os.chmod(dst.name, 0o600)
                            total, md5, sha = 0, hashlib.md5(), hashlib.sha256()
                            with client.media(file_id) as src:
                                while True:
                                    buf = src.read(1024 * 1024)
                                    if not buf:
                                        break
                                    total += len(buf)
                                    if total > max_bytes or total > f["bytes"]:
                                        raise Hold("DOWNLOAD_EXCEEDS_EXPECTED_SIZE")
                                    dst.write(buf)
                                    md5.update(buf)
                                    sha.update(buf)
                            dst.flush()
                            os.fsync(dst.fileno())
                        if total != f["bytes"] or md5.hexdigest() != f["md5"]:
                            raise Hold("DOWNLOADED_CONTENT_MISMATCH")
                        if not _stable(f, client.file_metadata(file_id), folder_id):
                            raise Hold("REMOTE_ORIGINAL_CHANGED_DURING_READ")
                        os.replace(tmp, target)
                    finally:
                        if tmp is not None:
                            tmp.unlink(missing_ok=True)
                    sha = sha.hexdigest()
                assets[file_id] = {**f, "sha256": sha, "status": "IMPORTED"}
                _atomic_json(state_path, state)
                counts["imported"] += 1
            except Hold as exc:
                # HOLD entries stay untouched; store only sanitized aggregate reasons.
                counts["hold"] += 1
                reason = str(exc).split(':')[0]
                reasons[reason] = reasons.get(reason, 0) + 1
        state["holdReasons"] = reasons
        state["lastSuccessfulCheckUnix"] = int(time.time())
        state["summary"] = counts
        _atomic_json(state_path, state)
    return counts


def main():
    ap = argparse.ArgumentParser(description="Private, opt-in Google Drive INBOX intake. No publishing.")
    ap.add_argument("--folder-id", required=True)
    ap.add_argument("--inbox", required=True, help="Private existing or new directory outside a Git working tree")
    ap.add_argument("--state", required=True, help="Private persisted JSON state outside the media directory")
    ap.add_argument("--max-file-mb", type=int, default=512)
    a = ap.parse_args()
    try:
        client = DriveHTTP(oauth_token_from_env())
        result = sync_once(client, a.folder_id, a.inbox, a.state, max_bytes=a.max_file_mb * 1024 ** 2)
        print(json.dumps({"status": "HOLD_REVIEW_REQUIRED" if result["hold"] else "INTAKE_COMPLETE_NO_POSTING",
                          "counts": result, "semanticRecognition": "NOT_PERFORMED"}))
        if result["hold"]:
            raise SystemExit(2)
    except Hold as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc)}), file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
