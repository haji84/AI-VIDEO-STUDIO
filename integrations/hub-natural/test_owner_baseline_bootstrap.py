"""Synthetic owner baseline two-step approval and private key isolation tests."""
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from drive_intake import Hold
from drive_checkpoint_store import compare_with_saved_checkpoint
from owner_baseline_bootstrap import (
    preview_owner_baseline, confirm_owner_baseline,
    read_owner_key, _separate_key_and_checkpoint, main,
)
from test_drive_metadata_inventory import FOLDER, NoMediaFake, video

KEY = bytes(range(32))


class OwnerTwoPhaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.checkpoint_dir = self.root / "checkpoint"
        self.key_dir = self.root / "key"
        self.checkpoint_dir.mkdir(mode=0o700)
        self.key_dir.mkdir(mode=0o700)
        self.checkpoint = self.checkpoint_dir / "owner-baseline.json"
        self.key_file = self.key_dir / "secret.bin"
        self.key_file.write_bytes(KEY)
        if os.name == "posix":
            self.key_file.chmod(0o600)
        self.client = NoMediaFake([video("syntheticFile0000001")])

    def preview(self):
        return preview_owner_baseline(self.client, FOLDER, key=KEY)

    def initialize(self, *, digest=None, confirmed=True):
        if digest is None:
            digest = self.preview()["checkpointPreviewSHA256"]
        return confirm_owner_baseline(
            self.client, FOLDER, key=KEY,
            checkpoint_path=self.checkpoint,
            expected_preview_sha256=digest,
            owner_confirmed=confirmed,
        )

    def test_preview_is_metadata_only_and_never_writes_a_checkpoint(self):
        report = self.preview()
        self.assertEqual(report["status"], "OWNER_CONFIRMATION_REQUIRED")
        self.assertEqual(report["videoCandidates"], 1)
        self.assertIsNone(report["newCandidates"])
        self.assertEqual(report["contentSHA256"], "NOT_COMPUTED")
        self.assertFalse(report["newArrivalsAcknowledged"])
        self.assertFalse(self.checkpoint.exists())
        self.assertEqual(self.client.downloads, 0)
        for secret in ("syntheticFile0000001", FOLDER, "DO_NOT_REPORT"):
            self.assertNotIn(secret, json.dumps(report))

    def test_confirm_exact_preview_then_read_same_signed_state(self):
        preview = self.preview()
        result = self.initialize(digest=preview["checkpointPreviewSHA256"])
        self.assertEqual(result["status"], "PRIVATE_BASELINE_INITIALIZED_UNACKNOWLEDGED")
        self.assertEqual(result["checkpointSHA256"], preview["checkpointPreviewSHA256"])
        self.assertEqual(result["independentRestore"], "NOT_VERIFIED_ON_OWNER_HOST")
        self.assertTrue(self.checkpoint.is_file())
        before = self.checkpoint.read_bytes()
        observed = compare_with_saved_checkpoint(
            self.client, FOLDER, key=KEY, path=self.checkpoint)
        self.assertEqual(observed["newCandidates"], 0)
        self.assertEqual(self.checkpoint.read_bytes(), before)
        self.assertEqual(self.client.downloads, 0)

    def test_new_candidate_is_never_acknowledged_by_repeated_comparisons(self):
        self.initialize()
        before = self.checkpoint.read_bytes()
        self.client.entries.append(video("syntheticFile0000002", b"new-fake"))
        a = compare_with_saved_checkpoint(
            self.client, FOLDER, key=KEY, path=self.checkpoint)
        b = compare_with_saved_checkpoint(
            self.client, FOLDER, key=KEY, path=self.checkpoint)
        self.assertEqual((a["newCandidates"], b["newCandidates"]), (1, 1))
        self.assertEqual(self.checkpoint.read_bytes(), before)
        self.assertEqual(self.client.downloads, 0)

    def test_changed_remote_snapshot_requires_another_human_confirmation(self):
        preview = self.preview()
        self.client.entries.append(video("syntheticFile0000002", b"new-fake"))
        before = self.client.lists
        with self.assertRaisesRegex(Hold, "OWNER_PREVIEW_CHANGED_CONFIRM_AGAIN"):
            self.initialize(digest=preview["checkpointPreviewSHA256"])
        self.assertEqual(self.client.lists, before + 1)
        self.assertFalse(self.checkpoint.exists())
        self.assertEqual(self.client.downloads, 0)

    def test_missing_owner_confirmation_rejected_before_remote_list(self):
        before = self.client.lists
        with self.assertRaisesRegex(Hold, "OWNER_BASELINE_CONFIRMATION_REQUIRED"):
            confirm_owner_baseline(
                self.client, FOLDER, key=KEY, checkpoint_path=self.checkpoint,
                expected_preview_sha256="0" * 64)
        with self.assertRaisesRegex(Hold, "OWNER_PREVIEW_SHA256_REQUIRED"):
            confirm_owner_baseline(
                self.client, FOLDER, key=KEY, checkpoint_path=self.checkpoint,
                expected_preview_sha256="incorrect", owner_confirmed=True)
        self.assertEqual(self.client.lists, before)
        self.assertFalse(self.checkpoint.exists())

    def test_initialized_checkpoint_cannot_be_overwritten_or_reconfirmed(self):
        self.initialize()
        original = self.checkpoint.read_bytes()
        before = self.client.lists
        with self.assertRaisesRegex(Hold, "PRIVATE_CHECKPOINT_ALREADY_EXISTS"):
            self.initialize(digest="f" * 64)
        self.assertEqual(self.client.lists, before)
        self.assertEqual(self.checkpoint.read_bytes(), original)

    def test_missing_or_damaged_checkpoint_never_rebaselines(self):
        self.initialize()
        self.checkpoint.write_bytes(b"not-a-valid-checkpoint")
        before = self.client.lists
        with self.assertRaises(Hold):
            compare_with_saved_checkpoint(
                self.client, FOLDER, key=KEY, path=self.checkpoint)
        self.assertEqual(self.client.lists, before)
        self.assertEqual(self.client.downloads, 0)

    def test_key_and_checkpoint_cannot_share_a_directory(self):
        with self.assertRaisesRegex(Hold, "OWNER_KEY_MUST_BE_STORED_SEPARATELY"):
            _separate_key_and_checkpoint(
                self.checkpoint_dir / "key.bin", self.checkpoint)
        _separate_key_and_checkpoint(self.key_file, self.checkpoint)

    @unittest.skipUnless(os.name == "posix", "POSIX owner-key ACL contract")
    def test_owner_key_file_privacy_and_symlink_attacks(self):
        self.assertEqual(read_owner_key(self.key_file), KEY)
        alias = self.key_dir / "alias.bin"
        alias.symlink_to(self.key_file)
        with self.assertRaisesRegex(Hold, "OWNER_KEY_SYMLINK_REFUSED"):
            read_owner_key(alias)
        self.key_file.chmod(0o644)
        with self.assertRaisesRegex(Hold, "OWNER_KEY_FILE_UNSAFE"):
            read_owner_key(self.key_file)
        self.key_file.chmod(0o600)
        self.key_dir.chmod(0o755)
        with self.assertRaisesRegex(Hold, "OWNER_KEY_PARENT_NOT_PRIVATE"):
            read_owner_key(self.key_file)

    @unittest.skipUnless(os.name == "posix", "POSIX owner-key file contract")
    def test_missing_short_and_git_tracked_key_fail_closed(self):
        self.key_file.write_bytes(b"short")
        with self.assertRaisesRegex(Hold, "OWNER_KEY_FILE_UNSAFE"):
            read_owner_key(self.key_file)
        self.key_file.unlink()
        with self.assertRaisesRegex(Hold, "OWNER_KEY_UNAVAILABLE"):
            read_owner_key(self.key_file)
        repo = self.root / "publicrepo"
        repo.mkdir(mode=0o700)
        (repo / ".git").mkdir()
        secret = repo / "dont-commit-key.bin"
        secret.write_bytes(KEY)
        secret.chmod(0o600)
        with self.assertRaisesRegex(Hold, "PRIVATE_STORAGE_CANNOT_BE_INSIDE_GIT"):
            read_owner_key(secret)

    def test_command_does_not_start_drive_client_without_owner_key(self):
        with mock.patch("owner_baseline_bootstrap.DriveHTTP",
                        side_effect=AssertionError("NO_NETWORK_WITHOUT_KEY")):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as captured:
                missing = self.key_dir / "nonexistent.bin"
                status = main(["preview", "--folder-id", FOLDER,
                               "--key-file", str(missing),
                               "--checkpoint", str(self.checkpoint)])
            self.assertEqual(status, 2)
            output = json.loads(captured.getvalue())
            self.assertEqual(output["status"], "HOLD")
            self.assertNotIn(str(missing), captured.getvalue())
            self.assertEqual(self.client.downloads, 0)


if __name__ == "__main__":
    unittest.main()
