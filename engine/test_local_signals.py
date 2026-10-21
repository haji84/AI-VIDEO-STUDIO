import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from .local_signals import SignalsError,analyze_file

ID='asset_'+'c'*32

@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'ffmpeg/ffprobe required')
class SignalExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.folder=Path(cls.tmp.name)
        cls.video=cls.folder/'test.mp4'
        cmd=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i',
             'testsrc2=s=96x54:r=10:d=3','-f','lavfi','-i',
             'sine=frequency=440:sample_rate=16000:duration=3',
             '-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',str(cls.video)]
        p=subprocess.run(cmd,capture_output=True)
        if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace'))
    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()
    def test_signals_are_normalized_and_not_semantic(self):
        r=analyze_file(self.video,ID,max_seconds=3)
        self.assertEqual(r['schema'],'aivs-local-signals-v1')
        self.assertFalse(r['partial'])
        self.assertGreaterEqual(len(r['source']['windows']),1)
        self.assertNotIn('path',r)
        self.assertNotIn('path',r['source'])
        for w in r['source']['windows']:
            for key in ('contrast','motion','audioEnergy'):
                self.assertTrue(0<=w[key]<=1)
        self.assertIn('NOT_SCENE_SEMANTICS',r['limitations'])
    def test_budget_reports_partial(self):
        r=analyze_file(self.video,ID,max_seconds=1)
        self.assertTrue(r['partial'])
        self.assertLess(r['coverageSeconds'],r['source']['durationSeconds'])
    def test_refuses_untrusted_asset(self):
        with self.assertRaises(SignalsError):analyze_file(self.video,'bad',max_seconds=1)
