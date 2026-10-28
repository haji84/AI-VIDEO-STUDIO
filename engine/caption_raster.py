"""Bounded static captions using one verified installed font and actual pixels.

This module imports optional media dependencies only when a caption is rendered.
It never downloads or installs fonts. The project text itself is not rewritten.
"""
from __future__ import annotations

import hashlib
import io
import math
import os
import shutil
import subprocess
import unicodedata
from pathlib import Path


class CaptionError(ValueError):
    pass


def _font_candidates():
    explicit = os.environ.get('AIVS_CAPTION_FONT')
    if explicit:
        return [Path(explicit).expanduser()]
    candidates = [
        Path('C:/Windows/Fonts/meiryo.ttc'),
        Path('C:/Windows/Fonts/YuGothM.ttc'),
        Path('C:/Windows/Fonts/msgothic.ttc'),
        Path('/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc'),
        Path('/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc'),
        Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'),
        Path('/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc'),
        Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
    ]
    matcher = shutil.which('fc-match')
    if matcher:
        try:
            result = subprocess.run([matcher, '-s', '--format=%{file}\n', 'sans-serif:lang=ja'],
                                    capture_output=True, text=True, timeout=5, check=False,
                                    stdin=subprocess.DEVNULL)
            if result.returncode == 0:
                candidates.extend(Path(p) for p in result.stdout.splitlines()[:32] if p)
        except (OSError, subprocess.TimeoutExpired):
            pass  # Known local font paths remain usable without fontconfig.
    return list(dict.fromkeys(candidates))


def _font_bytes(text, TTFont):
    from fontTools.ttLib import TTLibError
    # Even U+3000 and other spaces can become .notdef boxes in a font/layout
    # combination. Only the explicit line separator is never drawn.
    required = {ord(c) for c in text if c != '\n'}
    seen_font = False
    invalid_font = False
    for path in _font_candidates():
        try:
            with path.open('rb') as handle:
                data = handle.read(64 * 1024 * 1024 + 1)
            if not data or len(data) > 64 * 1024 * 1024:
                continue
            with TTFont(io.BytesIO(data), fontNumber=0, lazy=True) as font:
                cmap = font.getBestCmap() or {}
                covered = {point for point in required
                           if point in cmap and font.getGlyphID(cmap[point]) != 0}
            seen_font = True
            if required <= covered:
                return data, path.name, len(required)
        except TTLibError:
            invalid_font = True
            continue
        except (OSError, ValueError, KeyError, AssertionError):
            continue
    if seen_font:
        raise CaptionError('CAPTION_FONT_GLYPHS_MISSING: 字幕の全文字を表示できるフォントをAIVS_CAPTION_FONTで指定してください。')
    if invalid_font:
        raise CaptionError('CAPTION_FONT_INVALID: フォントを読み取れません。')
    raise CaptionError('CAPTION_FONT_UNAVAILABLE: 使用できるローカルフォントがありません。')


def _clusters(text):
    # Keep combining accents with their base rather than wrapping between them.
    groups = []
    for character in text:
        if groups and unicodedata.category(character).startswith('M'):
            groups[-1] += character
        else:
            groups.append(character)
    return groups


