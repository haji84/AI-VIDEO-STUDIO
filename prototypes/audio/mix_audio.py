#!/usr/bin/env python3
"""Prototype: deterministic, offline, non-destructive MP4 audio mixer.

Used to prove the reference mixing contract on generated clips; NOT an iOS app
and NOT an AI sound-selection engine. Only handles explicitly selected local files.
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
from pathlib import Path
from typing import Any

SUPPORTED_AUDIO = {'.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg'}
SUPPORTED_VIDEO = {'.mp4', '.mov', '.mkv'}


def _value(raw: Any, label: str, low: float, high: float) -> float:
    if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not math.isfinite(raw) or not low <= raw <= high:
        raise ValueError(f'{label} must be in [{low}, {high}]')
    return float(raw)


def _input_file(name: Any, audio: bool) -> Path:
    if not isinstance(name, str) or not name:
        raise ValueError('media source path missing')
    p = Path(name).expanduser().resolve(strict=True)
    if not p.is_file() or p.suffix.lower() not in (SUPPORTED_AUDIO if audio else SUPPORTED_VIDEO):
        raise ValueError(f'unsupported media: {p.name}')
    return p


def _ffprobe(path: Path) -> dict:
    cp = subprocess.run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)],
                        check=True, capture_output=True, text=True)
    return json.loads(cp.stdout)


def _volume_expr(ranges: list[list[float]], duck_gain: float) -> str:
    """Produce a fixed FFmpeg expression. User strings never enter filtergraph."""
    exp = '1'
    for start, end in reversed(ranges):
        exp = f'if(between(t\\,{start:.3f}\\,{end:.3f})\\,{duck_gain:.4f}\\,{exp})'
    return exp


def _check_ranges(data: Any, duration: float) -> list[list[float]]:
    if data is None:
        return []
    if not isinstance(data, list) or len(data) > 50:
        raise ValueError('duckRanges must be a list of up to 50 ranges')
    out = []
    for n, pair in enumerate(data):
        if not isinstance(pair, list) or len(pair) != 2:
            raise ValueError(f'duckRanges[{n}] must be [start,end]')
        a = _value(pair[0], 'duck start', 0, duration)
        b = _value(pair[1], 'duck end', 0, duration)
        if a >= b:
            raise ValueError('duck interval requires start < end')
        out.append([a, b])
    return sorted(out)


def render(spec: dict[str, Any]) -> dict:
    if spec.get('schemaVersion') != '0.3.1-audio':
        raise ValueError('unsupported schemaVersion')
    video = _input_file(spec.get('sourceVideo'), audio=False)
    output = Path(spec['output']).expanduser().resolve()
    if output == video or output in {_input_file(x['path'], True) for k in ('sfx', 'narration') for x in spec.get(k, [])}:
        raise ValueError('cannot overwrite source')
    meta = _ffprobe(video)
    vs = [x for x in meta.get('streams', []) if x.get('codec_type') == 'video']
    if not vs:
        raise ValueError('source is missing video')
    physical_duration = float(meta['format']['duration'])
    duration = _value(spec.get('durationSec', physical_duration), 'durationSec', 0.1, min(physical_duration + 0.03, 7200))
    original_gain = _value(spec.get('originalVolume', 1), 'originalVolume', 0, 1)
    if output.suffix.lower() != '.mp4':
        raise ValueError('output must be MP4')
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise FileExistsError('refusing to overwrite output')

    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(video)]
    filters = []
    names = []
    if any(s.get('codec_type') == 'audio' for s in meta['streams']):
        filters.append(f'[0:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,'
                       f'atrim=duration={duration:.3f},asetpts=PTS-STARTPTS,volume={original_gain:.4f}[original]')
    else:
        filters.append(f'anullsrc=channel_layout=stereo:sample_rate=48000,'
                       f'atrim=duration={duration:.3f}[original]')
    names.append('original')
    track_index = 1
    b = spec.get('bgm')
    if b is not None:
        if not isinstance(b, dict):
            raise ValueError('bgm must be object')
        bp = _input_file(b.get('path'), audio=True)
        command.extend(['-stream_loop', '-1' if b.get('loop', True) else '0', '-i', str(bp)])
        volume = _value(b.get('volume', .18), 'bgm volume', 0, 1)
        fade_in = _value(b.get('fadeInSec', .3), 'fadeInSec', 0, duration)
        fade_out = _value(b.get('fadeOutSec', .5), 'fadeOutSec', 0, duration)
        gain = _value(b.get('duckGain', .25), 'duckGain', 0, 1)
        ranges = _check_ranges(b.get('duckRanges', []), duration)
        expr = _volume_expr(ranges, gain)
        f = (f'[{track_index}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,'
             f'atrim=duration={duration:.3f},asetpts=PTS-STARTPTS,volume={volume:.4f}')
        if ranges:
            f += f',volume={expr}:eval=frame'
        if fade_in > 0:
            f += f',afade=t=in:st=0:d={fade_in:.3f}'
        if fade_out > 0:
            f += f',afade=t=out:st={duration-fade_out:.3f}:d={fade_out:.3f}'
        f += '[bgm]'
        filters.append(f)
        names.append('bgm')
        track_index += 1

    for typ in ('sfx', 'narration'):
        events = spec.get(typ, [])
        if not isinstance(events, list) or len(events) > 40:
            raise ValueError(f'{typ} must be a list of up to 40 items')
        for j, item in enumerate(events):
            if not isinstance(item, dict):
                raise ValueError(f'{typ}[{j}] must be an object')
            path = _input_file(item.get('path'), True)
            if path == output:
                raise ValueError('cannot overwrite source')
            start = _value(item.get('startSec'), 'startSec', 0, duration)
            gain = _value(item.get('volume', .5), 'volume', 0, 1)
            stop = _value(item.get('trimSec', min(5, duration-start)), 'trimSec', .01, duration)
            delay = round(start * 1000)
            name = f'{typ}{j}'
            command.extend(['-i', str(path)])
            filters.append(f'[{track_index}:a:0]aresample=48000,'
                           f'aformat=sample_fmts=fltp:channel_layouts=stereo,'
                           f'atrim=duration={stop:.3f},asetpts=PTS-STARTPTS,'
                           f'volume={gain:.4f},adelay={delay}:all=1[{name}]')
            names.append(name)
            track_index += 1

    filters.append(''.join(f'[{x}]' for x in names)
                   + f'amix=inputs={len(names)}:duration=first:dropout_transition=0,'
                     'alimiter=limit=0.90[outa]')
    command.extend(['-filter_complex', ';'.join(filters), '-map', '0:v:0', '-map', '[outa]',
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
                    '-t', f'{duration:.3f}', '-movflags', '+faststart', str(output)])
    subprocess.run(command, check=True)
    measured = _ffprobe(output)
    if not any(s.get('codec_type') == 'audio' for s in measured['streams']):
        raise RuntimeError('output has no audio')
    if abs(float(measured['format']['duration']) - duration) > .3:
        raise RuntimeError('output duration mismatch')
    subprocess.run(['ffmpeg', '-hide_banner', '-v', 'error', '-xerror', '-i', str(output), '-f', 'null', '-'],
                   check=True, capture_output=True, timeout=60)
    return {'status': 'PASS', 'output': str(output), 'durationSec': duration,
            'tracks': names, 'verified': 'ffprobe audio/video streams and full decoder pass',
            'semanticAudioQA': 'NOT_TESTED', 'iphoneNativeQA': 'NOT_TESTED'}


def main() -> None:
    parser = argparse.ArgumentParser(description='Offline audio MP4 mixer prototype (source never overwritten)')
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    result = render(json.loads(args.manifest.read_text(encoding='utf-8')))
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
