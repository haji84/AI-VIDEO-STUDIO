"""Saved sync evidence on actual generated cameras; no private media."""
import array
import hashlib
import json
import math
import random
import tempfile
import unittest
import wave
from pathlib import Path
from .test_project_pipeline import ROOT,run


def make_media(folder):
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True);rate=8000
    rng=random.Random(135);events=[(rng.uniform(.7,21.4),rng.randint(250,920),rng.uniform(.3,.9)) for _ in range(60)]
    signal=[]
    for i in range(22*rate):
        t=i/rate;value=.003*math.sin(t*143)
        for start,hz,amp in events:
            if start<=t<start+.12:value+=amp*math.sin(2*math.pi*hz*(t-start))
        signal.append(int(max(-1,min(1,value))*16000))
    for name,offset,color in [('master',0,'blue'),('target',2,'red'),('silent',0,'green')]:
        wav=folder/(name+'.wav');samples=signal[offset*rate:(offset+20)*rate] if name!='silent' else [0]*(20*rate)
        with wave.open(str(wav),'wb') as handle:handle.setnchannels(1);handle.setsampwidth(2);handle.setframerate(rate);handle.writeframes(array.array('h',samples).tobytes())
        run(['ffmpeg','-v','error','-f','lavfi','-i',f'color=c={color}:s=160x90:r=10:d=20','-i',str(wav),'-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',str(folder/(name+'.mp4'))])
    return folder/'master.mp4',folder/'target.mp4',folder/'silent.mp4'


def make_session(folder,paths,master_offset=3):
    script=r"""
import {createProject,EditSession} from './packages/project/project.mjs';
import {hashFile,saveSession} from './packages/project/local-store.mjs';
import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
const folder=process.argv[1],paths=JSON.parse(process.argv[2]),refs=[];
for(let i=0;i<paths.length;i++)refs.push({assetId:'asset_'+String(i+1).repeat(32),sha256:await hashFile(paths[i]),mediaKind:'video',durationSec:20,hasAudio:true,offsetSec:i===0?Number(process.argv[3]):0,driftPpm:0,syncStatus:i===0?'master':'unverified'});
const p=createProject({projectId:'project_saved_sync',sourceRefs:refs});
p.timeline=[{clipId:'clip_master',sourceId:refs[0].assetId,sourceInSec:0,durationSec:4,startSec:0,speed:1,layout:'single',effects:[]}];
p.audioClips=[{id:'audio_deliberate',assetId:refs[0].assetId,bus:'source',startSec:0,endSec:4,trimInSec:0,speed:1,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0}];
await saveSession(join(folder,'project.json'),new EditSession(p));
await writeFile(join(folder,'bindings.json'),JSON.stringify(refs.map((s,i)=>({assetId:s.assetId,path:paths[i]}))));
await writeFile(join(folder,'request.json'),JSON.stringify({masterId:refs[0].assetId,targetId:refs[1].assetId}));
"""
    run(['node','--input-type=module','-e',script,str(folder),json.dumps([str(p) for p in paths]),str(master_offset)],cwd=ROOT)


class SavedSyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture=tempfile.TemporaryDirectory(prefix='aivs-sync-media-');cls.paths=make_media(Path(cls.fixture.name))
    @classmethod
    def tearDownClass(cls):cls.fixture.cleanup()

    def test_known_offset_is_only_a_candidate_bound_to_saved_identity(self):
        from .sync_saved_project import analyse_saved_project
        with tempfile.TemporaryDirectory(prefix='aivs-sync-') as tmp:
            folder=Path(tmp);make_session(folder,self.paths[:2]);before=(folder/'project.json').read_bytes()
            report=analyse_saved_project(folder/'project.json',folder/'bindings.json',folder/'request.json',folder/'analysis',folder/'report.json')
            self.assertEqual(report['status'],'CANDIDATE',report);self.assertAlmostEqual(report['candidateOffsetSec'],5,delta=.21)
            self.assertGreaterEqual(report['confidence'],.43);self.assertGreaterEqual(report['uniqueness'],.045)
            self.assertEqual(report['driftMeasurement'],'NOT_ESTIMATED');self.assertEqual(report['analysisWindowSec'],300)
            self.assertEqual((folder/'project.json').read_bytes(),before);self.assertNotIn(self.fixture.name,json.dumps(report))
            self.assertEqual(report,json.loads((folder/'report.json').read_text()))
            self.assertEqual(report['targetIdentity']['sha256'],hashlib.sha256(self.paths[1].read_bytes()).hexdigest())

    def test_silent_or_missing_master_sound_is_not_a_verified_sync(self):
        from .sync_saved_project import analyse_saved_project
        with tempfile.TemporaryDirectory(prefix='aivs-sync-silent-') as tmp:
            folder=Path(tmp);make_session(folder,[self.paths[0],self.paths[2]])
            report=analyse_saved_project(folder/'project.json',folder/'bindings.json',folder/'request.json',folder/'analysis',folder/'report.json')
            self.assertEqual(report['status'],'UNVERIFIED');self.assertIsNone(report['candidateOffsetSec'])
            self.assertEqual(json.loads((folder/'project.json').read_text())['project']['sourceRefs'][1]['syncStatus'],'unverified')

    def test_wrong_hash_existing_report_and_indirect_playlist_are_refused(self):
        from .sync_saved_project import analyse_saved_project
        with tempfile.TemporaryDirectory(prefix='aivs-sync-safety-') as tmp:
            folder=Path(tmp);make_session(folder,self.paths[:2]);before=(folder/'project.json').read_bytes()
            with self.assertRaises(Exception):analyse_saved_project(folder/'project.json',folder/'bindings.json',folder/'request.json',folder/'never',folder/'project.json')
            self.assertEqual((folder/'project.json').read_bytes(),before)
            file=folder/'project.json';doc=json.loads(file.read_text());doc['project']['sourceRefs'][1]['sha256']='a'*64;file.write_text(json.dumps(doc))
            with self.assertRaises(Exception):analyse_saved_project(file,folder/'bindings.json',folder/'request.json',folder/'wrong-hash',folder/'out.json')
            self.assertFalse((folder/'out.json').exists())
            playlist=folder/'indirect.m3u8'
            run(['ffmpeg','-v','error','-i',str(self.paths[1]),'-c','copy','-hls_time','5','-hls_playlist_type','vod',str(playlist)])
            disguised=folder/'indirect.mp4';disguised.write_bytes(playlist.read_bytes());make_session(folder,[self.paths[0],disguised])
            with self.assertRaisesRegex(Exception,'UNSUPPORTED_MEDIA_FORMAT'):
                analyse_saved_project(file,folder/'bindings.json',folder/'request.json',folder/'playlist-job',folder/'playlist-report.json')

    def test_master_with_no_audio_produces_no_candidate(self):
        from .sync_saved_project import analyse_saved_project
        with tempfile.TemporaryDirectory(prefix='aivs-sync-no-audio-') as tmp:
            folder=Path(tmp);silent=folder/'no-audio.mp4'
            run(['ffmpeg','-v','error','-i',str(self.paths[0]),'-map','0:v','-an','-c:v','copy',str(silent)])
            make_session(folder,[silent,self.paths[1]]);file=folder/'project.json';doc=json.loads(file.read_text());doc['project']['sourceRefs'][0]['hasAudio']=False;doc['project']['audioClips']=[];file.write_text(json.dumps(doc))
            report=analyse_saved_project(file,folder/'bindings.json',folder/'request.json',folder/'analysis',folder/'report.json')
            self.assertEqual(report['status'],'UNVERIFIED');self.assertIsNone(report['candidateOffsetSec'])

    def test_delayed_audio_stream_leading_gap_keeps_the_media_clock(self):
        from . import core_v01 as core
        with tempfile.TemporaryDirectory(prefix='aivs-sync-clock-') as tmp:
            file=Path(tmp)/'delayed.mp4'
            run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=20','-itsoffset','1','-i',str(self.paths[0]),'-map','0:v','-map','1:a','-t','20','-c:v','libx264','-c:a','aac',str(file)])
            master=core._audio_envelope(str(self.paths[0]),max_seconds=18);target=core._audio_envelope(str(file),max_seconds=18)
            lag,score,_=core._correlate(master,target,30,min_overlap=100)
            self.assertAlmostEqual(lag/10,-1,delta=.21);self.assertGreater(score,.7)


if __name__=='__main__':unittest.main()
