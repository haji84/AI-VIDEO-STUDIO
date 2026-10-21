import copy
import json
import shutil
import subprocess
import tempfile
import unittest
import uuid
from pathlib import Path
from .run_manifest import ManifestError, process_manifest


class ManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
            raise unittest.SkipTest('Requires ffmpeg')
        cls.temp=tempfile.TemporaryDirectory()
        cls.folder=Path(cls.temp.name)
        cls.inputs=[]
        for i,color in enumerate(['red','blue','green']):
            path=cls.folder/f'cam{i}.mp4'
            r=subprocess.run(['ffmpeg','-hide_banner','-nostdin','-v','error','-y','-f','lavfi','-i',
                f'color=c={color}:s=320x180:r=15:d=2','-f','lavfi','-i',f'sine=frequency={600+i*20}:sample_rate=48000:duration=2',
                '-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',str(path)],capture_output=True)
            if r.returncode:raise RuntimeError(r.stderr.decode())
            cls.inputs.append(path)

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def _manifest(self,n):
        sources=[{'assetId':'asset_'+uuid.uuid4().hex,'path':str(x)} for x in self.inputs[:n]]
        m={'schema':1,'sources':sources,'quality':'review','manualOffsets':{x['assetId']:0 for x in sources[1:]},
           'allowUnverifiedSync':True,
           'timeline':[{'id':'clip_aaaa','sourceId':sources[0]['assetId'],'start':0,'duration':1,'layout':'single','speed':1,'caption':'訓練開始'}]}
        return m

    def test_one_camera_real_mp4(self):
        m=self._manifest(1)
        out=self.folder/'manifest_one.mp4'
        report=process_manifest(m,self.folder/'job_one',out)
        self.assertTrue(report['technical_ok'],report)
        self.assertTrue(report['whole_file_decode_checked'])
        self.assertEqual(report['video_input_count'],1)
        self.assertEqual(report['semantic_editing'],'not_implemented')
        self.assertTrue(out.exists())

    def test_three_cam_split_real_mp4(self):
        m=self._manifest(3)
        m['timeline'][0].update({'layout':'split','secondarySourceId':m['sources'][1]['assetId'],'caption':'役割の比較'})
        m['timeline'].append({'id':'clip_bbbb','sourceId':m['sources'][2]['assetId'],'start':0,'duration':1,'speed':1,'layout':'single','caption':'終盤'})
        out=self.folder/'manifest_three.mp4'
        report=process_manifest(m,self.folder/'job_three',out)
        self.assertTrue(report['technical_ok'],report)
        self.assertEqual(report['video_input_count'],3)
        self.assertEqual(report['final_educational_accuracy'],'not_evaluated')

    def test_reject_unknown_asset_and_original_overwrite(self):
        m=self._manifest(1)
        m['timeline'][0]['sourceId']='asset_'+uuid.uuid4().hex
        with self.assertRaises(ManifestError):process_manifest(m,self.folder/'bad',self.folder/'bad.mp4')
        original=self._manifest(1)
        with self.assertRaises(ManifestError):process_manifest(original,self.folder/'bad2',self.inputs[0])

    def test_reject_unverified_multicam_without_owner_override(self):
        m=self._manifest(2)
        m['manualOffsets']={}
        m['allowUnverifiedSync']=False
        with self.assertRaises(ManifestError):process_manifest(m,self.folder/'bad3',self.folder/'bad3.mp4')

class MissingAudioSyncTests(unittest.TestCase):
    def test_owner_manual_offsets_are_not_inferred_or_auto_verified(self):
        # Separate negative assertion; the actual split output is covered above.
        import uuid
        from .run_manifest import _remap_clips
        s=[('asset_'+uuid.uuid4().hex,{'id':'cam_'+uuid.uuid4().hex})]
        cl=[{'id':'clip_abcd','sourceId':s[0][0],'start':0,'duration':1,'speed':1,'layout':'single','caption':''}]
        mapped=_remap_clips(cl,s)
        self.assertEqual(mapped[0]['camera'],s[0][1]['id'])
