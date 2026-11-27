#!/usr/bin/env python3
"""Evidence-led *editorial* scene ranking for HUB NATURAL.

No video detector, no learned popularity prediction, no social-platform API.
Only reviewed, source-hash-bound scene observations may be scored. Ratings are
subjective editorial hypotheses, not verified probabilities of going viral.
Public code never contains actual footage, human identities or review data.
"""
from __future__ import annotations

from collections import defaultdict, deque
import hashlib
import json
from pathlib import Path
import math
import re

SCHEMA = "hub-natural-editorial-reviews-v1"
RESULT_SCHEMA = "hub-natural-interest-ranking-v1"
TAGS = {"discovery", "capture", "observation", "closeup", "other_wildlife", "no_event", "unknown"}
VALID_AXES = {"hook", "clarity", "action", "payoff", "surprise"}
# Editorial design choices, not derived from performance data.
WEIGHTS = {
    "A_challenge": {"hook": .22, "clarity": .24, "action": .21, "payoff": .26, "surprise": .07},
    "B_discovery": {"hook": .33, "clarity": .32, "action": .20, "payoff": .10, "surprise": .05},
    "C_wildlife": {"hook": .16, "clarity": .29, "action": .11, "payoff": .14, "surprise": .30},
}
HEX64 = re.compile(r"^[0-9a-f]{64}$")


class ReviewHold(ValueError):
    """Insufficient semantic evidence. No output can be considered ready."""


def _bounded(v, lo, hi):
    return type(v) in (int, float) and math.isfinite(v) and lo <= v <= hi


def _scene_id(item):
    # Avoid actual video names/paths/user details in generated scorecard IDs.
    return hashlib.sha256((item["sourceSha256"] + "|" +
                           f'{item["start"]:.3f}|{item["end"]:.3f}').encode()).hexdigest()[:20]


def validate_reviews(data):
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        raise ReviewHold("REVIEW_SCHEMA_INVALID")
    raw = data.get("scenes")
    if not isinstance(raw, list) or not 1 <= len(raw) <= 5000:
        raise ReviewHold("REVIEW_SCENE_COUNT_INVALID")
    result = []
    seen = set()
    for i, x in enumerate(raw):
        if not isinstance(x, dict):
            raise ReviewHold(f"SCENE_NOT_OBJECT:{i}")
        sha = x.get("sourceSha256")
        if not isinstance(sha, str) or not HEX64.fullmatch(sha):
            raise ReviewHold(f"SOURCE_SHA_INVALID:{i}")
        start, end = x.get("start"), x.get("end")
        if not (_bounded(start, 0, 14400) and _bounded(end, 0, 14400) and
                0 < end-start <= 120):
            raise ReviewHold(f"SCENE_INTERVAL_INVALID:{i}")
        tag = x.get("event")
        if tag not in TAGS:
            raise ReviewHold(f"SCENE_EVENT_INVALID:{i}")
        reviewed = x.get("reviewed") is True
        src = x.get("eventEvidence")
        if src not in ("human_checked", "model_suggestion", "unverified"):
            raise ReviewHold(f"EVENT_EVIDENCE_INVALID:{i}")
        editorial = x.get("editorial")
        if editorial is not None:
            if (not isinstance(editorial, dict) or set(editorial) != VALID_AXES or
                    any(not _bounded(v, 0, 4) for v in editorial.values())):
                raise ReviewHold(f"EDITORIAL_RATINGS_INVALID:{i}")
        visibility = x.get("subjectVisible")
        if visibility is not None and type(visibility) is not bool:
            raise ReviewHold(f"VISIBILITY_INVALID:{i}")
        sid = _scene_id(x)
        if sid in seen:
            raise ReviewHold(f"DUPLICATE_SCENE:{i}")
        seen.add(sid)
        verified = reviewed and src == "human_checked" and tag not in ("unknown", "no_event")
        if visibility is False or visibility is None:
            verified = False
        if editorial is None:
            verified = False
        result.append({"sceneId": sid, "sourceSha256": sha, "start": float(start),
                       "end": float(end), "event": tag, "reviewed": reviewed,
                       "eventEvidence": src, "subjectVisible": visibility,
                       "editorial": editorial, "eligible": verified})
    return result


