"""Synthetic zero-media tests for metadata-only Drive INBOX observation."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from drive_intake import Hold
from drive_metadata_inventory import observe, SCHEMA

FOLDER = "SyntheticFolder0000000001"


def video(file_id, payload=b"synthetic-video"):
    return {
        "id": file_id, "mimeType": "video/mp4", "size": str(len(payload)),
        "md5Checksum": hashlib.md5(payload).hexdigest(),
        "version": "1", "modifiedTime": "2026-01-01T00:00:00Z",
        # Even if a private title is present, it must not be propagated.
        "name": "DO_NOT_REPORT_owner_private_name.mp4",
    }


class NoMediaFake:
    def __init__(self, entries):
        self.entries = entries
        self.lists = 0
        self.downloads = 0
    def list_files(self, folder):
        assert folder == FOLDER
        self.lists += 1
        return [dict(x) for x in self.entries]
    def media(self, *_):
        self.downloads += 1
        raise AssertionError("MEDIA_MUST_NEVER_BE_REQUESTED")
    def file_metadata(self, *_):
        raise AssertionError("INDIVIDUAL_MEDIA_QUERY_NOT_NEEDED")


class InventoryTests(unittest.TestCase):
    def test_no_baseline_never_claims_new_arrival_or_sha(self):
        client = NoMediaFake([video("fakeVideoFile00001")])
        with tempfile.TemporaryDirectory() as scratch:
            before = list(Path(scratch).iterdir())
            # Even if a future caller tries to add a media download or file
            # write, this test rejects the side effect.
            with mock.patch("tempfile.NamedTemporaryFile", side_effect=AssertionError("NO_DISK_WRITE")):
                report, snapshot = observe(client, FOLDER)
            self.assertEqual(list(Path(scratch).iterdir()), before)
        self.assertEqual(report["status"], "METADATA_ONLY_UNVERIFIED")
        self.assertIsNone(report["newCandidates"])
        self.assertEqual(report["newness"], "UNKNOWN_NO_PRIVATE_BASELINE")
        self.assertEqual(report["contentSHA256"], "NOT_COMPUTED")
        self.assertEqual(report["mediaDownload"], "NOT_PERFORMED")
        self.assertEqual(client.downloads, 0)
        self.assertEqual(snapshot["schema"], SCHEMA)
        self.assertEqual(snapshot["folder"], FOLDER)
        self.assertEqual(len(snapshot["items"]), 1)
        encoded = json.dumps(report)
        self.assertNotIn("fakeVideoFile00001", encoded)
        self.assertNotIn("DO_NOT_REPORT", encoded)
        self.assertNotIn("md5Checksum", encoded)

    def test_private_baseline_comparison_marks_new_without_download(self):
        client = NoMediaFake([video("fakeVideoFile00001")])
        original, snapshot = observe(client, FOLDER)
        self.assertIsNone(original["newCandidates"])
        client.entries.append(video("fakeVideoFile00002", b"another-synthetic-video"))
        current, _ = observe(client, FOLDER, baseline=snapshot)
        self.assertEqual(current["newCandidates"], 1)
        self.assertEqual(current["unchangedCandidates"], 1)
        self.assertEqual(current["videoCandidates"], 2)
        self.assertEqual(client.downloads, 0)
        stable, _ = observe(client, FOLDER, baseline=snapshot)
        self.assertEqual(stable["newCandidates"], 1)
        self.assertEqual(client.downloads, 0)

    def test_modified_source_fails_closed_even_with_same_bytes(self):
        client = NoMediaFake([video("fakeVideoFile00001")])
        _, snapshot = observe(client, FOLDER)
        client.entries[0]["version"] = "2"
        with self.assertRaisesRegex(Hold, "DRIVE_METADATA_CHANGED_SINCE_BASELINE"):
            observe(client, FOLDER, baseline=snapshot)
        self.assertEqual(client.downloads, 0)

    def test_missing_previous_file_fails_closed(self):
        client = NoMediaFake([video("fakeVideoFile00001")])
        _, snapshot = observe(client, FOLDER)
        client.entries = []
        with self.assertRaisesRegex(Hold, "PREVIOUS_VIDEO_NO_LONGER_VISIBLE"):
            observe(client, FOLDER, baseline=snapshot)

    def test_wrong_folder_and_untrusted_baselines_rejected_before_list(self):
        client = NoMediaFake([])
        cases = [
            {"schema": SCHEMA, "folder": "OtherFolder000001", "items": {}},
            {"schema": SCHEMA, "folder": FOLDER, "items": {"bad": {}}},
            {"schema": "unexpected-schema", "folder": FOLDER, "items": {}},
        ]
        for case in cases:
            with self.subTest(case=case["schema"]):
                with self.assertRaises(Hold):
                    observe(client, FOLDER, baseline=case)
        self.assertEqual(client.lists, 0)

    def test_duplicate_ids_and_missing_integrity_metadata_rejected(self):
        entry = video("fakeVideoFile00001")
        with self.assertRaisesRegex(Hold, "DRIVE_DUPLICATE_ID_IN_PAGE"):
            observe(NoMediaFake([entry, entry]), FOLDER)
        bad = dict(entry)
        bad.pop("md5Checksum")
        with self.assertRaisesRegex(Hold, "DRIVE_VIDEO_INTEGRITY_METADATA_MISSING"):
            observe(NoMediaFake([bad]), FOLDER)
        empty = video("fakeVideoFile00001", b"")
        with self.assertRaisesRegex(Hold, "DRIVE_VIDEO_EMPTY"):
            observe(NoMediaFake([empty]), FOLDER)

    def test_nonvideos_are_counted_not_downloaded(self):
        client = NoMediaFake([{"id": "fakeNonVideo00001", "mimeType": "text/plain"}])
        r, snapshot = observe(client, FOLDER)
        self.assertEqual(r["unsupportedEntries"], 1)
        self.assertEqual(r["videoCandidates"], 0)
        self.assertEqual(snapshot["items"], {})
        self.assertEqual(client.downloads, 0)


if __name__ == "__main__":
    unittest.main()
