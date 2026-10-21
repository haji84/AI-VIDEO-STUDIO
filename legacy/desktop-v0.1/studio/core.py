"""AI VIDEO STUDIO local media engine.

No cloud or Codex usage is required during normal processing.
Inputs are never modified. Audio sync confidence is evidence, not certainty.
"""
from __future__ import annotations

import array
import copy
import datetime as dt
import hashlib
import json
import math
import os
import re
import shutil
import statistics
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Callable

PROFILES = {
    "review": {"width": 960, "height": 540, "fps": 24, "crf": 25},
    "fullhd": {"width": 1920, "height": 1080, "fps": 30, "crf": 20},
    "hd": {"width": 1280, "height": 720, "fps": 30, "crf": 22},
}
VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".m4v", ".avi", ".webm"}


class StudioError(Exception):
    pass


def utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _which(program: str) -> str:
    from_env = os.environ.get("AIVS_FFMPEG_DIR", "")
    if from_env:
        name = program + (".exe" if os.name == "nt" else "")
        candidate = Path(from_env) / name
        if candidate.is_file():
            return str(candidate)
    local_dir = Path(__file__).resolve().parent.parent / "tools" / "ffmpeg" / "bin"
    candidate = local_dir / (program + (".exe" if os.name == "nt" else ""))
    if candidate.is_file():
        return str(candidate)
    found = shutil.which(program)
    if not found:
        raise StudioError(f"{program} が見つかりません。FFmpegを初回セットアップしてください。")
    return found


