"""Local read-only saved-project audio correlation. Produces candidates only."""
from __future__ import annotations
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from . import core_v01 as core
from .render_saved_project import ROOT,_probe_local,_run
from .run_manifest import _check_source_identity,ManifestError


def analyse_saved_project(project_file,bindings_file,request_file,workspace,output):
    output=Path(output);workspace=Path(workspace)
    if output.exists() or output.is_symlink():raise FileExistsError('SYNC_REPORT_ALREADY_EXISTS')
    workspace.mkdir(parents=True,exist_ok=False);bundle_file=workspace/'checked-sync.json'
    _run(['node',str(ROOT/'tools/project-sync.mjs'),'--project',str(project_file),'--bindings',str(bindings_file),
          '--request',str(request_file),'--output',str(bundle_file)],timeout=3600)
    bundle=json.loads(bundle_file.read_text());sources=[bundle['master'],bundle['target']]
    for source in sources:
        metadata=_probe_local(Path(source['path']))
        if not any(s.get('codec_type')=='video' for s in metadata.get('streams',[])):raise ManifestError('VIDEO_SOURCE_REQUIRED')
        _check_source_identity(source,{'has_audio':any(s.get('codec_type')=='audio' for s in metadata.get('streams',[])),
                                       'duration':float(metadata['format']['duration'])})
    # Only this disposable legacy-shaped copy is mutated by the existing engine.
    legacy={'sources':[{'id':s['assetId'],'name':s['assetId'],'path':s['path'],'has_audio':s['hasAudio'],
                        'duration':s['durationSec'],'offset':0,'sync':{}} for s in sources]}
    try:
        core.sync_sources(legacy,max_shift_seconds=300,analysis_seconds=bundle['analysisWindowSec'])
        target=legacy['sources'][1];evidence=target['sync'];method=evidence['method']
        relative=target['offset'] if method=='audio_candidate' else evidence.get('candidate_offset')
    except core.StudioError:
        evidence={'confidence':0,'uniqueness':0};method='unverified';relative=None
    # Bind evidence to the same bytes after extraction, not merely before it.
    for source in sources:
        with Path(source['path']).open('rb') as handle:digest=hashlib.file_digest(handle,'sha256').hexdigest()
        if digest!=source['sha256']:raise ManifestError('SOURCE_CHANGED_DURING_SYNC')
    report={'schema':'aivs-sync-report-v1','projectId':bundle['projectId'],'projectRevision':bundle['projectRevision'],
      'masterIdentity':{k:v for k,v in sources[0].items() if k!='path'},'targetIdentity':{k:v for k,v in sources[1].items() if k!='path'},
      'status':'CANDIDATE' if method=='audio_candidate' else 'UNVERIFIED',
      'candidateOffsetSec':None if relative is None else round(sources[0]['offsetSec']+relative,3),
      'confidence':max(0,min(1,evidence.get('confidence',0))),'uniqueness':evidence.get('uniqueness',0),
      'analysisWindowSec':bundle['analysisWindowSec'],'driftMeasurement':'NOT_ESTIMATED','method':method,
      'reason':'音声からの推定です。共通場面を再生して確認してください。' if method=='audio_candidate' else '共通音声が不足・無音・不確かです。手動同期してください。'}
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('x',encoding='utf8') as handle:json.dump(report,handle,ensure_ascii=False,allow_nan=False)
    return report


def main():
    parser=argparse.ArgumentParser(description='Offline audio sync candidate; never modifies a saved project')
    for flag in ('project','bindings','request','workspace','output'):parser.add_argument('--'+flag,required=True,type=Path)
    args=parser.parse_args()
    try:
        report=analyse_saved_project(args.project,args.bindings,args.request,args.workspace,args.output)
        print(json.dumps({'ok':True,'status':report['status']}))
    except (OSError,ValueError,KeyError,ManifestError,core.StudioError,subprocess.TimeoutExpired) as error:
        parser.exit(1,json.dumps({'ok':False,'error':str(error)})+'\n')


if __name__=='__main__':main()
