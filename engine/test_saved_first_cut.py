"""Actual saved-project low-level analysis; generated footage only."""
import hashlib,json,subprocess,tempfile,unittest
from pathlib import Path
from .first_cut_saved_project import analyse_first_cut
from .render_saved_project import ROOT

def make_media(folder,durations=(4,4,4)):
    folder.mkdir(parents=True)
    for i,(name,video) in enumerate([('master','color=c=black:s=160x90:r=12:d=4'),('clear','testsrc2=s=160x90:r=12:d=4'),('unverified','testsrc2=s=160x90:r=12:d=4')]):
        duration=durations[i];video=video.replace(':d=4',f':d={duration}')
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i',video,'-f','lavfi','-i',f'sine=frequency={440+220*i}:sample_rate=16000:duration={duration}','-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',str(folder/(name+'.mp4'))],check=True)

def make_session(folder):
    refs=[];bindings=[]
    for i,name in enumerate(['master','clear','unverified']):
        f=folder/'media'/(name+'.mp4');asset='asset_'+str(i+1)*32
        duration=float(json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-of','json',str(f)]))['format']['duration'])
        refs.append(dict(assetId=asset,sha256=hashlib.sha256(f.read_bytes()).hexdigest(),mediaKind='video',durationSec=duration,hasAudio=True,offsetSec=0,driftPpm=0,syncStatus=['master','verified','unverified'][i]));bindings.append(dict(assetId=asset,path=str(f)))
    (folder/'refs.json').write_text(json.dumps(refs));(folder/'bindings.json').write_text(json.dumps(bindings));(folder/'request.json').write_text(json.dumps({'mode':'training'}))
    script="import {createProject,EditSession} from './packages/project/project.mjs';import {readFileSync,writeFileSync} from 'node:fs';const f=process.argv[1],p=createProject({projectId:'project_firstcut',sourceRefs:JSON.parse(readFileSync(f+'/refs.json'))});writeFileSync(f+'/project.json',new EditSession(p).serialize());"
    subprocess.run(['node','--input-type=module','-e',script,str(folder)],cwd=ROOT,check=True)

class SavedFirstCutTests(unittest.TestCase):
    def test_checked_sources_full_signals_proposal_and_no_mutation(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t);make_media(f/'media');make_session(f);before=(f/'project.json').read_bytes()
            report=analyse_first_cut(f/'project.json',f/'bindings.json',f/'request.json',f/'analysis',f/'report.json')
            self.assertEqual(report['proposal']['timeline'][0]['sourceId'],'asset_'+'2'*32)
            self.assertEqual(report['proposal']['evidence']['blockedCameraIds'],['asset_'+'3'*32])
            self.assertTrue(all(a['complete'] for a in report['analysis']));self.assertEqual(len(report['analysis']),2)
            self.assertEqual((f/'project.json').read_bytes(),before);self.assertNotIn(str(f),json.dumps(report))
            with self.assertRaises(FileExistsError):analyse_first_cut(f/'project.json',f/'bindings.json',f/'request.json',f/'other',f/'report.json')
    def test_modified_bytes_refused(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t);make_media(f/'media');make_session(f);(f/'media'/'clear.mp4').write_bytes(b'changed')
            with self.assertRaises(Exception):analyse_first_cut(f/'project.json',f/'bindings.json',f/'request.json',f/'analysis',f/'report.json')
            self.assertFalse((f/'report.json').exists())

    def test_fractional_duration_includes_last_sample_window(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t);make_media(f/'media',(4.3,4.3,4.3));make_session(f)
            report=analyse_first_cut(f/'project.json',f/'bindings.json',f/'request.json',f/'analysis',f/'report.json')
            for a in report['analysis']:
                source=next(s for s in report['sourceIdentities'] if s['assetId']==a['assetId']);self.assertGreaterEqual(a['coverageSeconds'],source['durationSec']-.1)
                signals=json.loads((f/'analysis'/(a['assetId']+'.json')).read_text());self.assertAlmostEqual(signals['source']['windows'][-1]['endSeconds'],source['durationSec'],places=2)
    def test_small_verified_offset_with_continuous_master_coverage(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t);make_media(f/'media',(6,4,4));make_session(f)
            document=json.loads((f/'project.json').read_text());document['project']['sourceRefs'][1]['offsetSec']=.1;(f/'project.json').write_text(json.dumps(document))
            report=analyse_first_cut(f/'project.json',f/'bindings.json',f/'request.json',f/'analysis',f/'report.json')
            self.assertEqual(report['proposal']['evidence']['gaps'],[]);self.assertEqual(report['proposal']['durationSeconds'],6)
