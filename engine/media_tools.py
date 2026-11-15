"""One local FFmpeg tool boundary for import, analysis and rendering.

No download, shell invocation, registry mutation or arbitrary disk search.
The resolve CLI lets the Node editor use the same selection as Python workers.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys


class MediaToolError(Exception):
    pass


def _pair(directory, windows):
    suffix = '.exe' if windows else ''
    paths = {name: Path(directory) / (name + suffix) for name in ('ffmpeg', 'ffprobe')}
    if all(p.is_file() and os.access(p, os.X_OK) for p in paths.values()):
        return {name: str(path.resolve()) for name, path in paths.items()}
    return None


def resolve_tools(*, environ=None, windows=None):
    """Require one complete pair; an explicit invalid selection never falls back."""
    environ = os.environ if environ is None else environ
    windows = os.name == 'nt' if windows is None else windows
    explicit = environ.get('AIVS_FFMPEG_DIR')
    if explicit:
        pair = _pair(explicit, windows)
        if pair:
            return pair
        raise MediaToolError('FFMPEG_TOOLCHAIN_INCOMPLETE: AIVS_FFMPEG_DIR 内の ffmpeg と ffprobe を確認してください。再インストールの前に保存先の指定を確認できます。')
    bundled = _pair(Path(__file__).resolve().parent.parent / 'tools' / 'ffmpeg' / 'bin', windows)
    if bundled:
        return bundled
    for name in ('ffmpeg', 'ffprobe'):
        found = shutil.which(name + ('.exe' if windows else ''), path=environ.get('PATH', ''))
        if found:
            pair = _pair(Path(found).resolve().parent, windows)
            if pair:
                return pair
    # WinGet's links and package roots are scoped installation locations. A
    # desktop-launched process can have an older PATH than a new PowerShell.
    candidates = []
    if windows:
        for variable in ('LOCALAPPDATA', 'PROGRAMDATA', 'ProgramFiles'):
            value = environ.get(variable)
            if not value:
                continue
            root = Path(value) / 'WinGet' if variable == 'ProgramFiles' else Path(value) / 'Microsoft' / 'WinGet'
            linked = _pair(root / 'Links', True)
            if linked:
                return linked
            packages = root / 'Packages'
            if packages.is_dir():
                for package in sorted(packages.glob('Gyan.FFmpeg*')):
                    for directory in [package / 'bin', *sorted(package.glob('ffmpeg*/bin'))]:
                        pair = _pair(directory, True)
                        if pair and pair not in candidates:
                            candidates.append(pair)
        if len(candidates) == 1:
            return candidates[0]
        if len(candidates) > 1:
            raise MediaToolError('FFMPEG_TOOLCHAIN_AMBIGUOUS: 複数の導入先があるため AIVS_FFMPEG_DIR で使用する bin フォルダを選んでください。')
    raise MediaToolError('FFMPEG_TOOLCHAIN_UNAVAILABLE: ffmpeg と ffprobe を検出できません。起動元の PATH または AIVS_FFMPEG_DIR を確認してください。')


def resolve_tool(name, **options):
    if name not in ('ffmpeg', 'ffprobe'):
        raise MediaToolError('MEDIA_TOOL_INVALID')
    return resolve_tools(**options)[name]


def parse_probe_json(payload):
    """A successful exit code is insufficient: stdout must be structured data."""
    if not isinstance(payload, (str, bytes, bytearray)) or not payload.strip():
        raise MediaToolError('FFPROBE_JSON_EMPTY: 動画検査の応答が空です。素材は保持して検査を再試行してください。')
    if len(payload) > 1024 * 1024:
        raise MediaToolError('FFPROBE_JSON_TOO_LARGE: 動画検査の応答が上限を超えました。')
    try:
        metadata = json.loads(payload)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise MediaToolError('FFPROBE_JSON_INVALID: 動画検査が有効な JSON を返しませんでした。') from error
    if (not isinstance(metadata, dict) or
            not isinstance(metadata.get('format', {}), dict) or
            not isinstance(metadata.get('streams', []), list) or
            any(not isinstance(stream, dict) for stream in metadata.get('streams', []))):
        raise MediaToolError('FFPROBE_JSON_SCHEMA: 動画検査の応答形式が不正です。')
    for section in [metadata.get('format', {}), *metadata.get('streams', [])]:
        if section.get('tags') is not None and not isinstance(section['tags'], dict):
            raise MediaToolError('FFPROBE_JSON_SCHEMA: 動画検査のタグ形式が不正です。')
    for stream in metadata.get('streams', []):
        for dimension in ('width', 'height'):
            value = stream.get(dimension)
            if value is not None and (type(value) is not int or value < 0):
                raise MediaToolError('FFPROBE_JSON_SCHEMA: 動画検査の寸法形式が不正です。')
    return metadata


def main():
    parser = argparse.ArgumentParser(description='Resolve installed local media tools without changing the machine.')
    parser.add_argument('--resolve', action='store_true', required=True)
    parser.parse_args()
    try:
        print(json.dumps(resolve_tools()))
    except MediaToolError as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
