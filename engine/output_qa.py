"""Whole-output technical evidence. Heuristics require human review, never edits.

All frames/audio samples pass through local FFmpeg. No screenshots, PCM, source
paths or raw decoder logs are retained in the portable inspection report.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path

from . import core_v01 as core

INPUT_OPTIONS=['-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm']
MAX_FINDINGS=256
NUMBER=r'[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?'


def _fingerprint(path):
    with path.open('rb') as handle:return hashlib.file_digest(handle,'sha256').hexdigest()


def _clip_ids(plan,start,end):
    return [c['clipId'] for c in (plan or {}).get('video',[]) if c['startSec']<end and c['endSec']>start]


def inspect_output(path:Path,expected:float|None=None,profile:dict|None=None,plan:dict|None=None)->dict:
    path=Path(path).resolve(strict=True)
    before=path.stat();digest=_fingerprint(path)
    cp=core.command([core._which('ffprobe'),'-v','error',*INPUT_OPTIONS,'-show_format','-show_streams','-of','json',str(path)],timeout=120)
    if cp.returncode:raise core.StudioError('OUTPUT_QA_INVALID_STANDALONE_MEDIA')
    try:
        metadata=json.loads(cp.stdout);duration=float(metadata['format']['duration'])
        video=next(s for s in metadata['streams'] if s['codec_type']=='video')
        if not math.isfinite(duration) or duration<=0:raise ValueError('duration')
        width,height=int(video['width']),int(video['height'])
    except (ValueError,KeyError,StopIteration) as error:raise core.StudioError('OUTPUT_QA_INVALID_METADATA') from error
    audio=any(s['codec_type']=='audio' for s in metadata['streams'])
    issues=[]
    if expected is not None and abs(duration-expected)>max(1,expected*.007):issues.append('出力時間が予定と違います')
    if profile and (width!=profile['width'] or height!=profile['height']):issues.append('出力の解像度が指定と違います')
    if not audio:issues.append('音声トラックがありません')
    try:
        video_start=float(video.get('start_time',0));video_end=video_start+float(video['duration'])
        if not math.isfinite(video_start+video_end):raise ValueError('duration')
    except (KeyError,TypeError,ValueError):video_start=video_end=None
    try:frame_sec=1/float(Fraction(video.get('avg_frame_rate','0/0')))
    except (ValueError,ZeroDivisionError):frame_sec=1/24
    timing_match=video_end is None or (abs(video_start)<=max(.1,2*frame_sec) and abs(video_end-duration)<=max(.1,2*frame_sec))
    if not timing_match:issues.append('映像トラックの開始・終了が出力全体の時間に一致しません')
    findings=[];omitted=0;peak=None;silence_start=None;decoded_frames=None;ended=False;peak_stats=False
    frame_text=video.get('nb_frames','')
    container_frames=int(frame_text) if str(frame_text).isdigit() else None
    def add(code,start,end,**extra):
        nonlocal omitted
        start=max(0,min(duration,start));end=max(start,min(duration,end))
        if end<=start:return
        if len(findings)>=MAX_FINDINGS:omitted+=1;return
        findings.append({'code':code,'severity':'REVIEW','startSec':round(start,6),'endSec':round(end,6),
                         'clipIds':_clip_ids(plan,start,end),**extra})
    def silence(start,end):
        if plan is None:
            add('SILENCE_REQUIRES_CONTEXT',start,end);return
        # Actual selection is context, not proof that speech should be audible.
        # Never call deliberately absent/muted tracks missing audio.
        windows=[]
        for a in plan.get('audio',[]):
            bus=plan['audioBuses'][a['bus']]
            left=max(start,a['startSec']);right=min(end,a['endSec'],duration)
            if not bus['muted'] and a['gainDb']+bus['gainDb']>-60 and right-left>=.25:windows.append((left,right,a['id']))
        if windows:add('SILENCE_WHILE_AUDIO_SELECTED',min(x[0] for x in windows),max(x[1] for x in windows),
                       audioClipIds=[x[2] for x in windows])
    args=[core._which('ffmpeg'),'-hide_banner','-nostats','-nostdin','-v','info','-xerror',*INPUT_OPTIONS,'-i',str(path),
          '-map','0:v:0','-vf','blackdetect=d=0.5:pix_th=0.10:pic_th=0.98']
    if audio:
        # Inspection only: reconstruct leading/PTS gaps and the absent tail on
        # the output media clock. Otherwise a short stream supplies no samples
        # for silencedetect to inspect after its last packet.
        args+=['-map','0:a:0','-af',f'aresample=async=1:first_pts=0,apad=whole_dur={duration:.9f},atrim=duration={duration:.9f},'
               'silencedetect=noise=-50dB:d=0.5,astats=metadata=0:reset=0']
    args+=['-fps_mode','passthrough','-progress','pipe:2','-f','null',os.devnull]
    # File-backed diagnostics keep long renders out of process memory. Reports
    # cap findings without stopping the actual all-frame/all-sample scan.
    with tempfile.TemporaryFile(mode='w+b') as log:
        process=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=log,
                               timeout=max(180,int(duration*6)+45),check=False)
        log.seek(0)
        for raw in log:
            line=raw.decode('utf-8',errors='replace')
            if re.fullmatch(r'frame=\d+\s*',line):decoded_frames=int(line.strip().split('=')[1])
            if line.strip()=='progress=end':ended=True
            match=re.search(r'black_start:('+NUMBER+r')\s+black_end:('+NUMBER+r')',line)
            if match:add('BLACK_INTERVAL',float(match[1]),float(match[2]))
            match=re.search(r'silence_start:\s*('+NUMBER+r')',line)
            if match:silence_start=float(match[1])
            match=re.search(r'silence_end:\s*('+NUMBER+r')',line)
            if match and silence_start is not None:silence(silence_start,float(match[1]));silence_start=None
            match=re.search(r'Peak level dB:\s*('+NUMBER+r'|-inf|inf|nan)',line)
            if match:
                value=float(match[1])
                if math.isfinite(value) or value==float('-inf'):peak_stats=True
                if math.isfinite(value):peak=value if peak is None else max(peak,value)
    if silence_start is not None:silence(silence_start,duration)
    if process.returncode:issues.append('出力の全編デコード・検査に失敗しました')
    if not ended or decoded_frames is None or decoded_frames<=0:issues.append('全編のデコード完了を確認できません')
    frame_match=container_frames is None or decoded_frames==container_frames
    if not frame_match:issues.append('コンテナのフレーム数と実際にデコードしたフレーム数が一致しません')
    if audio and not peak_stats:issues.append('音声全編の音量検査を確認できません')
    if peak is not None and peak>=-.1:add('NEAR_SAMPLE_CLIPPING',0,duration)
    after=path.stat()
    if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns) or _fingerprint(path)!=digest:
        raise core.StudioError('OUTPUT_CHANGED_DURING_INSPECTION')
    completed=process.returncode==0 and ended and decoded_frames is not None and decoded_frames>0 and frame_match
    return {'technical_ok':not issues,'issues':issues,'duration_seconds':duration,'width':width,'height':height,
            'has_audio':audio,'whole_file_decode_checked':completed,'sha256':digest,
            'projectId':(plan or {}).get('projectId'),'projectRevision':(plan or {}).get('revision'),
            'inspection':{'schema':'aivs-output-inspection-v1',
              'status':'FAILED_TECHNICAL' if issues else 'NEEDS_REVIEW' if findings or omitted else 'CHECKED_LIMITED',
              'coverage':'ALL_VIDEO_FRAMES_AND_SELECTED_OUTPUT_AUDIO_STREAM' if completed else 'INCOMPLETE',
              'decodedVideoFrames':decoded_frames,'containerVideoFrames':container_frames,
              'videoStreamStartSec':video_start,'videoStreamEndSec':video_end,
              'videoStreamTimingCheck':'UNAVAILABLE' if video_end is None else 'MATCH' if timing_match else 'MISMATCH',
              'audioClockInspection':'PTS_GAPS_AND_ABSENT_TAIL_INSPECTED_AS_SILENCE',
              'containerFrameCountCheck':'MATCH' if container_frames is not None and frame_match else 'MISMATCH' if not frame_match else 'UNAVAILABLE',
              'findings':findings,'omittedFindings':omitted,'audioSamplePeakDbfs':peak,'truePeak':'NOT_MEASURED',
              'thresholds':{'minimumBlackSec':.5,'blackPixelLuma':.1,'blackPictureRatio':.98,'minimumSilenceSec':.5,'silenceDbfs':-50,'nearClippingDbfs':-.1},
              'limitations':['Black and silence may be intentional; replay and re-edit manually.',
                'No freeze/cadence, caption raster, speech intelligibility, semantic or physical-device acceptance.']},
            'semantic_review':'NOT_EVALUATED'}