def rank_reviewed(data):
    scenes = validate_reviews(data)
    ranked = {}
    eligible = [s for s in scenes if s["eligible"]]
    for name, weights in WEIGHTS.items():
        scores = []
        for s in eligible:
            rating = s["editorial"]
            score = 25 * sum(weights[k]*rating[k] for k in VALID_AXES)
            # The subject must be legible to a new viewer. Punish unclear hooks.
            if rating["clarity"] < 2:
                score = max(0, score-25)
            scores.append({"sceneId": s["sceneId"], "sourceSha256": s["sourceSha256"],
                           "inSeconds": s["start"], "outSeconds": s["end"],
                           "event": s["event"], "score": round(score, 2),
                           "rationale": sorted(VALID_AXES, key=lambda k:-(weights[k]*rating[k]))[:2],
                           "note": "SUBJECTIVE_EDITORIAL_RATING_NOT_VIRALITY_FORECAST"})
        scores.sort(key=lambda v: (-v["score"], v["sceneId"]))
        ranked[name] = scores
    return {"schema": RESULT_SCHEMA, "status": "REVIEW_REQUIRED",
            "scenesTotal": len(scenes), "reviewedEligible": len(eligible),
            "needsReview": len(scenes)-len(eligible), "ranked": ranked,
            "viralityCalibration": "NOT_AVAILABLE_NO_POST_PERFORMANCE",
            "semanticModelAccuracy": "NOT_EVALUATED",
            "privacyCheck": "NOT_PERFORMED",
            "publishingAllowed": False,
            "limitations": ["RATINGS_ARE_HUMAN_EDITORIAL_JUDGMENTS",
                            "NOT_AN_AUTOMATIC_ANIMAL_DETECTOR",
                            "NO_PERFORMANCE_DATA_TO_VALIDATE_INTEREST_SCORE"]}


def _maximum_event_matches(detected, positives, min_overlap):
    # Only compare intervals from the same source and event class.
    truth_groups = defaultdict(list)
    for ti, t in enumerate(positives):
        truth_groups[(t['sourceSha256'], t['event'])].append((ti, t))
    adjacency = []
    for p in detected:
        candidates = []
        for ti, t in truth_groups[(p['sourceSha256'], p['event'])]:
            intersection = max(0, min(p['end'], t['end']) - max(p['start'], t['start']))
            union = max(p['end'], t['end']) - min(p['start'], t['start'])
            score = intersection / union
            if score >= min_overlap:
                candidates.append((score, ti))
        adjacency.append([ti for _, ti in sorted(candidates, key=lambda x: (-x[0], x[1]))])
    # Find augmenting paths, not just the highest individual IoU. Iterative
    # search avoids recursion limits on long chains of overlapping events.
    pred_to_truth = {}
    truth_to_pred = {}
    for root in range(len(detected)):
        pending = deque([root])
        visited = {root}
        parent = {}
        free = None
        while pending and free is None:
            p = pending.popleft()
            for t in adjacency[p]:
                if t in parent:
                    continue
                parent[t] = p
                if t not in truth_to_pred:
                    free = t
                    break
                nxt = truth_to_pred[t]
                if nxt not in visited:
                    visited.add(nxt)
                    pending.append(nxt)
        while free is not None:
            p = parent[free]
            previous = pred_to_truth.get(p)
            pred_to_truth[p] = free
            truth_to_pred[free] = p
            free = previous
    return set(pred_to_truth), set(truth_to_pred)


