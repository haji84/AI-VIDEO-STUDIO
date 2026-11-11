"""Fake Drive API tests. No external network, Google credentials, or private media."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from drive_intake import DriveHTTP, Hold, sync_once, SCHEMA

FOLDER = "fakeDriveFolder0123456789"


def fixture(id_, data=b"synthetic-mp4-content", mime="video/mp4", version="1"):
    return {"id": id_, "mimeType": mime, "md5Checksum": hashlib.md5(data).hexdigest(),
            "size": str(len(data)), "modifiedTime": "2026-01-01T00:00:00Z", "version": version,
            "trashed": False, "parents": [FOLDER]}


class FakeDrive:
    def __init__(self, files):
        self.files = files  # [(metadata, bytes)]
        self.downloads = 0
        self.changed_on_read = False

    def list_files(self, folder_id):
        if folder_id != FOLDER:
            raise AssertionError("Unexpected folder")
        return [dict(f) for f, _ in self.files]

    def file_metadata(self, id_):
        f = dict(next(f for f, _ in self.files if f["id"] == id_))
        if self.changed_on_read:
            f["version"] = "999"
        return f

    def media(self, id_):
        self.downloads += 1
        return contextlib.closing(io.BytesIO(next(d for f, d in self.files if f["id"] == id_)))


class TestDriveIntake(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.addCleanup(self.t.cleanup)
        self.root = Path(self.t.name)
        self.inbox = self.root / "inbox"
        self.state = self.root / "state" / "manifest.json"

    def sync(self, client, **kwargs):
        return sync_once(client, FOLDER, self.inbox, self.state, **kwargs)

    def test_new_video_imported_immutable_opaque_named_and_repeated_idempotent(self):
        original = b"synthetic-video" * 23
        f = fixture("sampleVID123456789", original)
        d = FakeDrive([(f, original)])
        s = self.sync(d)
        self.assertEqual(s["imported"], 1)
        self.assertEqual(d.downloads, 1)
        data = json.loads(self.state.read_text())
        self.assertEqual(data["schema"], SCHEMA)
        v = data["assets"][f["id"]]
        self.assertNotIn(f["id"], v["local"])
        self.assertEqual(v["sha256"], hashlib.sha256(original).hexdigest())
        self.assertEqual((self.inbox / v["local"]).read_bytes(), original)
        s = self.sync(d)
        self.assertEqual(s["already_present"], 1)
        self.assertEqual(d.downloads, 1)

    def test_duplicate_content_does_not_download_second_video(self):
        original = b"samesame" * 400
        d = FakeDrive([(fixture("sampleVID123456789", original), original),
                       (fixture("secondVID123456789", original), original)])
        result = self.sync(d)
        self.assertEqual(result["imported"], 1)
        self.assertEqual(result["duplicate"], 1)
        self.assertEqual(d.downloads, 1)
        self.assertEqual(len(list(self.inbox.glob("owner_*.mp4"))), 1)

    def test_updated_original_not_overwritten(self):
        id_ = "sampleVID123456789"
        d = FakeDrive([(fixture(id_, b"v1"), b"v1")])
        self.sync(d)
        before = next(self.inbox.glob("owner_*.mp4")).read_bytes()
        d.files = [(fixture(id_, b"v2", version="2"), b"v2")]
        r = self.sync(d)
        self.assertEqual(r["hold"], 1)
        self.assertEqual(json.loads(self.state.read_text())["holdReasons"]["IMPORTED_ORIGINAL_CHANGED"], 1)
        self.assertEqual(next(self.inbox.glob("owner_*.mp4")).read_bytes(), before)

    def test_remote_changed_during_download_is_hold_and_no_committed_media(self):
        d = FakeDrive([(fixture("sampleVID123456789", b"first"), b"first")])
        d.changed_on_read = True
        self.assertEqual(self.sync(d)["hold"], 1)
        self.assertEqual(list(self.inbox.glob("owner_*.mp4")), [])
        self.assertEqual(list(self.inbox.glob(".partial-*")), [])

    def test_wrong_download_checksum_is_hold_without_partial_artifact(self):
        d = FakeDrive([(fixture("sampleVID123456789", b"actual"), b"wrong!")])
        self.assertEqual(self.sync(d)["hold"], 1)
        self.assertFalse(list(self.inbox.glob("*")))

    def test_unsupported_does_not_touch_media(self):
        d = FakeDrive([(fixture("sampleVID123456789", b"abc", mime="image/jpeg"), b"abc")])
        r = self.sync(d)
        self.assertEqual(r["unsupported"], 1)
        self.assertEqual(d.downloads, 0)

    def test_oversized_no_download(self):
        d = FakeDrive([(fixture("sampleVID123456789", b"too-big"), b"too-big")])
        r = self.sync(d, max_bytes=2)
        self.assertEqual(r["hold"], 1)
        self.assertEqual(d.downloads, 0)

    def test_locked_or_mismatched_state_is_hold(self):
        self.state.parent.mkdir(parents=True)
        Path(str(self.state) + ".lock").mkdir()
        with self.assertRaisesRegex(Hold, "INTAKE_ALREADY_RUNNING"):
            self.sync(FakeDrive([]))
        Path(str(self.state) + ".lock").rmdir()
        self.state.write_text(json.dumps({"schema": "other", "folder": FOLDER, "assets": {}}))
        with self.assertRaisesRegex(Hold, "PRIVATE_STATE_INVALID"):
            self.sync(FakeDrive([]))

    def test_drive_client_does_not_accept_bad_access_token(self):
        with self.assertRaisesRegex(Hold, "OAUTH_NOT_CONNECTED"):
            DriveHTTP("")

    def test_symlink_to_untracked_media_is_hold(self):
        original = b"real-synthetic-media"
        f = fixture("sampleVID123456789", original)
        d = FakeDrive([(f, original)])
        self.inbox.mkdir()
        from drive_intake import _parsed_video
        link = self.inbox / _parsed_video(f)["local"]
        actual = self.root / "elsewhere.mp4"
        actual.write_bytes(original)
        link.symlink_to(actual)
        self.assertEqual(self.sync(d)["hold"], 1)
        self.assertEqual(d.downloads, 0)
        self.assertEqual(actual.read_bytes(), original)

    def test_repo_directory_rejected(self):
        fake = self.root / "publicrepo"
        fake.mkdir()
        (fake / ".git").mkdir()
        with self.assertRaisesRegex(Hold, "PRIVATE_STORAGE_CANNOT_BE_INSIDE_GIT"):
            sync_once(FakeDrive([]), FOLDER, fake / "INBOX", self.state)


if __name__ == "__main__":
    unittest.main()
