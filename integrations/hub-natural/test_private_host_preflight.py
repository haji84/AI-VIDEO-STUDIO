"""Synthetic and non-mutating private-host readiness tests. No real tokens/media."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from private_host_preflight import assess


class TestOwnerHostPreflight(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.addCleanup(self.t.cleanup)
        self.root = Path(self.t.name) / "owner-private"
        self.root.mkdir(mode=0o700)

    def inspect(self, env=None, root=None, ffmpeg=True):
        with mock.patch("private_host_preflight.shutil.which",
                        side_effect=lambda _: "synthetic-present" if ffmpeg else None):
            return assess(root or self.root, environ={} if env is None else env)

    def test_non_mutating_candidate_fails_closed_without_oauth(self):
        before = list(self.root.iterdir())
        x = self.inspect()
        self.assertEqual(x["status"], "NOT_PRODUCTION_VERIFIED")
        self.assertTrue(x["privateStorageCandidate"])
        self.assertFalse(x["oauthConfigPresentButUnverified"])
        self.assertIn("OWNER_OAUTH_SETUP_REQUIRED", x["blockers"])
        self.assertEqual(x["realDriveRead"], "NOT_ATTEMPTED")
        self.assertEqual(x["scheduledExecution"], "NOT_VERIFIED")
        self.assertEqual(before, list(self.root.iterdir()))

    def test_config_presence_never_claims_actual_auth(self):
        values = {
            "HUB_NATURAL_GOOGLE_CLIENT_ID": "synthetic-client-id",
            "HUB_NATURAL_GOOGLE_CLIENT_SECRET": "synthetic-client-secret",
            "HUB_NATURAL_GOOGLE_REFRESH_TOKEN": "synthetic-refresh-token",
        }
        x = self.inspect(env=values)
        self.assertTrue(x["oauthConfigPresentButUnverified"])
        self.assertNotIn("OWNER_OAUTH_SETUP_REQUIRED", x["blockers"])
        self.assertEqual(x["realDriveRead"], "NOT_ATTEMPTED")
        encoded = json.dumps(x)
        for value in values.values():
            self.assertNotIn(value, encoded)
        self.assertNotIn(str(self.root), encoded)

    def test_public_git_tree_is_rejected(self):
        repo = Path(self.t.name) / "public-code"
        (repo / ".git").mkdir(parents=True)
        folder = repo / "private"
        folder.mkdir(mode=0o700)
        x = self.inspect(root=folder)
        self.assertFalse(x["privateStorageCandidate"])
        self.assertIn("PRIVATE_STORAGE_CANNOT_BE_INSIDE_GIT", x["blockers"])

    def test_symlink_root_rejected(self):
        alias = Path(self.t.name) / "shortcut"
        try:
            alias.symlink_to(self.root, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("symlink creation not permitted")
        x = self.inspect(root=alias)
        self.assertFalse(x["privateStorageCandidate"])
        self.assertIn("PRIVATE_ROOT_SYMLINK", x["blockers"])

    def test_missing_media_tools_has_no_false_success(self):
        x = self.inspect(ffmpeg=False)
        self.assertIn("FFMPEG_OR_FFPROBE_MISSING", x["blockers"])
        self.assertFalse(x["mediaToolsAvailable"])

    @unittest.skipUnless(os.name == "posix", "POSIX permissions only")
    def test_group_readable_storage_is_not_accepted(self):
        self.root.chmod(0o755)
        x = self.inspect()
        self.assertFalse(x["privateStorageCandidate"])
        self.assertIn("PRIVATE_ROOT_POSIX_PERMISSIONS_UNSAFE", x["blockers"])


if __name__ == "__main__":
    unittest.main()
