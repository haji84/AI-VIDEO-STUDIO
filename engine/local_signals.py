"""Bounded, offline FFmpeg signal extractor for AI VIDEO STUDIO.

Outputs only low-level contrast/motion/audio-energy evidence. NO speech, role,
incident or technical correctness interpretation. Source files are opened
read-only and their filesystem paths are not included in the result JSON.
Mobile native decoders will need to produce the same portable evidence schema.
"""
from __future__ import annotations

import argparse
from array import array
import json
import math
from pathlib import Path
import re
import shutil
import statistics
import subprocess

WIDTH, HEIGHT = 32, 18
FRAME_BYTES = WIDTH * HEIGHT
SAMPLE_FPS = 1
AUDIO_RATE = 2000
WINDOW_SEC = 2
INPUT_OPTIONS = ['-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm,avi']
MAX_SECONDS = 1200  # explicit cap to control CPU/RAM and device heat

class SignalsError(Exception):
    pass


def _program(name):
    p=shutil.which(name)
    if not p:
        raise SignalsError(f'{name.upper()}_UNAVAILABLE')
    return p


def _run(cmd, timeout):
    try:
        p=subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise SignalsError('ANALYSIS_TIMEOUT') from exc
    if p.returncode:
        raise SignalsError('DECODER_FAILED')
    return p.stdout


def analyze_file(path, asset_id, *, offset_seconds=0.0, sync_status='master',
                 max_seconds=120, timeout=240):
    if not re.fullmatch(r'asset_[0-9a-f]{32}',asset_id):
        raise SignalsError('INVALID_ASSET_ID')
    if sync_status not in {'master','verified','candidate','unverified'}:
        raise SignalsError('INVALID_SYNC_STATUS')
    if not isinstance(offset_seconds,(int,float)) or not math.isfinite(offset_seconds) or abs(offset_seconds)>7200:
        raise SignalsError('INVALID_OFFSET')
    if not isinstance(max_seconds,int) or not 1<=max_seconds<=MAX_SECONDS:
        raise SignalsError('ANALYSIS_BUDGET_OUT_OF_RANGE')
    file=Path(path).expanduser().resolve(strict=True)
    if not file.is_file() or file.suffix.lower() not in {'.mp4','.mov','.mkv','.webm','.m4v','.avi'}:
        raise SignalsError('UNSUPPORTED_VIDEO')
    info=json.loads(_run([_program('ffprobe'),'-v','error',*INPUT_OPTIONS,'-show_entries',
        'format=duration:stream=codec_type','-of','json',str(file)],timeout))
    try:
        duration=float(info['format']['duration'])
    except (KeyError,ValueError,TypeError) as exc:
        raise SignalsError('DURATION_UNKNOWN') from exc
    if not math.isfinite(duration) or duration<=0 or duration>14400:
        raise SignalsError('DURATION_OUT_OF_RANGE')
    if not any(s.get('codec_type')=='video' for s in info.get('streams',[])):
        raise SignalsError('VIDEO_STREAM_MISSING')
    seconds=min(duration,max_seconds)
    # Input-time cap + EOF passthrough retains a real fractional tail sample.
    # Output -t at 1fps rounds that sample away; never pad a missing video tail.
    decoded=_run([_program('ffmpeg'),'-hide_banner','-nostdin','-v','error',
        *INPUT_OPTIONS,'-t',str(seconds),'-i',str(file),'-frames:v',str(math.ceil(seconds)),'-an',
        '-vf',f'fps={SAMPLE_FPS}:start_time=0:eof_action=pass,scale={WIDTH}:{HEIGHT},format=gray',
        '-f','rawvideo','-pix_fmt','gray','pipe:1'],timeout)
    frames=[decoded[i:i+FRAME_BYTES] for i in range(0,len(decoded)-FRAME_BYTES+1,FRAME_BYTES)]
    if not frames:
        raise SignalsError('NO_DECODED_FRAMES')
    has_audio=any(s.get('codec_type')=='audio' for s in info.get('streams',[]))
    samples=None
    if has_audio:
        audio=_run([_program('ffmpeg'),'-hide_banner','-nostdin','-v','error',
            *INPUT_OPTIONS,'-i',str(file),'-t',str(seconds),'-vn','-ac','1','-af',f'aresample={AUDIO_RATE}:async=1:first_pts=0','-ar',str(AUDIO_RATE),
            '-f','s16le','pipe:1'],timeout)
        samples=array('h')
        samples.frombytes(audio[:len(audio)//2*2])
    windows=[]
    for begin in range(0,math.ceil(seconds),WINDOW_SEC):
        finish=min(seconds,begin+WINDOW_SEC)
        local_frames=frames[begin:min(math.ceil(finish),len(frames))]
        if not local_frames:continue
        contrasts=[min(1,statistics.pstdev(frame)/72) for frame in local_frames]
        delta=[]
        for index in range(max(1,begin),min(math.ceil(finish),len(frames))):
            f,g=frames[index-1],frames[index]
            delta.append(min(1,(sum(abs(a-b) for a,b in zip(f,g))/FRAME_BYTES)/64))
        audio_strength=None
        if samples is not None:
            seg=samples[begin*AUDIO_RATE:min(len(samples),int(finish*AUDIO_RATE))]
            if seg:
                rms=math.sqrt(sum(x*x for x in seg)/len(seg))/32768
                audio_strength=round(min(1,rms*8),3)
        windows.append({'startSeconds':begin,'endSeconds':round(finish,3),
                        'contrast':round(statistics.fmean(contrasts),3),
                        'motion':round(statistics.fmean(delta),3) if delta else 0,
                        'audioEnergy':audio_strength})
    return {
        'schema':'aivs-local-signals-v1','extractor':'ffmpeg-lowres-signals-v1',
        'source':{'assetId':asset_id,'durationSeconds':round(duration,3),
           'offsetSeconds':round(float(offset_seconds),3),'sync':{'status':sync_status},
           'windows':windows},
        'coverageSeconds':round(min(seconds,len(frames)),3),
        'partial':seconds<duration-.1 or len(frames)<math.ceil(seconds),
        'limitations':['NOT_SPEECH_RECOGNITION','NOT_SCENE_SEMANTICS','NOT_ROLE_DETECTION',
                       'NOT_VALIDATED_ON_IPHONE_ANDROID_HARDWARE']
    }


def main():
    a=argparse.ArgumentParser(description='Analyze locally owned video without uploading it.')
    a.add_argument('--input',required=True)
    a.add_argument('--asset-id',required=True)
    a.add_argument('--offset-seconds',type=float,default=0)
    a.add_argument('--sync-status',choices=['master','verified','candidate','unverified'],default='master')
    a.add_argument('--max-seconds',type=int,default=120)
    a.add_argument('--output',required=True)
    args=a.parse_args()
    result=analyze_file(args.input,args.asset_id,offset_seconds=args.offset_seconds,
                        sync_status=args.sync_status,max_seconds=args.max_seconds)
    target=Path(args.output)
    if target.resolve()==Path(args.input).resolve():raise SignalsError('OUTPUT_WOULD_OVERWRITE_SOURCE')
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'ok':True,'coverageSeconds':result['coverageSeconds'],'partial':result['partial']}))

if __name__=='__main__':
    main()