def evaluated_detections(truth, predictions, *, min_overlap=.4):
    """Measure predictions against human-checked intervals; never call it model accuracy without coverage.

    Records: {sourceSha256, start, end, event}. `truth` may include 'no_event'.
    Maximize the number of 1-to-1 matches by source, event and minimum temporal IoU.
    This is not an optimization of the sum of matched IoUs.
    A short biased holdout yields metrics marked insufficient, not a PASS.
    """
    if not _bounded(min_overlap, 0, 1) or min_overlap == 0:
        raise ReviewHold("IOU_THRESHOLD_INVALID")
    for seq in (truth, predictions):
        if not isinstance(seq, list) or len(seq)>10000:
            raise ReviewHold("EVAL_INPUT_INVALID")
        for x in seq:
            if not isinstance(x,dict) or not isinstance(x.get('sourceSha256'),str) or not HEX64.fullmatch(x['sourceSha256']):
                raise ReviewHold("EVAL_SOURCE_SHA_INVALID")
            if x.get('event') not in TAGS:
                raise ReviewHold("EVAL_EVENT_INVALID")
            if not (_bounded(x.get('start'),0,14400) and _bounded(x.get('end'),0,14400) and x['end'] > x['start']):
                raise ReviewHold("EVAL_INTERVAL_INVALID")
    # Human-check declarations are necessary, but cannot prove independence.
    seen_truth = set()
    source_nights = {}
    declared_nights = set()
    missing_nights = 0
    for x in truth:
        if x.get('reviewed') is not True or x.get('eventEvidence') != 'human_checked':
            raise ReviewHold('UNVERIFIED_GROUND_TRUTH')
        key = (x['sourceSha256'], x['start'], x['end'], x['event'])
        if key in seen_truth:
            raise ReviewHold('DUPLICATE_EVAL_TRUTH')
        seen_truth.add(key)
        night = x.get('reviewNight')
        if night is None:
            missing_nights += 1
            continue
        if not isinstance(night, str) or not night.strip() or night != night.strip():
            raise ReviewHold('EVAL_NIGHT_INVALID')
        previous = source_nights.setdefault(x['sourceSha256'], night)
        if previous != night:
            raise ReviewHold('EVAL_SOURCE_NIGHT_CONFLICT')
        if x['event'] != 'unknown':
            declared_nights.add(night)
    positives=[x for x in truth if x['event'] not in ('no_event','unknown')]
    detected=[x for x in predictions if x['event'] not in ('no_event','unknown')]
    seenp, seent = _maximum_event_matches(detected, positives, min_overlap)
    def counts(tp, fp, fn):
        return {
            "truePositive": tp, "falsePositive": fp, "falseNegative": fn,
            "precision": round(tp / (tp + fp), 4) if tp + fp else None,
            "recall": round(tp / (tp + fn), 4) if tp + fn else None,
            "f1": round(2 * tp / (2 * tp + fp + fn), 4) if 2 * tp + fp + fn else None,
        }

    per_event = {}
    for event in sorted(TAGS - {'no_event', 'unknown'}):
        p_indices = [i for i, p in enumerate(detected) if p['event'] == event]
        t_indices = [i for i, t in enumerate(positives) if t['event'] == event]
        tp = sum(i in seenp for i in p_indices)
        per_event[event] = {
            **counts(tp, len(p_indices) - tp, len(t_indices) - tp),
            "labeledPositive": len(t_indices), "predictedPositive": len(p_indices),
        }
    negatives = sum(x['event'] == 'no_event' for x in truth)
    # Count coverage, never certify independent nights from self-reported IDs.
    enough = len(positives) >= 30 and negatives >= 30 and len(declared_nights) >= 5 and missing_nights == 0
    return {
        "status": "COVERAGE_ONLY_INDEPENDENCE_NOT_VERIFIED" if enough else "INSUFFICIENT_INDEPENDENT_HOLDOUT",
        **counts(len(seenp), len(detected) - len(seenp), len(positives) - len(seent)),
        "perEvent": per_event,
        "labeledPositive": len(positives), "labeledNegative": negatives,
        "declaredNights": len(declared_nights), "missingNightLabels": missing_nights,
        "independentNights": None, "holdoutIndependence": "NOT_VERIFIED",
        "speciesPresenceAccuracy": "NOT_EVALUATED",
        "note": "TEMPORAL_IOU_EVENT_MATCH_ONLY_NOT_PROOF_OF_VIRAL_SUCCESS",
    }


def rank_private_file(input_path, output_path):
    inp=Path(input_path).resolve(strict=True)
    out=Path(output_path).resolve()
    for candidate in (inp, out):
        if any((p / '.git').exists() for p in (candidate,*candidate.parents)):
            raise ReviewHold('PRIVATE_REVIEWS_CANNOT_BE_INSIDE_GIT')
    if inp==out:
        raise ReviewHold("OUTPUT_MUST_NOT_OVERWRITE_SOURCE")
    result=rank_reviewed(json.loads(inp.read_text(encoding='utf8')))
    out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists():
        raise ReviewHold("OUTPUT_ALREADY_EXISTS")
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    return result
