"""Offline synthetic restoration proof. Never uses real owners or Google OAuth."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from drive_blinded_baseline import observe_blinded
from drive_checkpoint_exchange import prepare_private_upload
from drive_checkpoint_store import (
    initialize_owner_checkpoint, compare_with_saved_checkpoint)
from drive_intake import Hold
from owner_checkpoint_restore import (
    restore_owner_checkpoint, _read_owner_private_blob,
    _separate_restore_locations, main)
from test_drive_metadata_inventory import FOLDER, NoMediaFake, video

KEY = bytes(range(32))
OTHER = bytes(range(1, 33))


class OwnerOfflineRestoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.keydir = self.root / "secret"
        self.backupdir = self.root / "backup"
        self.destdir = self.root / "restored"
        for p in (self.keydir, self.backupdir, self.destdir):
            p.mkdir(mode=0o700)
        self.keyfile = self.keydir / "hmac-key.bin"
        self.keyfile.write_bytes(KEY)
        if os.name == "posix":
            self.keyfile.chmod(0o600)
        self.checkpoint = self.destdir / "checkpoint.json"
        self.payload_path = self.backupdir / "remote-export.json"
        self.receipt_path = self.backupdir / "trusted-receipt.json"
        self.client = NoMediaFake([video("syntheticVideoFile00001")])
        _unused, cp = observe_blinded(self.client, FOLDER, key=KEY)
        self.cp = cp
        self.payload, self.receipt = prepare_private_upload(cp, FOLDER, key=KEY)
        self.pin = self.receipt["sha256"]
        self.payload_path.write_bytes(self.payload)
        self.receipt_path.write_text(
            json.dumps(self.receipt, sort_keys=True), encoding="utf-8")
        if os.name == "posix":
            self.payload_path.chmod(0o600)
            self.receipt_path.chmod(0o600)

    def restore(self, **changes):
        args = dict(
            blob=self.payload, receipt=self.receipt, folder_id=FOLDER,
            key=KEY, checkpoint_path=self.checkpoint,
            owner_pinned_sha256=self.pin, owner_confirmed=True)
        args.update(changes)
        return restore_owner_checkpoint(**args)

    def cli(self, **changes):
        args = [
            "--folder-id", FOLDER, "--key-file", str(self.keyfile),
            "--checkpoint", str(self.checkpoint),
            "--backup-payload", str(self.payload_path),
            "--backup-receipt", str(self.receipt_path),
            "--owner-pinned-sha256", self.pin,
            "--owner-confirms-restore",
        ]
        for flag, value in changes.items():
            if flag == "no_confirmation":
                args.remove("--owner-confirms-restore")
            else:
                p = args.index(flag)
                args[p + 1] = value
        return args

    def test_verified_restore_canonical_bytes_and_no_media(self):
        report = self.restore()
        self.assertEqual(
            report["status"], "OWNER_METADATA_CHECKPOINT_RESTORED_LOCALLY")
        self.assertEqual(report["checkpointSHA256"], self.pin)
        self.assertEqual(report["localReadbackSHA256"], self.pin)
        self.assertTrue(report["localReadbackVerified"])
        self.assertFalse(report["newArrivalsAcknowledged"])
        self.assertEqual(report["videoContentSHA256"], "NOT_COMPUTED")
        self.assertEqual(self.checkpoint.read_bytes(), self.payload)
        self.assertEqual(self.client.downloads, 0)
        for private in ("syntheticVideoFile00001", FOLDER, "DO_NOT_REPORT"):
            self.assertNotIn(private, json.dumps(report))

    def test_independent_process_sees_new_candidates_unchanged(self):
        self.restore()
        self.client.entries.append(video("syntheticVideoFile00002", b"new"))
        before = self.checkpoint.read_bytes()
        script = r'''
import json, sys
from drive_checkpoint_store import compare_with_saved_checkpoint
from test_drive_metadata_inventory import FOLDER, NoMediaFake, video
cli = NoMediaFake([video("syntheticVideoFile00001"),
                   video("syntheticVideoFile00002", b"new")])
out = compare_with_saved_checkpoint(
    cli, FOLDER, key=bytes(range(32)), path=sys.argv[1])
assert cli.downloads == 0
print(json.dumps(out, sort_keys=True))
'''
        for _ in range(2):
            result = subprocess.run(
                [sys.executable, "-c", script, str(self.checkpoint)],
                capture_output=True, text=True, timeout=20,
                cwd=str(Path(__file__).resolve().parent))
            self.assertEqual(result.returncode, 0, result.stderr)
            data = json.loads(result.stdout)
            self.assertEqual(data["newCandidates"], 1)
            self.assertEqual(data["checkpointState"], "OWNER_BASELINE_UNCHANGED")
            self.assertFalse(data["newArrivalsAcknowledged"])
        self.assertEqual(before, self.checkpoint.read_bytes())

    def test_denies_missing_approval_without_writing(self):
        with self.assertRaisesRegex(Hold, "RESTORE_CONFIRMATION_REQUIRED"):
            self.restore(owner_confirmed=False)
        self.assertFalse(self.checkpoint.exists())

    def test_denies_bad_or_unpinned_digest(self):
        for value in ("", "invalid", "1" * 63, None, 1234):
            with self.subTest(value=str(value)):
                with self.assertRaisesRegex(Hold, "INDEPENDENT_SHA_REQUIRED"):
                    self.restore(owner_pinned_sha256=value)
        with self.assertRaisesRegex(Hold, "INDEPENDENT_SHA_MISMATCH"):
            self.restore(owner_pinned_sha256="0" * 64)
        self.assertFalse(self.checkpoint.exists())

    def test_denies_remote_content_tamper_and_wrong_receipt(self):
        with self.assertRaisesRegex(Hold, "READBACK_SHA_MISMATCH"):
            self.restore(blob=self.payload[:-2] + b"Z\n")
        with self.assertRaisesRegex(Hold, "RECEIPT_INVALID"):
            self.restore(receipt={**self.receipt,
                                  "newArrivalsAcknowledged": True})
        self.assertFalse(self.checkpoint.exists())

    def test_wrong_key_and_folder_hold_before_file_creation(self):
        with self.assertRaisesRegex(Hold, "WRONG_FOLDER_OR_KEY"):
            self.restore(key=OTHER)
        with self.assertRaisesRegex(Hold, "WRONG_FOLDER_OR_KEY"):
            self.restore(folder_id="SyntheticOtherFolder00001")
        self.assertFalse(self.checkpoint.exists())

    def test_noncanonical_json_not_restored_even_if_receipt_matches(self):
        changed = (json.dumps(self.cp, indent=2, sort_keys=True)
                   + "\n").encode("utf-8")
        forged_receipt = {
            **self.receipt, "sizeBytes": len(changed),
            "sha256": hashlib.sha256(changed).hexdigest()}
        with self.assertRaisesRegex(Hold, "NONCANONICAL_PAYLOAD"):
            self.restore(blob=changed, receipt=forged_receipt,
                         owner_pinned_sha256=forged_receipt["sha256"])
        self.assertFalse(self.checkpoint.exists())

    def test_never_overwrites_existing_protected_checkpoint(self):
        initialize_owner_checkpoint(
            self.checkpoint, FOLDER, key=KEY, checkpoint=self.cp)
        before = self.checkpoint.read_bytes()
        with self.assertRaisesRegex(Hold, "PRIVATE_CHECKPOINT_ALREADY_EXISTS"):
            self.restore()
        self.assertEqual(before, self.checkpoint.read_bytes())
        self.assertEqual(self.client.downloads, 0)

    def test_path_separation_holds_before_any_data_read(self):
        with self.assertRaisesRegex(Hold, "RESTORE_STORAGE_NOT_SEPARATED"):
            _separate_restore_locations(
                self.keyfile, self.checkpoint, self.checkpoint, self.receipt_path)
        with self.assertRaisesRegex(Hold, "RESTORE_STORAGE_NOT_SEPARATED"):
            _separate_restore_locations(
                self.keyfile, self.checkpoint, self.keyfile, self.receipt_path)

    @unittest.skipUnless(os.name == "posix", "POSIX backup ACL only")
    def test_private_blob_rejects_symlinks_and_group_readable(self):
        self.assertEqual(_read_owner_private_blob(
            self.payload_path, 4 * 1024 * 1024), self.payload)
        alias = self.backupdir / "alias.json"
        alias.symlink_to(self.payload_path)
        with self.assertRaisesRegex(Hold, "OWNER_BACKUP_PATH_SYMLINK"):
            _read_owner_private_blob(alias, 4 * 1024 * 1024)
        self.payload_path.chmod(0o644)
        with self.assertRaisesRegex(Hold, "OWNER_BACKUP_FILE_UNSAFE"):
            _read_owner_private_blob(self.payload_path, 4 * 1024 * 1024)
        self.payload_path.chmod(0o600)
        self.backupdir.chmod(0o755)
        with self.assertRaisesRegex(Hold, "OWNER_BACKUP_DIRECTORY_UNSAFE"):
            _read_owner_private_blob(self.payload_path, 4 * 1024 * 1024)

    @unittest.skipUnless(os.name == "posix", "Owner host CLI only on POSIX")
    def test_cli_complete_offline_restore_and_external_restart(self):
        with mock.patch("owner_checkpoint_restore.print") as output:
            rc = main(self.cli())
        self.assertEqual(rc, 0)
        report = json.loads(output.call_args.args[0])
        self.assertEqual(report["localReadbackSHA256"], self.pin)
        self.assertEqual(self.checkpoint.read_bytes(), self.payload)
        self.assertEqual(self.client.downloads, 0)

    def test_cli_without_approval_does_not_touch_private_data(self):
        with mock.patch("owner_checkpoint_restore.read_owner_key",
                        side_effect=AssertionError("MUST_NOT_READ_KEY")):
            with mock.patch("owner_checkpoint_restore.print") as output:
                rc = main(self.cli(no_confirmation=True))
        self.assertEqual(rc, 2)
        self.assertEqual(json.loads(output.call_args.args[0])["status"], "HOLD")
        self.assertFalse(self.checkpoint.exists())

    def test_cli_missing_key_fails_closed_and_masks_path(self):
        args = self.cli(**{"--key-file": str(self.keydir / "missing.bin")})
        with mock.patch("owner_checkpoint_restore.print") as output:
            rc = main(args)
        self.assertEqual(rc, 2)
        result = output.call_args.args[0]
        self.assertEqual(json.loads(result)["status"], "HOLD")
        self.assertNotIn(str(self.keydir), result)
        self.assertFalse(self.checkpoint.exists())

    @unittest.skipUnless(os.name == "posix", "Owner backup file contract on POSIX")
    def test_duplicate_receipt_json_keys_rejected(self):
        self.receipt_path.write_text('{"schema":"a","schema":"b"}')
        with mock.patch("owner_checkpoint_restore.print") as output:
            rc = main(self.cli())
        self.assertEqual(rc, 2)
        self.assertEqual(json.loads(output.call_args.args[0])["reason"],
                         "OWNER_RESTORE_RECEIPT_INVALID_JSON")
        self.assertFalse(self.checkpoint.exists())


if __name__ == "__main__":
    unittest.main()
