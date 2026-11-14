"""Offline-only regression for blinded Drive metadata checkpoints."""
import json
import unittest

from drive_intake import Hold
from drive_blinded_baseline import observe_blinded
from test_drive_metadata_inventory import FOLDER, NoMediaFake, video

KEY = bytes(range(32))
OTHER = bytes(range(1, 33))


class BlindedCheckpointTests(unittest.TestCase):
    def test_first_observation_is_not_new_and_leaks_no_identifier(self):
        source = video("fakeVideoFile00001")
        client = NoMediaFake([source])
        report, checkpoint = observe_blinded(client, FOLDER, key=KEY)
        self.assertIsNone(report["newCandidates"])
        self.assertEqual(report["contentSHA256"], "NOT_COMPUTED")
        self.assertEqual(client.downloads, 0)
        self.assertEqual(client.lists, 1)
        encoded = json.dumps(checkpoint)
        for private in ("fakeVideoFile00001", FOLDER,
                        source["md5Checksum"], source["name"]):
            self.assertNotIn(private, encoded)
        self.assertEqual(len(checkpoint["entries"]), 1)
        self.assertEqual(len(checkpoint["mac"]), 64)

    def test_changed_candidate_and_replayed_candidate_are_not_acknowledged(self):
        client = NoMediaFake([video("fakeVideoFile00001")])
        _, baseline = observe_blinded(client, FOLDER, key=KEY)
        client.entries.append(video("fakeVideoFile00002", b"fresh-synthetic"))
        first, future = observe_blinded(client, FOLDER, key=KEY, baseline=baseline)
        second, _ = observe_blinded(client, FOLDER, key=KEY, baseline=baseline)
        self.assertEqual((first["newCandidates"], second["newCandidates"]), (1, 1))
        self.assertEqual(first["unchangedCandidates"], 1)
        self.assertEqual(client.downloads, 0)
        # Explicit re-baselining changes comparison, but is NOT proof of
        # processing and must never be done automatically by this module.
        after, _ = observe_blinded(client, FOLDER, key=KEY, baseline=future)
        self.assertEqual(after["newCandidates"], 0)

    def test_deleted_and_modified_existing_hold_without_media(self):
        client = NoMediaFake([video("fakeVideoFile00001")])
        _, baseline = observe_blinded(client, FOLDER, key=KEY)
        client.entries[0]["version"] = "2"
        with self.assertRaisesRegex(Hold, "DRIVE_METADATA_CHANGED"):
            observe_blinded(client, FOLDER, key=KEY, baseline=baseline)
        client.entries = []
        with self.assertRaisesRegex(Hold, "PREVIOUS_VIDEO_NO_LONGER_VISIBLE"):
            observe_blinded(client, FOLDER, key=KEY, baseline=baseline)
        self.assertEqual(client.downloads, 0)

    def test_bad_checkpoint_rejected_before_network(self):
        client = NoMediaFake([])
        _, baseline = observe_blinded(client, FOLDER, key=KEY)
        count = client.lists
        corrupt = json.loads(json.dumps(baseline))
        corrupt["mac"] = "f" * 64
        cases = [corrupt, {}, {**baseline, "extra": 1},
                 {**baseline, "entries": {"PRIVATE_FILE_ID": "a" * 64}},
                 {**baseline, "entries": {"b" * 64: "c" * 64}},
                 {**baseline, "mac": 123}]
        for case in cases:
            with self.subTest(case=str(case)[:50]), self.assertRaises(Hold):
                observe_blinded(client, FOLDER, key=KEY, baseline=case)
        with self.assertRaisesRegex(Hold, "WRONG_FOLDER_OR_KEY"):
            observe_blinded(client, FOLDER, key=OTHER, baseline=baseline)
        with self.assertRaisesRegex(Hold, "WRONG_FOLDER_OR_KEY"):
            observe_blinded(client, "DifferentFolder000001", key=KEY, baseline=baseline)
        self.assertEqual(client.lists, count)

    def test_reject_key_under_32_bytes_without_network(self):
        client = NoMediaFake([])
        for key in (b"", b"1" * 31, "string-is-not-byte-secret", None):
            with self.assertRaisesRegex(Hold, "PRIVATE_CHECKPOINT_KEY_REQUIRED"):
                observe_blinded(client, FOLDER, key=key)
        self.assertEqual(client.lists, 0)

    def test_serialization_roundtrip_without_media(self):
        client = NoMediaFake([video("fakeVideoFile00001")])
        _, baseline = observe_blinded(client, FOLDER, key=KEY)
        roundtripped = json.loads(json.dumps(baseline, sort_keys=True))
        report, current = observe_blinded(
            client, FOLDER, key=KEY, baseline=roundtripped)
        self.assertEqual(report["newCandidates"], 0)
        self.assertEqual(report["unchangedCandidates"], 1)
        self.assertEqual(roundtripped, current)

    def test_nonvideo_only_never_implies_media_processing(self):
        client = NoMediaFake([{"id": "nonvideo00000001", "mimeType": "text/plain"}])
        report, checkpoint = observe_blinded(client, FOLDER, key=KEY)
        self.assertEqual(report["videoCandidates"], 0)
        self.assertEqual(report["unsupportedEntries"], 1)
        self.assertEqual(checkpoint["entries"], {})
        self.assertEqual(report["drafts"], "NOT_GENERATED")
        self.assertEqual(report["publication"], "NOT_PERFORMED")


if __name__ == "__main__":
    unittest.main()
