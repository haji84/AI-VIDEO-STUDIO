"""Tests use synthetic video only. No private footage or credentials."""
from __future__ import annotations
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import pipeline as subject


def create_fixture(path, *, with_audio=True, hue='blue'):
    args = ['ffmpeg', '-hide_banner', '-y', '-v', 'error', '-f', 'lavfi',
            '-i', f'color=c={hue}:s=320x180:r=25:d=3']
    if with_audio:
        args += ['-f', 'lavfi', '-i', 'sine=frequency=432:sample_rate=44100:duration=3',
                 '-shortest']
    args += ['-c:v', 'libx264', '-pix_fmt', 'yuv420p']
    if with_audio:
        args += ['-c:a', 'aac']
    args += [str(path)]
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


class HabuPipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.folder = Path(cls.tmp.name)
        cls.sources = cls.folder / 'sources'
        cls.sources.mkdir()
        create_fixture(cls.sources / 'a.mp4')
        create_fixture(cls.sources / 'b.mp4', with_audio=False, hue='green')
        cls.sha_a = subject.sha_file(cls.sources / 'a.mp4')
        cls.sha_b = subject.sha_file(cls.sources / 'b.mp4')
        cls.labels = cls.folder / 'labels.json'
        cls.labels.write_text(json.dumps({'schema': 'hub-natural-reviewed-segments-v1',
                                          'clips': [
                                              {'file': 'a.mp4', 'sha256': cls.sha_a,
                                               'start': 0.2, 'end': 0.9, 'tag': 'capture', 'reviewed': True},
                                              {'file': 'b.mp4', 'sha256': cls.sha_b,
                                               'start': 0.5, 'end': 1.2, 'tag': 'discovery', 'reviewed': True},
                                              {'file': 'a.mp4', 'sha256': cls.sha_a,
                                               'start': 1.0, 'end': 1.7, 'tag': 'observation', 'reviewed': True}
                                          ]}), encoding='utf-8')

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_source_scan_has_hash_and_no_semantic_claim(self):
        target = self.folder / 'scan.json'
        found = subject.scan(self.sources, target)
        self.assertEqual(len(found), 2)
        self.assertEqual({f['sha256'] for f in found}, {self.sha_a, self.sha_b})
        self.assertEqual(json.loads(target.read_text())['semantic_recognition'], 'NOT_PERFORMED')

    def test_path_traversal_and_unverified_label_are_hold(self):
        with self.assertRaises(subject.Hold):
            subject.resolve_media(self.sources, '../labels.json')
        labels = json.loads(self.labels.read_text())
        labels['clips'][0]['reviewed'] = False
        corrupt = self.folder / 'unreviewed.json'
        corrupt.write_text(json.dumps(labels))
        with self.assertRaisesRegex(subject.Hold, 'CLIP_NOT_REVIEWED'):
            subject.validate_labels(self.sources, corrupt)

    def test_modified_original_cannot_sneak_through(self):
        labels = json.loads(self.labels.read_text())
        labels['clips'][0]['sha256'] = '0' * 64
        corrupt = self.folder / 'wronghash.json'
        corrupt.write_text(json.dumps(labels))
        with self.assertRaisesRegex(subject.Hold, 'SOURCE_SHA_MISMATCH'):
            subject.validate_labels(self.sources, corrupt)

    def test_scan_will_not_overwrite_original_mp4(self):
        original = self.sources / 'a.mp4'
        before = subject.sha_file(original)
        with self.assertRaisesRegex(subject.Hold, 'CATALOG_MUST_BE_OUTSIDE_ORIGINALS'):
            subject.scan(self.sources, original)
        self.assertEqual(subject.sha_file(original), before)

    def test_render_refuses_existing_output_and_preserves_older_receipt(self):
        dest = self.folder / 'already-present'
        dest.mkdir(exist_ok=True)
        receipt = dest / 'receipt.json'
        receipt.write_text('original receipt', encoding='utf-8')
        with self.assertRaisesRegex(subject.Hold, 'OUTPUT_ALREADY_EXISTS'):
            subject.render(self.sources, self.labels, dest)
        self.assertEqual(receipt.read_text(encoding='utf-8'), 'original receipt')

    def test_plans_change_first_beat_with_same_verified_sources(self):
        clips = subject.validate_labels(self.sources, self.labels)
        plans = subject.create_plans(clips)
        self.assertEqual(set(plans), {'A_challenge', 'B_discovery', 'C_wildlife'})
        self.assertEqual(plans['A_challenge']['clips'][0]['tag'], 'capture')
        self.assertEqual(plans['B_discovery']['clips'][0]['tag'], 'discovery')
        self.assertEqual(plans['C_wildlife']['clips'][0]['tag'], 'observation')
        self.assertTrue(all(p['reviewRequired'] for p in plans.values()))

    def test_reviewed_interest_scores_drive_three_distinct_draft_hooks(self):
        from interest_eval import SCHEMA
        clips = subject.validate_labels(self.sources, self.labels)
        kind_ratings = {
            'capture': {'hook':2,'clarity':3,'action':4,'payoff':4,'surprise':0},
            'discovery': {'hook':4,'clarity':4,'action':1,'payoff':0,'surprise':1},
            'observation': {'hook':1,'clarity':4,'action':0,'payoff':1,'surprise':4},
        }
        reviews={'schema':SCHEMA,'scenes':[
            {'sourceSha256':c['sha256'],'start':c['start'],'end':c['end'],
             'event':c['tag'],'reviewed':True,'eventEvidence':'human_checked',
             'subjectVisible':True,'editorial':kind_ratings[c['tag']]}
            for c in clips]}
        private_path=self.folder/'interest_synthetic.json'
        private_path.write_text(json.dumps(reviews),encoding='utf8')
        from interest_eval import rank_reviewed
        ranking=rank_reviewed(reviews)
        plans=subject.create_plans(clips,interest_ranking=ranking)
        self.assertEqual(plans['A_challenge']['clips'][0]['tag'],'capture')
        self.assertEqual(plans['B_discovery']['clips'][0]['tag'],'discovery')
        self.assertEqual(plans['C_wildlife']['clips'][0]['tag'],'observation')
        dest=self.folder/'interest-output'
        result=subject.render(self.sources,self.labels,dest,interest_file=private_path)
        self.assertEqual(len(result['drafts']),3)
        self.assertFalse(result['public_safe'])
        self.assertTrue(all(v['rankingEvidence']=='HUMAN_REVIEWED_EDITORIAL_SCORE_NOT_VIRALITY_FORECAST'
                            for v in result['drafts'].values()))
        self.assertTrue(all(v['fullDecode']=='PASS' for v in result['drafts'].values()))

    def test_unverified_interest_data_does_not_produce_false_edits(self):
        from interest_eval import SCHEMA
        clips=subject.validate_labels(self.sources,self.labels)
        data={'schema':SCHEMA,'scenes':[{'sourceSha256':clips[0]['sha256'],
             'start':clips[0]['start'],'end':clips[0]['end'],'event':clips[0]['tag'],
             'reviewed':False,'eventEvidence':'model_suggestion',
             'subjectVisible':None,'editorial':None}]}
        path=self.folder/'unverified_interest.json';path.write_text(json.dumps(data))
        dest=self.folder/'unverified-output'
        with self.assertRaisesRegex(subject.Hold,'INTEREST_EVIDENCE_NOT_VERIFIED'):
            subject.render(self.sources,self.labels,dest,interest_file=path)
        self.assertFalse(dest.exists())

    def test_real_mp4_three_versions_full_decode_source_unchanged(self):
        # Synthetic video, real FFmpeg codecs and actual output readback.
        result = subject.render(self.sources, self.labels, self.folder / 'output')
        self.assertEqual(len(result['drafts']), 3)
        self.assertFalse(result['public_safe'])
        self.assertEqual(result['posting'], 'NOT_IMPLEMENTED')
        self.assertEqual(result['gorilla_logo'], 'MISSING_HOLD_FOR_PUBLICATION')
        self.assertEqual(subject.sha_file(self.sources / 'a.mp4'), self.sha_a)
        self.assertEqual(subject.sha_file(self.sources / 'b.mp4'), self.sha_b)
        for item in result['drafts'].values():
            self.assertEqual(item['fullDecode'], 'PASS')
            self.assertEqual(item['dimensions'], [720, 1280])
            path = self.folder / 'output' / item['file']
            self.assertEqual(subject.sha_file(path), item['sha256'])
            self.assertGreater(item['seconds'], 1.6)
        self.assertEqual(json.loads((self.folder / 'output/receipt.json').read_text())['status'], 'REVIEW_REQUIRED')

if __name__ == '__main__':
    unittest.main()
