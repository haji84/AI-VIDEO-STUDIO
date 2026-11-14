"""Offline-only private checkpoint transfer contract tests (no real IDs/media)."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from drive_intake import Hold
from drive_blinded_baseline import observe_blinded
from drive_checkpoint_exchange import (
    prepare_private_upload, verify_private_readback,
)
from test_drive_metadata_inventory import FOLDER, NoMediaFake, video

KEY = bytes(range(32))
OTHER = bytes(range(1, 33))


class PrivateCheckpointReadbackTests(unittest.TestCase):
    def checkpoint(self):
        _report, checkpoint = observe_blinded(
            NoMediaFake([video("syntheticVideoFile00001")]), FOLDER, key=KEY)
        return checkpoint

    def pair(self):
        return prepare_private_upload(self.checkpoint(), FOLDER, key=KEY)

    def test_exact_bytes_and_sha_hmac_verified_without_media(self):
        blob, receipt = self.pair()
        restored, report = verify_private_readback(
            blob, receipt, FOLDER, key=KEY)
        self.assertEqual(restored, self.checkpoint())
        self.assertEqual(report["status"],
                         "PRIVATE_METADATA_CHECKPOINT_READBACK_VERIFIED")
        self.assertEqual(report["sha256"], hashlib.sha256(blob).hexdigest())
        self.assertEqual(receipt["contentSHA256"], "NOT_COMPUTED")
        self.assertFalse(receipt["newArrivalsAcknowledged"])
        for private in ("syntheticVideoFile00001", FOLDER, "md5Checksum"):
            self.assertNotIn(private, blob.decode())
            self.assertNotIn(private, json.dumps(receipt))

    def test_independent_process_reopens_a_private_copy(self):
        blob, receipt = self.pair()
        with tempfile.TemporaryDirectory() as temp:
            raw = Path(temp) / "private-checkpoint.json"
            meta = Path(temp) / "verified-receipt.json"
            raw.write_bytes(blob)
            meta.write_text(json.dumps(receipt), encoding="utf-8")
            before = raw.read_bytes()
            # This is an entirely different Python interpreter; the
            # secret is deterministic synthetic test data, never a real key.
            script = r'''
import json, sys
from pathlib import Path
from drive_checkpoint_exchange import verify_private_readback
from test_drive_metadata_inventory import FOLDER
doc, result = verify_private_readback(
    Path(sys.argv[1]).read_bytes(),
    json.loads(Path(sys.argv[2]).read_text(encoding="utf-8")),
    FOLDER, key=bytes(range(32)))
assert len(doc["entries"]) == 1
assert result["newArrivalsAcknowledged"] is False
print(json.dumps(result, sort_keys=True))
'''
            child = subprocess.run(
                [sys.executable, "-c", script, str(raw), str(meta)],
                cwd=str(Path(__file__).resolve().parent),
                capture_output=True, text=True, timeout=20,
            )
            self.assertEqual(child.returncode, 0, child.stderr)
            output = json.loads(child.stdout)
            self.assertEqual(output["sha256"], hashlib.sha256(blob).hexdigest())
            self.assertEqual(raw.read_bytes(), before)

    def test_changed_remote_payload_or_underrun_holds(self):
        blob, receipt = self.pair()
        with self.assertRaisesRegex(Hold, "READBACK_SHA_MISMATCH"):
            verify_private_readback(
                blob[:-2] + b"X\n", receipt, FOLDER, key=KEY)
        with self.assertRaisesRegex(Hold, "READBACK_SIZE_MISMATCH"):
            verify_private_readback(
                blob[:-1], receipt, FOLDER, key=KEY)
        with self.assertRaisesRegex(Hold, "READBACK_SIZE_MISMATCH"):
            verify_private_readback(
                b"", receipt, FOLDER, key=KEY)

    def test_wrong_key_and_folder_hold_even_if_sha_matches(self):
        blob, receipt = self.pair()
        with self.assertRaisesRegex(Hold, "WRONG_FOLDER_OR_KEY"):
            verify_private_readback(
                blob, receipt, FOLDER, key=OTHER)
        with self.assertRaisesRegex(Hold, "WRONG_FOLDER_OR_KEY"):
            verify_private_readback(
                blob, receipt, "SyntheticOtherFolder0001", key=KEY)

    def test_missing_modified_or_excess_receipt_rejected(self):
        blob, receipt = self.pair()
        invalid = [
            None, {}, {**receipt, "newArrivalsAcknowledged": True},
            {**receipt, "contentSHA256": receipt["sha256"]},
            {**receipt, "sizeBytes": True},
            {**receipt, "sizeBytes": -1},
            {**receipt, "sha256": "0" * 64, "extra": "maybe"},
            {**receipt, "sha256": "not-sha"},
        ]
        for item in invalid:
            with self.subTest(item=str(item)[:30]):
                with self.assertRaisesRegex(Hold, "RECEIPT_INVALID"):
                    verify_private_readback(blob, item, FOLDER, key=KEY)

    def test_duplicate_json_keys_fail_even_if_receipt_hash_is_updated(self):
        blob, receipt = self.pair()
        duplicated = b'{"schema":"a","schema":"b"}'
        modified = {**receipt, "sha256": hashlib.sha256(duplicated).hexdigest(),
                    "sizeBytes": len(duplicated)}
        with self.assertRaisesRegex(Hold, "READBACK_INVALID_JSON"):
            verify_private_readback(duplicated, modified, FOLDER, key=KEY)

    def test_metadata_new_arrival_not_automatically_accepted(self):
        client = NoMediaFake([video("syntheticVideoFile00001")])
        _report, old = observe_blinded(client, FOLDER, key=KEY)
        blob, receipt = prepare_private_upload(old, FOLDER, key=KEY)
        client.entries.append(video("syntheticVideoFile00002"))
        one, _ = observe_blinded(client, FOLDER, key=KEY, baseline=old)
        restored, _ = verify_private_readback(blob, receipt, FOLDER, key=KEY)
        two, _ = observe_blinded(client, FOLDER, key=KEY, baseline=restored)
        self.assertEqual(one["newCandidates"], 1)
        self.assertEqual(two["newCandidates"], 1)
        self.assertEqual(client.downloads, 0)


if __name__ == "__main__":
    unittest.main()
