"""Live FFmpeg smoke: generated camera -> lowres signals -> Node proposal -> MP4."""
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from .local_signals import analyze_file
from .run_manifest import process_manifest

@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe') and shutil.which('node'),
                     'ffmpeg/ffprobe/node required')
class SignalToRenderIntegration(unittest.TestCase):
    def test_three_camera_first_cut_and_technical_decode(self):
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d)
            root=Path(__file__).resolve().parent.parent
            signal_files=[];sources=[]
            for i in range(3):
                video=folder/f'camera{i}.mp4'
                r=subprocess.run(['ffmpeg','-hide_banner','-nostdin','-loglevel','error','-f','lavfi','-i',
                      f'testsrc2=s=160x90:r=12:d=4','-f','lavfi','-i',
                      f'sine=frequency={440+20*i}:sample_rate=16000:duration=4',
                      '-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',str(video)],
                      capture_output=True)
                self.assertEqual(r.returncode,0,r.stderr.decode(errors='replace'))
                asset='asset_'+format(i+1,'032x')
                doc=analyze_file(video,asset,sync_status='master' if i==0 else 'verified',max_seconds=4)
                p=folder/f'signal{i}.json'
                p.write_text(json.dumps(doc),encoding='utf-8')
                signal_files.extend(['--signals',str(p)])
                sources.append({'assetId':asset,'path':str(video)})
            output=folder/'proposal.json'
            r=subprocess.run(['node',str(root/'tools'/'compose-proposal.mjs'),*signal_files,
                 '--output',str(output)],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
            proposal=json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(proposal['evidence']['eligibleCameraCount'],3)
            self.assertTrue(proposal['reviewRequired'])
            self.assertEqual(proposal['semanticUnderstanding'],'NOT_EVALUATED')
            self.assertTrue(proposal['timeline'])
            m={'schema':1,'name':'synthetic test', 'sources':sources,'quality':'review',
               'manualOffsets':{x['assetId']:0 for x in sources[1:]},
               'allowUnverifiedSync':True,'timeline':proposal['timeline']}
            report=process_manifest(m,folder/'work',folder/'first-cut.mp4')
            self.assertTrue(report['technical_ok'],report)
            self.assertTrue(report['whole_file_decode_checked'])
            self.assertEqual(report['video_input_count'],3)
            self.assertEqual(report['semantic_editing'],'not_implemented')
