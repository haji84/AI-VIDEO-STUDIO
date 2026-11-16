"""Offline contract tests for M1 remote access: no fake proof of real iPhone access."""
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from mac_remote_readiness import SCHEMA, TESTS, check_private_metadata_root, inspect, main


class RemoteReadinessTests(unittest.TestCase):
    def test_native_m1_process_still_needs_real_iphone_remote_test(self):
        r = inspect(system="Darwin", arch="arm64",
                    python_version=(3, 12), launchctl=True)
        self.assertEqual(r["schema"], SCHEMA)
        self.assertEqual(r["environmentBlockers"], [])
        self.assertTrue(r["nativeArm64Process"])
        self.assertFalse(r["productionRemoteVerified"])
        self.assertEqual(r["remoteControlOffNetwork"], "NOT_TESTED")
        self.assertEqual(r["status"], "HOLD_REMOTE_IPHONE_TEST_NOT_VERIFIED")
        self.assertEqual(set(r["requiredOwnerTests"]), set(TESTS))
        self.assertEqual(r["localVideoRetention"], "DISABLED")

    def test_linux_ci_does_not_claim_owner_mac_success(self):
        r = inspect(system="Linux", arch="x86_64",
                    python_version=(3, 12), launchctl=False)
        self.assertIn("NOT_RUNNING_ON_OWNER_MAC", r["environmentBlockers"])
        self.assertIn("LAUNCHD_NOT_DISCOVERED", r["environmentBlockers"])
        self.assertFalse(r["productionRemoteVerified"])

    def test_rosetta_detection_does_not_claim_m1_hardware_identity(self):
        r = inspect(system="Darwin", arch="x86_64",
                    python_version=(3, 12), launchctl=True)
        self.assertIn("ARM64_PYTHON_OR_ROSETTA_REVIEW_REQUIRED",
                      r["environmentBlockers"])
        self.assertFalse(r["nativeArm64Process"])

    def test_older_python_and_unrecognized_launchd_are_blocked(self):
        r = inspect(system="Darwin", arch="arm64",
                    python_version=(3, 10), launchctl=False)
        self.assertIn("PYTHON_311_REQUIRED", r["environmentBlockers"])
        self.assertIn("LAUNCHD_NOT_DISCOVERED", r["environmentBlockers"])
        self.assertFalse(r["productionRemoteVerified"])

    def test_bad_version_facts_never_raise_or_become_ready(self):
        for invalid in ("3.12", (3,), (True, 12), (-1, 0), [3, "12"]):
            with self.subTest(v=invalid):
                r = inspect(system="Darwin", arch="arm64",
                            python_version=invalid, launchctl=True)
                self.assertIn("PYTHON_311_REQUIRED", r["environmentBlockers"])
                self.assertFalse(r["productionRemoteVerified"])

    def test_output_has_no_paths_tokens_names_and_never_claims_video(self):
        r = inspect(system="Darwin", arch="arm64",
                    python_version=(3, 12), launchctl=True)
        raw = json.dumps(r, sort_keys=True)
        for forbidden in ("access_token", "refresh_token", "file_id",
                          "password", "privateHostname", "ownerEmail"):
            self.assertNotIn(forbidden, raw)
        self.assertEqual(r["actualHmacKeyAndDriveOAuth"], "NOT_CONNECTED")
        self.assertEqual(r["localVideoIngest"], "DISABLED")
        self.assertEqual(r["localVideoRender"], "DISABLED")

    def test_cli_is_read_only_and_always_holds_without_iphone_proof(self):
        with mock.patch("mac_remote_readiness.inspect",
                        return_value=inspect(system="Darwin", arch="arm64",
                                             python_version=(3, 12), launchctl=True)):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as output:
                rc = main([])
        self.assertEqual(rc, 2)
        record = json.loads(output.getvalue())
        self.assertEqual(record["remoteControlOffNetwork"], "NOT_TESTED")
        self.assertFalse(record["productionRemoteVerified"])


    def test_metadata_root_missing_and_relative_path_fail_closed(self):
        with tempfile.TemporaryDirectory() as d:
            missing = Path(d) / "no-such-private-root"
            for root, reason in (
                (str(missing), "OWNER_METADATA_ROOT_MISSING_OR_NOT_DIRECTORY"),
                ("relative-private-state", "OWNER_METADATA_ROOT_ABSOLUTE_PATH_REQUIRED"),
                ("", "OWNER_METADATA_ROOT_INVALID"),
                (42, "OWNER_METADATA_ROOT_INVALID"),
            ):
                with self.subTest(reason=reason):
                    self.assertEqual(check_private_metadata_root(root), (reason, False))

    @unittest.skipUnless(os.name == "posix", "POSIX owner/mode rules")
    def test_existing_owner_only_metadata_root_is_candidate_not_activated(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "owner-only"
            root.mkdir(mode=0o700)
            report = inspect(system="Darwin", arch="arm64",
                             python_version=(3, 12), launchctl=True,
                             metadata_root=str(root))
            self.assertTrue(report["metadataPrivateRootCandidate"])
            self.assertEqual(report["metadataPrivateRootReadOnlyCheck"],
                             "PRIVATE_METADATA_ROOT_CANDIDATE_NOT_ACTIVATED")
            self.assertFalse(report["metadataHostActivated"])
            self.assertFalse(report["productionRemoteVerified"])
            self.assertEqual(report["backgroundStateManagement"], "NOT_CONNECTED")
            self.assertNotIn(str(root), json.dumps(report))

    @unittest.skipUnless(os.name == "posix", "POSIX owner/mode rules")
    def test_metadata_root_group_access_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "group-readable"
            root.mkdir(mode=0o700)
            root.chmod(0o750)
            self.assertEqual(check_private_metadata_root(str(root)),
                             ("OWNER_METADATA_ROOT_NOT_OWNER_ONLY", False))

    def test_git_worktree_root_is_rejected_without_reading_files(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            (base / ".git").mkdir()
            root = base / "private"
            root.mkdir()
            self.assertEqual(check_private_metadata_root(str(root)),
                             ("OWNER_METADATA_ROOT_INSIDE_GIT", False))

    @unittest.skipUnless(os.name == "posix", "symlink test requires POSIX")
    def test_symlink_root_and_symlink_parent_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            real = base / "real"
            real.mkdir(mode=0o700)
            alias = base / "alias"
            alias.symlink_to(real, target_is_directory=True)
            self.assertEqual(check_private_metadata_root(str(alias)),
                             ("OWNER_METADATA_ROOT_SYMLINK", False))
            self.assertEqual(check_private_metadata_root(str(alias / "nested")),
                             ("OWNER_METADATA_ROOT_SYMLINK", False))

    def test_metadata_cli_never_prints_private_root_or_claims_remote_pass(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "owner"
            root.mkdir(mode=0o700)
            with mock.patch("sys.stdout", new_callable=io.StringIO) as output:
                rc = main(["--metadata-root", str(root)])
            self.assertEqual(rc, 2)
            raw = output.getvalue()
            self.assertNotIn(str(root), raw)
            report = json.loads(raw)
            self.assertFalse(report["productionRemoteVerified"])
            self.assertFalse(report["metadataHostActivated"])
            self.assertEqual(report["localVideoRetention"], "DISABLED")


if __name__ == "__main__":
    unittest.main()
