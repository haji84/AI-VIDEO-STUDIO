"""FFmpeg-made synthetic videos only: exercise the full bounded poll to queue."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from drive_intake import Hold
from bounded_intake_poll import run_cycles
from new_arrival_job import run_once

FOLDER = "SyntheticInboxFake0000001"


class FakeDrive:
    def __init__(self, first_id, first_bytes):
        self.sources = {}
        self.add(first_id, first_bytes)
        self.list_calls = 0
        self.media_calls = []

    def add(self, file_id, data):
        self.sources[file_id] = data

    def _meta(self, file_id):
        data = self.sources[file_id]
        return {
            "id": file_id, "mimeType": "video/mp4",
            "md5Checksum": hashlib.md5(data).hexdigest(),
            "size": str(len(data)), "version": "1",
            "modifiedTime": "2026-01-01T00:00:00Z",
            "trashed": False, "parents": [FOLDER],
        }

    def list_files(self, folder_id):
        if folder_id != FOLDER:
            raise AssertionError("UNEXPECTED_FOLDER")
        self.list_calls += 1
        return [self._meta(file_id) for file_id in sorted(self.sources)]

    def file_metadata(self, file_id):
        return self._meta(file_id)

    def media(self, file_id):
        self.media_calls.append(file_id)
        return contextlib.closing(io.BytesIO(self.sources[file_id]))


class SyntheticIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = tempfile.TemporaryDirectory()
        path = Path(cls.sources.name)
        cls.payloads = []
        for color in ("blue", "red"):
            output = path / (color + ".mp4")
            subprocess.run([
                "ffmpeg", "-hide_banner", "-y", "-v", "error",
                "-f", "lavfi", "-i", f"color=c={color}:s=320x180:r=25:d=2",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(output)
            ], check=True, timeout=30)
            cls.payloads.append(output.read_bytes())
        if hashlib.sha256(cls.payloads[0]).digest() == hashlib.sha256(cls.payloads[1]).digest():
            raise AssertionError("SYNTHETIC_FIXTURES_IDENTICAL")

    @classmethod
    def tearDownClass(cls):
        cls.sources.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name) / "owner-private"
        self.inbox = root / "media"
        self.state = root / "state" / "intake.json"
        self.catalog = root / "state" / "catalog.json"
        self.queue = root / "state" / "review.json"
        self.client = FakeDrive("syntheticVideoFile00001", self.payloads[0])

    def check(self):
        return run_once(self.client, FOLDER, self.inbox, self.state,
                        self.catalog, self.queue)

    def test_first_second_arrival_then_idempotent_third_poll(self):
        sleeps = []

        def between_checks(seconds):
            sleeps.append(seconds)
            if len(sleeps) == 1:
                self.client.add("syntheticVideoFile00002", self.payloads[1])

        report = run_cycles(self.check, cycles=3, interval_seconds=60,
                            require_later_arrival=True, sleep_fn=between_checks)
        self.assertEqual(report["checks"], 3)
        self.assertEqual(report["newImportsAfterFirstCheck"], 1)
        self.assertEqual(report["newImports"], 2)
        self.assertEqual(report["newlyQueued"], 2)
        self.assertEqual(report["lastQueuePending"], 2)
        self.assertEqual(report["status"], "INTAKE_ONLY_REVIEW_REQUIRED")
        self.assertEqual(report["publishing"], "NOT_PERFORMED")
        self.assertEqual(self.client.media_calls,
                         ["syntheticVideoFile00001", "syntheticVideoFile00002"])
        self.assertEqual(self.client.list_calls, 3)
        self.assertEqual(sleeps, [60, 60])
        record = json.loads(self.queue.read_text(encoding="utf-8"))
        self.assertEqual(record["sourceCount"], 2)
        self.assertEqual(record["semanticRecognition"], "NOT_PERFORMED")
        self.assertEqual(record["publishing"], "NOT_PERFORMED")
        actual = {hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in self.inbox.glob("owner_*.mp4")}
        expected = {hashlib.sha256(data).hexdigest() for data in self.payloads}
        self.assertEqual(actual, expected)

    def test_original_corrupted_between_polls_stops_before_second_drive_list(self):
        initial_queue = []

        def damage_between_checks(_seconds):
            source = next(self.inbox.glob("owner_*.mp4"))
            initial_queue.append(self.queue.read_bytes())
            source.write_bytes(b"corrupted-synthetic-file")

        with self.assertRaisesRegex(
                Hold, "PREVIOUS_QUEUED_SOURCE_MISSING_OR_CHANGED"):
            run_cycles(self.check, cycles=3, interval_seconds=60,
                       sleep_fn=damage_between_checks)
        self.assertEqual(len(initial_queue), 1)
        self.assertEqual(self.queue.read_bytes(), initial_queue[0])
        self.assertEqual(self.client.list_calls, 1)
        self.assertEqual(self.client.media_calls, ["syntheticVideoFile00001"])


if __name__ == "__main__":
    unittest.main()
