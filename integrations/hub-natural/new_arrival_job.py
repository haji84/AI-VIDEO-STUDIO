#!/usr/bin/env python3
"""One bounded Drive-INBOX -> verified-media-catalog -> private review-queue cycle.

This is *not* a daemon or an automatic publisher. It can be scheduled by an owner-
authorized persistent host with Drive read-only OAuth. With no semantic evidence it
stops at a review queue, rather than inventing a snake event or exporting footage.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import os

from drive_intake import (DriveHTTP, Hold, _assert_private, _atomic_json,
                          oauth_token_from_env, sync_once)
import pipeline

SCHEMA="hub-natural-private-review-queue-v1"


def _assert_paths(inbox, state, catalog, queue):
    paths=list(map(_assert_private,(inbox, state, catalog, queue)))
    if len(set(paths))!=len(paths):
        raise Hold("PRIVATE_PATHS_MUST_BE_DISTINCT")
    media=paths[0]
    if any(p.is_relative_to(media) for p in paths[1:]):
        raise Hold("REPORTS_MUST_BE_OUTSIDE_MEDIA_INBOX")
    if any(p.suffix.lower() in ('.mp4','.mov','.mkv','.m4v') for p in paths[1:]):
        raise Hold("REPORT_PATH_MUST_NOT_BE_VIDEO")
    return paths


def run_once(client, folder_id, inbox, state, catalog, queue, *, max_bytes=None):
    inbox,state,catalog,queue=_assert_paths(inbox,state,catalog,queue)
    options={"max_bytes":max_bytes} if max_bytes is not None else {}
    result=sync_once(client,folder_id,inbox,state,**options)
    # `scan` checks source SHA and actual FFprobe data, and writes catalog atomically.
    assets=pipeline.scan(inbox,catalog)
    entries=[]; held=0
    for a in assets:
        if 'hold' in a:
            held+=1;continue
        if a['duplicate_of'] is not None:
            continue
        # This id never carries real names or footage outside private output.
        sid='asset_'+a['sha256'][:32]
        entries.append({'assetId':sid,'sha256':a['sha256'],
                        'local':a['relative_name'],'seconds':round(a['duration'],3),
                        'width':a['width'],'height':a['height'],
                        'hasAudio':a['audio'],
                        'sceneStatus':'NEEDS_SEMANTIC_REVIEW',
                        'editorialQuality':'NOT_EVALUATED',
                        'privacyCheck':'NOT_PERFORMED'})
    entries.sort(key=lambda x:x['assetId'])
    record={'schema':SCHEMA,'status':'HOLD_REVIEW_REQUIRED',
            'assets':entries,'sourceCount':len(entries),
            'intake':result,'scanHolds':held,
            'semanticRecognition':'NOT_PERFORMED',
            'draftGeneration':'NOT_RUN_NO_VERIFIED_SCENES',
            'publishing':'NOT_PERFORMED'}
    # derived file is safe to overwrite, but never allow source or state overwrites
    _atomic_json(queue,record)
    return {'status':record['status'],'newImports':result['imported'],
            'alreadyPresent':result['already_present'],'held':result['hold']+held,
            'queuePending':len(entries),'draftsMade':0,'publishing':'NOT_PERFORMED'}


def main():
    ap=argparse.ArgumentParser(description='Private unattended component: Drive arrival to semantic review queue')
    ap.add_argument('--folder-id',required=True)
    ap.add_argument('--inbox',required=True)
    ap.add_argument('--state',required=True)
    ap.add_argument('--catalog',required=True)
    ap.add_argument('--review-queue',required=True)
    a=ap.parse_args()
    try:
        client=DriveHTTP(oauth_token_from_env())
        result=run_once(client,a.folder_id,a.inbox,a.state,a.catalog,a.review_queue)
        print(json.dumps(result))
        if result['held']:
            raise SystemExit(2)
    except (Hold,pipeline.Hold) as exc:
        # Exception messages only contain predefined non-sensitive gate codes.
        print(json.dumps({'status':'HOLD','reason':str(exc)}))
        raise SystemExit(2)

if __name__=='__main__':main()
