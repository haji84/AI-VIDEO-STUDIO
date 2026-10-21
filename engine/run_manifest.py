"""Independent, portable FFmpeg processing entry point for AI VIDEO STUDIO.

Runs in a container, VM, workstation or Cloud Run Job when provisioned.
Expects already staged local video files. This does NOT itself deploy, poll a
cloud queue, charge users, run a vision model or verify semantic safety.

CLI:
  python -m engine.run_manifest --manifest job.json --workspace /tmp/aivs --output video.mp4
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import re
import sys
import time
from pathlib import Path

from . import core_v01 as core

ALLOWED_QUALITY = {'review', 'hd', 'fullhd'}


class ManifestError(Exception):
    pass


def _check_manifest(m: dict) -> None:
    if not isinstance(m, dict) or m.get('schema') != 1:
        raise ManifestError('Unknown manifest schema')
    videos = m.get('sources')
    if not isinstance(videos, list) or not 1 <= len(videos) <= 100:
        raise ManifestError('Sources must contain 1 to 100 files')
    ids = set()
    for video in videos:
        if not isinstance(video, dict) or not re.fullmatch(r'asset_[0-9a-f]{32}', str(video.get('assetId',''))):
            raise ManifestError('Invalid asset reference')
        if video['assetId'] in ids:
            raise ManifestError('Duplicate asset reference')
        ids.add(video['assetId'])
        path = Path(str(video.get('path', '')))
        if not path.is_file() or path.suffix.lower() not in core.VIDEO_EXTS:
            raise ManifestError('Staged video missing or unsupported: ' + path.name)
    if m.get('quality', 'review') not in ALLOWED_QUALITY:
        raise ManifestError('Invalid quality')
    if m.get('timeline') is not None and not isinstance(m['timeline'], list):
        raise ManifestError('Timeline must be a list')
    if bool(m.get('autoPlan', False)) and m.get('timeline'):
        raise ManifestError('Choose an automatic first cut OR a manual timeline')
    if m.get('manualOffsets') is not None and not isinstance(m.get('manualOffsets'), dict):
        raise ManifestError('Invalid manual sync offsets')
    if m.get('allowUnverifiedSync') not in {True, False, None}:
        raise ManifestError('Invalid sync gate')


def _remap_clips(clips, sources) -> list[dict]:
    by_asset = {asset:s for asset,s in sources}
    if not isinstance(clips,list) or not clips or len(clips)>2000:
        raise ManifestError('No clips to render')
    result = []
    for x in clips:
        if not isinstance(x,dict) or x.get('sourceId') not in by_asset:
            raise ManifestError('Timeline refers to unknown camera')
        secondary = x.get('secondarySourceId')
        layout = x.get('layout', 'single')
        if layout=='split' and (secondary not in by_asset or secondary==x['sourceId']):
            raise ManifestError('Second camera is invalid')
        clip_id = str(x.get('id', ''))
        if not re.fullmatch(r'clip_[A-Za-z0-9_-]{1,70}',clip_id):
            raise ManifestError('Invalid clip identifier')
        # 'start' is shared synchronized timeline time, not a per-camera file offset.
        result.append({'id':clip_id,'camera':by_asset[x['sourceId']]['id'],
                       'secondary':by_asset[secondary]['id'] if layout=='split' else None,
                       'layout':layout,'start':x.get('start'), 'duration':x.get('duration'),
                       'speed':x.get('speed',1.0),'caption':str(x.get('caption',''))})
    return result


def process_manifest(manifest: dict, workspace: Path, output: Path, progress=None) -> dict:
    """Render a submitted timeline or a time-based first cut with honest QA."""
    _check_manifest(manifest)
    workspace=Path(workspace).resolve()
    output=Path(output).resolve()
    workspace.mkdir(parents=True,exist_ok=True)
    start_time=time.monotonic()
    project=core.new_project(str(manifest.get('name','動画プロジェクト')))
    core.add_sources(project,[s['path'] for s in manifest['sources']])
    mapped=list(zip([x['assetId'] for x in manifest['sources']],project['sources']))
    manual_offsets=manifest.get('manualOffsets') or {}
    all_manual=len(mapped)>1 and all(asset in manual_offsets for asset,_ in mapped[1:])
    if len(mapped)>1 and not all_manual:
        sync = core.sync_sources(project,max_shift_seconds=int(manifest.get('maxSyncShiftSeconds',600)))
    elif len(mapped)>1:
        sync={'aligned':1,'unverified':len(mapped)-1,'details':[], 'method':'owner_manual_unverified'}
    else:
        sync={'aligned':1,'unverified':0,'details':[]}
    for asset,src in mapped:
        offset=manual_offsets.get(asset)
        if offset is not None:
            if not isinstance(offset,(int,float)) or not math.isfinite(offset):raise ManifestError('Invalid offset')
            core.manual_offset(project,src['id'],float(offset))
    untrusted=[s['name'] for s in project['sources'][1:] if s['sync']['method'] not in {'audio_candidate','master'}]
    if untrusted and not manifest.get('allowUnverifiedSync',False):
        raise ManifestError('SYNC_UNVERIFIED: '+'; '.join(untrusted)+'; use independently verified manual offsets')
    # Existing v0.1 engine does not understand scenes or role semantics. This is
    # deliberately named first-cut and MUST NOT be described as AI final edit.
    if manifest.get('autoPlan',False):
        core.make_plan(project,float(manifest.get('switchSeconds',18)))
    else:
        project['timeline']=_remap_clips(manifest.get('timeline',[]),mapped)
    core.validate_timeline(project)
    if output in [Path(x['path']).resolve() for x in project['sources']]:
        raise ManifestError('Cannot overwrite original footage')
    report=core.render_project(project,workspace/'scratch',output,quality=manifest.get('quality','review'),gpu=False,callback=progress)
    report.update({'executionMode':'portable_ffmpeg_processor','semantic_editing':'not_implemented',
                   'final_educational_accuracy':'not_evaluated',
                   'video_input_count':len(mapped),'elapsed_wall_seconds':round(time.monotonic()-start_time,2),
                   'source_ids':[asset for asset,_ in mapped],
                   'sync_estimates':sync})
    report_path=workspace/'technical_qa.json'
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    return report


def cli():
    ap=argparse.ArgumentParser(description='Cloud-portable video processing job')
    ap.add_argument('--manifest',required=True,help='Trusted manifest path')
    ap.add_argument('--workspace',required=True,help='Isolated scratch path')
    ap.add_argument('--output',required=True,help='Output MP4 path')
    args=ap.parse_args()
    try:
        manifest=json.loads(Path(args.manifest).read_text(encoding='utf-8'))
        result=process_manifest(manifest,Path(args.workspace),Path(args.output))
        print(json.dumps({'ok':True,'path':result['path'],'technical_ok':result['technical_ok'],
                          'semantic_editing':result['semantic_editing']},ensure_ascii=False))
    except (core.StudioError,ManifestError,OSError,ValueError,KeyError) as exc:
        print(json.dumps({'ok':False,'error':str(exc)},ensure_ascii=False),file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    cli()
