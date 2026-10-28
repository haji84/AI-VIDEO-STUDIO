"""Full-output inspection uses generated media, never private footage."""
import hashlib
import json
import math
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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
                self.assertEqual(qa['inspection']['truePeak'],'SILENT')
                self.assertIsNone(qa['inspection']['truePeakMeasurement']['maximumDbTP'])
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
            self.assertEqual(qa['inspection']['truePeak'],'MEASURED')

    def test_missing_audio_and_corruption_cannot_become_a_technical_pass(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory(prefix='aivs-qa-bad-') as tmp:
            file=Path(tmp)/'video-only.mp4'
            run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=1','-c:v','libx264',str(file)])
            qa=inspect_output(file,expected=1,plan=self._plan())
            self.assertFalse(qa['technical_ok']);self.assertEqual(qa['inspection']['status'],'FAILED_TECHNICAL')
            self.assertEqual(qa['inspection']['truePeak'],'NOT_APPLICABLE')
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
            self.assertEqual(qa['inspection']['truePeak'],'INCOMPLETE')
            self.assertIsNone(qa['inspection']['truePeakMeasurement']['maximumDbTP'])

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


class TruePeakTests(unittest.TestCase):
    @staticmethod
    def media(folder,name='source',end_only=False,amplitude=1.2):
        # 12 kHz at 48 kHz, phase pi/4: samples reach amplitude/sqrt(2),
        # while the reconstructed, gently windowed sine reaches amplitude.
        audio=(f'aevalsrc=0.1*sin(2*PI*440*t)|{amplitude}*sin(2*PI*12000*t+PI/4):s=48000:d=0.5')
        if end_only:
            audio='aevalsrc=if(gt(n\\,23983)\\,1.2*sin(2*PI*12000*t+PI/4)\\,0):s=48000:d=0.5'
        file=folder/(name+'.mp4')
        args=['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=30:d=0.5','-f','lavfi','-i',audio]
        if not end_only:args+=['-af','afade=t=in:d=0.01,afade=t=out:st=0.49:d=0.01']
        run([*args,'-c:v','libx264','-c:a','alac','-shortest',str(file)])
        return file

    @staticmethod
    def plan():
        return {'projectId':'project_peak','revision':3,'durationSec':.5,
                'video':[{'clipId':'clip_peak','startSec':0,'endSec':.5}],
                'audio':[{'id':'audio_selected','bus':'source','startSec':0,'endSec':.5,'gainDb':0}],
                'audioBuses':{'source':{'gainDb':0,'muted':False}}}

    def test_intersample_overshoot_is_reported_even_below_sample_peak_warning(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory() as tmp:
            file=self.media(Path(tmp));before=file.read_bytes()
            qa=inspect_output(file,expected=.5,plan=self.plan())
            codes=[f['code'] for f in qa['inspection']['findings']]
            self.assertIn('TRUE_PEAK_AT_OR_ABOVE_REFERENCE',codes,
                          'Actual intersample overshoot was missed by sample-only QA')
            self.assertNotIn('NEAR_SAMPLE_CLIPPING',codes)
            self.assertLess(qa['inspection']['audioSamplePeakDbfs'],-1)
            self.assertTrue(qa['technical_ok'],qa);self.assertTrue(qa['whole_file_decode_checked'])
            self.assertEqual(qa['inspection']['status'],'NEEDS_REVIEW')
            self.assertEqual(qa['inspection']['truePeak'],'MEASURED')
            measurement=qa['inspection']['truePeakMeasurement']
            self.assertAlmostEqual(measurement['maximumDbTP'],20*math.log10(1.2),delta=.12)
            self.assertEqual(measurement['unit'],'dBTP')
            self.assertEqual(measurement['method'],'ffmpeg-ebur128-peak-true')
            self.assertEqual(measurement['reportedPrecisionDb'],.1)
            finding=next(f for f in qa['inspection']['findings'] if f['code']=='TRUE_PEAK_AT_OR_ABOVE_REFERENCE')
            self.assertEqual(finding['severity'],'REVIEW');self.assertEqual(finding['clipIds'],['clip_peak'])
            self.assertEqual(finding['scope'],'GLOBAL_MAXIMUM_NO_PEAK_TIMESTAMP')
            self.assertEqual(file.read_bytes(),before)
            self.assertEqual(qa['sha256'],hashlib.sha256(before).hexdigest())
            json.dumps(qa,allow_nan=False)

    def test_last_samples_are_not_lost_in_the_true_peak_resampler_tail(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory() as tmp:
            file=self.media(Path(tmp),end_only=True);qa=inspect_output(file,plan=self.plan())
            self.assertIn('TRUE_PEAK_AT_OR_ABOVE_REFERENCE',[f['code'] for f in qa['inspection']['findings']])
            self.assertGreater(qa['inspection']['truePeakMeasurement']['maximumDbTP'],0)
            self.assertEqual(qa['inspection']['truePeakMeasurement']['analysisTailPaddingSec'],.1)
            self.assertAlmostEqual(qa['duration_seconds'],.5,delta=.001)

    def test_safe_audio_has_a_measured_peak_without_a_peak_warning(self):
        from .output_qa import inspect_output
        with tempfile.TemporaryDirectory() as tmp:
            qa=inspect_output(self.media(Path(tmp),amplitude=.1),plan=self.plan())
            self.assertEqual(qa['inspection']['truePeak'],'MEASURED')
            self.assertLess(qa['inspection']['truePeakMeasurement']['maximumDbTP'],-10)
            self.assertEqual(qa['inspection']['status'],'CHECKED_LIMITED')
            self.assertEqual(qa['inspection']['findings'],[])

    def test_absent_meter_summary_is_explicitly_unavailable_not_a_clean_result(self):
        from .output_qa import inspect_output
        real_run=subprocess.run
        def omit_meter(args,**kwargs):
            # Exercise actual full decoding with a missing external meter result.
            args=[s.replace('ebur128=peak=true:framelog=verbose','anull') if isinstance(s,str) else s for s in args]
            return real_run(args,**kwargs)
        with tempfile.TemporaryDirectory() as tmp:
            file=self.media(Path(tmp),amplitude=.1)
            with patch('engine.output_qa.subprocess.run',side_effect=omit_meter):
                qa=inspect_output(file,plan=self.plan())
            self.assertTrue(qa['technical_ok'],qa)
            self.assertTrue(qa['whole_file_decode_checked'])
            self.assertEqual(qa['inspection']['truePeak'],'UNAVAILABLE')
            self.assertIsNone(qa['inspection']['truePeakMeasurement']['maximumDbTP'])
            self.assertEqual(qa['inspection']['status'],'NEEDS_REVIEW')
            self.assertIn('TRUE_PEAK_UNAVAILABLE',[f['code'] for f in qa['inspection']['findings']])
            self.assertNotIn('true-peak-ebur128-v1',qa['inspection']['detectors'])

    def test_incomplete_final_meter_summary_does_not_reuse_an_earlier_measurement(self):
        from .output_qa import inspect_output
        real_run=subprocess.run
        def incomplete_final_summary(args,**kwargs):
            result=real_run(args,**kwargs)
            if '-af' in args and 'ebur128=peak=true' in args[args.index('-af')+1]:
                kwargs['stderr'].write(b'[Parsed_ebur128_99 @ 0x1] Summary:\n\n  Integrated loudness:\n    I: -70.0 LUFS\n')
            return result
        with tempfile.TemporaryDirectory() as tmp:
            file=self.media(Path(tmp))
            with patch('engine.output_qa.subprocess.run',side_effect=incomplete_final_summary):
                qa=inspect_output(file,plan=self.plan())
            self.assertEqual(qa['inspection']['truePeak'],'UNAVAILABLE')
            self.assertIsNone(qa['inspection']['truePeakMeasurement']['maximumDbTP'])
            self.assertIn('TRUE_PEAK_UNAVAILABLE',[f['code'] for f in qa['inspection']['findings']])

    def test_saved_real_aac_mp4_persists_measurement_without_changing_source_or_project(self):
        from .render_saved_project import render_saved_project
        from .test_project_pipeline import ROOT
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);source=self.media(folder);source_before=source.read_bytes()
            script=r"""
import {createProject,EditSession} from './packages/project/project.mjs';
import {hashFile,saveSession,loadSession} from './packages/project/local-store.mjs';
import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
const folder=process.argv[1],path=join(folder,'source.mp4'),id='asset_'+'1'.repeat(32);
const p=createProject({projectId:'project_peak',sourceRefs:[{assetId:id,sha256:await hashFile(path),
 mediaKind:'video',durationSec:.5,hasAudio:true,offsetSec:0,driftPpm:0,syncStatus:'master'}]});
p.exportProfile='review';p.timeline=[{clipId:'clip_peak',sourceId:id,sourceInSec:0,durationSec:.5,startSec:0,speed:1,layout:'single',effects:[]}];
p.audioClips=[{id:'audio_source',assetId:id,bus:'source',startSec:0,endSec:.5,trimInSec:0,speed:1,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0}];
const file=join(folder,'project.json');await saveSession(file,new EditSession(p));
await loadSession(file);await writeFile(join(folder,'bindings.json'),JSON.stringify([{assetId:id,path}]));
"""
            run(['node','--input-type=module','-e',script,str(folder)],cwd=ROOT)
            project_before=(folder/'project.json').read_bytes();output=folder/'output.mp4'
            qa=render_saved_project(folder/'project.json',folder/'bindings.json',folder/'job',output)
            stored=json.loads((folder/'job/technical_qa.json').read_text())
            self.assertEqual(stored['inspection'],qa['inspection'])
            self.assertEqual(stored['inspection']['truePeak'],'MEASURED')
            self.assertIn('TRUE_PEAK_AT_OR_ABOVE_REFERENCE',[f['code'] for f in stored['inspection']['findings']])
            self.assertEqual(stored['truePeakGuarantee'],'NOT_GUARANTEED')
            self.assertTrue(stored['whole_file_decode_checked']);self.assertTrue(stored['technical_ok'])
            self.assertEqual(stored['sha256'],hashlib.sha256(output.read_bytes()).hexdigest())
            run(['ffmpeg','-v','error','-xerror','-i',str(output),'-f','null','-'])
            self.assertEqual(source.read_bytes(),source_before)
            self.assertEqual((folder/'project.json').read_bytes(),project_before)
            json.dumps(stored,allow_nan=False)


if __name__=='__main__':unittest.main()
