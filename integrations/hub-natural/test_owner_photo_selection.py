"""Synthetic-only offline tests; no real media, OAuth, Drive or posting."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from owner_photo_selection import SCHEMA, Hold, confirm, preview, main


@unittest.skipUnless(os.name == "posix", "owner ACL gate is POSIX-only")
class OwnerPhotoSelectionTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name) / "private"
        self.root.mkdir(mode=0o700)
        self.selection = self.root / "selected.json"
        self.receipt = self.root / "receipt.json"
        self.a = self.root / "selected_a.mp4"
        self.b = self.root / "selected_b.mov"
        self.a.write_bytes(b"synthetic-fake-video-A" * 7)
        self.b.write_bytes(b"synthetic-fake-video-A" * 7)
        self.a.chmod(0o600)
        self.b.chmod(0o600)
        self.choose([self.a, self.b])

    def choose(self, paths, *, approved=True):
        self.selection.write_text(json.dumps({
            "schema": SCHEMA, "ownerSelected": approved,
            "selectedFiles": [str(path) for path in paths],
        }))
        self.selection.chmod(0o600)

    def test_preview_verifies_sha_and_content_duplicates_without_writes(self):
        result = preview(self.selection)
        self.assertEqual(result["selectedCount"], 2)
        self.assertEqual(result["uniqueContentCount"], 1)
        self.assertEqual(result["duplicateContentCount"], 1)
        self.assertEqual(result["assets"][0]["sha256"],
                         hashlib.sha256(self.a.read_bytes()).hexdigest())
        self.assertEqual(result["mediaTransfer"], "NOT_PERFORMED")
        self.assertFalse(self.receipt.exists())
        self.assertEqual(len(list(self.root.iterdir())), 3)

    def test_confirm_requires_pinned_preview_and_never_replaces(self):
        pin = preview(self.selection)["selectionSHA256"]
        with self.assertRaisesRegex(Hold, "PHOTO_SELECTION_CHANGED_CONFIRM_AGAIN"):
            confirm(self.selection, self.receipt, "0" * 64)
        self.assertFalse(self.receipt.exists())
        answer = confirm(self.selection, self.receipt, pin)
        self.assertEqual(answer["status"], "OWNER_SELECTION_FROZEN_NOT_IMPORTED")
        self.assertEqual(self.receipt.stat().st_mode & 0o777, 0o600)
        saved = self.receipt.read_text()
        self.assertNotIn(str(self.root), saved)
        self.assertNotIn("selected_a", saved)
        self.assertIn(pin, saved)
        with self.assertRaisesRegex(Hold, "PHOTO_SELECTION_RECEIPT_ALREADY_EXISTS"):
            confirm(self.selection, self.receipt, pin)
        self.assertEqual(saved, self.receipt.read_text())

    def test_identical_content_selection_count_is_frozen(self):
        # Two explicitly selected copies must not inherit approval for one copy.
        original = preview(self.selection)
        self.assertEqual(original["selectedCount"], 2)
        self.assertEqual(original["uniqueContentCount"], 1)
        pin = original["selectionSHA256"]
        self.choose([self.a])
        reduced = preview(self.selection)
        self.assertEqual(reduced["selectedCount"], 1)
        self.assertEqual(reduced["uniqueContentCount"], 1)
        self.assertNotEqual(reduced["selectionSHA256"], pin)
        with self.assertRaisesRegex(Hold, "PHOTO_SELECTION_CHANGED_CONFIRM_AGAIN"):
            confirm(self.selection, self.receipt, pin)
        self.assertFalse(self.receipt.exists())

    def test_identical_content_selected_extension_is_frozen(self):
        # Same bytes, different selected video suffixes are distinct consent.
        self.choose([self.a])
        pin = preview(self.selection)["selectionSHA256"]
        self.choose([self.b])
        self.assertNotEqual(preview(self.selection)["selectionSHA256"], pin)
        with self.assertRaisesRegex(Hold, "PHOTO_SELECTION_CHANGED_CONFIRM_AGAIN"):
            confirm(self.selection, self.receipt, pin)
        self.assertFalse(self.receipt.exists())

    def test_unapproved_selection_and_mutated_file_hold(self):
        self.choose([self.a], approved=False)
        with self.assertRaisesRegex(Hold, "PHOTO_SELECTION_INVALID"):
            preview(self.selection)
        self.choose([self.a])
        pinned = preview(self.selection)["selectionSHA256"]
        self.a.write_bytes(b"changed-synthetic-video")
        with self.assertRaisesRegex(Hold, "PHOTO_SELECTION_CHANGED_CONFIRM_AGAIN"):
            confirm(self.selection, self.receipt, pinned)
        self.assertFalse(self.receipt.exists())

    def test_duplicate_path_nonprivate_source_and_symlink_hold(self):
        self.choose([self.a, self.a])
        with self.assertRaisesRegex(Hold, "PHOTO_SELECTION_DUPLICATE_PATH"):
            preview(self.selection)
        self.choose([self.a])
        self.a.chmod(0o644)
        with self.assertRaisesRegex(Hold, "PHOTO_SELECTION_VIDEO_UNSAFE"):
            preview(self.selection)
        self.a.chmod(0o600)
        symlink = self.root / "linked.mp4"
        symlink.symlink_to(self.a)
        self.choose([symlink])
        with self.assertRaisesRegex(Hold, "PHOTO_SELECTION_PATH_UNSAFE"):
            preview(self.selection)
        self.assertFalse(self.receipt.exists())

    def test_cli_is_network_free_and_does_not_echo_private_paths(self):
        with mock.patch("socket.socket", side_effect=AssertionError("network forbidden")):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(main(["preview", "--selection-file", str(self.selection)]), 0)
        answer = output.getvalue()
        self.assertIn("OWNER_SELECTION_PREVIEW_NOT_IMPORTED", answer)
        self.assertNotIn(str(self.root), answer)
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(main(["preview", "--selection-file", str(self.selection),
                                   "--unknown", "PRIVATE_FAKE_TOKEN_12345"]), 2)
        self.assertEqual(json.loads(output.getvalue())["reason"],
                         "PHOTO_SELECTION_ARGUMENTS_INVALID")
        self.assertNotIn("PRIVATE_FAKE_TOKEN", output.getvalue())


if __name__ == "__main__":
    unittest.main()
