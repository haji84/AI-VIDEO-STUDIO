"""Fake Drive API tests. No external network, Google credentials, or private media."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from drive_intake import DriveHTTP, Hold, sync_once, SCHEMA, _RejectRedirect

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

    def test_duplicate_content_verified_by_sha_after_second_download(self):
        original = b"samesame" * 400
        d = FakeDrive([(fixture("sampleVID123456789", original), original),
                       (fixture("secondVID123456789", original), original)])
        result = self.sync(d)
        self.assertEqual(result["imported"], 1)
        self.assertEqual(result["duplicate"], 1)
        self.assertEqual(d.downloads, 2)  # distinct IDs require their own SHA-256 proof
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

    def test_killed_worker_releases_lock_for_next_process(self):
        # A hard exit bypasses contextmanager finally, unlike a normal exception.
        # OS advisory locks must still release without deleting the lock file.
        import subprocess
        import sys
        script = ("import os, sys\n"
                  "from drive_intake import _single_writer\n"
                  "with _single_writer(sys.argv[1]):\n"
                  "    os._exit(17)\n")
        child = subprocess.run([sys.executable, "-c", script, str(self.state)],
                               cwd=str(Path(__file__).resolve().parent),
                               capture_output=True, timeout=10)
        self.assertEqual(child.returncode, 17, child.stderr)
        self.assertTrue(Path(str(self.state) + ".lock").is_file())
        result = self.sync(FakeDrive([]))
        self.assertEqual(result["imported"], 0)
        self.assertTrue(Path(str(self.state) + ".lock").is_file())

    def test_other_process_cannot_enter_while_live_worker_holds_lock(self):
        import subprocess
        import sys
        from drive_intake import _single_writer
        script = ("import sys\n"
                  "from drive_intake import _single_writer, Hold\n"
                  "try:\n"
                  "    with _single_writer(sys.argv[1]):\n"
                  "        sys.exit(8)\n"
                  "except Hold as exc:\n"
                  "    sys.exit(4 if str(exc) == 'INTAKE_ALREADY_RUNNING' else 5)\n")
        with _single_writer(self.state):
            child = subprocess.run([sys.executable, "-c", script, str(self.state)],
                                   cwd=str(Path(__file__).resolve().parent),
                                   capture_output=True, timeout=10)
            self.assertEqual(child.returncode, 4, child.stderr)
        self.assertEqual(self.sync(FakeDrive([]))["imported"], 0)

    def test_crash_between_media_commit_and_state_write_recovers_without_download(self):
        from unittest import mock
        raw = b"synthetic-crash-video-bytes" * 9
        client = FakeDrive([(fixture("sampleVID123456789", raw), raw)])
        # The media rename happens before the manifest write; simulate an
        # abrupt failure in exactly that gap, then restart independently.
        with mock.patch("drive_intake._atomic_json",
                        side_effect=RuntimeError("synthetic-crash-before-state")):
            with self.assertRaisesRegex(RuntimeError, "synthetic-crash-before-state"):
                self.sync(client)
        self.assertEqual(client.downloads, 1)
        self.assertFalse(self.state.exists())
        committed = list(self.inbox.glob("owner_*.mp4"))
        self.assertEqual(len(committed), 1)
        self.assertEqual(hashlib.sha256(committed[0].read_bytes()).hexdigest(),
                         hashlib.sha256(raw).hexdigest())
        recovered = self.sync(client)
        self.assertEqual(recovered["imported"], 1)
        self.assertEqual(client.downloads, 1)
        self.assertEqual(self.sync(client)["already_present"], 1)
        self.assertEqual(client.downloads, 1)

    def test_symlink_lock_cannot_redirect_private_lock(self):
        self.state.parent.mkdir(parents=True)
        other = self.root / "unrelated-private-record"
        other.write_bytes(b"must-stay-unchanged")
        try:
            Path(str(self.state) + ".lock").symlink_to(other)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks require local OS privilege")
        with self.assertRaisesRegex(Hold, "UNSAFE_PRIVATE_LOCK_SYMLINK"):
            self.sync(FakeDrive([]))
        self.assertEqual(other.read_bytes(), b"must-stay-unchanged")

    def test_same_md5_but_changed_provider_version_is_hold(self):
        old = b"content"
        d = FakeDrive([(fixture("sampleVID123456789", old), old)])
        self.sync(d)
        d.files = [(fixture("sampleVID123456789", old, version="2"), old)]
        self.assertEqual(self.sync(d)["hold"], 1)
        self.assertEqual(d.downloads, 1)

    def test_second_file_with_md5_collision_claim_must_be_downloaded_and_refused(self):
        real = b"example-01"
        fake = b"example-02"  # same length but different actual checksum
        x = fixture("sampleVID123456789", real)
        y = fixture("secondVID123456789", real)
        d = FakeDrive([(x, real), (y, fake)])  # falsified MD5 metadata on second
        result = self.sync(d)
        self.assertEqual(result["imported"], 1)
        self.assertEqual(result["hold"], 1)
        self.assertEqual(result["duplicate"], 0)
        self.assertEqual(d.downloads, 2)
        self.assertEqual(len(list(self.inbox.glob("owner_*.mp4"))), 1)

    def test_drive_client_does_not_accept_bad_access_token(self):
        with self.assertRaisesRegex(Hold, "OAUTH_NOT_CONNECTED"):
            DriveHTTP("")

    def test_bearer_token_is_never_forwarded_to_http_redirect(self):
        # Pure transport test, no Google network or OAuth credentials used.
        from urllib import request
        handler = _RejectRedirect()
        initial = request.Request(
            "https://www.googleapis.com/drive/v3/files/abcde0123456?alt=media",
            headers={"Authorization": "Bearer dummy-not-real"})
        with self.assertRaisesRegex(Hold, "DRIVE_REDIRECT_REQUIRES_REVIEW"):
            handler.redirect_request(initial, None, 302, "Moved", {},
                                     "https://example.com/collect")
        # URL prefix is insufficient: files.evil must not be accepted as files.
        with self.assertRaisesRegex(Hold, "UNEXPECTED_REMOTE_HOST"):
            DriveHTTP("dummy-not-real")._open(
                "https://www.googleapis.com/drive/v3/files.evil.com")

    def test_oauth_refresh_rejects_redirects_without_exposing_secrets(self):
        # Offline regression: token refresh must use a no-redirect transport.
        # All values here are fake, with no real Google network or OAuth access.
        import os
        from unittest import mock
        from urllib import request
        from drive_intake import oauth_token_from_env, TOKEN_URL

        class FakeOpener:
            def open(self, req, timeout=None):
                self_req = req
                assert self_req.full_url == TOKEN_URL
                assert self_req.get_method() == 'POST'
                assert b'refresh_token=fake-refresh-token' in self_req.data
                return contextlib.closing(io.BytesIO(b'{"access_token":"synthetic-access"}'))

        def reject_redirects_factory(handler):
            self.assertIsInstance(handler, _RejectRedirect)
            outgoing = request.Request(TOKEN_URL, data=b'synthetic-fake-credentials', method='POST')
            with self.assertRaisesRegex(Hold, 'DRIVE_REDIRECT_REQUIRES_REVIEW'):
                handler.redirect_request(outgoing, None, 307, 'Temporary Redirect', {},
                                         'https://not-google.invalid/harvest')
            return FakeOpener()

        fake_env = {
            'HUB_NATURAL_GOOGLE_CLIENT_ID': 'fake-client-id',
            'HUB_NATURAL_GOOGLE_CLIENT_SECRET': 'fake-client-secret',
            'HUB_NATURAL_GOOGLE_REFRESH_TOKEN': 'fake-refresh-token',
        }
        with mock.patch.dict(os.environ, fake_env, clear=True):
            with mock.patch('drive_intake.request.build_opener',
                            side_effect=reject_redirects_factory) as opener_factory:
                with mock.patch('drive_intake.request.urlopen',
                                side_effect=AssertionError('unsafe default redirect opener called')):
                    self.assertEqual(oauth_token_from_env(), 'synthetic-access')
                opener_factory.assert_called_once()

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