def render_caption(text: str, width: int, height: int, output: Path) -> dict:
    """Render an entire static caption or fail; never crop/shrink/drop text.

    Cmap coverage establishes glyph availability, not typography/meaning or
    physical-device acceptance. Actual glyph and background bounds are measured
    on the same raster sent to the existing FFmpeg compositor.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
        from fontTools.ttLib import TTFont, TTLibError
    except ImportError as error:
        raise CaptionError('CAPTION_DEPENDENCY_MISSING: 字幕にはrequirements-media.txtのPillowとfontToolsが必要です。') from error
    if not isinstance(text, str) or not 0 < len(text) <= 200:
        raise CaptionError('CAPTION_TEXT_INVALID: 字幕は1〜200文字で指定してください。')
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    if any(unicodedata.category(c).startswith('C') and c != '\n' for c in text):
        raise CaptionError('CAPTION_TEXT_UNSUPPORTED_CONTROL: 制御文字は字幕に使えません。')
    if not text.strip():
        raise CaptionError('CAPTION_TEXT_INVALID: 字幕に表示する文字がありません。')
    try:
        data, name, coverage = _font_bytes(text, TTFont)
    except TTLibError as error:
        raise CaptionError('CAPTION_FONT_INVALID: フォントを読み取れません。') from error
    font_size = max(18, width // 38)
    try:
        font = ImageFont.truetype(io.BytesIO(data), font_size, index=0)
    except OSError as error:
        raise CaptionError('CAPTION_FONT_INVALID: フォントを描画できません。') from error
    inset_x, inset_y = math.ceil(width * .05), math.ceil(height * .05)
    padding, gap = 14, max(4, font_size // 5)
    available = width - 2 * (inset_x + padding)
    if available <= 0:
        raise CaptionError('CAPTION_LAYOUT_OVERFLOW: 出力が字幕より小さすぎます。')
    lines = []
    for paragraph in text.split('\n'):
        line = ''
        for cluster in _clusters(paragraph):
            candidate = line + cluster
            bounds = font.getbbox(candidate)
            if bounds[2] - bounds[0] > available:
                if not line:
                    raise CaptionError('CAPTION_LAYOUT_OVERFLOW: 字幕が表示領域に収まりません。')
                lines.append(line)
                line = cluster
                bounds = font.getbbox(line)
                if bounds[2] - bounds[0] > available:
                    raise CaptionError('CAPTION_LAYOUT_OVERFLOW: 字幕が表示領域に収まりません。')
            else:
                line = candidate
        lines.append(line)
    bounds = [font.getbbox(line) for line in lines]
    ascent, descent = font.getmetrics()
    line_height = max(ascent + descent, max(b[3] - b[1] for b in bounds))
    box_width = max(b[2] - b[0] for b in bounds) + 2 * padding
    box_height = len(lines) * line_height + (len(lines) - 1) * gap + 2 * padding
    bottom = max(60, inset_y)
    if box_height > height - bottom - inset_y:
        raise CaptionError('CAPTION_LAYOUT_OVERFLOW: 字幕が多すぎます。改行や文字数を減らしてください。')
    glyphs = Image.new('L', (box_width, box_height), 0)
    draw = ImageDraw.Draw(glyphs)
    for index, (line, bound) in enumerate(zip(lines, bounds)):
        x = (box_width - (bound[2] - bound[0])) // 2 - bound[0]
        y = padding + index * (line_height + gap) - bound[1]
        draw.text((x, y), line, font=font, fill=255)
    actual = glyphs.getbbox()
    if actual is None or actual[0] < padding or actual[1] < padding or actual[2] > box_width - padding or actual[3] > box_height - padding:
        raise CaptionError('CAPTION_LAYOUT_OVERFLOW: 字幕の実描画範囲を確認できません。')
    raster = Image.new('RGBA', glyphs.size, (0, 0, 0, 166))
    raster.paste((255, 255, 255, 255), (0, 0), glyphs)
    # The existing output is 4:2:0: match the compositor's even-pixel origin so
    # the recorded placement is the actual placement rather than a rounded one.
    x = ((width - box_width) // 2) // 2 * 2
    y = (height - bottom - box_height) // 2 * 2
    if x < inset_x or y < inset_y or x + box_width > width - inset_x:
        raise CaptionError('CAPTION_LAYOUT_OVERFLOW: 字幕が表示領域に収まりません。')
    raster.save(output, format='PNG')
    return {'schema': 'aivs-static-caption-raster-v1', 'x': x, 'y': y,
            'width': box_width, 'height': box_height, 'lineCount': len(lines),
            'fontSize': font_size, 'fontName': name, 'fontFaceIndex': 0,
            'fontSha256': hashlib.sha256(data).hexdigest(),
            'glyphCodepointsChecked': coverage, 'glyphCoverage': 'CMAP_VERIFIED',
            'glyphBounds': [actual[0]+x, actual[1]+y, actual[2]+x, actual[3]+y],
            'safeInsets': [inset_x, inset_y],
            'rasterSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
            'physicalDeviceAcceptance': 'NOT_RUN'}
