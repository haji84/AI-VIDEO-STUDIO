#!/usr/bin/env python3
"""HUB NATURAL private-media drafting gate for AI VIDEO STUDIO.

Optional adapter; does not upload, post, or create misleading semantic labels.
Source media remains local and read-only. Public GitHub must never hold the
catalog, label file, rendered files or image/audio/video extracted from sources.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ALLOWED_TYPES = {'.mp4', '.mov', '.m4v', '.mkv'}
TAGS = {'discovery', 'capture', 'observation', 'closeup'}
PRESETS = {
    'A_challenge': {
        'intro': 'ハブ捕り1年目', 'subtitle': '200匹への道｜2026年の記録',
        'priority': ['capture', 'discovery', 'closeup', 'observation'],
    },
    'B_discovery': {
        'intro': '奄美大島の夜', 'subtitle': 'ライトの先にいたのは？',
        'priority': ['discovery', 'closeup', 'capture', 'observation'],
    },
    'C_wildlife': {
        'intro': '夜の奄美を記録する', 'subtitle': '野生のハブ・観察記録',
        'priority': ['observation', 'closeup', 'discovery', 'capture'],
    },
}

class Hold(Exception):
    """A gate failed. Do not render or publish a suspect source."""


def run(cmd, *, timeout=120):
    try:
        p = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Hold(f'RUN_FAILED:{cmd[0]}:{type(e).__name__}') from e
    if p.returncode:
        raise Hold(f'COMMAND_FAILED:{Path(cmd[0]).name}:{p.stderr[-300:].decode("utf-8", "replace")}')
    return p.stdout


def sha_file(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def resolve_media(root, relative):
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
        raise Hold('INVALID_RELATIVE_PATH')
    root = Path(root).resolve(strict=True)
    candidate = root / relative
    if candidate.is_symlink() or any(p.is_symlink() for p in candidate.parents if p != root and root in p.parents):
        raise Hold('SYMLINK_SOURCE')
    candidate = candidate.resolve(strict=True)
    if not candidate.is_relative_to(root) or not candidate.is_file() or candidate.suffix.lower() not in ALLOWED_TYPES:
        raise Hold('SOURCE_OUTSIDE_ROOT_OR_INVALID')
    return candidate


def probe(path):
    data = json.loads(run(['ffprobe', '-v', 'error', '-show_entries',
                           'format=duration:stream=codec_type,width,height', '-of', 'json', str(path)]))
    video = [s for s in data.get('streams', []) if s.get('codec_type') == 'video']
    if not video:
        raise Hold('VIDEO_MISSING')
    try:
        duration = float(data['format']['duration'])
    except (KeyError, ValueError, TypeError) as e:
        raise Hold('DURATION_UNKNOWN') from e
    if not 0 < duration <= 4 * 3600:
        raise Hold('DURATION_UNSAFE')
    return {'duration': duration, 'width': video[0].get('width'),
            'height': video[0].get('height'),
            'audio': any(s.get('codec_type') == 'audio' for s in data['streams'])}


def scan(root, out):
    root = Path(root).resolve(strict=True)
    out = Path(out).resolve()
    # A mistaken --out pointing at an original .mp4 must never replace footage.
    if out == root or out.is_relative_to(root):
        raise Hold('CATALOG_MUST_BE_OUTSIDE_ORIGINALS')
    results = []
    for path in sorted(root.rglob('*')):
        if path.suffix.lower() not in ALLOWED_TYPES:
            continue
        if not path.is_file() or path.is_symlink():
            continue
        try:
            path = resolve_media(root, str(path.relative_to(root)))
            results.append({'relative_name': str(path.relative_to(root)), 'sha256': sha_file(path),
                            'bytes': path.stat().st_size, **probe(path)})
        except Hold as e:
            results.append({'relative_name': str(path.relative_to(root)), 'hold': str(e)})
    known = {}
    for item in results:
        if 'sha256' in item:
            item['duplicate_of'] = known.get(item['sha256'])
            known.setdefault(item['sha256'], item['relative_name'])
    out.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=out.parent,
                                         prefix='.catalog-', suffix='.tmp', delete=False) as file:
            temp_path = Path(file.name)
            json.dump({'schema': 'hub-natural-media-catalog-v1', 'status': 'PRIVATE',
                       'semantic_recognition': 'NOT_PERFORMED', 'assets': results},
                      file, ensure_ascii=False, indent=2)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp_path, out)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    return results


def validate_labels(root, labels):
    """Labels are private, reviewed annotations; not generated by numerical scoring."""
    data = json.loads(Path(labels).read_text(encoding='utf-8'))
    if data.get('schema') != 'hub-natural-reviewed-segments-v1' or not isinstance(data.get('clips'), list):
        raise Hold('LABEL_SCHEMA_INVALID')
    if len(data['clips']) < 3 or len(data['clips']) > 100:
        raise Hold('CLIP_COUNT_UNSUPPORTED')
    files = {}
    clips = []
    for index, item in enumerate(data['clips']):
        if item.get('reviewed') is not True:
            raise Hold(f'CLIP_NOT_REVIEWED:{index}')
        tag = item.get('tag')
        if tag not in TAGS:
            raise Hold(f'INVALID_TAG:{index}')
        path = resolve_media(root, item.get('file'))
        if path not in files:
            files[path] = (sha_file(path), probe(path))
        digest, info = files[path]
        if digest != item.get('sha256'):
            raise Hold(f'SOURCE_SHA_MISMATCH:{index}')
        start, end = item.get('start'), item.get('end')
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or \
            isinstance(start, bool) or isinstance(end, bool) or \
            start < 0 or end <= start or end > info['duration'] + .01 or end - start > 20:
            raise Hold(f'CLIP_BOUNDARY_INVALID:{index}')
        clips.append({'tag': tag, 'file': path, 'relative': item['file'], 'sha256': digest,
                      'start': float(start), 'end': float(end), 'audio': info['audio']})
    return clips


def create_plans(clips, *, max_clips=4, interest_ranking=None):
    """Select three *distinct editorial hypotheses*, not asserted viral winners.

    If interest_ranking is supplied, all scored scenes must match actual
    source SHA, segment times, and previously reviewed event labels. Without
    editorial evidence, older tag-order fallback remains visibly uncalibrated.
    """
    plans = {}
    lookup = {(c['sha256'], round(c['start'], 3), round(c['end'], 3), c['tag']):c
              for c in clips}
    if interest_ranking is not None:
        if (not isinstance(interest_ranking, dict) or
                interest_ranking.get('schema') != 'hub-natural-interest-ranking-v1' or
                interest_ranking.get('reviewedEligible', 0) == 0 or
                interest_ranking.get('publishingAllowed') is not False):
            raise Hold('INTEREST_EVIDENCE_NOT_VERIFIED')
        rankings = interest_ranking.get('ranked', {})
        if set(rankings) != set(PRESETS):
            raise Hold('INTEREST_MODES_INCOMPLETE')
        for mode, ranked in rankings.items():
            for r in ranked:
                key = (r['sourceSha256'], round(r['inSeconds'], 3),
                       round(r['outSeconds'], 3), r['event'])
                if key not in lookup:
                    raise Hold('INTEREST_SCENE_SOURCE_OR_LABEL_MISMATCH')
    for name, preset in PRESETS.items():
        if interest_ranking is None:
            order = {tag: i for i, tag in enumerate(preset['priority'])}
            selected = sorted(enumerate(clips), key=lambda p: (order[p[1]['tag']], p[0]))[:max_clips]
            chosen = [c for _, c in selected]
            ranking_evidence = 'TAG_PRIORITY_FALLBACK_NO_MEASURED_INTEREST'
        else:
            eligible_events = set(preset['priority'])
            chosen=[]
            for r in interest_ranking['ranked'][name]:
                if r['event'] not in eligible_events:
                    continue
                key=(r['sourceSha256'], round(r['inSeconds'],3),
                     round(r['outSeconds'],3),r['event'])
                c=lookup[key]
                if c not in chosen:
                    chosen.append(c)
                if len(chosen)>=max_clips:
                    break
            if not chosen:
                raise Hold('INTEREST_REVIEW_HAS_NO_RELEVANT_SCENES')
            ranking_evidence = 'HUMAN_REVIEWED_EDITORIAL_SCORE_NOT_VIRALITY_FORECAST'
        plans[name] = {'intro': preset['intro'], 'subtitle': preset['subtitle'],
                       'clips': chosen, 'reviewRequired': True,
                       'rankingEvidence': ranking_evidence,
                       'semanticSource': 'reviewed_labels_not_AI_detection'}
    return plans


def measure_plan_diversity(plans):
    """Structural QA, *not* a user-interest or post-performance metric."""
    if set(plans) != set(PRESETS):
        raise Hold('THREE_PLANS_REQUIRED')
    shot_sets = {}
    openers = []
    for name, plan in plans.items():
        shots = {(c['sha256'], round(c['start'],3), round(c['end'],3))
                 for c in plan['clips']}
        if not shots:
            raise Hold('EMPTY_PLAN')
        shot_sets[name] = shots
        c=plan['clips'][0]
        openers.append((c['sha256'],round(c['start'],3),round(c['end'],3)))
    names=list(PRESETS)
    jaccards={}
    for i,a in enumerate(names):
        for b in names[i+1:]:
            union=shot_sets[a] | shot_sets[b]
            jaccards[a+'__'+b]=round(len(shot_sets[a]&shot_sets[b])/len(union),3)
    warnings=[]
    if len(set(openers)) < 3:
        warnings.append('OPENERS_NOT_THREE_DISTINCT_SCENES')
    if all(x==1 for x in jaccards.values()):
        warnings.append('ALL_VARIANTS_SAME_SHOT_INVENTORY')
    return {'structuralEvidence':'SHOT_IDS_AND_ORDER_ONLY',
            'uniqueOpeners':len(set(openers)),
            'pairwiseShotJaccard':jaccards,
            'warnings':warnings,
            'creativeQuality':'NOT_MEASURED',
            'postingReady':False}


def font_file(explicit=None):
    if explicit:
        f = Path(explicit).resolve(strict=True)
        if not f.is_file():
            raise Hold('FONT_NOT_FILE')
        return str(f)
    if not shutil.which('fc-match'):
        raise Hold('JAPANESE_FONT_REQUIRED')
    p = run(['fc-match', '-f', '%{file}', 'Noto Sans CJK JP']).decode().strip()
    if not p or not Path(p).is_file():
        raise Hold('JAPANESE_FONT_REQUIRED')
    return p


def quote_filter_path(s):
    return s.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'").replace(',', '\\,')


def render_part(clip, *, output, intro, subtitle, font, logo, tempdir):
    d = clip['end'] - clip['start']
    heading = Path(tempdir) / 'title.txt'
    note = Path(tempdir) / 'subtitle.txt'
    heading.write_text(intro, encoding='utf-8')
    note.write_text(subtitle, encoding='utf-8')
    font = quote_filter_path(font)
    head = quote_filter_path(str(heading))
    sub = quote_filter_path(str(note))
    vf = (
        '[0:v]split[back][front];'
        '[back]scale=180:320:force_original_aspect_ratio=increase,crop=180:320,boxblur=4:1,scale=720:1280[bg];'
        '[front]scale=720:-2[fg];'
        '[bg][fg]overlay=x=(W-w)/2:y=(H-h)/2,'
        'drawbox=x=0:y=0:w=iw:h=320:color=black@0.60:t=fill,'
        'drawbox=x=0:y=930:w=iw:h=350:color=black@0.65:t=fill,'
        f'drawtext=fontfile={font}:textfile={head}:fontcolor=white:fontsize=43:x=(w-text_w)/2:y=150,'
        f'drawtext=fontfile={font}:textfile={sub}:fontcolor=white:fontsize=31:x=(w-text_w)/2:y=1000'
    )
    args = ['ffmpeg', '-hide_banner', '-y', '-nostdin', '-v', 'error',
            '-ss', str(clip['start']), '-t', str(d), '-i', str(clip['file'])]
    if clip['audio']:
        audio_map = ['-map', '0:a:0']
    else:
        args += ['-f', 'lavfi', '-t', str(d), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']
        audio_map = ['-map', '1:a:0']
    if logo:
        args += ['-loop', '1', '-i', str(logo)]
        lid = '1' if clip['audio'] else '2'
        vf += f'[base];[{lid}:v]scale=132:-1[logo];[base][logo]overlay=x=18:y=20:shortest=1[v]'
    else:
        vf += '[v]'
    args += ['-filter_complex', vf, '-map', '[v]', *audio_map,
             '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-crf', '26', '-r', '30',
             '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-ar', '44100',
             '-af', 'aresample=async=1:first_pts=0', '-shortest', '-movflags', '+faststart', str(output)]
    run(args, timeout=220)


def render(root, label_file, out, *, logo_file=None, font=None, interest_file=None):
    """Build private drafts into staging; publish a complete reviewed receipt atomically.

    An existing output directory is never reused or overwritten. Broken or
    interrupted renders cannot leave a stale public-ready receipt beside video.
    """
    out = Path(out).resolve()
    root = Path(root).resolve(strict=True)
    if out.is_relative_to(root):
        raise Hold('OUTPUT_CANNOT_BE_INSIDE_SOURCE_DIRECTORY')
    if out.exists():
        raise Hold('OUTPUT_ALREADY_EXISTS_USE_NEW_DIRECTORY')
    clips = validate_labels(root, label_file)
    font = font_file(font)
    logo = Path(logo_file).resolve(strict=True) if logo_file else None
    if logo and (not logo.is_file() or logo.suffix.lower() not in {'.png', '.jpg', '.jpeg'}):
        raise Hold('LOGO_FORMAT_INVALID')
    interest_ranking = None
    if interest_file is not None:
        from interest_eval import rank_reviewed
        try:
            reviews = json.loads(Path(interest_file).read_text(encoding='utf-8'))
            interest_ranking = rank_reviewed(reviews)
        except (ValueError, OSError) as exc:
            raise Hold('EDITORIAL_REVIEWS_INVALID') from exc
    plans = create_plans(clips, interest_ranking=interest_ranking)
    variation = measure_plan_diversity(plans)
    out.parent.mkdir(parents=True, exist_ok=True)
    staged = Path(tempfile.mkdtemp(prefix='.hub-natural-render-', dir=out.parent))
    try:
        receipts = {}
        for name, plan in plans.items():
            output = staged / (name + '.mp4')
            with tempfile.TemporaryDirectory(prefix='hub_natural_') as scratch:
                paths = []
                for i, clip in enumerate(plan['clips']):
                    path = Path(scratch) / f'part_{i:03}.mp4'
                    render_part(clip, output=path, intro=plan['intro'], subtitle=plan['subtitle'],
                                font=font, logo=logo, tempdir=scratch)
                    paths.append(path)
                concat = Path(scratch) / 'list.txt'
                concat.write_text(''.join(f"file '{p}'\n" for p in paths), encoding='utf-8')
                run(['ffmpeg', '-hide_banner', '-y', '-nostdin', '-v', 'error', '-f', 'concat', '-safe', '0',
                     '-i', str(concat), '-map_metadata', '-1', '-map_chapters', '-1',
                     '-c', 'copy', '-movflags', '+faststart', str(output)], timeout=180)
            info = probe(output)
            if not (info['width'] == 720 and info['height'] == 1280 and info['audio']):
                raise Hold(f'OUTPUT_STREAM_INVALID:{name}')
            run(['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-i', str(output),
                 '-f', 'null', '-'], timeout=220)
            receipts[name] = {'file': output.name, 'sha256': sha_file(output),
                              'seconds': round(info['duration'], 3), 'dimensions': [720, 1280],
                              'parts': [{'sourceSha256': c['sha256'], 'inSeconds': c['start'],
                                         'outSeconds': c['end'], 'tag': c['tag']} for c in plan['clips']],
                              'fullDecode': 'PASS', 'privacyAndSafety': 'REVIEW_REQUIRED',
                              'labelEvidence': 'DECLARED_REVIEWED_NOT_INDEPENDENTLY_AUDITED',
                              'rankingEvidence': plan['rankingEvidence']}
        # Even a race during FFmpeg reading is caught before any final draft appears.
        for clip in clips:
            if sha_file(clip['file']) != clip['sha256']:
                raise Hold('SOURCE_CHANGED_DURING_RENDER')
        result = {'schema': 'hub-natural-private-drafts-v1', 'status': 'REVIEW_REQUIRED',
                  'posting': 'NOT_IMPLEMENTED', 'public_safe': False,
                  'gorilla_logo': 'APPLIED' if logo else 'MISSING_HOLD_FOR_PUBLICATION',
                  'face_location_plate_qa': 'NOT_PROVEN',
                  'interestPrediction': 'NOT_A_VIRALITY_FORECAST',
                  'variationReview': variation, 'drafts': receipts}
        (staged / 'receipt.json').write_text(json.dumps(result, ensure_ascii=False, indent=2),
                                             encoding='utf-8')
        if out.exists():
            raise Hold('OUTPUT_APPEARED_DURING_RENDER')
        os.rename(staged, out)
        return result
    finally:
        if staged.exists():
            shutil.rmtree(staged)


def main():
    p = argparse.ArgumentParser(description='Private HUB NATURAL intake/3-draft prototype')
    cmd = p.add_subparsers(dest='command', required=True)
    s = cmd.add_parser('scan')
    s.add_argument('--root', required=True)
    s.add_argument('--out', required=True)
    r = cmd.add_parser('render')
    r.add_argument('--root', required=True)
    r.add_argument('--labels', required=True)
    r.add_argument('--out', required=True)
    r.add_argument('--logo')
    r.add_argument('--font')
    r.add_argument('--interest-reviews')
    args = p.parse_args()
    try:
        if args.command == 'scan':
            ans = scan(args.root, args.out)
            print(json.dumps({'status': 'SCAN_ONLY', 'count': len(ans),
                              'semanticRecognition': 'NOT_PERFORMED'}))
        else:
            result = render(args.root, args.labels, args.out, logo_file=args.logo, font=args.font,
                            interest_file=args.interest_reviews)
            print(json.dumps({'status': result['status'],
                              'draftNames': list(result['drafts'])}))
    except (Hold, FileNotFoundError, ValueError) as e:
        print(json.dumps({'status': 'HOLD', 'reason': str(e)}), file=sys.stderr)
        raise SystemExit(2)

if __name__ == '__main__':
    main()
