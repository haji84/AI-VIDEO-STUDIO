"""Four independently saved buses, real decoded PCM; synthetic assets only."""
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import numpy as np
from .test_project_pipeline import ROOT, run


class SavedProjectAudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not all(shutil.which(x) for x in ('node','ffmpeg','ffprobe')):
            raise unittest.SkipTest('requires local tools')

    def _fixture(self, folder):
        run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=4',
             '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4',
             '-c:v','libx264','-c:a','aac','-shortest',str(folder/'source.mp4')])
        for name,hz,length in [('bgm',660,.7),('narration',880,1),('sfx',990,.3)]:
            run(['ffmpeg','-v','error','-f','lavfi','-i',f'sine=frequency={hz}:sample_rate=48000:duration={length}',
                 '-c:a','pcm_s16le',str(folder/f'{name}.wav')])
        script=r"""
import {createProject,EditSession} from './packages/project/project.mjs';
import {hashFile,saveSession} from './packages/project/local-store.mjs';
import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
const folder=process.argv[1],names=['source.mp4','bgm.wav','narration.wav','sfx.wav'],durations=[4,.7,1,.3],refs=[];
for(let i=0;i<names.length;i++)refs.push({assetId:'asset_'+String(i+1).padStart(32,'0'),
 sha256:await hashFile(join(folder,names[i])),mediaKind:i===0?'video':'audio',durationSec:durations[i],
 hasAudio:true,offsetSec:0,driftPpm:0,syncStatus:i===0?'master':'unverified'});
const p=createProject({projectId:'project_audio',sourceRefs:refs});
p.timeline=[{clipId:'clip_source',sourceId:refs[0].assetId,sourceInSec:0,durationSec:4,startSec:0,speed:1,layout:'single',effects:[]}];
const audio=(i,bus,startSec,endSec,extra={})=>({id:'audio_'+bus,assetId:refs[i].assetId,bus,startSec,endSec,
 trimInSec:0,speed:1,gainDb:-6,loop:false,fadeInSec:0,fadeOutSec:0,...extra});
p.audioClips=[audio(0,'source',0,4),audio(1,'bgm',0,4,{loop:true,fadeInSec:.3,fadeOutSec:.5,
 ducking:{enabled:true,gainFactor:.2,voiceIntervals:[[1,2]]}}),audio(2,'narration',1,2),audio(3,'sfx',2.4,2.7)];
await saveSession(join(folder,'project.json'),new EditSession(p));
await writeFile(join(folder,'bindings.json'),JSON.stringify(refs.map((s,i)=>({assetId:s.assetId,path:join(folder,names[i])}))));
"""
        run(['node','--input-type=module','-e',script,str(folder)],cwd=ROOT)
        return [folder/name for name in ['source.mp4','bgm.wav','narration.wav','sfx.wav']]

    @staticmethod
    def _amplitude(pcm,hz,start,end):
        sample=pcm[round(start*48000):round(end*48000)]
        t=np.arange(len(sample))/48000
        return float(abs(np.sum(sample*np.exp(-2j*np.pi*hz*t)))*2/len(sample))

    def test_saved_four_bus_mix_timing_ducking_loop_and_mute(self):
        from .render_saved_project import render_saved_project
        with tempfile.TemporaryDirectory(prefix='aivs-buses-') as tmp:
            folder=Path(tmp);sources=self._fixture(folder)
            hashes=[hashlib.sha256(p.read_bytes()).hexdigest() for p in sources]
            output=folder/'mix.mp4'
            report=render_saved_project(folder/'project.json',folder/'bindings.json',folder/'job',output)
            self.assertTrue(report['technical_ok'],report);self.assertTrue(report['whole_file_decode_checked'])
            pcm=np.frombuffer(run(['ffmpeg','-v','error','-i',str(output),'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1']).stdout,dtype='<f4')
            for hz,start,end in [(440,.4,.8),(660,3,3.4),(880,1.2,1.8),(990,2.45,2.65)]:
                self.assertGreater(self._amplitude(pcm,hz,start,end),.025,(hz,start,end))
            bgm_normal=self._amplitude(pcm,660,.4,.8);bgm_ducked=self._amplitude(pcm,660,1.2,1.8)
            self.assertLess(bgm_ducked/bgm_normal,.3);self.assertGreater(bgm_ducked/bgm_normal,.1)
            self.assertLess(self._amplitude(pcm,880,.4,.8),.002)
            self.assertLess(self._amplitude(pcm,990,2.9,3.2),.002)
            self.assertLess(self._amplitude(pcm,660,3.85,3.95),bgm_normal*.4)
            self.assertLess(float(np.max(np.abs(pcm))),1)
            self.assertLess(abs(report['duration_seconds']-4),.1)
            for p,sha in zip(sources,hashes):self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),sha)
            # Persist a mute in the same session, then render from disk again.
            doc=json.loads((folder/'project.json').read_text());doc['project']['audioBuses']['source']['muted']=True
            doc['project']['audioBuses']['sfx']['muted']=True
            (folder/'project.json').write_text(json.dumps(doc))
            muted=folder/'muted.mp4';render_saved_project(folder/'project.json',folder/'bindings.json',folder/'job2',muted)
            pcm=np.frombuffer(run(['ffmpeg','-v','error','-i',str(muted),'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1']).stdout,dtype='<f4')
            self.assertLess(self._amplitude(pcm,440,.4,.8),.002)
            self.assertLess(self._amplitude(pcm,990,2.45,2.65),.002)
            self.assertGreater(self._amplitude(pcm,880,1.2,1.8),.025)

    def test_explicit_no_audio_does_not_leak_intermediate_original(self):
        from .render_saved_project import render_saved_project
        with tempfile.TemporaryDirectory(prefix='aivs-no-audio-') as tmp:
            folder=Path(tmp);self._fixture(folder)
            doc=json.loads((folder/'project.json').read_text());doc['project']['audioClips']=[]
            (folder/'project.json').write_text(json.dumps(doc))
            out=folder/'silent.mp4';render_saved_project(folder/'project.json',folder/'bindings.json',folder/'job',out)
            pcm=np.frombuffer(run(['ffmpeg','-v','error','-i',str(out),'-vn','-ac','1','-f','f32le','pipe:1']).stdout,dtype='<f4')
            self.assertLess(float(np.max(np.abs(pcm))),.0001)

    def test_refuse_existing_outputs_and_wrong_audio_identity(self):
        from .render_saved_project import render_saved_project
        with tempfile.TemporaryDirectory(prefix='aivs-audio-safety-') as tmp:
            folder=Path(tmp);sources=self._fixture(folder)
            original=(folder/'project.json').read_bytes();source=sources[0].read_bytes()
            with self.assertRaises(Exception):render_saved_project(folder/'project.json',folder/'bindings.json',folder/'job',folder/'project.json')
            self.assertEqual((folder/'project.json').read_bytes(),original)
            alias=folder/'alias.mp4';alias.symlink_to(sources[0])
            with self.assertRaises(Exception):render_saved_project(folder/'project.json',folder/'bindings.json',folder/'job2',alias)
            self.assertEqual(sources[0].read_bytes(),source)
            sources[1].write_bytes(b'changed audio bytes')
            with self.assertRaisesRegex(Exception,'HASH_MISMATCH'):
                render_saved_project(folder/'project.json',folder/'bindings.json',folder/'job3',folder/'out.mp4')
            self.assertFalse((folder/'out.mp4').exists())

    def test_select_different_audio_trimmed_loop_speed_and_global_placement(self):
        from .render_saved_project import render_saved_project
        with tempfile.TemporaryDirectory(prefix='aivs-audio-clock-') as tmp:
            folder=Path(tmp);self._fixture(folder)
            # Lead-in tone must never reappear when the selected tail loops.
            run(['ffmpeg','-v','error','-y','-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=0.35',
                 '-f','lavfi','-i','sine=frequency=1320:sample_rate=48000:duration=0.35',
                 '-filter_complex','[0:a][1:a]concat=n=2:v=0:a=1[out]','-map','[out]',
                 '-c:a','pcm_s16le',str(folder/'bgm.wav')])
            file=folder/'project.json';doc=json.loads(file.read_text());p=doc['project']
            p['sourceRefs'][1]['sha256']=hashlib.sha256((folder/'bgm.wav').read_bytes()).hexdigest()
            p['audioClips']=[{'id':'audio_selected','assetId':p['sourceRefs'][1]['assetId'],'bus':'source',
              'startSec':.5,'endSec':3.5,'trimInSec':.35,'speed':2,'gainDb':0,'loop':True,'fadeInSec':0,'fadeOutSec':0}]
            file.write_text(json.dumps(doc));out=folder/'selected.mp4'
            render_saved_project(file,folder/'bindings.json',folder/'job',out)
            pcm=np.frombuffer(run(['ffmpeg','-v','error','-i',str(out),'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1']).stdout,dtype='<f4')
            self.assertLess(float(np.max(np.abs(pcm[4800:14400]))),.0001)
            self.assertGreater(self._amplitude(pcm,1320,2.1,2.6),.05)
            self.assertLess(self._amplitude(pcm,660,2.1,2.6),.002)
            self.assertLess(self._amplitude(pcm,440,2.1,2.6),.002)
            self.assertLess(float(np.max(np.abs(pcm[round(3.7*48000):round(3.9*48000)]))),.0001)

    def test_delayed_source_audio_keeps_media_clock_before_trim_speed_and_loop(self):
        from .render_saved_project import render_saved_project
        with tempfile.TemporaryDirectory(prefix='aivs-delayed-audio-') as tmp:
            folder=Path(tmp);self._fixture(folder);source=folder/'source.mp4'
            run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=4',
                 '-itsoffset','1','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3',
                 '-c:v','libx264','-c:a','aac','-t','4',str(source)])
            file=folder/'project.json';doc=json.loads(file.read_text());p=doc['project']
            p['sourceRefs'][0]['sha256']=hashlib.sha256(source.read_bytes()).hexdigest()
            # Trim0.2 and speed2 should put sound at (1-0.2)/2=0.4s,
            # preserving the leading silent span before every repeated tail.
            p['audioClips']=[{'id':'audio_delayed','assetId':p['sourceRefs'][0]['assetId'],'bus':'source',
              'startSec':0,'endSec':4,'trimInSec':.2,'speed':2,'gainDb':0,'loop':True,'fadeInSec':0,'fadeOutSec':0}]
            file.write_text(json.dumps(doc));out=folder/'delayed-loop.mp4'
            render_saved_project(file,folder/'bindings.json',folder/'job',out)
            pcm=np.frombuffer(run(['ffmpeg','-v','error','-i',str(out),'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1']).stdout,dtype='<f4')
            self.assertLess(float(np.sqrt(np.mean(pcm[4800:14400]**2))),.002)
            self.assertGreater(self._amplitude(pcm,440,.7,1),.05)
            # One tail lasts (4-.2)/2=1.9s, then its leading silence repeats.
            self.assertLess(float(np.sqrt(np.mean(pcm[round(2.05*48000):round(2.2*48000)]**2))),.002)
            p['audioClips'][0].update({'loop':False,'speed':1,'trimInSec':0})
            file.write_text(json.dumps(doc));out2=folder/'delayed-once.mp4'
            render_saved_project(file,folder/'bindings.json',folder/'job2',out2)
            pcm=np.frombuffer(run(['ffmpeg','-v','error','-i',str(out2),'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1']).stdout,dtype='<f4')
            self.assertLess(float(np.sqrt(np.mean(pcm[4800:28800]**2))),.002)
            self.assertGreater(self._amplitude(pcm,440,3.4,3.8),.05)

    def test_indirect_audio_playlists_are_rejected_even_with_audio_extension(self):
        from .render_saved_project import render_saved_project
        with tempfile.TemporaryDirectory(prefix='aivs-playlist-') as tmp:
            folder=Path(tmp);self._fixture(folder)
            playlist=folder/'bgm.m3u8'
            run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=0.7',
                 '-c:a','aac','-f','hls','-hls_time','1','-hls_playlist_type','vod',
                 '-hls_segment_filename',str(folder/'segment%03d.ts'),str(playlist)])
            meta=json.loads(run(['ffprobe','-v','error','-show_format','-of','json',str(playlist)],text=True).stdout)
            file=folder/'project.json';doc=json.loads(file.read_text());s=doc['project']['sourceRefs'][1]
            s['durationSec']=float(meta['format']['duration']);s['sha256']=hashlib.sha256(playlist.read_bytes()).hexdigest()
            bindings=json.loads((folder/'bindings.json').read_text());bindings[1]['path']=str(playlist)
            file.write_text(json.dumps(doc));(folder/'bindings.json').write_text(json.dumps(bindings))
            with self.assertRaisesRegex(Exception,'UNSUPPORTED_MEDIA_FORMAT'):
                render_saved_project(file,folder/'bindings.json',folder/'job',folder/'out.mp4')
            disguised=folder/'disguised.wav';disguised.write_bytes(playlist.read_bytes())
            bindings[1]['path']=str(disguised);(folder/'bindings.json').write_text(json.dumps(bindings))
            with self.assertRaisesRegex(Exception,'UNSUPPORTED_MEDIA_FORMAT'):
                render_saved_project(file,folder/'bindings.json',folder/'job2',folder/'out2.mp4')
            self.assertFalse((folder/'out.mp4').exists());self.assertFalse((folder/'out2.mp4').exists())


if __name__=='__main__':unittest.main()