def command(args: list[str], timeout: int | None = None) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, check=False, stdin=subprocess.DEVNULL)
    except FileNotFoundError as exc:
        raise StudioError(f"実行ファイルが見つかりません: {args[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise StudioError(f"処理が制限時間を超えました: {args[0]}") from exc


def media_info(path: str) -> dict[str, Any]:
    original = Path(path).expanduser().resolve(strict=True)
    if not original.is_file() or original.suffix.lower() not in VIDEO_EXTS:
        raise StudioError(f"対応する動画ファイルではありません: {original.name}")
    cp = command([_which("ffprobe"), "-v", "error", "-show_entries", "format=duration,format_name:format_tags=creation_time:stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate:stream_tags=creation_time:stream_side_data=side_data_type,projection", "-of", "json", str(original)], timeout=120)
    if cp.returncode:
        raise StudioError(f"動画を解析できません: {original.name}\n{cp.stderr[-900:]}")
    try:
        data = json.loads(cp.stdout)
        stream = next(s for s in data.get("streams", []) if s.get("codec_type") == "video")
        duration = float(data.get("format", {}).get("duration") or 0)
        if not math.isfinite(duration) or duration <= 0:
            raise ValueError("duration")
    except (ValueError, StopIteration, KeyError) as exc:
        raise StudioError(f"有効な動画ストリームが見つかりません: {original.name}") from exc
    has_audio = any(s.get("codec_type") == "audio" for s in data.get("streams", []))
    width, height = int(stream.get("width") or 0), int(stream.get("height") or 0)
    tags = data.get("format", {}).get("tags", {})
    created = tags.get("creation_time") or (stream.get("tags") or {}).get("creation_time")
    projections = json.dumps(stream.get("side_data_list", []), ensure_ascii=False).lower()
    spherical = "spherical" in projections or "equirect" in projections
    return {
        "id": uuid.uuid4().hex[:12], "path": str(original), "name": original.name,
        "duration": round(duration, 3), "bytes": original.stat().st_size,
        "width": width, "height": height, "codec": stream.get("codec_name", ""),
        "fps": stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "",
        "has_audio": has_audio, "creation_time": created,
        "projection_evidence": bool(spherical),
        "maybe_360": bool(spherical or (height > 0 and 1.98 < width / height < 2.02)),
        "equirect": bool(spherical), "yaw": 0.0, "pitch": 0.0,
        "offset": 0.0, "sync": {"method": "not_aligned", "confidence": 0.0},
    }


def new_project(name: str = "新しい動画プロジェクト") -> dict[str, Any]:
    now = utcnow()
    return {"schema": 1, "name": name[:80] or "新しい動画プロジェクト", "created_at": now,
            "updated_at": now, "sources": [], "timeline": [], "settings": {"mode": "training", "switch_seconds": 18,
            "export_profile": "fullhd"}, "notes": []}


def safe_project_id(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,70}", value):
        raise StudioError("不正なプロジェクトIDです。")
    return value


def store_project(path: Path, project: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    obj = copy.deepcopy(project)
    obj["updated_at"] = utcnow()
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)
    project["updated_at"] = obj["updated_at"]


def read_project(path: Path) -> dict[str, Any]:
    o = json.loads(path.read_text(encoding="utf-8"))
    if o.get("schema") != 1 or not isinstance(o.get("sources"), list) or not isinstance(o.get("timeline"), list):
        raise StudioError("未対応のプロジェクト形式です。")
    return o


def add_sources(project: dict[str, Any], paths: list[str]) -> list[dict[str, Any]]:
    if not isinstance(paths, list) or not paths or len(paths) > 100:
        raise StudioError("1回に追加できる動画は1〜100本です。")
    existing = {str(Path(s["path"]).resolve()).lower() for s in project["sources"]}
    added = []
    for path in paths:
        resolved = str(Path(path).expanduser().resolve(strict=True))
        if resolved.lower() in existing:
            continue
        data = media_info(resolved)
        if not project["sources"] and not added:
            data["sync"] = {"method": "master", "confidence": 1.0}
        added.append(data)
        existing.add(resolved.lower())
    project["sources"].extend(added)
    return added


def _audio_envelope(path: str, step_seconds: float = 0.1, max_seconds: float = 7200) -> list[float]:
    rate = 1000
    cp = subprocess.run([_which("ffmpeg"), "-hide_banner", "-nostdin", "-v", "error", "-i", path,
                         "-t", str(int(max_seconds)), "-vn", "-ac", "1", "-ar", str(rate),
                         "-f", "s16le", "pipe:1"], stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE, timeout=3600, check=False)
    if cp.returncode or len(cp.stdout) < rate * 2:
        raise StudioError(f"音声データを抽出できません: {Path(path).name}")
    samples = array.array("h")
    samples.frombytes(cp.stdout[:len(cp.stdout) // 2 * 2])
    batch = int(step_seconds * rate)
    count = len(samples) // batch
    raw = []
    for i in range(count):
        win = samples[i * batch:(i + 1) * batch]
        raw.append(math.sqrt(sum(x*x for x in win) / batch))
    # Local novelty removes ambient level and highlights shared audio events.
    prefix = [0.0]
    for value in raw:
        prefix.append(prefix[-1] + value)
    values = []
    for i, current in enumerate(raw):
        a, b = max(0, i - 15), min(len(raw), i + 16)
        neighborhood = (prefix[b] - prefix[a]) / (b - a)
        values.append(max(0.0, current - neighborhood))
    mean = sum(values) / len(values) if values else 0.0
    scale = math.sqrt(sum((x-mean)**2 for x in values) / max(1, len(values)))
    if scale < 0.05:
        raise StudioError("同期に使える音声の変化が不足しています。")
    return [(x - mean) / scale for x in values]


def _fft(data: list[complex], inverse: bool = False) -> None:
    n = len(data)
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j ^= bit
        if i < j:
            data[i], data[j] = data[j], data[i]
    size = 2
    while size <= n:
        angle = (2 if inverse else -2) * math.pi / size
        w_step = complex(math.cos(angle), math.sin(angle))
        half = size // 2
        for start in range(0, n, size):
            w = 1 + 0j
            for k in range(start, start + half):
                u = data[k]
                v = data[k + half] * w
                data[k], data[k + half] = u + v, u - v
                w *= w_step
        size <<= 1
    if inverse:
        for i in range(n):
            data[i] /= n


def _correlate(master: list[float], target: list[float], max_shift: int, min_overlap: int = 50) -> tuple[int, float, float]:
    """Return target start relative to master in bins and normalized overlap score."""
    m, n = len(master), len(target)
    size = 1
    while size < m+n-1:
        size *= 2
    a = [complex(x) for x in master] + [0j] * (size-m)
    b = [complex(x) for x in reversed(target)] + [0j] * (size-n)
    _fft(a)
    _fft(b)
    for i in range(size):
        a[i] *= b[i]
    _fft(a, inverse=True)
    sq_m = [0.0]
    sq_t = [0.0]
    for x in master:
        sq_m.append(sq_m[-1] + x*x)
    for x in target:
        sq_t.append(sq_t[-1] + x*x)
    options = []
    for shift in range(-min(n-1, max_shift), min(m-1, max_shift)+1):
        start_m, start_t = max(shift, 0), max(-shift, 0)
        overlap = min(m-start_m, n-start_t)
        if overlap < min_overlap:
            continue
        power_m = sq_m[start_m+overlap] - sq_m[start_m]
        power_t = sq_t[start_t+overlap] - sq_t[start_t]
        if power_m < 1e-8 or power_t < 1e-8:
            continue
        score = a[shift+n-1].real / math.sqrt(power_m * power_t)
        # Slight preference for longer supported overlap.
        weighted = score * (0.75 + 0.25 * overlap / min(m, n))
        options.append((weighted, score, shift))
    if not options:
        raise StudioError("音声の共通区間が足りません。手動で同期位置を設定してください。")
    options.sort(reverse=True)
    best = options[0]
    secondary = max((x[1] for x in options if abs(x[2] - best[2]) >= 20), default=-1.0)
    return best[2], round(best[1], 3), round(max(0.0, best[1] - secondary), 3)


def sync_sources(project: dict[str, Any], max_shift_seconds: int = 600,
                 callback: Callable[[str], None] | None = None) -> dict[str, Any]:
    sources = project["sources"]
    if not sources:
        raise StudioError("動画が登録されていません。")
    if len(sources) == 1:
        sources[0]["offset"] = 0.0
        sources[0]["sync"] = {"method":"master", "confidence":1.0}
        return {"aligned": 1, "unverified": 0, "details":[]}
    if not sources[0]["has_audio"]:
        raise StudioError("基準動画に音声がありません。基準動画を変えるか手動同期してください。")
    if callback: callback("基準動画の音声を解析中")
    master = _audio_envelope(sources[0]["path"])
    sources[0]["offset"] = 0.0
    sources[0]["sync"] = {"method":"master", "confidence":1.0}
    details, good = [], 1
    for s in sources[1:]:
        if callback: callback(f"{s['name']} の音声を同期中")
        try:
            if not s["has_audio"]:
                raise StudioError("音声トラックなし")
            target = _audio_envelope(s["path"])
            lag, score, uniqueness = _correlate(master, target, int(max_shift_seconds * 10), min_overlap=100)
            # Do not silently accept weak or ambiguous correlations.
            if score < 0.43 or uniqueness < 0.045:
                s["sync"] = {"method":"unverified_audio", "confidence":score, "uniqueness":uniqueness,
                             "candidate_offset":round(lag / 10.0, 2), "message":"同期候補です。別の共通場面で確認してください。"}
            else:
                s["offset"] = round(lag / 10.0, 2)
                s["sync"] = {"method":"audio_candidate", "confidence":score,"uniqueness":uniqueness,
                             "message":"音声同期の推定値です。重要映像では目視・試聴確認が必要です。"}
                good += 1
        except StudioError as exc:
            s["sync"] = {"method":"unverified", "confidence":0.0, "message":str(exc)}
        details.append({"source":s["name"],"offset":s["offset"], **s["sync"]})
    return {"aligned":good, "unverified":len(sources)-good, "details":details}


def manual_offset(project: dict[str, Any], source_id: str, seconds: float) -> None:
    if not math.isfinite(seconds) or abs(seconds) > 7200:
        raise StudioError("同期位置が範囲外です。")
    for i, s in enumerate(project["sources"]):
        if s["id"] == source_id:
            if i == 0 and abs(seconds)>0.001:
                raise StudioError("基準動画のオフセットは0秒に固定します。")
            s["offset"] = round(seconds, 3)
            s["sync"] = {"method":"manual", "confidence":None,
                         "message":"手動調整値。同期精度は未検証です。"} if i else {"method":"master","confidence":1.0}
            return
    raise StudioError("指定された動画がありません。")


def make_plan(project: dict[str, Any], switch_seconds: float = 18.0) -> list[dict[str, Any]]:
    """Conservative multi-angle first-cut. Never claims semantic video understanding."""
    sources = project["sources"]
    if not sources:
        raise StudioError("動画を追加してください。")
    if not 4 <= switch_seconds <= 180:
        raise StudioError("切り替え間隔は4〜180秒で指定してください。")
    start = min(float(s["offset"]) for s in sources)
    end = max(float(s["offset"]) + float(s["duration"]) for s in sources)
    timeline = []
    t = start
    index = 0
    while t < end-0.15:
        candidates = [s for s in sources if float(s["offset"]) <= t + 0.001 and
                      float(s["offset"]) + float(s["duration"]) > t + 0.15]
        if not candidates:
            next_starts = [float(s["offset"]) for s in sources if float(s["offset"]) > t]
            if not next_starts: break
            t = min(next_starts)
            continue
        chosen = candidates[index % len(candidates)]
        end_t = min(end, t + switch_seconds,
                    float(chosen["offset"]) + float(chosen["duration"]))
        next_starts = [float(s["offset"]) for s in sources if t+0.01 < float(s["offset"]) < end_t]
        if next_starts:
            end_t = min(end_t, min(next_starts))
        if end_t - t < 0.1:
            t += 0.2
            continue
        other = next((s for s in candidates if s["id"] != chosen["id"] and
                    float(s["offset"]) + float(s["duration"]) >= end_t), None)
        layout = "split" if other and index % 4 == 1 else "single"
        timeline.append({"id":uuid.uuid4().hex[:12], "start":round(t,3),
                         "duration":round(end_t-t,3), "camera":chosen["id"],
                         "secondary":other["id"] if layout == "split" else None,
                         "layout":layout, "caption":"", "speed":1.0})
        t = end_t
        index += 1
    project["timeline"] = timeline
    return timeline


def validate_timeline(project: dict[str, Any]) -> None:
    source_map = {s["id"]:s for s in project["sources"]}
    if not project["timeline"]:
        raise StudioError("タイムラインが空です。")
    if len(project["timeline"]) > 1200:
        raise StudioError("区間数の上限1200を超えています。")
    total = 0.0
    for pos, item in enumerate(project["timeline"]):
        camera = source_map.get(item.get("camera"))
        if camera is None:
            raise StudioError(f"区間{pos+1}: 元の動画がありません。")
        start, duration = float(item["start"]), float(item["duration"])
        speed = float(item.get("speed", 1.0))
        if not all(map(math.isfinite, (start, duration, speed))) or duration < 0.2 or speed < 0.25 or speed > 4:
            raise StudioError(f"区間{pos+1}: 開始時刻、再生時間、速度が不正です。")
        for role, cam in (("メイン", camera), ("サブ", source_map.get(item.get("secondary")) if item.get("layout") == "split" else None)):
            if cam is None:
                if role == "サブ" and item.get("layout") == "split":
                    raise StudioError(f"区間{pos+1}: 2画面の相手が未指定です。")
                continue
            local_start = start - float(cam["offset"])
            if local_start < -0.15 or local_start + duration > float(cam["duration"]) + 0.15:
                raise StudioError(f"区間{pos+1}: {role}の元動画の撮影範囲外です。")
        if item.get("layout") not in {"single", "split"}:
            raise StudioError(f"区間{pos+1}: 未対応のレイアウトです。")
        if len(str(item.get("caption", ""))) > 200:
            raise StudioError(f"区間{pos+1}: テロップは200文字以下にしてください。")
        total += duration / speed
    if total > 8*3600:
        raise StudioError("編集後の動画が8時間を超えています。")


def timeline_duration(project: dict[str, Any]) -> float:
    return round(sum(float(s["duration"]) / float(s.get("speed", 1.0)) for s in project["timeline"]), 2)


def mutate_segment(project: dict[str,Any], segment_id: str, changes:dict[str,Any]) -> None:
    permitted={"camera","secondary","layout","caption","start","duration","speed"}
    if not changes or not set(changes).issubset(permitted):
        raise StudioError("未対応の編集項目があります。")
    original=copy.deepcopy(project["timeline"])
    target=next((s for s in project["timeline"] if s["id"]==segment_id),None)
    if not target: raise StudioError("区間が見つかりません。")
    try:
        target.update(changes)
        validate_timeline(project)
    except Exception:
        project["timeline"]=original
        raise


def segment_action(project:dict[str,Any], segment_id:str, action:str) -> None:
    original=copy.deepcopy(project["timeline"])
    for i, s in enumerate(project["timeline"]):
        if s["id"]!=segment_id: continue
        if action=="delete":
            project["timeline"].pop(i)
        elif action=="split":
            if s["duration"] < 1.0: raise StudioError("1秒未満の区間は分割できません。")
            second=copy.deepcopy(s)
            second["id"]=uuid.uuid4().hex[:12]
            second["start"]=round(s["start"] + s["duration"]/2,3)
            second["duration"]=round(s["duration"]-s["duration"]/2,3)
            s["duration"]=round(s["duration"]/2,3)
            project["timeline"].insert(i+1,second)
        elif action=="up" and i>0:
            project["timeline"][i-1],project["timeline"][i]=project["timeline"][i],project["timeline"][i-1]
        elif action=="down" and i<len(project["timeline"])-1:
            project["timeline"][i+1],project["timeline"][i]=project["timeline"][i],project["timeline"][i+1]
        else:
            raise StudioError("この移動操作はできません。")
        try:
            if project["timeline"]: validate_timeline(project)
        except Exception:
            project["timeline"]=original
            raise
        return
    raise StudioError("区間が見つかりません。")


def _fpath(path:str|Path) -> str:
    """Escape a native path for an FFmpeg filtergraph option."""
    return str(path).replace("\\", "/").replace(":", r"\:").replace("'", r"\'").replace("[", r"\[").replace("]", r"\]")


def _video_filter(index:int, source:dict, width:int, height:int, fps:int,
                  mode:str="single") -> str:
    chain=f"[{index}:v:0]"
    if source.get("equirect"):
        yaw=float(source.get("yaw",0.0));pitch=float(source.get("pitch",0.0))
        if not -180 <= yaw <= 180 or not -90 <= pitch <= 90:
            raise StudioError("360度動画の視点設定が範囲外です。")
        chain+=f"v360=input=equirect:output=flat:yaw={yaw}:pitch={pitch}:w={width}:h={height},"
    chain+=f"fps={fps},scale={width}:{height}:force_original_aspect_ratio=decrease,"
    chain+=f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p"
    return chain


def _segment_render(project:dict, segment:dict, output:Path, profile:dict,
                    encoder:str, workdir:Path) -> None:
    by_id={s["id"]:s for s in project["sources"]}
    source=by_id[segment["camera"]]
    second=by_id[segment["secondary"]] if segment["layout"]=="split" else None
    start=float(segment["start"]);dur=float(segment["duration"]);speed=float(segment.get("speed",1.0))
    w,h,fps=int(profile["width"]),int(profile["height"]),int(profile["fps"])
    cmd=[_which("ffmpeg"),"-hide_banner","-nostdin","-v","error","-y", "-ss",f"{max(0,start-source['offset']):.3f}","-i",source["path"]]
    if second:
        cmd.extend(["-ss",f"{max(0,start-second['offset']):.3f}","-i",second["path"]])
    cmd.extend(["-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=48000"])
    inputs=[]
    if second:
        half=w//2
        inputs += [_video_filter(0,source,half,h,fps)+"[left]", _video_filter(1,second,w-half,h,fps)+"[right]", "[left][right]hstack=inputs=2[vbase]"]
    else:
        inputs += [_video_filter(0,source,w,h,fps)+"[vbase]"]
    # Output duration depends on speed, but source trim always uses original duration.
    vf=f"[vbase]trim=duration={dur:.3f},setpts=(PTS-STARTPTS)/{speed:.4f}"
    caption=str(segment.get("caption", "")).strip()
    if caption:
        txt=workdir/(segment["id"]+"_caption.txt")
        txt.write_text(caption.replace("\r", " ").replace("\n", " "),encoding="utf-8")
        font_opts=""
        if os.name=="nt":
            for fontname in ("meiryo.ttc","YuGothM.ttc","msgothic.ttc"):
                candidate=Path("C:/Windows/Fonts")/fontname
                if candidate.is_file():
                    font_opts=f"fontfile='{_fpath(candidate)}':"
                    break
        vf+=f",drawtext={font_opts}textfile='{_fpath(txt)}':fontsize={max(18,w//38)}:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=14:x=(w-text_w)/2:y=h-text_h-60"
    vf+="[vout]"
    inputs.append(vf)
    # For cameras with no recorded audio, a bounded silence track is still generated.
    audio_idx = 2 if second else 1
    input_audio=f"[0:a:0]" if source["has_audio"] else f"[{audio_idx}:a:0]"
    # atempo supports 0.5..2.0 only, chain for outside range.
    rate=speed
    tempo=[]
    while rate>2.0:
        tempo.append("atempo=2.0"); rate/=2.0
    while rate<0.5:
        tempo.append("atempo=0.5"); rate/=0.5
    tempo.append(f"atempo={rate:.4f}")
    af=f"{input_audio}atrim=duration={dur:.3f},asetpts=PTS-STARTPTS,aresample=48000,{','.join(tempo)},aformat=sample_rates=48000:channel_layouts=stereo[aout]"
    inputs.append(af)
    cmd.extend(["-filter_complex",";".join(inputs),"-map","[vout]","-map","[aout]",
                "-c:v",encoder])
    if encoder=="libx264":
        cmd.extend(["-preset","veryfast","-crf",str(profile["crf"])])
    else:
        cmd.extend(["-preset","p4","-cq",str(profile["crf"]),"-b:v","0"])
    cmd.extend(["-pix_fmt","yuv420p","-r",str(fps),"-c:a","aac","-b:a","128k",
                "-ar","48000","-ac","2","-t",f"{dur/speed:.3f}","-movflags","+faststart",str(output)])
    cp=command(cmd,timeout=max(300,int(dur/speed*8)+60))
    if cp.returncode or not output.exists() or output.stat().st_size<2000:
        raise StudioError(f"区間書き出し失敗 ({source['name']}, {start:.1f}s): {cp.stderr[-1100:]}")


def _encode_availability() -> list[str]:
    r=command([_which("ffmpeg"),"-hide_banner","-encoders"],timeout=30)
    return [name for name in ("h264_nvenc","libx264") if re.search(r"\b"+name+r"\b",r.stdout)]


def render_project(project:dict, directory:Path, output:Path, quality:str="fullhd",gpu:bool=True,
                   callback:Callable[[float,str],None]|None=None) -> dict:
    validate_timeline(project)
    if quality not in PROFILES: raise StudioError("未対応の画質設定です。")
    profile=PROFILES[quality]
    out=output.resolve()
    originals={Path(s["path"]).resolve() for s in project["sources"]}
    if out in originals: raise StudioError("元動画への上書きは禁止です。")
    out.parent.mkdir(parents=True,exist_ok=True)
    directory=directory.resolve()
    directory.mkdir(parents=True,exist_ok=True)
    encoders=_encode_availability()
    if "libx264" not in encoders and "h264_nvenc" not in encoders:
        raise StudioError("FFmpegにH.264エンコーダーがありません。")
    encoder = "h264_nvenc" if gpu and "h264_nvenc" in encoders else "libx264"
    if encoder not in encoders: encoder=encoders[0]
    expected=timeline_duration(project)
    min_free = 2 * 1024**3 if quality == "fullhd" else 600 * 1024**2
    if shutil.disk_usage(directory).free < min_free:
        raise StudioError("作業用ドライブの空き容量が不足しています。別ドライブで実行してください。")
    with tempfile.TemporaryDirectory(prefix="render_",dir=directory) as tmp:
        workdir=Path(tmp)
        attempt_encoders=[encoder]
        if encoder=="h264_nvenc" and "libx264" in encoders:
            attempt_encoders.append("libx264")
        last_error=None
        for attempt_encoder in attempt_encoders:
            try:
                segments=[]
                for i, seg in enumerate(project["timeline"]):
                    if callback:
                        callback(0.05+0.72*i/max(1,len(project["timeline"])),
                                 f"区間 {i+1}/{len(project['timeline'])} を編集中 ({attempt_encoder})")
                    dest=workdir/f"part_{i:04d}.mp4"
                    dest.unlink(missing_ok=True)
                    _segment_render(project,seg,dest,profile,attempt_encoder,workdir)
                    segments.append(dest)
                playlist=workdir/"clips.txt"
                playlist.write_text("".join("file '"+str(p).replace("\\","/").replace("'", "'\\''")+"'\n" for p in segments),encoding="utf-8")
                candidate=workdir/"joined.mp4"
                candidate.unlink(missing_ok=True)
                if callback: callback(0.8,"区間を結合中")
                cp=command([_which("ffmpeg"),"-hide_banner","-nostdin","-v","error","-y","-f","concat","-safe","0","-i",str(playlist),"-c","copy","-movflags","+faststart",str(candidate)],timeout=max(240,int(expected*2)))
                if cp.returncode or not candidate.is_file():
                    raise StudioError("動画結合に失敗: "+cp.stderr[-900:])
                if callback: callback(0.88,"完成ファイルを検査中")
                qa=quality_check(candidate,expected,profile,deep=True,callback=callback)
                if not qa["technical_ok"]:
                    raise StudioError("出力動画が検査に合格しませんでした: "+"; ".join(qa["issues"]))
                encoder=attempt_encoder
                break
            except StudioError as exc:
                last_error=exc
                if attempt_encoder=="h264_nvenc" and len(attempt_encoders)>1:
                    if callback: callback(0.04,"GPUエンコードに失敗。全区間をソフトウェア方式で再作成")
                    for clip in workdir.glob("part_*.mp4"):
                        clip.unlink(missing_ok=True)
                    continue
                raise
        else:
            raise last_error or StudioError("動画の書き出しに失敗しました。")
        final_tmp=out.with_name(out.name+".new")
        if final_tmp in originals:raise StudioError("元動画への上書きは禁止です。")
        shutil.copyfile(candidate,final_tmp)
        os.replace(final_tmp,out)
    qa["path"]=str(out)
    qa["source_files"]=[s["name"] for s in project["sources"]]
    qa["finished_at"]=utcnow()
    qa["encoder"]=encoder
    qa["sync_review_required"]=any(s["sync"]["method"] in {"not_aligned","unverified","unverified_audio","manual","audio_candidate"} for s in project["sources"][1:])
    if callback: callback(1.0,"書き出しと技術検査が完了")
    return qa


def quality_check(path:Path,expected:float|None=None, profile:dict|None=None,deep:bool=True,
                  callback:Callable[[float,str],None]|None=None)->dict:
    metadata=media_info(str(path))
    issues=[]
    actual=metadata["duration"]
    if expected is not None and abs(actual-expected)>max(1.0,expected*0.007):
        issues.append(f"出力時間が予定と違います（予定{expected:.2f}s 実際{actual:.2f}s）")
    if profile and (metadata["width"]!=profile["width"] or metadata["height"]!=profile["height"]):
        issues.append("出力の解像度が指定と違います。")
    if not metadata["has_audio"]:
        issues.append("音声トラックがありません。")
    if deep:
        if callback: callback(0.91,"全フレームをデコード検査中")
        cp=command([_which("ffmpeg"),"-hide_banner","-nostdin","-v","error","-xerror","-i",str(path),"-f","null",os.devnull],timeout=max(180,int(actual*6)+45))
        if cp.returncode:
            issues.append("デコードに失敗: "+cp.stderr[-600:])
    return {"technical_ok":not issues,"issues":issues,"duration_seconds":actual,
            "width":metadata["width"],"height":metadata["height"],"has_audio":metadata["has_audio"],
            "whole_file_decode_checked":deep,
            "semantic_review":"未実装：人物の役割・技術評価・場面選択の妥当性は自動保証できません。"}


def preview_frame(source:dict,time_global:float,dest:Path)->Path:
    local=max(0.0,min(float(source["duration"])-0.1,time_global-float(source["offset"])))
    dest.parent.mkdir(parents=True,exist_ok=True)
    cmd=[_which("ffmpeg"),"-hide_banner","-nostdin","-v","error","-y","-ss",f"{local:.3f}","-i",source["path"],"-frames:v","1","-vf","scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2","-q:v","5",str(dest)]
    cp=command(cmd,timeout=90)
    if cp.returncode or not dest.is_file():raise StudioError("プレビュー画像を作れません: "+cp.stderr[-400:])
    return dest


def preview_clip(project:dict,segment:dict,dest:Path)->Path:
    with tempfile.TemporaryDirectory(prefix="preview_",dir=dest.parent) as tmp:
        profile=PROFILES["review"]
        short=copy.deepcopy(segment)
        short["duration"]=min(7.0,float(segment["duration"]))
        _segment_render(project,short,dest,profile,"libx264",Path(tmp))
    return dest
