"""Hash-bound saved-project local signal proposal; no automatic editing."""
from __future__ import annotations
import argparse,hashlib,json,subprocess
from pathlib import Path
from .local_signals import analyze_file,SignalsError
from .render_saved_project import ROOT,_probe_local,_run
from .run_manifest import _check_source_identity,ManifestError
from .core_v01 import StudioError

def analyse_first_cut(project_file,bindings_file,request_file,workspace,output):
    output=Path(output);workspace=Path(workspace)
    if output.exists() or output.is_symlink():raise FileExistsError('FIRST_CUT_REPORT_ALREADY_EXISTS')
    workspace.mkdir(parents=True,exist_ok=False);bundle_file=workspace/'checked-first-cut.json'
    _run(['node',str(ROOT/'tools/project-first-cut.mjs'),'--project',str(project_file),'--bindings',str(bindings_file),'--request',str(request_file),'--output',str(bundle_file)],timeout=3600)
    bundle=json.loads(bundle_file.read_text());signals=[];analysis=[]
    for source in bundle['sourceIdentities']:
        if source['syncStatus'] not in ('master','verified'):
            # Exclusion remains visible to the existing planner; never extract it.
            doc={'schema':'aivs-local-signals-v1','source':{'assetId':source['assetId'],'durationSeconds':source['durationSec'],'offsetSeconds':0,'sync':{'status':'unverified'},'windows':[]}}
        else:
            local=next(s for s in bundle['sources'] if s['assetId']==source['assetId']);metadata=_probe_local(Path(local['path']))
            _check_source_identity(local,{'has_audio':any(s.get('codec_type')=='audio' for s in metadata.get('streams',[])),'duration':float(metadata['format']['duration'])})
            doc=analyze_file(local['path'],source['assetId'],offset_seconds=source['offsetSec'],sync_status=source['syncStatus'],max_seconds=bundle['analysisWindowSec'])
            analysis.append({'assetId':source['assetId'],'coverageSeconds':doc['coverageSeconds'],'complete':not doc['partial']})
        file=workspace/(source['assetId']+'.json');file.write_text(json.dumps(doc));signals.extend(['--signals',str(file)])
    proposal_file=workspace/'proposal.json'
    _run(['node',str(ROOT/'tools/compose-proposal.mjs'),*signals,'--mode',bundle['mode'],'--multiview','recommend','--output',str(proposal_file)],timeout=240)
    for source in bundle['sources']:
        with Path(source['path']).open('rb') as handle:digest=hashlib.file_digest(handle,'sha256').hexdigest()
        if digest!=source['sha256']:raise ManifestError('SOURCE_CHANGED_DURING_FIRST_CUT')
    report={'schema':'aivs-first-cut-report-v1','projectId':bundle['projectId'],'projectRevision':bundle['projectRevision'],'sourceIdentities':bundle['sourceIdentities'],'analysis':analysis,'proposal':json.loads(proposal_file.read_text())}
    checked=workspace/'report.json';checked.write_text(json.dumps(report,allow_nan=False))
    _run(['node',str(ROOT/'tools/project-first-cut.mjs'),'--report',str(checked)],timeout=240)
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('x',encoding='utf8') as handle:json.dump(report,handle,ensure_ascii=False,allow_nan=False)
    return report

def main():
    p=argparse.ArgumentParser(description='Offline signal first-cut candidate, always requires review')
    for flag in ('project','bindings','request','workspace','output'):p.add_argument('--'+flag,required=True,type=Path)
    a=p.parse_args()
    try:
        r=analyse_first_cut(a.project,a.bindings,a.request,a.workspace,a.output);print(json.dumps({'ok':True,'cuts':len(r['proposal']['timeline'])}))
    except (OSError,ValueError,KeyError,ManifestError,StudioError,SignalsError,subprocess.TimeoutExpired) as e:p.exit(1,json.dumps({'ok':False,'error':str(e)})+'\n')

if __name__=='__main__':main()
