"""Saved portable projects -> existing FFmpeg: generated media, no private inputs."""
import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


class SavedProjectPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not all(shutil.which(x) for x in ('node', 'ffmpeg', 'ffprobe')):
            raise unittest.SkipTest('requires Node + FFmpeg')

    def test_save_reopen_relink_three_camera_mp4_and_original_audio(self):
        with tempfile.TemporaryDirectory(prefix='aivs-project-e2e-') as tmp:
            folder = Path(tmp)
            sources = []
            for i, (color, hz) in enumerate([('red', 440), ('blue', 660), ('green', 880)]):
                p = folder / f'synthetic_{i}.mp4'
                run(['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                     f'color=c={color}:s=320x180:r=30:d=3', '-f', 'lavfi', '-i',
                     f'sine=frequency={hz}:sample_rate=48000:duration=3', '-c:v', 'libx264',
                     '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', str(p)])
                sources.append(p)
            hashes = [hashlib.sha256(p.read_bytes()).hexdigest() for p in sources]
            script = r"""
import {createProject,EditSession} from './packages/project/project.mjs';
import {hashFile,saveSession,loadSession} from './packages/project/local-store.mjs';
import {writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
const folder=process.argv[1];
const sources=[];
for(let i=0;i<3;i++){
 const path=join(folder,`synthetic_${i}.mp4`);
 sources.push({assetId:'asset_'+String(i+1).padStart(32,'0'),sha256:await hashFile(path),
  mediaKind:'video',durationSec:3,hasAudio:true,offsetSec:0,driftPpm:0,syncStatus:i===0?'master':'verified'});
}
const p=createProject({projectId:'project_e2e',name:'Synthetic media only',sourceRefs:sources});
p.timeline=[{clipId:'clip_split',sourceId:sources[0].assetId,secondarySourceId:sources[1].assetId,
 secondaryInSec:.5,sourceInSec:.5,durationSec:1,startSec:0,speed:1,layout:'split',effects:[
 {effectId:'effect_caption',version:1,type:'caption',startSec:0,endSec:1,
 parameters:{text:'SYNTHETIC CAPTION'},keyframes:[]}]},
 {clipId:'clip_final',sourceId:sources[2].assetId,sourceInSec:1,durationSec:1,startSec:1,speed:1,layout:'single',effects:[]}];
p.audioClips=p.timeline.map((c,i)=>({id:'audio_'+i,assetId:c.sourceId,bus:'source',
 startSec:c.startSec,endSec:c.startSec+1,trimInSec:c.sourceInSec,speed:1,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0}));
const session=new EditSession(p);const edit=session.current;edit.name='Reopened edit';session.apply(edit);
const file=join(folder,'project.aivs.json');
await saveSession(file,session,{protectedPaths:sources.map((_,i)=>join(folder,`synthetic_${i}.mp4`))});
const reopened=await loadSession(file);if(!reopened.undo()||!reopened.redo())throw new Error('HISTORY_NOT_REOPENED');
await saveSession(file,reopened);
await rename(join(folder,'synthetic_2.mp4'),join(folder,'moved_2.mp4'));
await writeFile(join(folder,'bindings.json'),JSON.stringify(sources.map((s,i)=>({assetId:s.assetId,
 path:join(folder,i===2?'moved_2.mp4':`synthetic_${i}.mp4`)}))));
"""
            run(['node', '--input-type=module', '-e', script, str(folder)], cwd=ROOT)
            manifest = folder / 'manifest.json'
            command = ['node', 'tools/project-manifest.mjs', '--project', str(folder/'project.aivs.json'),
                       '--bindings', str(folder/'bindings.json'), '--output', str(manifest)]
            result = run(command, cwd=ROOT, text=True)
            self.assertEqual(json.loads(result.stdout)['sources'], 3)
            # Same invocation must refuse to replace existing evidence.
            refused = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn('EEXIST', refused.stderr)
            output = folder / 'completed.mp4'
            run(['python', '-m', 'engine.run_manifest', '--manifest', str(manifest),
                 '--workspace', str(folder/'workspace'), '--output', str(output)], cwd=ROOT)
            qa = json.loads((folder/'workspace'/'technical_qa.json').read_text())
            self.assertTrue(qa['technical_ok'], qa)
            self.assertTrue(qa['whole_file_decode_checked'])
            meta = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format',
                                  '-of', 'json', str(output)], text=True).stdout)
            self.assertLess(abs(float(meta['format']['duration'])-2), .12)
            self.assertEqual([s['codec_name'] for s in meta['streams']], ['h264', 'aac'])
            # Decode complete soundtrack, verify actual selected camera sound per shot.
            pcm = run(['ffmpeg', '-v', 'error', '-i', str(output), '-vn', '-ac', '1', '-ar', '48000',
                       '-f', 'f32le', 'pipe:1']).stdout
            samples = np.frombuffer(pcm, dtype='<f4')
            for start, hz in [(.2, 440), (1.2, 880)]:
                chunk = samples[int(start*48000):int((start+.5)*48000)]
                fft = abs(np.fft.rfft(chunk*np.hanning(len(chunk))))
                frequencies = np.fft.rfftfreq(len(chunk), 1/48000)
                dominant = frequencies[int(np.argmax(fft))]
                self.assertLess(abs(dominant-hz), 5)
                self.assertGreater(float(np.sqrt(np.mean(chunk**2))), .01)
            # Actual frame pixels prove split camera selection and later third camera.
            frames = []
            for at in (.5, 1.5):
                raw = run(['ffmpeg', '-v', 'error', '-ss', str(at), '-i', str(output), '-frames:v', '1',
                           '-vf', 'scale=320:180', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']).stdout
                frames.append(np.frombuffer(raw, dtype=np.uint8).reshape(180,320,3))
            self.assertGreater(int(frames[0][60,60,0]), 200)
            self.assertGreater(int(frames[0][60,260,2]), 200)
            self.assertGreater(int(frames[1][60,160,1]), 90)
            # Inspect caption at native output resolution; downsampling to 320px
            # erases most white antialiased glyph interiors of an 18px caption.
            video_stream = next(s for s in meta['streams'] if s['codec_type'] == 'video')
            w, h = video_stream['width'], video_stream['height']
            raw = run(['ffmpeg', '-v', 'error', '-ss', '0.5', '-i', str(output), '-frames:v', '1',
                       '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']).stdout
            native = np.frombuffer(raw, dtype=np.uint8).reshape(h,w,3)
            self.assertGreater(int(np.sum(np.all(native[int(h*.75):] > 180, axis=2))), 100,
                               'Caption pixels missing from native rendered frame')
            for i, p in enumerate([sources[0], sources[1], folder/'moved_2.mp4']):
                self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(), hashes[i])
            # Evidence contains synthetic hashes only; no source/output media is committed.
            self.assertEqual(qa['semantic_editing'], 'not_implemented')

    def test_render_refuses_output_temp_and_report_aliases_and_wrong_metadata(self):
        from .run_manifest import process_manifest, ManifestError
        with tempfile.TemporaryDirectory(prefix='aivs-project-safety-') as tmp:
            folder=Path(tmp);source=folder/'source.mp4'
            run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=red:s=320x180:r=30:d=2',
                 '-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-c:a','aac',
                 '-shortest',str(source)])
            original=source.read_bytes();saved=folder/'project.aivs.json';saved.write_text('saved session')
            bindings=folder/'bindings.json';bindings.write_text('saved bindings')
            asset='asset_'+'1'.zfill(32)
            base={'schema':1,'sources':[{'assetId':asset,'path':str(source),
                   'sha256':hashlib.sha256(original).hexdigest(),'hasAudio':True,'durationSec':2}],
                  'protectedPaths':[str(saved),str(bindings)],'quality':'review','timeline':[
                   {'id':'clip_a','sourceId':asset,'start':0,'duration':1,'speed':1,'layout':'single','caption':''}]}
            with self.assertRaises(ManifestError):process_manifest(base,folder/'w1',saved)
            self.assertEqual(saved.read_text(),'saved session')
            out=folder/'out.mp4';alias=folder/'out.mp4.new';alias.symlink_to(source)
            with self.assertRaises(ManifestError):process_manifest(base,folder/'w2',out)
            self.assertEqual(source.read_bytes(),original)
            alias.unlink();alias.hardlink_to(source)
            with self.assertRaises(ManifestError):process_manifest(base,folder/'w3',out)
            self.assertEqual(source.read_bytes(),original)
            workspace=folder/'w4';workspace.mkdir();(workspace/'technical_qa.json').symlink_to(bindings)
            with self.assertRaises(ManifestError):process_manifest(base,workspace,out)
            self.assertEqual(bindings.read_text(),'saved bindings')
            alias.unlink()
            wrong=json.loads(json.dumps(base));wrong['sources'][0]['hasAudio']=False
            with self.assertRaisesRegex(ManifestError,'METADATA_MISMATCH'):
                process_manifest(wrong,folder/'w5',out)
            wrong=json.loads(json.dumps(base));wrong['sources'][0]['sha256']='0'*64
            with self.assertRaisesRegex(ManifestError,'HASH_MISMATCH'):
                process_manifest(wrong,folder/'w6',out)
            # A benign pre-existing predictable temporary name must not be used
            # by a successful render. Final output is installed from an exclusive file.
            alias.write_bytes(b'keep this unrelated file')
            process_manifest(base,folder/'w7',out)
            self.assertEqual(alias.read_bytes(),b'keep this unrelated file')
            self.assertEqual(source.read_bytes(),original)


if __name__ == '__main__':
    unittest.main()
