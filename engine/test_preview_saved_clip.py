"""Saved-cut preview evidence from generated media, never private inputs."""
import hashlib
import importlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from .test_project_pipeline import ROOT, run


def digest(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


class SavedClipPreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not all(shutil.which(name) for name in ('node', 'ffmpeg', 'ffprobe')):
            raise unittest.SkipTest('requires Node and FFmpeg')
        cls.media = tempfile.TemporaryDirectory(prefix='aivs-preview-media-')
        cls.media_dir = Path(cls.media.name)
        cls.master = cls.media_dir / 'master.mp4'
        cls.source = cls.media_dir / 'blue-red.mp4'
        run(['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
             'color=c=green:s=320x180:r=30:d=2', '-f', 'lavfi', '-i',
             'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'libx264',
             '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', str(cls.master)])
        run(['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
             'color=c=blue:s=320x180:r=30:d=1', '-f', 'lavfi', '-i',
             'color=c=red:s=320x180:r=30:d=1', '-f', 'lavfi', '-i',
             'sine=frequency=440:sample_rate=48000:duration=2', '-filter_complex',
             '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a',
             '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-t', '2', str(cls.source)])

    @classmethod
    def tearDownClass(cls):
        cls.media.cleanup()

    def worker(self):
        # Removing this feature must produce an assertion failure, not an import error.
        self.assertTrue((ROOT / 'engine' / 'preview_saved_clip.py').is_file(),
                        'Saved-cut preview worker is required for read-only visual parity')
        return importlib.import_module('engine.preview_saved_clip')

    def fixture(self, folder, speed=1, caption='', profile='review', source_in=.5, duration=1):
        script = r"""
import {createProject,EditSession} from './packages/project/project.mjs';
import {hashFile,saveSession} from './packages/project/local-store.mjs';
import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
const [folder,master,source,options]=process.argv.slice(1),o=JSON.parse(options),refs=[];
for(const [i,path] of [master,source].entries())refs.push({assetId:'asset_'+String(i+1).repeat(32),
 sha256:await hashFile(path),mediaKind:'video',durationSec:2,hasAudio:true,
 offsetSec:i===0?3:5,driftPpm:0,syncStatus:i===0?'master':'verified'});
const p=createProject({projectId:'project_preview',sourceRefs:refs});p.exportProfile=o.profile;
p.timeline=[{clipId:'clip_lead',sourceId:refs[0].assetId,sourceInSec:0,durationSec:.2,
 startSec:0,speed:1,layout:'single',effects:[]},{clipId:'clip_selected',sourceId:refs[1].assetId,
 sourceInSec:o.sourceIn,durationSec:o.duration,startSec:.2,speed:o.speed,layout:'single',effects:[]}];
const total=.2+o.duration/o.speed;
p.audioBuses.source.gainDb=-3;p.audioBuses.bgm.muted=true;
p.audioClips=[{id:'audio_deliberate',assetId:refs[0].assetId,bus:'source',startSec:0,endSec:total,
 trimInSec:.1,speed:1,gainDb:-6,loop:true,fadeInSec:.1,fadeOutSec:.1}];
const session=new EditSession(p),q=session.current;
if(o.caption)q.timeline[1].effects=[{effectId:'effect_caption',version:1,type:'caption',startSec:0,
 endSec:o.duration/o.speed,parameters:{text:o.caption},keyframes:[]}];
q.name='Saved preview fixture';session.apply(q);
await saveSession(join(folder,'project.json'),session);
await writeFile(join(folder,'bindings.json'),JSON.stringify(refs.map((s,i)=>({assetId:s.assetId,path:[master,source][i]}))));
"""
        options = {'speed': speed, 'caption': caption, 'profile': profile,
                   'sourceIn': source_in, 'duration': duration}
        run(['node', '--input-type=module', '-e', script, str(folder), str(self.master),
             str(self.source), json.dumps(options)], cwd=ROOT)
        return folder / 'project.json', folder / 'bindings.json'

    def preview(self, folder, start=0, name='preview', request=None):
        worker = self.worker()
        request_file = folder / (name + '-request.json')
        request_file.write_text(json.dumps(request if request is not None else
                                          {'clipId': 'clip_selected', 'startSec': start}))
        output, report = folder / (name + '.mp4'), folder / (name + '.json')
        result = worker.preview_saved_clip(folder / 'project.json', folder / 'bindings.json',
                                          request_file, folder / (name + '-job'), output, report)
        self.assertEqual(result, json.loads(report.read_text()))
        return output, result

    @staticmethod
    def timestamps(path):
        frames = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_frames',
            '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', str(path)], text=True).stdout)['frames']
        return [float(frame['best_effort_timestamp_time']) for frame in frames]

    def frame(self, path, at, width, height):
        # Input -ss returns the next frame. Select the frame actually presented
        # at this time, using measured PTS and passthrough to avoid duplication.
        timestamps = self.timestamps(path)
        index = max((i for i, timestamp in enumerate(timestamps) if timestamp <= at + 1e-7), default=0)
        raw = run(['ffmpeg', '-v', 'error', '-i', str(path), '-vf', f'select=eq(n\\,{index})',
                   '-frames:v', '1', '-fps_mode', 'passthrough',
                   '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']).stdout
        return np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3), timestamps[index]

    def red_transition(self, path):
        timestamps = self.timestamps(path)
        raw = run(['ffmpeg', '-v', 'error', '-i', str(path), '-vf', 'scale=16:9',
                   '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']).stdout
        frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 9, 16, 3)
        self.assertEqual(len(frames), len(timestamps))
        return next(at for at, frame in zip(timestamps, frames) if frame[1, 8, 0] > 220)

    def check_output(self, path, duration, width, height, fps):
        meta = json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams',
                              '-of', 'json', str(path)], text=True).stdout)
        video = next(stream for stream in meta['streams'] if stream['codec_type'] == 'video')
        self.assertEqual((video['width'], video['height']), (width, height))
        numerator, denominator = map(int, video['avg_frame_rate'].split('/'))
        self.assertAlmostEqual(numerator / denominator, fps)
        self.assertLess(abs(float(meta['format']['duration']) - duration), .11)
        run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'])

    def test_saved_profile_trim_rate_camera_clock_and_caption_pixels_match_export(self):
        # Rebasing the selected camera, ignoring output time/speed, flattening
        # newlines or hardcoding the review profile changes actual decoded frames.
        self.worker()
        from .render_saved_project import render_saved_project
        for speed, caption, profile, width, height, fps in [
            (.5, 'FIRST LINE\nSECOND LINE', 'review', 960, 540, 24),
            (1, '日本語の字幕\n確認テスト', 'hd', 1280, 720, 30),
            (2, 'FIRST LINE\nSECOND LINE', 'review', 960, 540, 24),
            (4, '日本語の字幕\n確認テスト', 'fullhd', 1920, 1080, 30),
        ]:
            with self.subTest(speed=speed, profile=profile), tempfile.TemporaryDirectory(prefix='aivs-preview-parity-') as tmp:
                folder = Path(tmp)
                project, bindings = self.fixture(folder, speed, caption, profile)
                protected = [project, bindings, self.master, self.source]
                before = {path: digest(path) for path in protected}
                output, report = self.preview(folder, start=.1 / speed)
                final = folder / 'final.mp4'
                final_report = render_saved_project(project, bindings, folder / 'export-job', final)
                self.assertEqual(report['schema'], 'aivs-saved-clip-preview-v1')
                self.assertEqual((report['projectId'], report['projectRevision'], report['clipId']),
                                 ('project_preview', 1, 'clip_selected'))
                self.assertEqual(report['sourceIdentities'], json.loads(project.read_text())['project']['sourceRefs'])
                self.assertNotIn(str(folder), json.dumps(report))
                self.assertNotIn(str(self.media_dir), json.dumps(report))
                self.assertEqual(report['exportProfile'], profile)
                self.assertEqual((report['width'], report['height'], report['fps']), (width, height, fps))
                self.assertEqual(report['outputSha256'], digest(output))
                self.assertEqual(report['bytes'], output.stat().st_size)
                self.assertEqual(report['wholeFileDecode'], 'PASS')
                for key, expected in {'startSec': .1 / speed, 'endSec': 1 / speed,
                                      'durationSec': .9 / speed, 'totalSec': 1 / speed,
                                      'sourceInSec': .6, 'sourceDurationSec': .9, 'speed': speed}.items():
                    self.assertAlmostEqual(report['window'][key], expected, msg=key)
                self.assertEqual(report['captionRasters'], final_report['captionRasters'])
                raster = report['captionRasters'][0]
                self.assertEqual(raster['lineCount'], 2)
                self.assertEqual(raster['glyphCoverage'], 'CMAP_VERIFIED')
                self.check_output(output, .9 / speed, width, height, fps)
                self.check_output(final, .2 + 1 / speed, width, height, fps)
                preview_red = self.red_transition(output)
                final_red = self.red_transition(final) - .2
                transition_difference = abs(preview_red + .1 / speed - final_red)
                self.assertLessEqual(transition_difference, 1 / fps + 1e-6,
                                     'Aligned transition differs by more than one profile frame')
                samples = []
                for local, channel in [(.15 / speed, 2), (.8 / speed, 0)]:
                    preview_pixels, preview_at = self.frame(output, local, width, height)
                    exported, final_at = self.frame(final, .2 + .1 / speed + local, width, height)
                    self.assertGreater(int(preview_pixels[height // 4, width // 2, channel]), 220)
                    difference = np.abs(preview_pixels.astype(np.int16) - exported.astype(np.int16))
                    self.assertLess(float(difference.mean()), 2, 'Preview composition differs from saved export')
                    self.assertLess(float(np.mean(difference > 20)), .005)
                    samples.append({'requestedPreviewSec': local, 'previewPtsSec': preview_at,
                                    'requestedExportSec': .2 + .1 / speed + local, 'exportPtsSec': final_at,
                                    'meanAbsolutePixelDifference': float(difference.mean())})
                    mask = preview_pixels.min(axis=2) > 210
                    rows = np.flatnonzero(mask.any(axis=1))
                    ys, xs = np.where(mask)
                    self.assertGreater(len(xs), 200, 'Decoded caption glyphs must be visible')
                    self.assertEqual(1 + np.count_nonzero(np.diff(rows) > 1), 2)
                    self.assertGreaterEqual(int(xs.min()), raster['safeInsets'][0])
                    self.assertLess(int(xs.max()), width - raster['safeInsets'][0])
                    self.assertGreaterEqual(int(ys.min()), raster['safeInsets'][1])
                    self.assertLess(int(ys.max()), height - raster['safeInsets'][1])
                self.assertEqual({path: digest(path) for path in protected}, before)
                print(json.dumps({'previewParityEvidence': {'speed': speed, 'profile': profile,
                    'window': report['window'], 'inputSha256': before[self.source],
                    'previewSha256': report['outputSha256'], 'exportSha256': digest(final),
                    'captionRasterSha256': raster['rasterSha256'], 'previewRedPtsSec': preview_red,
                    'exportCutRedPtsSec': final_red, 'transitionDifferenceSec': transition_difference,
                    'transitionToleranceSec': 1 / fps, 'samples': samples,
                    'wholeFileDecode': 'PASS', 'savedSessionAndOriginalHashes': 'UNCHANGED'}}, sort_keys=True), flush=True)

    def test_output_window_is_capped_and_minimum_source_span_is_enforced(self):
        # Capping source seconds would allow a 28-second .25x preview.
        self.worker()
        with tempfile.TemporaryDirectory(prefix='aivs-preview-window-') as tmp:
            folder = Path(tmp)
            self.fixture(folder, speed=.25, source_in=0, duration=2)
            output, report = self.preview(folder, start=.5)
            self.assertEqual(report['window'], {'startSec': .5, 'endSec': 7.5, 'durationSec': 7,
                'totalSec': 8, 'sourceInSec': .125, 'sourceDurationSec': 1.75, 'speed': .25})
            self.check_output(output, 7, 960, 540, 24)
            output, report = self.preview(folder, start=7.2, name='tail')
            self.assertAlmostEqual(report['window']['sourceDurationSec'], .2)
            self.check_output(output, .8, 960, 540, 24)
            for start in (7.21, 8, 8.1):
                with self.subTest(start=start), self.assertRaisesRegex(Exception, 'PREVIEW_(RANGE|SOURCE_SPAN)'):
                    self.preview(folder, start=start, name='invalid-' + str(start))
                self.assertFalse((folder / ('invalid-' + str(start) + '.mp4')).exists())

    def test_invalid_requests_and_unsupported_edits_cannot_render(self):
        self.worker()
        with tempfile.TemporaryDirectory(prefix='aivs-preview-invalid-') as tmp:
            folder = Path(tmp)
            project, bindings = self.fixture(folder)
            before = {path: digest(path) for path in (project, bindings, self.master, self.source)}
            invalid = [[], {}, {'clipId': 'clip_selected'}, {'clipId': '../source', 'startSec': 0},
                       {'clipId': 'clip_selected', 'startSec': 0, 'output': '/tmp/arbitrary.mp4'}]
            invalid.extend({'clipId': 'clip_selected', 'startSec': value}
                           for value in (True, None, '0', -1, float('nan'), float('inf'), 10 ** 500))
            invalid.append({'clipId': 'clip_missing', 'startSec': 0})
            for index, request in enumerate(invalid):
                with self.subTest(request=request), self.assertRaisesRegex(Exception, 'PREVIEW_'):
                    self.preview(folder, name='invalid-' + str(index), request=request)
                self.assertFalse((folder / ('invalid-' + str(index) + '.mp4')).exists())
            self.assertEqual({path: digest(path) for path in before}, before)
            original = project.read_text()
            for name in ('split', 'effect', 'overflow'):
                doc = json.loads(original)
                clip = doc['project']['timeline'][1]
                if name == 'split':
                    doc['project']['sourceRefs'][1]['offsetSec'] = 3
                    clip.update(layout='split', secondarySourceId=doc['project']['sourceRefs'][0]['assetId'],
                                secondaryInSec=.5)
                    error = 'PREVIEW_UNSUPPORTED_LAYOUT'
                else:
                    clip['effects'] = [{'effectId': 'effect_bad', 'version': 1,
                        'type': 'zoom' if name == 'effect' else 'caption', 'startSec': 0, 'endSec': 1,
                        'parameters': {} if name == 'effect' else {'text': '\n'.join(['LINE'] * 20)},
                        'keyframes': []}]
                    error = 'EFFECT_RENDERING' if name == 'effect' else 'CAPTION_LAYOUT_OVERFLOW'
                project.write_text(json.dumps(doc))
                saved = project.read_bytes()
                with self.subTest(edit=name), self.assertRaisesRegex(Exception, error):
                    self.preview(folder, name=name)
                self.assertEqual(project.read_bytes(), saved)
                self.assertFalse((folder / (name + '.mp4')).exists())
                self.assertFalse((folder / (name + '.json')).exists())

    def test_existing_and_aliased_destinations_preserve_originals(self):
        worker = self.worker()
        with tempfile.TemporaryDirectory(prefix='aivs-preview-protection-') as tmp:
            folder = Path(tmp)
            project, bindings = self.fixture(folder)
            request = folder / 'request.json'
            request.write_text('{"clipId":"clip_selected","startSec":0}')
            alias = folder / 'source-alias.mp4'; alias.symlink_to(self.source)
            hard = folder / 'source-hardlink.mp4'; hard.hardlink_to(self.source)
            report_alias = folder / 'report-alias.json'; report_alias.symlink_to(project)
            report_hard = folder / 'report-hardlink.json'; report_hard.hardlink_to(bindings)
            occupied = folder / 'occupied.mp4'; occupied.write_bytes(b'prior result')
            protected = (project, bindings, request, self.master, self.source, occupied)
            before = {path: digest(path) for path in protected}
            pairs = [(alias, folder / 'a.json'), (hard, folder / 'b.json'),
                     (occupied, folder / 'c.json'), (folder / 'd.mp4', project),
                     (folder / 'e.mp4', report_alias), (folder / 'f.mp4', report_hard)]
            for index, (output, report) in enumerate(pairs):
                with self.subTest(output=output.name, report=report.name), self.assertRaises(Exception):
                    worker.preview_saved_clip(project, bindings, request, folder / ('job-' + str(index)), output, report)
            self.assertEqual({path: digest(path) for path in protected}, before)
            workspace = folder / 'existing-job'; workspace.mkdir()
            with self.assertRaises(FileExistsError):
                worker.preview_saved_clip(project, bindings, request, workspace, folder / 'out.mp4', folder / 'out.json')
            self.assertFalse((folder / 'out.mp4').exists())

    def test_changed_source_and_destination_races_refuse_publication(self):
        # The real compositor runs; the hook introduces races only at its return
        # boundary, when a pre-render hash/existence check is no longer enough.
        worker = self.worker()
        real_process = worker.process_manifest
        for change in ('source', 'output', 'report'):
            with self.subTest(change=change), tempfile.TemporaryDirectory(prefix='aivs-preview-race-') as tmp:
                folder = Path(tmp)
                self.fixture(folder)
                original = self.source.read_bytes()
                def render_then_change(*args, **kwargs):
                    result = real_process(*args, **kwargs)
                    if change == 'source':
                        self.source.write_bytes(self.master.read_bytes())
                    else:
                        (folder / ('preview.mp4' if change == 'output' else 'preview.json')).write_bytes(b'other writer')
                    return result
                try:
                    with patch.object(worker, 'process_manifest', side_effect=render_then_change):
                        with self.assertRaisesRegex(Exception, 'SOURCE_CHANGED|EXISTS|exist'):
                            self.preview(folder)
                    if change == 'source':
                        self.assertFalse((folder / 'preview.mp4').exists())
                        self.assertFalse((folder / 'preview.json').exists())
                    else:
                        occupied = folder / ('preview.mp4' if change == 'output' else 'preview.json')
                        self.assertEqual(occupied.read_bytes(), b'other writer')
                        absent = folder / ('preview.json' if change == 'output' else 'preview.mp4')
                        self.assertFalse(absent.exists())
                finally:
                    self.source.write_bytes(original)

    def test_cli_wraps_long_caption_and_records_a_decoded_result(self):
        # Exercise the manager-facing CLI and measured wrapping in an actual MP4.
        self.worker()
        with tempfile.TemporaryDirectory(prefix='aivs-preview-cli-') as tmp:
            folder = Path(tmp)
            project, bindings = self.fixture(folder, caption='W' * 180)
            request = folder / 'request.json'
            request.write_text('{"clipId":"clip_selected","startSec":0.2}')
            command = [sys.executable, '-m', 'engine.preview_saved_clip', '--project', str(project),
                       '--bindings', str(bindings), '--request', str(request), '--workspace', str(folder / 'job'),
                       '--output', str(folder / 'out.mp4'), '--report', str(folder / 'report.json')]
            result = run(command, cwd=ROOT, text=True)
            self.assertTrue(json.loads(result.stdout)['ok'])
            report = json.loads((folder / 'report.json').read_text())
            self.assertGreater(report['captionRasters'][0]['lineCount'], 1)
            self.check_output(folder / 'out.mp4', .8, 960, 540, 24)
            frame, _ = self.frame(folder / 'out.mp4', .2, 960, 540)
            ys, xs = np.where(frame.min(axis=2) > 210)
            self.assertGreater(len(xs), 200)
            self.assertGreaterEqual(int(xs.min()), 48)
            self.assertLess(int(xs.max()), 912)
            self.assertGreaterEqual(int(ys.min()), 27)
            self.assertLess(int(ys.max()), 513)
            refused = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)
            self.assertFalse(json.loads(refused.stderr)['ok'])


if __name__ == '__main__':
    unittest.main()
