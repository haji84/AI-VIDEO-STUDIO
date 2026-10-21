"""Optional on-demand cloud processor, deliberately NOT connected/deployed in v0.2.

Requires separately authorized Cloud Run job execution, two private credentials:
  - R2 object storage key (scoped to one private bucket)
  - WORKER_TOKEN for exact job report/claim. Never logs either.

No autonomous external billing, Workflows, deployment or Stripe integration exists.
"""
from __future__ import annotations
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from engine.run_manifest import ManifestError, process_manifest
from engine import core_v01 as core

ALLOWED_FORMATS={'mp4','mov','mkv','m4v','avi','webm'}


def config_from_env():
    names=['AIVS_PRIVATE_API_URL','AIVS_JOB_ID','AIVS_WORKER_TOKEN','R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY']
    c={k:os.environ.get(k,'') for k in names}
    if any(not c[k] for k in names):raise ManifestError('Missing cloud worker configuration')
    if not c['AIVS_PRIVATE_API_URL'].startswith('https://') or not c['R2_ENDPOINT'].startswith('https://'):
        raise ManifestError('Cloud storage and control-plane connections must use HTTPS')
    if not re.fullmatch(r'job_[0-9a-f]{32}',c['AIVS_JOB_ID']):raise ManifestError('Bad job ID')
    return c


def api_call(base,job_id,token,action,data=None):
    url=base.rstrip('/')+'/api/internal/jobs/'+job_id+'/'+action
    headers={'Authorization':'Bearer '+token}
    if data is not None:headers['Content-Type']='application/json'
    body=None if data is None else json.dumps(data).encode()
    r=urllib.request.Request(url,data=body,headers=headers,method='GET' if body is None else 'POST')
    try:
        with urllib.request.urlopen(r,timeout=60) as res:
            data=json.load(res)
            if not data.get('ok'):raise ManifestError('Control plane rejected job operation')
            return data
    except urllib.error.HTTPError as exc:
        # Never emit a full request, secret header, or contents.
        raise ManifestError('Control plane HTTP status '+str(exc.code)) from exc


def r2_client(cfg):
    import boto3
    from botocore.config import Config
    return boto3.client('s3',endpoint_url=cfg['R2_ENDPOINT'],
                        aws_access_key_id=cfg['R2_ACCESS_KEY_ID'],
                        aws_secret_access_key=cfg['R2_SECRET_ACCESS_KEY'],
                        region_name='auto',config=Config(signature_version='s3v4',retries={'max_attempts':2}))


def prepare_inputs(manifest:dict,s3,bucket:str,folder:Path)->dict:
    pid=manifest.get('projectId','')
    if not re.fullmatch(r'proj_[0-9a-f]{32}',pid):raise ManifestError('Bad project ID')
    sources=manifest.get('sources',[])
    if not isinstance(sources,list) or not 1<=len(sources)<=100:raise ManifestError('Bad input list')
    staged=[]
    for s in sources:
        asset=str(s.get('assetId',''))
        key=str(s.get('objectKey',''))
        filename=str(s.get('filename',''))
        declared=s.get('bytes')
        if not re.fullmatch(r'asset_[0-9a-f]{32}',asset):raise ManifestError('Bad asset ID')
        prefix=f'owner_preview/{pid}/{asset}/'
        if not key.startswith(prefix) or key!=prefix+filename:
            raise ManifestError('Invalid R2 source object reference')
        ext=Path(filename).suffix.lower().lstrip('.')
        if ext not in ALLOWED_FORMATS:raise ManifestError('Unsupported staged source')
        if not isinstance(declared,int) or declared<=0 or declared>8*1024**3:raise ManifestError('Bad source size')
        path=folder/(asset+'.'+ext)
        with path.open('wb') as dst:
            s3.download_fileobj(bucket,key,dst)
        if path.stat().st_size!=declared:raise ManifestError('Staged video size mismatch')
        staged.append({'assetId':asset,'path':str(path)})
    return {**manifest,'sources':staged}


def run_cloud_job():
    cfg=config_from_env() # refuses unconfigured and unapproved local executions
    api=cfg['AIVS_PRIVATE_API_URL'];jid=cfg['AIVS_JOB_ID'];token=cfg['AIVS_WORKER_TOKEN']
    meta=api_call(api,jid,token,'manifest')['manifest']
    if meta.get('jobId')!=jid:raise ManifestError('Job ID mismatch')
    client=r2_client(cfg)
    # Claim is gated by two separate flags at the API. No execution by default.
    api_call(api,jid,token,'claim',{})
    with tempfile.TemporaryDirectory(prefix='aivs_cloud_job_') as temp:
        root=Path(temp);inputdir=root/'inputs';inputdir.mkdir()
        try:
            m=prepare_inputs(meta,client,cfg['R2_BUCKET'],inputdir)
            target=root/'finished.mp4'
            report=process_manifest(m,root/'work',target)
            if not report.get('technical_ok') or not target.is_file():
                raise ManifestError('Technical media QA failed')
            key=f"owner_preview/{meta['projectId']}/exports/{jid}/result.mp4"
            client.upload_file(str(target),cfg['R2_BUCKET'],key,ExtraArgs={'ContentType':'video/mp4'})
            size=client.head_object(Bucket=cfg['R2_BUCKET'],Key=key)['ContentLength']
            if size!=target.stat().st_size:raise ManifestError('R2 output size mismatch')
            api_call(api,jid,token,'report',{'success':True,'technicalOk':True,'resultKey':key})
        except Exception as exc:
            classification='SYNC_UNVERIFIED' if 'SYNC_UNVERIFIED' in str(exc) else 'UNKNOWN'
            if isinstance(exc,(OSError,IOError)):classification='STAGING_FAILED'
            try:api_call(api,jid,token,'report',{'success':False,'errorCode':classification})
            except Exception:pass
            raise


if __name__=='__main__':
    try:run_cloud_job()
    except Exception as exc:
        # Secret/path free error reporting only. Raw exceptions are not printed.
        msg='Cloud processing stopped ('+exc.__class__.__name__+')'
        print(msg,file=sys.stderr)
        sys.exit(1)
