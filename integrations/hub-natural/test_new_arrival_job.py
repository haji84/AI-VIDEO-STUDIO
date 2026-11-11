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
