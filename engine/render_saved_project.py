"""Local saved project -> existing video compositor + independent four-bus mix.

No network, service, learned AI or native-device support is implied. The common
Node validator is the authority for project/audio semantics. Runtime paths and
reports remain local. Run with --help for the CLI.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from . import core_v01 as core
from .run_manifest import process_manifest, _check_source_identity, _assert_safe_destinations, ManifestError
from .output_qa import inspect_output
from prototypes.audio.mix_audio import _volume_expr

ROOT=Path(__file__).resolve().parent.parent
# Self-contained local containers only. Never follow HLS/DASH/concat references
# whose dependent bytes are absent from the project's verified source hashes.
INPUT_OPTIONS=['-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm,wav,mp3,aac,flac,ogg']


def _probe_local(path:Path) -> dict:
    result=subprocess.run(['ffprobe','-v','error',*INPUT_OPTIONS,'-show_format','-show_streams','-of','json',str(path)],
                          capture_output=True,text=True,stdin=subprocess.DEVNULL,timeout=120)
    if result.returncode:raise ManifestError('UNSUPPORTED_MEDIA_FORMAT_OR_INVALID_MEDIA')
    return json.loads(result.stdout)


def _run(args:list[str], timeout:int) -> None:
    if Path(args[0]).name=='ffmpeg':
        gated=[]
        for arg in args:
            if arg=='-i':gated.extend(INPUT_OPTIONS)
            gated.append(arg)
        args=gated
    result=subprocess.run(args,capture_output=True,text=True,stdin=subprocess.DEVNULL,timeout=timeout)
    if result.returncode:raise core.StudioError('LOCAL_RENDER_FAILED: '+result.stderr[-1200:])


def _tempo(speed:float) -> str:
    parts=[]
    while speed>2:parts.append('atempo=2');speed/=2
    while speed<.5:parts.append('atempo=0.5');speed/=.5
    return ','.join(parts+[f'atempo={speed:.9f}'])


def _install_new(candidate:Path,output:Path) -> None:
    """Exclusive temporary file + no-clobber atomic link on the destination FS."""
    staged=None
    try:
        with tempfile.NamedTemporaryFile(prefix=output.name+'.',suffix='.new',dir=output.parent,delete=False) as handle:
            staged=Path(handle.name)
            with candidate.open('rb') as source:shutil.copyfileobj(source,handle)
            handle.flush();os.fsync(handle.fileno())
        os.link(staged,output)  # existing names/symlinks fail, never follow them
    finally:
        if staged is not None:staged.unlink(missing_ok=True)


def render_saved_project(project_file:Path,bindings_file:Path,workspace:Path,output:Path) -> dict:
    project_file=Path(project_file).resolve(strict=True);bindings_file=Path(bindings_file).resolve(strict=True)
    requested=Path(output).absolute()
    if requested.suffix.lower()!='.mp4':raise ManifestError('Output must be a new MP4')
    if requested.exists() or requested.is_symlink():raise FileExistsError('OUTPUT_ALREADY_EXISTS')
    output=requested.resolve();workspace=Path(workspace).resolve()
    workspace.mkdir(parents=True,exist_ok=False)
    bundle_path=workspace/'checked-render-bundle.json'
    _run(['node',str(ROOT/'tools/project-manifest.mjs'),'--project',str(project_file),
          '--bindings',str(bindings_file),'--output',str(bundle_path),'--format','bundle'],timeout=3600)
    bundle=json.loads(bundle_path.read_text(encoding='utf-8'))
    if bundle.get('schema')!='aivs-local-render-bundle-v1':raise ManifestError('UNSUPPORTED_RENDER_BUNDLE')
    plan=bundle['plan'];manifest=bundle['videoManifest'];paths=bundle['mediaPaths']
    protected=list(bundle['protectedPaths'])+[str(bundle_path)]
    manifest['protectedPaths']=protected
    _assert_safe_destinations(manifest,workspace,output)
    if len(plan['audio'])>64:raise ManifestError('AUDIO_RENDER_LIMIT_64_CLIPS')
    # All actual audio capabilities are independently probed, including assets
    # which do not appear in the video composition manifest.
    refs={s['assetId']:s for s in plan['sourceRefs']}
    for source in refs.values():
        path=Path(paths[source['assetId']]).resolve(strict=True)
        meta=_probe_local(path)
        observed={'has_audio':any(s.get('codec_type')=='audio' for s in meta.get('streams',[])),
                  'duration':float(meta['format']['duration'])}
        _check_source_identity({'path':str(path),'sha256':source['sha256'],'hasAudio':source['hasAudio'],
                                'durationSec':source['durationSec']},observed)
    loop_bytes=sum((refs[a['assetId']]['durationSec']-a['trimInSec'])*192000 for a in plan['audio'] if a['loop'])
    required=64*1024**2+loop_bytes*1.2+plan['durationSec']*1024**2
    if shutil.disk_usage(workspace).free<required:raise core.StudioError('INSUFFICIENT_LOCAL_DISK_FOR_RENDER')
    with tempfile.TemporaryDirectory(prefix='compose_',dir=workspace) as temp:
        temp=Path(temp);base=temp/'video.mp4'
        video_report=process_manifest(manifest,temp/'video-job',base)
        command=['ffmpeg','-hide_banner','-nostdin','-v','error','-i',str(base)]
        duration=plan['durationSec'];filters=[f'anullsrc=r=48000:cl=stereo,atrim=duration={duration:.9f}[bed]']
        labels=['bed']
        for i,a in enumerate(plan['audio']):
            path=Path(paths[a['assetId']]);trim=a['trimInSec'];length=a['endSec']-a['startSec']
            if a['loop']:
                # Decode the selected tail once to disk; repeat that exact tail,
                # rather than buffering long audio or looping unwanted lead-in.
                loop=temp/f'loop_{i}.wav'
                tail=refs[a['assetId']]['durationSec']-trim
                loop_filter=(f'aresample=48000:async=1:first_pts=0,atrim=start={trim:.9f},'
                             f'asetpts=PTS-STARTPTS,apad=whole_dur={tail:.9f},atrim=duration={tail:.9f}')
                _run(['ffmpeg','-hide_banner','-nostdin','-v','error','-i',str(path),'-vn','-af',loop_filter,
                      '-ar','48000','-ac','2','-c:a','pcm_s16le',str(loop)],timeout=3600)
                command.extend(['-stream_loop','-1','-i',str(loop)]);trim=0
            else:command.extend(['-i',str(path)])
            bus=plan['audioBuses'][a['bus']]
            gain=0 if bus['muted'] else 10**((a['gainDb']+bus['gainDb'])/20)
            label=f'audio{i}';labels.append(label)
            # Reconstruct the source media clock (including a delayed audio
            # stream's leading silence) before trimming or changing speed.
            chain=(f'[{i+1}:a:0]aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,'
                   f'atrim=start={trim:.9f}:duration={length*a["speed"]:.9f},asetpts=PTS-STARTPTS,'
                   f'{_tempo(a["speed"])},atrim=duration={length:.9f},apad=whole_dur={length:.9f},volume={gain:.12f}')
            d=a.get('ducking')
            if d and d['enabled'] and d['voiceIntervals']:
                ranges=[[start-a['startSec'],end-a['startSec']] for start,end in d['voiceIntervals']]
                chain+=',volume='+_volume_expr(ranges,d['gainFactor'])+':eval=frame'
            if a['fadeInSec']:chain+=f',afade=t=in:st=0:d={a["fadeInSec"]:.9f}'
            if a['fadeOutSec']:chain+=f',afade=t=out:st={length-a["fadeOutSec"]:.9f}:d={a["fadeOutSec"]:.9f}'
            chain+=f',adelay={round(a["startSec"]*48000)}S:all=1[{label}]'
            filters.append(chain)
        filters.append(''.join(f'[{label}]' for label in labels)+
                       f'amix=inputs={len(labels)}:duration=first:dropout_transition=0:normalize=0,'
                       'alimiter=limit=0.89:level=0:latency=1[finalaudio]')
        candidate=temp/'mixed.mp4'
        command.extend(['-filter_complex',';'.join(filters),'-map','0:v:0','-map','[finalaudio]',
                        '-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-ac','2',
                        '-t',f'{duration:.9f}','-movflags','+faststart',str(candidate)])
        _run(command,timeout=max(180,int(duration*8)+60))
        qa=inspect_output(candidate,duration,core.PROFILES[plan['exportProfile']],plan=plan)
        if not qa['technical_ok']:raise core.StudioError('MIXED_OUTPUT_QA_FAILED:'+str(qa['issues']))
        _assert_safe_destinations(manifest,workspace,output)
        output.parent.mkdir(parents=True,exist_ok=True);_install_new(candidate,output)
    with output.open('rb') as handle:output_hash=hashlib.file_digest(handle,'sha256').hexdigest()
    qa.update({'schema':'aivs-saved-project-audio-report-v1','path':str(output),'sha256':output_hash,
               'projectId':plan['projectId'],'projectRevision':plan['revision'],
               'audioClipCount':len(plan['audio']),'audioBuses':list(plan['audioBuses']),
               'intermediateAudio':'IGNORED_BY_FINAL_MIX','semanticAudioQA':'NOT_EVALUATED',
               'truePeakGuarantee':'NOT_MEASURED','physicalDeviceAcceptance':'NOT_RUN',
               'captionRasters':video_report.get('captionRasters',[])})
    with (workspace/'technical_qa.json').open('x',encoding='utf-8') as handle:
        json.dump(qa,handle,ensure_ascii=False,indent=2)
    return qa


def main() -> None:
    parser=argparse.ArgumentParser(description='Offline saved-project MP4 export with four audio buses')
    for flag in ('project','bindings','workspace','output'):parser.add_argument('--'+flag,required=True,type=Path)
    args=parser.parse_args()
    try:
        report=render_saved_project(args.project,args.bindings,args.workspace,args.output)
        print(json.dumps({'ok':True,'technical_ok':report['technical_ok'],'qualityStatus':report['inspection']['status'],'sha256':report['sha256']}))
    except (OSError,ValueError,KeyError,ManifestError,core.StudioError,subprocess.TimeoutExpired) as error:
        parser.exit(1,json.dumps({'ok':False,'error':str(error)})+'\n')


if __name__=='__main__':main()
