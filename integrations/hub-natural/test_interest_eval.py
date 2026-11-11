"""Synthetic-only editorial evidence and holdout tests."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from interest_eval import (SCHEMA, ReviewHold, rank_reviewed,
                           rank_private_file, evaluated_detections)

SHA1=hashlib.sha256(b'fixture-capture').hexdigest()
SHA2=hashlib.sha256(b'fixture-vehicle-road').hexdigest()

def scene(sha=SHA1,start=1,end=4,event='capture',rating=None,reviewed=True,evidence='human_checked',visible=True):
    return {'sourceSha256':sha,'start':start,'end':end,'event':event,
            'reviewed':reviewed,'eventEvidence':evidence,'subjectVisible':visible,
            'editorial':rating if rating is not None else {'hook':4,'clarity':4,'action':4,'payoff':4,'surprise':2}}

class Tests(unittest.TestCase):
    def test_real_event_with_weak_visibility_cannot_outscore_good_clear_hook(self):
        clear=scene(); dark=scene(SHA2,start=5,end=8,rating={'hook':4,'clarity':1,'action':4,'payoff':4,'surprise':4})
        r=rank_reviewed({'schema':SCHEMA,'scenes':[dark,clear]})
        for mode, ranked in r['ranked'].items():
            self.assertEqual(ranked[0]['sourceSha256'], SHA1)
            self.assertGreater(ranked[0]['score'], ranked[1]['score'])
        self.assertEqual(r['publishingAllowed'],False)
        self.assertEqual(r['viralityCalibration'],'NOT_AVAILABLE_NO_POST_PERFORMANCE')

    def test_model_guesses_and_unknowns_are_not_reviewed_evidence(self):
        r=rank_reviewed({'schema':SCHEMA,'scenes':[scene(evidence='model_suggestion'),scene(SHA2,5,8,reviewed=False)]})
        self.assertEqual(r['reviewedEligible'],0)
        self.assertEqual(r['needsReview'],2)
        self.assertTrue(all(v == [] for v in r['ranked'].values()))

    def test_no_event_must_not_be_ranked_as_snake_scene(self):
        r=rank_reviewed({'schema':SCHEMA,'scenes':[scene(event='no_event')]})
        self.assertEqual(r['reviewedEligible'],0)

    def test_invalid_rating_and_bad_range_fail_closed(self):
        doc={'schema':SCHEMA,'scenes':[scene()]}
        changed=copy.deepcopy(doc)
        changed['scenes'][0]['editorial']['clarity']=7
        with self.assertRaisesRegex(ReviewHold,'EDITORIAL'):
            rank_reviewed(changed)
        changed=copy.deepcopy(doc)
        changed['scenes'][0]['end']=0
        with self.assertRaisesRegex(ReviewHold,'INTERVAL'):
            rank_reviewed(changed)

    def test_same_scene_repeated_fails_closed(self):
        with self.assertRaisesRegex(ReviewHold, 'DUPLICATE'):
            rank_reviewed({'schema':SCHEMA,'scenes':[scene(),scene()]})

    def test_file_never_rewrites_review_source_or_previous_output(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); i=root/'review.json';o=root/'score.json'
            i.write_text(json.dumps({'schema':SCHEMA,'scenes':[scene()]}))
            before=i.read_bytes()
            rank_private_file(i,o)
            self.assertEqual(i.read_bytes(),before)
            self.assertEqual(json.loads(o.read_text())['status'],'REVIEW_REQUIRED')
            with self.assertRaisesRegex(ReviewHold,'OUTPUT_ALREADY_EXISTS'):
                rank_private_file(i,o)
            with self.assertRaisesRegex(ReviewHold,'OUTPUT_MUST_NOT_OVERWRITE_SOURCE'):
                rank_private_file(i,i)

    def test_temporal_event_eval_counts_false_positive_and_miss(self):
        truth=[{'sourceSha256':SHA1,'start':10,'end':14,'event':'capture','reviewNight':'night-1','reviewed':True,'eventEvidence':'human_checked'},
               {'sourceSha256':SHA1,'start':20,'end':24,'event':'discovery','reviewNight':'night-1','reviewed':True,'eventEvidence':'human_checked'},
               {'sourceSha256':SHA2,'start':0,'end':9,'event':'no_event','reviewNight':'night-1','reviewed':True,'eventEvidence':'human_checked'}]
        predictions=[{'sourceSha256':SHA1,'start':11,'end':14,'event':'capture'},
                     {'sourceSha256':SHA2,'start':2,'end':5,'event':'capture'}]
        r=evaluated_detections(truth,predictions)
        self.assertEqual((r['truePositive'],r['falsePositive'],r['falseNegative']),(1,1,1))
        self.assertEqual((r['precision'],r['recall'],r['f1']),(0.5,0.5,0.5))
        self.assertEqual(r['status'],'INSUFFICIENT_INDEPENDENT_HOLDOUT')
        truth[0]['eventEvidence']='model_suggestion'
        with self.assertRaisesRegex(ReviewHold, 'UNVERIFIED_GROUND_TRUTH'):
            evaluated_detections(truth,predictions)

if __name__=='__main__': unittest.main()
