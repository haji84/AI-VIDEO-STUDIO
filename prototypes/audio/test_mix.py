import json
import math
import subprocess
import tempfile
import unittest
from pathlib import Path

import mix_audio


def ffmpeg(*args):
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True,capture_output=True)


class TestAudioMix(unittest.TestCase):
    def test_parameters_and_duck(self):
        self.assertIn('between(t\\,1.000\\,1.800)', mix_audio._volume_expr([[1,1.8]],.2))
        with self.assertRaises(ValueError):
            mix_audio._check_ranges([[2,1]], 4)
        with self.assertRaises(ValueError):
            mix_audio._value(float('nan'), 'volume',0,1)

    def test_video_without_original_audio(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)
            movie=p/'silent.mp4'
            out=p/'with_sound.mp4'
            beep=p/'beep.wav'
            ffmpeg('-f','lavfi','-i','color=c=green:s=160x90:r=15:d=2',
                   '-c:v','libx264','-pix_fmt','yuv420p','-an',movie)
            ffmpeg('-f','lavfi','-i','sine=frequency=550:duration=0.4:sample_rate=48000',beep)
            res=mix_audio.render({'schemaVersion':'0.3.1-audio',
                                  'sourceVideo':str(movie),'output':str(out),'durationSec':2,
                                  'sfx':[{'path':str(beep),'startSec':.8,'trimSec':.35}]})
            self.assertEqual(res['status'],'PASS')
            self.assertEqual(res['tracks'],['original','sfx0'])

    def test_synthetic_mix_no_voice_service(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)
            original=p/'original.mp4'
            bgm=p/'bgm.wav'
            sfx=p/'sfx.wav'
            narration=p/'narration.wav'
            out=p/'mixed.mp4'
            ffmpeg('-f','lavfi','-i','color=c=blue:s=160x90:r=15:d=4',
                   '-f','lavfi','-i','sine=frequency=220:duration=4:sample_rate=48000',
                   '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',original)
            for hz,dur,path in [(440,4,bgm),(880,.25,sfx),(660,.75,narration)]:
                ffmpeg('-f','lavfi','-i',f'sine=frequency={hz}:duration={dur}:sample_rate=48000',path)
            job={
                'schemaVersion':'0.3.1-audio',
                'sourceVideo':str(original), 'output':str(out), 'durationSec':4,
                'originalVolume':0.0,
                'bgm':{'path':str(bgm),'volume':.35,'loop':True,'fadeInSec':0,'fadeOutSec':0,
                       'duckGain':.17,'duckRanges':[[2.0,2.8]]},
                'sfx':[{'path':str(sfx),'startSec':1.0,'volume':.55,'trimSec':.25}],
                'narration':[{'path':str(narration),'startSec':2.0,'volume':.45,'trimSec':.75}]
            }
            result=mix_audio.render(job)
            self.assertTrue(out.exists())
            self.assertEqual(result['status'],'PASS')
            self.assertEqual(result['tracks'], ['original','bgm','sfx0','narration0'])
            with self.assertRaises(FileExistsError):
                mix_audio.render(job)
            # Decode PCM for rough source-frequency detection and music ducking.
            pcm=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(out),
                                '-f','f32le','-ac','1','-ar','48000','-'],
                               capture_output=True,check=True).stdout
            import numpy as np
            sound=np.frombuffer(pcm,dtype=np.float32)
            sr=48000
            def tone_level(center, freq):
                s=sound[int((center-.08)*sr):int((center+.08)*sr)]
                window=np.hanning(len(s))
                t=np.arange(len(s))/sr
                return float(abs(np.dot(s*window, np.exp(-2j*np.pi*freq*t))))/len(s)
            # 440 Hz BGM is clearly softer when narration is present.
            self.assertLess(tone_level(2.4,440), .45*tone_level(.6,440))
            # 880Hz effect appears near the specified time, not near the beginning.
            self.assertGreater(tone_level(1.12,880),3*tone_level(.6,880))
            # 660Hz narration appears near the specified time.
            self.assertGreater(tone_level(2.45,660),3*tone_level(.6,660))
            self.assertTrue(original.exists())
            self.assertEqual(mix_audio._ffprobe(original)['format']['duration'], '4.000000')


if __name__=='__main__':
    unittest.main()
