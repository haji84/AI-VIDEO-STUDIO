"""Pure-synthetic, cross-process checkpoint storage and restart regression.

Never uses real media, Drive OAuth, credentials, Google network, or publication.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from drive_intake import Hold
from drive_blinded_baseline import observe_blinded
from drive_checkpoint_store import (
    compare_with_saved_checkpoint, initialize_owner_checkpoint,
)
from test_drive_metadata_inventory import FOLDER, NoMediaFake, video

KEY = bytes(range(32))
OTHER = bytes(range(1, 33))


class PrivateDurableCheckpointTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.private = Path(self.tmp.name) / "private"
        self.private.mkdir(mode=0o700)
        self.checkpoint = self.private / "metadata-baseline.json"
        self.client = NoMediaFake([video("fakeVideoFile00001")])

    def approved_checkpoint(self):
        _unverified_report, checkpoint = observe_blinded(
            self.client, FOLDER, key=KEY)
        return checkpoint

    def initialize(self):
        return initialize_owner_checkpoint(
            self.checkpoint, FOLDER, key=KEY,
            checkpoint=self.approved_checkpoint())

    def compare(self, key=KEY, folder=FOLDER):
        return compare_with_saved_checkpoint(
            self.client, folder, key=key, path=self.checkpoint)

    def child(self, script, *arguments):
        return subprocess.run(
            [sys.executable, "-c", script, str(self.checkpoint), *arguments],
            cwd=str(Path(__file__).resolve().parent), capture_output=True,
            text=True, timeout=15)

    def test_initialization_is_private_atomic_and_never_acks_media(self):
        initial = self.initialize()
        self.assertEqual(initial["status"], "PRIVATE_BASELINE_INITIALIZED_UNACKNOWLEDGED")
        self.assertFalse(initial["newArrivalsAcknowledged"])
        self.assertEqual(initial["videoContentSHA256"], "NOT_COMPUTED")
        raw = self.checkpoint.read_bytes()
        for sensitive in (b"fakeVideoFile00001", FOLDER.encode(), b"md5Checksum"):
            self.assertNotIn(sensitive, raw)
        self.assertTrue(self.checkpoint.is_file())
        self.assertTrue(Path(str(self.checkpoint) + ".lock").is_file())
        if os.name == "posix":
            self.assertEqual(self.checkpoint.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.compare()["newCandidates"], 0)
        self.assertEqual(self.checkpoint.read_bytes(), raw)
        self.assertEqual(self.client.downloads, 0)

    def test_explicit_initialization_never_overwrites_a_previous_checkpoint(self):
        original = self.approved_checkpoint()
        self.initialize()
        before = self.checkpoint.read_bytes()
        with self.assertRaisesRegex(Hold, "PRIVATE_CHECKPOINT_ALREADY_EXISTS"):
            initialize_owner_checkpoint(
                self.checkpoint, FOLDER, key=KEY, checkpoint=original)
        self.assertEqual(self.checkpoint.read_bytes(), before)

    def test_new_candidate_remains_unacknowledged_across_real_process_restarts(self):
        self.initialize()
        before = self.checkpoint.read_bytes()
        script = r'''
import json, sys
from drive_checkpoint_store import compare_with_saved_checkpoint
from test_drive_metadata_inventory import FOLDER, NoMediaFake, video
entries = [video("fakeVideoFile00001")]
if sys.argv[2] == "new":
    entries.append(video("fakeVideoFile00002", b"second-real-FFmpeg-not-needed"))
report = compare_with_saved_checkpoint(
    NoMediaFake(entries), FOLDER, key=bytes(range(32)), path=sys.argv[1])
print(json.dumps(report, sort_keys=True))
'''
        same = self.child(script, "same")
        first_new = self.child(script, "new")
        second_new = self.child(script, "new")
        for child in (same, first_new, second_new):
            self.assertEqual(child.returncode, 0, child.stderr)
        self.assertEqual(json.loads(same.stdout)["newCandidates"], 0)
        for child in (first_new, second_new):
            report = json.loads(child.stdout)
            self.assertEqual(report["newCandidates"], 1)
            self.assertEqual(report["checkpointState"], "OWNER_BASELINE_UNCHANGED")
            self.assertFalse(report["newArrivalsAcknowledged"])
            self.assertEqual(report["contentSHA256"], "NOT_COMPUTED")
            self.assertEqual(report["mediaDownload"], "NOT_PERFORMED")
        self.assertEqual(self.checkpoint.read_bytes(), before)
        self.assertEqual(self.client.downloads, 0)

    def test_tampered_wrong_folder_wrong_key_and_missing_hold_before_drive(self):
        self.initialize()
        client = NoMediaFake([video("fakeVideoFile00001")])
        with self.assertRaisesRegex(Hold, "WRONG_FOLDER_OR_KEY"):
            compare_with_saved_checkpoint(
                client, FOLDER, key=OTHER, path=self.checkpoint)
        with self.assertRaisesRegex(Hold, "WRONG_FOLDER_OR_KEY"):
            compare_with_saved_checkpoint(
                client, "DifferentFolder000001", key=KEY, path=self.checkpoint)
        self.assertEqual(client.lists, 0)

        document = json.loads(self.checkpoint.read_text())
        document["mac"] = "0" * 64
        self.checkpoint.write_text(json.dumps(document))
        with self.assertRaisesRegex(Hold, "TAMPERED"):
            compare_with_saved_checkpoint(
                client, FOLDER, key=KEY, path=self.checkpoint)
        self.assertEqual(client.lists, 0)
        self.checkpoint.unlink()
        with self.assertRaisesRegex(Hold, "PRIVATE_CHECKPOINT_MISSING"):
            compare_with_saved_checkpoint(
                client, FOLDER, key=KEY, path=self.checkpoint)
        self.assertEqual(client.lists, 0)

    def test_missing_or_insecure_path_cannot_initialize_or_use_baseline(self):
        good = self.approved_checkpoint()
        missing = self.private / "nonexistent" / "baseline.json"
        with self.assertRaisesRegex(Hold, "PRIVATE_CHECKPOINT_DIRECTORY_MISSING"):
            initialize_owner_checkpoint(missing, FOLDER, key=KEY,
                                        checkpoint=good)
        alias = self.private / "alias.json"
        self.initialize()
        try:
            alias.symlink_to(self.checkpoint)
        except (OSError, NotImplementedError):
            self.skipTest("local symlink privileges unavailable")
        with self.assertRaisesRegex(Hold, "PRIVATE_CHECKPOINT_PATH_SYMLINK"):
            compare_with_saved_checkpoint(
                self.client, FOLDER, key=KEY, path=alias)

    def test_publish_crash_before_link_never_creates_fake_baseline(self):
        # Hard-exit process 1 after fsynced staging but before atomic publish.
        script = r'''
import os, sys
from unittest import mock
from drive_blinded_baseline import observe_blinded
from drive_checkpoint_store import initialize_owner_checkpoint
from test_drive_metadata_inventory import FOLDER, NoMediaFake, video
_, baseline = observe_blinded(
    NoMediaFake([video("fakeVideoFile00001")]), FOLDER,
    key=bytes(range(32)))
with mock.patch("drive_checkpoint_store.os.link",
                side_effect=lambda *_: os._exit(42)):
    initialize_owner_checkpoint(
        sys.argv[1], FOLDER, key=bytes(range(32)), checkpoint=baseline)
'''
        dead = self.child(script)
        self.assertEqual(dead.returncode, 42, dead.stderr)
        self.assertFalse(self.checkpoint.exists())
        with self.assertRaisesRegex(Hold, "PRIVATE_CHECKPOINT_MISSING"):
            self.compare()
        # The owner-confirmed initial checkpoint may be explicitly retried.
        self.initialize()
        self.assertEqual(self.compare()["newCandidates"], 0)
        self.assertEqual(self.client.downloads, 0)

    def test_publish_crash_after_link_can_recover_authenticated_checkpoint(self):
        # Process 1 dies in the hardlink-to-cleanup gap; process 2 validates
        # the MAC and removes ONLY the matching published temp link.
        script = r'''
import os, sys
from unittest import mock
from drive_blinded_baseline import observe_blinded
from drive_checkpoint_store import initialize_owner_checkpoint
from test_drive_metadata_inventory import FOLDER, NoMediaFake, video
_, baseline = observe_blinded(
    NoMediaFake([video("fakeVideoFile00001")]), FOLDER,
    key=bytes(range(32)))
real_link = os.link
def publish_then_die(pending, final):
    real_link(pending, final)
    os._exit(43)
with mock.patch("drive_checkpoint_store.os.link",
                side_effect=publish_then_die):
    initialize_owner_checkpoint(
        sys.argv[1], FOLDER, key=bytes(range(32)), checkpoint=baseline)
'''
        dead = self.child(script)
        self.assertEqual(dead.returncode, 43, dead.stderr)
        self.assertTrue(self.checkpoint.exists())
        self.assertEqual(self.checkpoint.stat().st_nlink, 2)
        pending = list(self.private.glob(".hub-natural-checkpoint-pending-*.tmp"))
        self.assertEqual(len(pending), 1)
        restart = self.child(r'''
import json, sys
from drive_checkpoint_store import compare_with_saved_checkpoint
from test_drive_metadata_inventory import FOLDER, NoMediaFake, video
r = compare_with_saved_checkpoint(
    NoMediaFake([video("fakeVideoFile00001")]), FOLDER,
    key=bytes(range(32)), path=sys.argv[1])
print(json.dumps(r))
''')
        self.assertEqual(restart.returncode, 0, restart.stderr)
        self.assertEqual(json.loads(restart.stdout)["newCandidates"], 0)
        self.assertEqual(self.checkpoint.stat().st_nlink, 1)
        self.assertEqual(list(self.private.glob(".hub-natural-checkpoint-pending-*.tmp")), [])
        self.assertEqual(self.compare()["newCandidates"], 0)

    def test_ambiguous_hardlink_refused_without_removal(self):
        self.initialize()
        elsewhere = self.private / "unrelated-link.json"
        try:
            os.link(self.checkpoint, elsewhere)
        except OSError:
            self.skipTest("hardlinks unsupported on CI filesystem")
        with self.assertRaisesRegex(Hold, "PRIVATE_CHECKPOINT_HARDLINK_AMBIGUOUS"):
            self.compare()
        self.assertTrue(elsewhere.exists())
        elsewhere.unlink()
        self.assertEqual(self.compare()["newCandidates"], 0)

    @unittest.skipUnless(os.name == "posix", "POSIX owner permissions only")
    def test_group_readable_baseline_holds_before_drive(self):
        self.initialize()
        self.checkpoint.chmod(0o644)
        before = self.client.lists
        with self.assertRaisesRegex(Hold, "PRIVATE_CHECKPOINT_FILE_NOT_OWNER_ONLY"):
            self.compare()
        self.assertEqual(self.client.lists, before)


if __name__ == "__main__":
    unittest.main()
