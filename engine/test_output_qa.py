"""Full-output inspection uses generated media, never private footage."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from .test_project_pipeline import run


class OutputQATests(unittest.TestCase):
    def _late_fault(self, folder):
        file=folder/'late-fault.mp4'
        run(['ffmpeg','-v','error','-f','lavfi','-i',
             'color=c=blue:s=320x180:r=30:d=8,drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable=gte(t\\,6)',
             '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=8',
             '-af',"volume=enable='gte(t,6)':volume=0",'-c:v','libx264','-c:a','aac','-shortest',str(file)])
        return file

    @staticmethod
    def _plan(audio=True):
        return {'projectId':'project_qa','revision':7,'durationSec':8,
                'video':[{'clipId':'clip_early','startSec':0,'endSec':4},
                         {'clipId':'clip_late','startSec':4,'endSec':8}],
                'audio':[{'id':'audio_selected','bus':'source','startSec':0,'endSec':8,'gainDb':0}] if audio else [],
                'audioBuses':{'source':{'gainDb':0,'muted':False}}}

    def test_late_faults_found_with_hash_time_and_saved_clip_references(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory(prefix='aivs-qa-') as tmp:
            file=self._late_fault(Path(tmp));before=file.read_bytes()
            qa=inspect_output(file,expected=8,plan=self._plan())
            self.assertTrue(qa['technical_ok'],qa)
            self.assertEqual(qa['inspection']['status'],'NEEDS_REVIEW')
            self.assertTrue(qa['whole_file_decode_checked'])
            self.assertEqual(qa['sha256'],hashlib.sha256(before).hexdigest())
            self.assertEqual(qa['projectRevision'],7)
            for code in ('BLACK_INTERVAL','SILENCE_WHILE_AUDIO_SELECTED'):
                findings=[x for x in qa['inspection']['findings'] if x['code']==code]
                self.assertTrue(findings,code);finding=findings[0]
                self.assertAlmostEqual(finding['startSec'],6,delta=.08)
                self.assertGreater(finding['endSec'],7.8)
                self.assertEqual(finding['clipIds'],['clip_late'])
            self.assertLess(qa['inspection']['audioSamplePeakDbfs'],-10)
            self.assertEqual(file.read_bytes(),before)
            self.assertNotIn(str(file),json.dumps(qa))

    def test_intentional_empty_or_muted_audio_is_not_a_missing_sound_fault(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory(prefix='aivs-qa-silence-') as tmp:
            file=Path(tmp)/'silent.mp4'
            run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=1',
                 '-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','1','-c:v','libx264','-c:a','aac',str(file)])
            for plan in (self._plan(False),self._plan()):
                plan['durationSec']=1;plan['audioBuses']['source']['muted']=True
                qa=inspect_output(file,expected=1,plan=plan)
                self.assertEqual(qa['inspection']['status'],'CHECKED_LIMITED')
                self.assertEqual(qa['inspection']['findings'],[])
                self.assertIsNone(qa['inspection']['audioSamplePeakDbfs'])
                json.dumps(qa,allow_nan=False)
            selected=self._plan();selected['durationSec']=1
            qa=inspect_output(file,expected=1,plan=selected)
            self.assertIn('SILENCE_WHILE_AUDIO_SELECTED',[x['code'] for x in qa['inspection']['findings']])

    def test_full_audio_peak_measurement_warns_without_rewriting_original(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory(prefix='aivs-qa-peak-') as tmp:
            file=Path(tmp)/'peak.mov'
            run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=1',
                 '-f','lavfi','-i','aevalsrc=0.999*sin(2*PI*440*t):s=48000:d=1',
                 '-c:v','libx264','-c:a','pcm_s16le','-shortest',str(file)])
            qa=inspect_output(file,expected=1,plan=self._plan())
            self.assertGreater(qa['inspection']['audioSamplePeakDbfs'],-.1)
            self.assertIn('NEAR_SAMPLE_CLIPPING',[x['code'] for x in qa['inspection']['findings']])
            self.assertEqual(qa['inspection']['truePeak'],'NOT_MEASURED')

    def test_missing_audio_and_corruption_cannot_become_a_technical_pass(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory(prefix='aivs-qa-bad-') as tmp:
            file=Path(tmp)/'video-only.mp4'
            run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=1','-c:v','libx264',str(file)])
            qa=inspect_output(file,expected=1,plan=self._plan())
            self.assertFalse(qa['technical_ok']);self.assertEqual(qa['inspection']['status'],'FAILED_TECHNICAL')
            file.write_bytes(b'not a video')
            with self.assertRaises(Exception):inspect_output(file,expected=1,plan=self._plan())

    def test_late_corrupt_video_packet_cannot_silently_drop_a_frame_and_pass(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory(prefix='aivs-qa-packet-') as tmp:
            file=Path(tmp)/'late-corrupt.mp4'
            run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=3',
                 '-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-c:a','aac',
                 '-movflags','+faststart',str(file)])
            metadata=json.loads(run(['ffprobe','-v','error','-select_streams','v','-show_packets','-of','json',str(file)],text=True).stdout)
            packet=[p for p in metadata['packets'] if float(p.get('pts_time',0))>2][-1]
            data=bytearray(file.read_bytes());start=int(packet['pos']);length=int(packet['size'])
            data[start:start+length]=b'\0'*length;file.write_bytes(data)
            qa=inspect_output(file,expected=3)
            self.assertFalse(qa['technical_ok'],qa)
            self.assertEqual(qa['inspection']['status'],'FAILED_TECHNICAL')
            self.assertLess(qa['inspection']['decodedVideoFrames'],qa['inspection']['containerVideoFrames'])

    def test_short_audio_stream_does_not_hide_selected_missing_tail(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory(prefix='aivs-qa-audio-tail-') as tmp:
            file=Path(tmp)/'short-audio.mp4'
            run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=8',
                 '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1',
                 '-c:v','libx264','-c:a','aac',str(file)])
            qa=inspect_output(file,expected=8,plan=self._plan())
            self.assertEqual(qa['inspection']['status'],'NEEDS_REVIEW')
            finding=next(x for x in qa['inspection']['findings'] if x['code']=='SILENCE_WHILE_AUDIO_SELECTED')
            self.assertAlmostEqual(finding['startSec'],1,delta=.1);self.assertGreater(finding['endSec'],7.9)
            # Deliberate audio ending at1s is not missing audio.
            plan=self._plan();plan['audio'][0]['endSec']=1
            deliberate=inspect_output(file,expected=8,plan=plan)
            self.assertNotIn('SILENCE_WHILE_AUDIO_SELECTED',[x['code'] for x in deliberate['inspection']['findings']])
            self.assertIn('STATIC_OR_FREEZE_INTERVAL',[x['code'] for x in deliberate['inspection']['findings']], 'intentional static video remains a review warning')

    def test_video_ending_early_is_not_hidden_by_a_long_audio_track(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory(prefix='aivs-qa-video-tail-') as tmp:
            file=Path(tmp)/'short-video.mp4'
            run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=1',
                 '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=8',
                 '-c:v','libx264','-c:a','aac',str(file)])
            qa=inspect_output(file,expected=8,plan=self._plan())
            self.assertFalse(qa['technical_ok'],qa)
            self.assertEqual(qa['inspection']['status'],'FAILED_TECHNICAL')
            self.assertLess(qa['inspection']['videoStreamEndSec'],2)

class FreezeCadenceTests(unittest.TestCase):
    def test_middle_freeze_is_warning_with_time_clip_hash_and_no_rewrite(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory() as t:
            f=Path(t)/'held.mp4'
            run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=4','-f','lavfi','-i','sine=frequency=440:duration=6',
                 '-filter_complex','[0:v]split[a][b];[a]trim=0:2,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=2[held];[b]trim=2:4,setpts=PTS-STARTPTS[moving];[held][moving]concat=n=2:v=1:a=0[v]',
                 '-map','[v]','-map','1:a:0','-c:v','libx264','-c:a','aac',str(f)])
            before=f.read_bytes();qa=inspect_output(f,expected=6,plan=OutputQATests._plan());self.assertTrue(qa['technical_ok'],qa);self.assertTrue(qa['whole_file_decode_checked'])
            finding=next(x for x in qa['inspection']['findings'] if x['code']=='STATIC_OR_FREEZE_INTERVAL')
            self.assertAlmostEqual(finding['startSec'],1.9,delta=.15);self.assertAlmostEqual(finding['endSec'],4,delta=.15);self.assertIn('clip_early',finding['clipIds']);self.assertEqual(finding['severity'],'REVIEW')
            self.assertEqual(f.read_bytes(),before);self.assertEqual(qa['sha256'],hashlib.sha256(before).hexdigest());self.assertNotIn(str(f),json.dumps(qa))
    def test_static_tail_is_context_warning_and_stops_at_actual_video_end(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory() as t:
            f=Path(t)/'still.mp4';run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=3','-f','lavfi','-i','sine=frequency=440:duration=6','-c:v','libx264','-c:a','aac',str(f)])
            qa=inspect_output(f,expected=6,plan=OutputQATests._plan());finding=next(x for x in qa['inspection']['findings'] if x['code']=='STATIC_OR_FREEZE_INTERVAL')
            self.assertLessEqual(finding['endSec'],3.001);self.assertEqual(finding['severity'],'REVIEW');self.assertFalse(qa['technical_ok'],'short video must still fail timing gate')
    def test_moving_cfr_negative_and_real_variable_pts_positive(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory() as t:
            for variable in (False,True):
                f=Path(t)/('vfr.mp4' if variable else 'cfr.mp4')
                args=['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10:d=2','-f','lavfi','-i','sine=frequency=440:duration=2.7']
                if variable:args+=['-vf',"setpts=if(lt(N\\,10)\\,N/(10*TB)\\,1/TB+(N-10)/(5*TB))",'-fps_mode','vfr']
                else:args+=['-t','2']
                run([*args,'-c:v','libx264','-c:a','aac',str(f)]);qa=inspect_output(f)
                self.assertTrue(qa['technical_ok'],qa);codes=[x['code'] for x in qa['inspection']['findings']];self.assertNotIn('STATIC_OR_FREEZE_INTERVAL',codes)
                cadence=qa['inspection']['cadence'];self.assertGreater(cadence['examinedIntervals'],10)
                self.assertEqual(cadence['status'],'VARIABLE_INTERVALS' if variable else 'CONSTANT_INTERVALS')
                self.assertEqual('VARIABLE_FRAME_CADENCE' in codes,variable);self.assertTrue(qa['whole_file_decode_checked'])

    def test_one_frame_is_insufficient_cadence_evidence_not_a_broken_decode(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory() as t:
            f=Path(t)/'one-frame.mp4';run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=0.1','-f','lavfi','-i','sine=frequency=440:duration=0.1','-c:v','libx264','-c:a','aac',str(f)])
            qa=inspect_output(f);self.assertTrue(qa['technical_ok'],qa);self.assertEqual(qa['inspection']['cadence']['status'],'INSUFFICIENT_FRAMES');self.assertEqual(qa['inspection']['cadence']['examinedIntervals'],0);self.assertTrue(qa['whole_file_decode_checked'])


if __name__=='__main__':unittest.main()
