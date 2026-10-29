"""Read-only saved-cut visual preview through the existing export compositor.

The local editor owns all paths and the worker's process-group deadline. This
entry point validates its saved snapshot, renders at the saved export profile,
and publishes a new MP4/report pair. Intermediate camera audio is not the saved
four-bus mix; this result is evidence for picture and static captions only.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
from pathlib import Path

from . import core_v01 as core
from .render_saved_project import ROOT, _install_new, _probe_local, _run
from .run_manifest import ManifestError, _assert_safe_destinations, _check_source_identity, process_manifest


def _request(path: Path) -> dict:
    def unique_fields(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ManifestError('PREVIEW_INVALID_REQUEST')
            result[key] = value
        return result

    with path.open('r', encoding='utf-8') as handle:
        raw = handle.read(4097)
    if len(raw) > 4096:
        raise ManifestError('PREVIEW_INVALID_REQUEST')
    try:
        request = json.loads(raw, object_pairs_hook=unique_fields)
    except (ValueError, RecursionError) as error:
        raise ManifestError('PREVIEW_INVALID_REQUEST') from error
    if not isinstance(request, dict) or set(request) != {'clipId', 'startSec'}:
        raise ManifestError('PREVIEW_INVALID_REQUEST')
    clip_id, start = request['clipId'], request['startSec']
    if not isinstance(clip_id, str) or not re.fullmatch(r'clip_[A-Za-z0-9_-]{1,70}', clip_id):
        raise ManifestError('PREVIEW_INVALID_CLIP')
    try:
        valid_start = type(start) in (int, float) and math.isfinite(start) and start >= 0
    except OverflowError:
        valid_start = False
    if not valid_start:
        raise ManifestError('PREVIEW_INVALID_START')
    return request


def _new_destination(path: Path, suffix: str) -> Path:
    requested = Path(path).absolute()
    if requested.suffix.lower() != suffix:
        raise ManifestError('PREVIEW_INVALID_DESTINATION')
    if requested.exists() or requested.is_symlink():
        raise FileExistsError('PREVIEW_DESTINATION_ALREADY_EXISTS')
    return requested.resolve()


def _digest(path: Path) -> str:
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def preview_saved_clip(project_file: Path, bindings_file: Path, request_file: Path,
                       workspace: Path, output: Path, report_file: Path) -> dict:
    project_file = Path(project_file).resolve(strict=True)
    bindings_file = Path(bindings_file).resolve(strict=True)
    request_file = Path(request_file).resolve(strict=True)
    request = _request(request_file)
    output = _new_destination(output, '.mp4')
    report_file = _new_destination(report_file, '.json')
    workspace = Path(workspace).absolute()
    if workspace.exists() or workspace.is_symlink():
        raise FileExistsError('PREVIEW_WORKSPACE_ALREADY_EXISTS')
    workspace = workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=False, mode=0o700)
    bundle_file = workspace / 'checked-preview-bundle.json'
    _run(['node', str(ROOT / 'tools/project-manifest.mjs'), '--project', str(project_file),
          '--bindings', str(bindings_file), '--output', str(bundle_file), '--format', 'bundle'], timeout=180)
    bundle = json.loads(bundle_file.read_text(encoding='utf-8'))
    if bundle.get('schema') != 'aivs-local-render-bundle-v1':
        raise ManifestError('UNSUPPORTED_RENDER_BUNDLE')
    plan = bundle['plan']
    manifest = copy.deepcopy(bundle['videoManifest'])
    manifest['protectedPaths'] = list(bundle['protectedPaths']) + [str(project_file), str(bindings_file),
                                                                 str(request_file), str(bundle_file)]
    for destination in (output, report_file):
        _assert_safe_destinations(manifest, workspace, destination)
    selected = next((clip for clip in plan['video'] if clip['clipId'] == request['clipId']), None)
    segment = next((clip for clip in manifest['timeline'] if clip['id'] == request['clipId']), None)
    if selected is None or segment is None:
        raise ManifestError('PREVIEW_CLIP_NOT_FOUND')
    if segment['layout'] != 'single':
        raise ManifestError('PREVIEW_UNSUPPORTED_LAYOUT')
    speed = selected['speed']
    total = selected['durationSec'] / speed
    start = request['startSec']
    if start >= total:
        raise ManifestError('PREVIEW_RANGE_EXCEEDED')
    end = min(total, start + 7)
    duration = end - start
    source_duration = duration * speed
    if source_duration < .2 - 1e-9:
        raise ManifestError('PREVIEW_SOURCE_SPAN_UNDER_200MS')
    # Preserve an exact 200ms boundary despite floating-point subtraction.
    source_duration = max(.2, source_duration)
    segment['start'] += start * speed
    segment['duration'] = source_duration
    manifest['timeline'] = [segment]
    manifest['quality'] = plan['exportProfile']
    # Keep every checked video source and manual offset. Filtering to the chosen
    # camera would change the first source and therefore the legacy clock origin.
    video_paths = {source['assetId']: source['path'] for source in manifest['sources']}
    checked_paths = {}
    for source in plan['sourceRefs']:
        asset_id = source['assetId']
        path = Path(video_paths.get(asset_id, bundle['mediaPaths'][asset_id])).resolve(strict=True)
        metadata = _probe_local(path)
        _check_source_identity({**source, 'path': str(path)}, {
            'has_audio': any(stream.get('codec_type') == 'audio' for stream in metadata.get('streams', [])),
            'duration': float(metadata['format']['duration']),
        })
        checked_paths[asset_id] = path
    with tempfile.TemporaryDirectory(prefix='compose_', dir=workspace) as temporary:
        temporary = Path(temporary)
        candidate = temporary / 'preview.mp4'
        rendered = process_manifest(manifest, temporary / 'video-job', candidate)
        if rendered.get('technical_ok') is not True or rendered.get('whole_file_decode_checked') is not True:
            raise core.StudioError('PREVIEW_OUTPUT_QA_FAILED')
        for source in plan['sourceRefs']:
            if _digest(checked_paths[source['assetId']]) != source['sha256']:
                raise ManifestError('SOURCE_CHANGED_DURING_PREVIEW')
        profile = core.PROFILES[plan['exportProfile']]
        report = {
            'schema': 'aivs-saved-clip-preview-v1',
            'projectId': plan['projectId'], 'projectRevision': plan['revision'], 'clipId': request['clipId'],
            'sourceIdentities': plan['sourceRefs'],
            'window': {'startSec': start, 'endSec': end, 'durationSec': duration, 'totalSec': total,
                       'sourceInSec': selected['sourceInSec'] + start * speed,
                       'sourceDurationSec': source_duration, 'speed': speed},
            'exportProfile': plan['exportProfile'],
            'width': profile['width'], 'height': profile['height'], 'fps': profile['fps'],
            'outputSha256': _digest(candidate), 'bytes': candidate.stat().st_size,
            'wholeFileDecode': 'PASS', 'captionRasters': rendered.get('captionRasters', []),
        }
        staged_report = temporary / 'report.json'
        with staged_report.open('x', encoding='utf-8') as handle:
            json.dump(report, handle, ensure_ascii=False, allow_nan=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        for destination, suffix in ((output, '.mp4'), (report_file, '.json')):
            _new_destination(destination, suffix)
            _assert_safe_destinations(manifest, workspace, destination)
            destination.parent.mkdir(parents=True, exist_ok=True)
        _install_new(candidate, output)
        installed = output.lstat()
        try:
            _install_new(staged_report, report_file)
        except OSError:
            # Remove only the file installed here if publishing its receipt fails.
            try:
                current = output.lstat()
                if (current.st_dev, current.st_ino) == (installed.st_dev, installed.st_ino):
                    output.unlink()
            except FileNotFoundError:
                pass
            raise
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description='Offline saved-cut visual preview; saved project remains unchanged')
    for flag in ('project', 'bindings', 'request', 'workspace', 'output', 'report'):
        parser.add_argument('--' + flag, required=True, type=Path)
    args = parser.parse_args()
    try:
        report = preview_saved_clip(args.project, args.bindings, args.request, args.workspace, args.output, args.report)
        print(json.dumps({'ok': True, 'outputSha256': report['outputSha256'],
                          'wholeFileDecode': report['wholeFileDecode']}))
    except (OSError, ValueError, KeyError, ManifestError, core.StudioError, subprocess.TimeoutExpired) as error:
        parser.exit(1, json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
