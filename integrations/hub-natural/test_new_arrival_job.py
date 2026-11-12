"""Synthetic media only. No Google credentials, no outside video, no posting."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from drive_intake import Hold
from new_arrival_job import run_once,SCHEMA

FOLDER='SyntheticInboxFake0000001'

class Client:
    def __init__(self, data):
        self.data=data;self.calls=0;self.meta={'id':'syntheticFile00000001','mimeType':'video/mp4',
        'md5Checksum':hashlib.md5(data).hexdigest(),'size':str(len(data)),
        'version':'1','modifiedTime':'2026-01-01T00:00:00Z','trashed':False,'parents':[FOLDER]}
    def list_files(self, folder):
        if folder!=FOLDER:raise AssertionError
        return [self.meta.copy()]
    def file_metadata(self, file_id):
        if file_id!=self.meta['id']:raise AssertionError
        return self.meta.copy()
    def media(self, file_id):
        self.calls+=1
        return contextlib.closing(io.BytesIO(self.data))

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src=tempfile.TemporaryDirectory(); cls.addPath=Path(cls.src.name)/'fixture.mp4'
        subprocess.run(['ffmpeg','-hide_banner','-y','-v','error','-f','lavfi','-i','color=c=black:s=320x180:r=25:d=2',
                        '-c:v','libx264','-pix_fmt','yuv420p',str(cls.addPath)],check=True)
        cls.bytes=cls.addPath.read_bytes()
    @classmethod
    def tearDownClass(cls):cls.src.cleanup()
    def setUp(self):
        self.t=tempfile.TemporaryDirectory();self.addCleanup(self.t.cleanup)
        r=Path(self.t.name)
        self.inbox=r/'private'/'media';self.state=r/'private'/'state.json'
        self.cat=r/'private'/'catalog.json';self.queue=r/'private'/'queue.json'
        self.client=Client(self.bytes)
    def run_job(self):return run_once(self.client,FOLDER,self.inbox,self.state,self.cat,self.queue)
    def test_first_new_arrival_then_repeat_without_second_download(self):
        first=self.run_job();self.assertEqual(first['newImports'],1)
        self.assertEqual(first['draftsMade'],0)
        self.assertEqual(first['queuePending'],1)
        q=json.loads(self.queue.read_text())
        self.assertEqual(q['schema'],SCHEMA)
        self.assertEqual(q['assets'][0]['sceneStatus'],'NEEDS_SEMANTIC_REVIEW')
        self.assertEqual(q['semanticRecognition'],'NOT_PERFORMED')
        self.assertEqual(q['publishing'],'NOT_PERFORMED')
        self.assertEqual(self.client.calls,1)
        self.assertEqual(self.run_job()['newImports'],0)
        self.assertEqual(self.client.calls,1)
        self.assertEqual(hashlib.sha256(next(self.inbox.glob('owner_*.mp4')).read_bytes()).hexdigest(),
                         hashlib.sha256(self.bytes).hexdigest())
    def test_repeated_schedule_does_not_enqueue_same_asset_again(self):
        first = self.run_job()
        self.assertEqual(first['newlyQueued'], 1)
        before = self.queue.read_bytes()
        second = self.run_job()
        self.assertEqual(second['newlyQueued'], 0)
        self.assertEqual(second['queuePending'], 1)
        self.assertEqual(self.client.calls, 1)
        after = json.loads(self.queue.read_text())
        self.assertEqual(after['assets'], json.loads(before)['assets'])

    def test_parallel_job_is_blocked_before_source_or_queue_changes(self):
        from drive_intake import _single_writer
        with _single_writer(self.queue):
            with self.assertRaisesRegex(Hold, 'INTAKE_ALREADY_RUNNING'):
                self.run_job()
        self.assertEqual(self.client.calls, 0)
        self.assertFalse(self.queue.exists())
        self.assertEqual(self.run_job()['newlyQueued'], 1)
        self.assertEqual(self.client.calls, 1)

    def test_job_restart_after_crash_before_scan_keeps_original_and_queues_once(self):
        from unittest import mock
        with mock.patch('new_arrival_job.pipeline.scan',
                        side_effect=RuntimeError('simulated-stop-before-queue')):
            with self.assertRaisesRegex(RuntimeError, 'simulated-stop-before-queue'):
                self.run_job()
        self.assertEqual(self.client.calls, 1)
        self.assertFalse(self.queue.exists())
        restarted = self.run_job()
        self.assertEqual(restarted['newImports'], 0)
        self.assertEqual(restarted['newlyQueued'], 1)
        self.assertEqual(self.client.calls, 1)
        self.assertEqual(self.run_job()['newlyQueued'], 0)

    def test_hard_killed_queue_worker_can_restart_without_manual_unlock(self):
        import sys
        script = ("import os, sys\n"
                  "from drive_intake import _single_writer\n"
                  "with _single_writer(sys.argv[1]):\n"
                  "    os._exit(23)\n")
        child = subprocess.run([sys.executable, "-c", script, str(self.queue)],
                               cwd=str(Path(__file__).resolve().parent),
                               capture_output=True, timeout=10)
        self.assertEqual(child.returncode, 23, child.stderr)
        self.assertEqual(self.run_job()['newlyQueued'], 1)
        self.assertEqual(self.client.calls, 1)


    def test_independent_process_hard_crash_then_new_arrival_then_idempotent_replay(self):
        """Four separate worker processes and two actual FFmpeg-made synthetic MP4s.

        Process 1 dies after committing the first media file but before state.
        Process 2 independently reattaches media without downloading it.
        Process 3 sees a second incoming video and downloads only that one.
        Process 4 reruns with both files and downloads neither. No OAuth/post.
        """
        import sys
        second = Path(self.t.name) / 'second_synthetic.mp4'
        subprocess.run([
            'ffmpeg', '-hide_banner', '-y', '-v', 'error',
            '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=25:d=2',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(second)
        ], check=True, timeout=30)
        source1 = self.addPath
        self.assertNotEqual(hashlib.sha256(source1.read_bytes()).hexdigest(),
                            hashlib.sha256(second.read_bytes()).hexdigest())
        script = r'''
import contextlib, hashlib, io, json, os, sys
from pathlib import Path
import drive_intake
from new_arrival_job import run_once
from test_new_arrival_job import FOLDER

media1 = Path(sys.argv[1]).read_bytes()
media2 = Path(sys.argv[2]).read_bytes()
root = Path(sys.argv[3])
stage = sys.argv[4]
inbox = root / "private" / "media"
state = root / "private" / "state.json"
catalog = root / "private" / "catalog.json"
queue = root / "private" / "queue.json"
entries = [("syntheticFile00000001", media1)]
if stage in ("arrival", "repeat"):
    entries.append(("syntheticFile00000002", media2))

class DiskDrive:
    def __init__(self):
        self.downloads = []
        self.data = dict(entries)
        self.meta = {
            file_id: {
                "id": file_id, "mimeType": "video/mp4",
                "md5Checksum": hashlib.md5(data).hexdigest(),
                "size": str(len(data)), "version": "1",
                "modifiedTime": "2026-01-01T00:00:00Z",
                "trashed": False, "parents": [FOLDER]
            } for file_id, data in entries
        }
    def list_files(self, folder_id):
        assert folder_id == FOLDER
        return [dict(entry) for entry in self.meta.values()]
    def file_metadata(self, file_id):
        return dict(self.meta[file_id])
    def media(self, file_id):
        if stage == "recover" or (stage in ("arrival", "repeat") and file_id == "syntheticFile00000001"):
            raise AssertionError("PREVIOUS_MEDIA_WAS_DOWNLOADED_AGAIN")
        self.downloads.append(file_id)
        return contextlib.closing(io.BytesIO(self.data[file_id]))

client = DiskDrive()
if stage == "die":
    original = drive_intake._atomic_json
    def hard_exit_after_media_rename(path, value):
        if Path(path) == state:
            os._exit(39)
        return original(path, value)
    drive_intake._atomic_json = hard_exit_after_media_rename
result = run_once(client, FOLDER, inbox, state, catalog, queue)
print(json.dumps({"result": result, "downloads": client.downloads}))
'''
        def invoke(stage):
            return subprocess.run([
                sys.executable, '-c', script, str(source1), str(second),
                str(self.t.name), stage
            ], cwd=str(Path(__file__).resolve().parent),
                capture_output=True, text=True, timeout=30)

        crashed = invoke('die')
        self.assertEqual(crashed.returncode, 39, crashed.stderr)
        self.assertFalse(self.state.exists())
        self.assertFalse(self.queue.exists())
        self.assertEqual(len(list(self.inbox.glob('owner_*.mp4'))), 1)
        self.assertTrue(Path(str(self.state) + '.lock').is_file())

        recovered = invoke('recover')
        self.assertEqual(recovered.returncode, 0, recovered.stderr)
        first = json.loads(recovered.stdout)
        self.assertEqual(first['downloads'], [])
        self.assertEqual(first['result']['newImports'], 1)
        self.assertEqual(first['result']['newlyQueued'], 1)

        arrived = invoke('arrival')
        self.assertEqual(arrived.returncode, 0, arrived.stderr)
        second_run = json.loads(arrived.stdout)
        self.assertEqual(second_run['downloads'], ['syntheticFile00000002'])
        self.assertEqual(second_run['result']['newImports'], 1)
        self.assertEqual(second_run['result']['newlyQueued'], 1)
        self.assertEqual(second_run['result']['queuePending'], 2)

        repeated = invoke('repeat')
        self.assertEqual(repeated.returncode, 0, repeated.stderr)
        last = json.loads(repeated.stdout)
        self.assertEqual(last['downloads'], [])
        self.assertEqual(last['result']['newImports'], 0)
        self.assertEqual(last['result']['newlyQueued'], 0)
        self.assertEqual(last['result']['queuePending'], 2)
        self.assertEqual(json.loads(self.queue.read_text())['publishing'], 'NOT_PERFORMED')
        originals = sorted(self.inbox.glob('owner_*.mp4'))
        self.assertEqual(len(originals), 2)
        saved_sha = {hashlib.sha256(p.read_bytes()).hexdigest() for p in originals}
        expected_sha = {hashlib.sha256(source1.read_bytes()).hexdigest(),
                        hashlib.sha256(second.read_bytes()).hexdigest()}
        self.assertEqual(saved_sha, expected_sha)

    def test_unexpected_queue_status_mutation_fails_closed(self):
        self.run_job()
        doc = json.loads(self.queue.read_text())
        doc['assets'][0]['sceneStatus'] = 'APPROVED_WITHOUT_EVIDENCE'
        self.queue.write_text(json.dumps(doc))
        with self.assertRaisesRegex(Hold, 'PREVIOUS_QUEUE_SOURCE_OR_STATUS_CHANGED'):
            self.run_job()

    def test_corrupted_existing_original_cannot_be_treated_as_new_safe_media(self):
        self.run_job()
        source=next(self.inbox.glob('owner_*.mp4'))
        source.write_bytes(b'corruption')
        again=self.run_job()
        self.assertGreaterEqual(again['held'],1)  # intake and scan may flag same damaged source independently
        self.assertGreaterEqual(again['queuePending'],0)
        self.assertEqual(self.client.calls,1)
    def test_no_report_or_state_inside_source_inbox(self):
        with self.assertRaisesRegex(Hold,'REPORTS_MUST_BE_OUTSIDE_MEDIA_INBOX'):
            run_once(self.client,FOLDER,self.inbox,self.state,self.inbox/'catalog.json',self.queue)
        self.assertEqual(self.client.calls,0)
    def test_no_private_artifact_in_git_worktree(self):
        repo=Path(self.t.name)/'test-repo';repo.mkdir();(repo/'.git').mkdir()
        with self.assertRaisesRegex(Hold,'PRIVATE_STORAGE_CANNOT_BE_INSIDE_GIT'):
            run_once(self.client,FOLDER,repo/'video',self.state,self.cat,self.queue)

if __name__=='__main__':unittest.main()
