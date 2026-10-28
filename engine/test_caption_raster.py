"""Actual caption pixels and MP4 output, using generated local media only."""
import os
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from . import core_v01 as core


class CaptionRasterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which('ffmpeg'):
            raise unittest.SkipTest('FFmpeg required for actual output checks')
        cls.font = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
        if not cls.font.is_file():
            raise unittest.SkipTest('DejaVu Sans test font unavailable')
        cls.temp = tempfile.TemporaryDirectory(prefix='aivs-caption-raster-')
        cls.folder = Path(cls.temp.name)
        cls.source = cls.folder / 'original.mp4'
        subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error',
                        '-f', 'lavfi', '-i', 'color=c=0x2050a0:s=640x360:r=24:d=1',
                        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
                        '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
                        '-shortest', str(cls.source)], check=True, capture_output=True)
        # Isolated test-only fontconfig: do not change system fonts/settings.
        cls.config = cls.folder / 'fonts.conf'
        cls.config.write_text('<fontconfig><dir>' + str(cls.font.parent) +
                              '</dir><cachedir>' + str(cls.folder / 'font-cache') +
                              '</cachedir></fontconfig>', encoding='utf-8')

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def render(self, caption, name):
        work = self.folder / name
        work.mkdir()
        output = work / 'output.mp4'
        source = {'id': 'camera1', 'path': str(self.source), 'name': 'original.mp4',
                  'offset': 0, 'has_audio': True}
        segment = {'id': 'clip1', 'camera': 'camera1', 'layout': 'single',
                   'start': 0, 'duration': 1, 'speed': 1, 'caption': caption}
        with patch.dict(os.environ, {'AIVS_CAPTION_FONT': str(self.font),
                                     'FONTCONFIG_FILE': str(self.config)}):
            self.last_evidence = core._segment_render({'sources': [source]}, segment, output,
                                                      {'width': 640, 'height': 360, 'fps': 24, 'crf': 18},
                                                      'libx264', work)
        return output

    def frame(self, output):
        result = subprocess.run(['ffmpeg', '-v', 'error', '-ss', '0.5', '-i', str(output),
                                 '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                                 'pipe:1'], check=True, capture_output=True)
        return np.frombuffer(result.stdout, dtype=np.uint8).reshape(360, 640, 3)

    def white_rows(self, frame):
        mask = (frame.min(axis=2) > 210)
        return mask, np.flatnonzero(mask.any(axis=1))

    def test_long_caption_wraps_inside_visible_safe_area(self):
        # Removing measured wrapping clips actual decoded glyphs at x=0/639.
        output = self.render('W' * 180, 'long')
        mask, rows = self.white_rows(self.frame(output))
        ys, xs = np.where(mask)
        self.assertGreater(len(xs), 500, 'Actual text must be visible')
        self.assertGreaterEqual(int(xs.min()), 32, 'Left glyphs were clipped')
        self.assertLess(int(xs.max()), 608, 'Right glyphs were clipped')
        self.assertGreaterEqual(int(ys.min()), 18, 'Top glyphs were clipped')
        self.assertLess(int(ys.max()), 342, 'Bottom glyphs were clipped')
        self.assertGreaterEqual(1 + np.count_nonzero(np.diff(rows) > 1), 2)
        subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(output),
                        '-f', 'null', '-'], check=True, capture_output=True)

    def test_explicit_newlines_remain_three_visible_lines(self):
        # Flattening newlines creates one line; each hand-selected phrase fits.
        mask, rows = self.white_rows(self.frame(self.render('FIRST\nSECOND\nTHIRD', 'lines')))
        self.assertGreater(mask.sum(), 100)
        self.assertEqual(1 + np.count_nonzero(np.diff(rows) > 1), 3)

    def test_missing_japanese_glyphs_fail_before_writing_mp4(self):
        # DejaVu Sans has no these Japanese glyphs; tofu is not successful text.
        with self.assertRaisesRegex(core.StudioError, 'CAPTION_FONT_GLYPHS_MISSING'):
            self.render('日本語の字幕', 'missing')
        self.assertFalse((self.folder / 'missing' / 'output.mp4').exists())

    def test_unfit_caption_fails_without_silently_dropping_lines(self):
        # Twenty explicit lines must not be clipped or collapsed to one line.
        with self.assertRaisesRegex(core.StudioError, 'CAPTION_LAYOUT_OVERFLOW'):
            self.render('\n'.join(['LINE'] * 20), 'too_tall')
        self.assertFalse((self.folder / 'too_tall' / 'output.mp4').exists())

    def test_bad_discovered_font_does_not_hide_a_usable_installed_font(self):
        from . import caption_raster
        invalid = self.folder / 'invalid-font.otf'
        invalid.write_bytes(b'not a TrueType or OpenType font')
        raster = self.folder / 'font-fallback.png'
        with patch.object(caption_raster, '_font_candidates', return_value=[invalid, self.font]):
            evidence = caption_raster.render_caption('READABLE', 640, 360, raster)
        self.assertEqual(evidence['fontSha256'], hashlib.sha256(self.font.read_bytes()).hexdigest())
        from PIL import Image
        with Image.open(raster) as pixels:
            self.assertGreater(np.count_nonzero(np.asarray(pixels)[:, :, :3].min(axis=2) > 210), 100)

    def test_fullwidth_space_without_glyph_is_rejected_in_basic_layout(self):
        from PIL import ImageFont
        with patch.object(ImageFont.core, 'HAVE_RAQM', False):
            with self.assertRaisesRegex(core.StudioError, 'CAPTION_FONT_GLYPHS_MISSING'):
                self.render('A\u3000B', 'missing_space')
        self.assertFalse((self.folder / 'missing_space' / 'output.mp4').exists())

    def test_reported_box_origin_matches_actual_subsampled_mp4(self):
        # FFmpeg's 4:2:0 overlay rounds odd origins down by one pixel.
        pixels = self.frame(self.render('W' * 180, 'origin'))
        evidence = self.last_evidence
        dark_x = np.flatnonzero(pixels[evidence['y'] + 6, :, 2] < 100)
        dark_y = np.flatnonzero(pixels[:, evidence['x'] + 6, 2] < 100)
        self.assertEqual(int(dark_x.min()), evidence['x'])
        self.assertEqual(int(dark_y.min()), evidence['y'])

    def test_saved_project_records_caption_evidence_and_preserves_real_audio(self):
        from .render_saved_project import render_saved_project
        folder = self.folder / 'saved'
        folder.mkdir()
        root = Path(__file__).resolve().parent.parent
        digest = hashlib.sha256(self.source.read_bytes()).hexdigest()
        script = r"""
import {createProject,EditSession} from './packages/project/project.mjs';
import {saveSession,loadSession,hashFile} from './packages/project/local-store.mjs';
import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
const [folder,path]=process.argv.slice(1),id='asset_'+'1'.repeat(32);
const p=createProject({projectId:'project_caption',sourceRefs:[{assetId:id,
 sha256:await hashFile(path),mediaKind:'video',durationSec:1,hasAudio:true,
 offsetSec:0,driftPpm:0,syncStatus:'master'}]});p.exportProfile='review';
p.timeline=[{clipId:'clip_caption',sourceId:id,sourceInSec:0,durationSec:1,startSec:0,
 speed:1,layout:'single',effects:[]}];
p.audioClips=[{id:'audio_source',assetId:id,bus:'source',startSec:0,endSec:1,
 trimInSec:0,speed:1,gainDb:0,loop:false,fadeInSec:0,fadeOutSec:0}];
const s=new EditSession(p),q=s.current;
q.timeline[0].effects=[{effectId:'effect_caption',type:'caption',version:1,startSec:0,
 endSec:1,parameters:{text:'FIRST\nSECOND\nTHIRD'},keyframes:[]}];s.apply(q);
const file=join(folder,'project.json');await saveSession(file,s);const reopened=await loadSession(file);
if(!reopened.undo()||!reopened.redo())throw new Error('HISTORY_LOST');await saveSession(file,reopened);
await writeFile(join(folder,'bindings.json'),JSON.stringify([{assetId:id,path}]));
"""
        subprocess.run(['node', '--input-type=module', '-e', script, str(folder), str(self.source)],
                       cwd=root, check=True, capture_output=True)
        output = folder / 'saved.mp4'
        before = (folder / 'project.json').read_bytes()
        with patch.dict(os.environ, {'AIVS_CAPTION_FONT': str(self.font)}):
            report = render_saved_project(folder / 'project.json', folder / 'bindings.json',
                                          folder / 'job', output)
        self.assertEqual(len(report.get('captionRasters', [])), 1,
                         'Final saved-project report lost the actual caption evidence')
        evidence = report['captionRasters'][0]
        self.assertEqual(evidence['lineCount'], 3)
        self.assertEqual(evidence['glyphCoverage'], 'CMAP_VERIFIED')
        self.assertEqual(evidence['clipId'], 'clip_caption')
        stored = json.loads((folder / 'job' / 'technical_qa.json').read_text())
        self.assertEqual(stored['captionRasters'], report['captionRasters'])
        self.assertTrue(report['whole_file_decode_checked'])
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(output), '-vn', '-ac', '1',
                              '-ar', '48000', '-f', 'f32le', 'pipe:1'], check=True, capture_output=True)
        samples = np.frombuffer(pcm.stdout, dtype='<f4')[9600:33600]
        self.assertGreater(float(np.sqrt(np.mean(samples ** 2))), .01)
        peak = np.fft.rfftfreq(len(samples), 1/48000)[np.argmax(abs(np.fft.rfft(samples)))]
        self.assertLess(abs(peak - 440), 5)
        self.assertEqual((folder / 'project.json').read_bytes(), before)
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), digest)

    def test_caption_free_render_runs_without_site_packages(self):
        # -S removes Pillow/fontTools from this interpreter, exercising real MP4
        # production instead of mocking dependency imports or FFmpeg.
        folder = self.folder / 'no_dependencies'
        folder.mkdir()
        code = """
import sys
from pathlib import Path
from engine import core_v01 as c
source,work=Path(sys.argv[1]),Path(sys.argv[2])
p={'sources':[{'id':'cam','path':str(source),'name':'synthetic.mp4','offset':0,'has_audio':True}]}
s={'id':'clip','camera':'cam','layout':'single','start':0,'duration':1,'speed':1,'caption':''}
c._segment_render(p,s,work/'out.mp4',{'width':640,'height':360,'fps':24,'crf':18},'libx264',work)
"""
        subprocess.run([sys.executable, '-S', '-c', code, str(self.source), str(folder)],
                       cwd=Path(__file__).resolve().parent.parent, check=True, capture_output=True)
        self.assertTrue((folder / 'out.mp4').is_file())


if __name__ == '__main__':
    unittest.main()
