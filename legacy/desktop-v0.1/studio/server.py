"""Local-only browser UI for AI VIDEO STUDIO. No external service.

Only binds 127.0.0.1; untrusted origins cannot initiate state-changing POSTs.
"""
from __future__ import annotations

import copy
import json
import math
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import core

ROOT = Path(__file__).resolve().parent.parent
STATIC = Path(__file__).resolve().parent / "static"
WORKSPACE = ROOT / "workspace"


def _project_folder(project_id: str) -> Path:
    return WORKSPACE / "projects" / core.safe_project_id(project_id)


class Context:
    def __init__(self, workspace: Path = WORKSPACE):
        self.workspace = workspace
        (self.workspace / "projects").mkdir(parents=True,exist_ok=True)
        self.lock = threading.RLock()
        self.current_id = ""
        self.job = {"state":"idle","progress":0.0,"message":"待機中","error":None}
        self._job_active = False
        ids = self.list_projects()
        if ids:
            self.current_id = ids[0]["id"]
        else:
            self.create_project("最初のプロジェクト")

    def project_path(self):
        return self.workspace / "projects" / core.safe_project_id(self.current_id) / "project.json"

    def project(self):
        return core.read_project(self.project_path())

    def list_projects(self):
        results=[]
        for folder in (self.workspace / "projects").iterdir():
            if not folder.is_dir() or not re.fullmatch(r"[A-Za-z0-9_-]{1,70}",folder.name):continue
            path=folder / "project.json"
            if path.exists():
                try:
                    proj=core.read_project(path)
                    results.append({"id":folder.name,"name":proj["name"],"updated_at":proj["updated_at"]})
                except (OSError,ValueError,KeyError,core.StudioError):pass
        return sorted(results,key=lambda x:x["updated_at"],reverse=True)

    def create_project(self,name):
        pid="project_"+uuid.uuid4().hex[:10]
        path=self.workspace / "projects" / pid / "project.json"
        project=core.new_project(str(name))
        core.store_project(path,project)
        self.current_id=pid
        return pid

    def _checkpoint(self,proj):
        path=self.project_path()
        history=path.parent/"history"
        history.mkdir(exist_ok=True)
        items=sorted(history.glob("undo_*.json"))
        marker=f"undo_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}.json"
        (history/marker).write_text(json.dumps(proj,ensure_ascii=False,indent=2),encoding="utf-8")
        for older in items[:-29]: older.unlink(missing_ok=True)
        for redo in history.glob("redo_*.json"): redo.unlink(missing_ok=True)

    def mutate(self,fn):
        with self.lock:
            if self._job_active: raise core.StudioError("解析・書き出し中は編集を変更できません。")
            proj=self.project()
            old=copy.deepcopy(proj)
            result=fn(proj)
            self._checkpoint(old)
            core.store_project(self.project_path(),proj)
            return result

    def undo(self,redo=False):
        with self.lock:
            if self._job_active:raise core.StudioError("処理中は戻せません。")
            history=self.project_path().parent/"history"
            pattern="redo_*.json" if redo else "undo_*.json"
            items=sorted(history.glob(pattern))
            if not items:raise core.StudioError("これ以上戻せる履歴はありません。")
            prev=items[-1]
            current=self.project()
            prefix="undo_" if redo else "redo_"
            name=f"{prefix}{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}.json"
            (history/name).write_text(json.dumps(current,ensure_ascii=False,indent=2),encoding="utf-8")
            restored=core.read_project(prev)
            core.store_project(self.project_path(),restored)
            prev.unlink()

    def start_job(self, title, runner):
        with self.lock:
            if self._job_active:raise core.StudioError("別の処理を実行中です。")
            project_id=self.current_id
            snapshot=copy.deepcopy(self.project())
            self._job_active=True
            self.job={"state":"running","progress":0.0,"message":title,"error":None,"result":None}
        def update(progress,msg):
            with self.lock:
                self.job.update({"progress":float(progress),"message":msg})
        def target():
            try:
                result=runner(snapshot,project_id,update)
                with self.lock:
                    if self.current_id==project_id and result.get("updated_project"):
                        self._checkpoint(self.project())
                        core.store_project(self.project_path(),result["updated_project"])
                    self.job={"state":"done","progress":1.0,"message":result.get("message","完了"),"result":result.get("data"),"error":None}
            except Exception as exc:
                with self.lock:
                    self.job={"state":"error","progress":0.0,"message":"処理に失敗しました","error":str(exc),"result":None}
            finally:
                with self.lock:self._job_active=False
        threading.Thread(target=target,daemon=True,name="AIVS-Job").start()

    def status(self):
        with self.lock:
            try: system={"ffmpeg":core._which("ffmpeg"),"ffprobe":core._which("ffprobe")}
            except core.StudioError as exc:system={"warning":str(exc)}
            return {"project":self.project(),"project_id":self.current_id,
                    "projects":self.list_projects(),"job":self.job,"system":system}


CTX = None


def _select_files_native():
    # tkinter must run in its own GUI process, never in an HTTP worker thread.
    code=("import tkinter as tk,json;from tkinter import filedialog;"
          "root=tk.Tk();root.withdraw();root.attributes('-topmost',True);"
          "files=filedialog.askopenfilenames(title='追加する動画を選択（複数可）',"
          "filetypes=[('動画','*.mp4 *.mov *.mkv *.avi *.m4v *.webm'),('すべて','*.*')]);"
          "print(json.dumps(list(files)));root.destroy()")
    result=subprocess.run([sys.executable,"-c",code],capture_output=True,text=True,
                          encoding="utf-8",errors="replace",timeout=600)
    if result.returncode:
        raise core.StudioError("動画選択画面を開けません: "+result.stderr[-450:])
    try:return json.loads(result.stdout.strip().splitlines()[-1])
    except (ValueError,IndexError) as exc:raise core.StudioError("選択結果を読み取れません。") from exc


def _ollama_proposal(user_text, project):
    """Untrusted LLM response is only a proposal, never executed automatically."""
    if not isinstance(user_text,str) or not 1<=len(user_text)<=350:
        raise core.StudioError("編集の指示は1〜350文字で指定してください。")
    compact=[{"id":s["id"],"time":s["start"],"duration":s["duration"],"camera":s["camera"],"caption":s["caption"]} for s in project["timeline"][:40]]
    cameras=[{"id":s["id"],"name":s["name"]} for s in project["sources"]]
    system=("You only propose video timeline edits, in valid JSON. Do not execute commands, edit files,"
            " create paths, give shell commands or invent source video content."
            " Respond exactly with {\"segment_id\":string,\"changes\":object,\"reason\":string}."
            " Allowed keys in changes: camera, caption, layout, secondary, speed."
            " Allowed layout: single or split. If ambiguous return {\"segment_id\":\"\",\"changes\":{},\"reason\":\"Unclear; please select a segment.\"}."
            " Segment ids and camera ids must be chosen from data given. Never claim semantic understanding of video.")
    prompt=system+"\nCameras:"+json.dumps(cameras,ensure_ascii=False)+"\nSegments(first 40):"+json.dumps(compact,ensure_ascii=False)+"\nUser:"+user_text
    payload=json.dumps({"model":os.environ.get("AIVS_OLLAMA_MODEL","qwen2.5-coder:3b"),
                        "prompt":prompt,"stream":False,"format":"json","options":{"num_predict":350,"temperature":0.1}}).encode("utf-8")
    try:
        req=urllib.request.Request("http://127.0.0.1:11434/api/generate",data=payload,headers={"Content-Type":"application/json"},method="POST")
        with urllib.request.urlopen(req,timeout=90) as res:response=json.load(res)
        p=json.loads(response["response"])
    except (OSError,ValueError,KeyError) as exc:
        raise core.StudioError("Ollamaから提案を取得できません。モデルとサービスを確認してください: "+str(exc)[:120]) from exc
    ids={s["id"] for s in project["timeline"]}
    cameras_by_id={s["id"] for s in project["sources"]}
    changes=p.get("changes",{})
    if not isinstance(changes,dict) or not set(changes).issubset({"camera","caption","layout","secondary","speed"}):
        raise core.StudioError("AIの編集提案に未許可の操作が含まれています。")
    seg_id=str(p.get("segment_id",""))
    if seg_id not in ids or not changes:
        raise core.StudioError("対象区間が特定できませんでした。区間を選択して具体的に指示してください。")
    if "camera" in changes and changes["camera"] not in cameras_by_id:raise core.StudioError("AIが存在しないカメラを指定しました。")
    if "secondary" in changes and changes["secondary"] is not None and changes["secondary"] not in cameras_by_id:
        raise core.StudioError("AIが存在しないサブカメラを指定しました。")
    # Test proposal on a detached copy; it is not yet applied.
    test=copy.deepcopy(project)
    core.mutate_segment(test,seg_id,changes)
    return {"segment_id":seg_id,"changes":changes,"reason":str(p.get("reason",""))[:300],"requires_confirmation":True}


class Handler(BaseHTTPRequestHandler):
    server_version="AI-Video-Studio/0.1"

    def log_message(self, format, *args):
        # Avoid logging source video paths, query parameters or prompts.
        if os.environ.get("AIVS_VERBOSE")=="1":
            print("[HTTP] "+format%args)

    def _send_bytes(self,data:bytes,type_:str="application/json; charset=utf-8",status:int=200):
        self.send_response(status)
        self.send_header("Content-Type",type_)
        self.send_header("Content-Length",str(len(data)))
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Cache-Control","no-store")
        self.send_header("Content-Security-Policy","default-src 'self' 'unsafe-inline' data: blob:; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:")
        self.end_headers()
        self.wfile.write(data)

    def json_out(self,data:dict,status:int=200):
        self._send_bytes(json.dumps(data,ensure_ascii=False,default=str).encode("utf-8"),status=status)

    def _fail(self,exception):
        status=400 if isinstance(exception,(core.StudioError,ValueError,KeyError,FileNotFoundError)) else 500
        self.json_out({"ok":False,"error":str(exception) if status==400 else "内部エラー。画面を更新して再試行してください。"},status)

    def do_GET(self):
        try:
            url=urlparse(self.path)
            if url.path in {"/","/index.html"}:
                self._send_bytes((STATIC/"index.html").read_bytes(),"text/html; charset=utf-8")
            elif url.path=="/api/status":
                self.json_out({"ok":True,**CTX.status()})
            elif url.path=="/api/frame":
                q=parse_qs(url.query)
                sid=q.get("id",[""])[0]
                t=float(q.get("t",["0"])[0])
                if not math.isfinite(t):raise core.StudioError("時刻が不正です。")
                s=next((s for s in CTX.project()["sources"] if s["id"]==sid),None)
                if not s:raise core.StudioError("動画が見つかりません。")
                cached=CTX.project_path().parent/"previews"/(f"{sid}_{int(t)}.jpg")
                if not cached.exists():core.preview_frame(s,t,cached)
                self._send_bytes(cached.read_bytes(),"image/jpeg")
            elif url.path=="/api/clip":
                q=parse_qs(url.query)
                sid=q.get("id",[""])[0]
                proj=CTX.project()
                segment=next((s for s in proj["timeline"] if s["id"]==sid),None)
                if not segment:raise core.StudioError("区間が見つかりません。")
                dest=CTX.project_path().parent/"previews"/(f"clip_{sid}_{hash(json.dumps(segment,sort_keys=True))&0xffffffff:x}.mp4")
                dest.parent.mkdir(exist_ok=True)
                if not dest.is_file():core.preview_clip(proj,segment,dest)
                self._send_bytes(dest.read_bytes(),"video/mp4")
            elif url.path=="/api/report":
                path=CTX.project_path().parent/"last_export_report.json"
                if not path.is_file():raise core.StudioError("書き出し履歴はまだありません。")
                self.json_out({"ok":True,"report":json.loads(path.read_text(encoding="utf-8"))})
            else:
                self.json_out({"ok":False,"error":"見つかりません。"},404)
        except Exception as exc:self._fail(exc)

    def do_POST(self):
        try:
            origin=self.headers.get("Origin","")
            allowed=f"http://127.0.0.1:{self.server.server_port}"
            if origin and origin !=allowed:
                raise core.StudioError("別サイトからの操作は禁止しています。")
            if self.headers.get("Content-Type","").split(";")[0].strip().lower()!="application/json":
                raise core.StudioError("JSON形式の操作だけ受け付けます。")
            length=int(self.headers.get("Content-Length","0"))
            if length<0 or length>300000:raise core.StudioError("リクエストが大きすぎます。")
            data=json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(data,dict):raise core.StudioError("操作内容が不正です。")
            path=urlparse(self.path).path
            if path=="/api/new":
                with CTX.lock:
                    if CTX._job_active:raise core.StudioError("処理中はプロジェクトを変更できません。")
                    result=CTX.create_project(data.get("name","新しい動画プロジェクト"))
                self.json_out({"ok":True,"project_id":result})
            elif path=="/api/open":
                target=core.safe_project_id(str(data.get("id","")))
                with CTX.lock:
                    if CTX._job_active:raise core.StudioError("処理中は変更できません。")
                    if not (CTX.workspace/"projects"/target/"project.json").is_file():raise core.StudioError("プロジェクトがありません。")
                    CTX.current_id=target
                self.json_out({"ok":True})
            elif path=="/api/rename":
                CTX.mutate(lambda p: p.update({"name":str(data.get("name",""))[:80] or p["name"]}))
                self.json_out({"ok":True})
            elif path=="/api/add":
                added=CTX.mutate(lambda p: core.add_sources(p,data.get("paths",[])))
                self.json_out({"ok":True,"added":len(added)})
            elif path=="/api/pick":
                paths=_select_files_native()
                if paths:
                    added=CTX.mutate(lambda p:core.add_sources(p,paths))
                else:added=[]
                self.json_out({"ok":True,"added":len(added),"cancelled":not bool(paths)})
            elif path=="/api/source/update":
                def m(p):
                    source=next((s for s in p["sources"] if s["id"]==data.get("id")),None)
                    if not source:raise core.StudioError("指定された動画がありません。")
                    for key in ("equirect","yaw","pitch"):
                        if key in data:source[key]=data[key]
                CTX.mutate(m)
                self.json_out({"ok":True})
            elif path=="/api/manual_offset":
                CTX.mutate(lambda p:core.manual_offset(p,str(data["id"]),float(data["offset"])))
                self.json_out({"ok":True})
            elif path=="/api/sync":
                def run(p,pid,update):
                    outcome=core.sync_sources(p,callback=lambda msg:update(0.5,msg))
                    return {"message":"音声による同期候補を計算しました。確度の低い候補は未確定です。",
                            "updated_project":p,"data":outcome}
                CTX.start_job("音声からカメラを同期中",run)
                self.json_out({"ok":True})
            elif path=="/api/plan":
                count=CTX.mutate(lambda p:len(core.make_plan(p,float(data.get("seconds",18)))))
                self.json_out({"ok":True,"segments":count,"notice":"時系列の自動配置です。映像内容の意味理解による選択ではありません。"})
            elif path=="/api/segment/update":
                CTX.mutate(lambda p:core.mutate_segment(p,str(data["id"]),data.get("changes",{})))
                self.json_out({"ok":True})
            elif path=="/api/segment/action":
                CTX.mutate(lambda p:core.segment_action(p,str(data["id"]),str(data["action"])))
                self.json_out({"ok":True})
            elif path=="/api/undo":
                CTX.undo()
                self.json_out({"ok":True})
            elif path=="/api/redo":
                CTX.undo(redo=True)
                self.json_out({"ok":True})
            elif path=="/api/ai/propose":
                proposal=_ollama_proposal(str(data.get("text","")),CTX.project())
                self.json_out({"ok":True,"proposal":proposal})
            elif path=="/api/export":
                quality=data.get("quality","fullhd")
                gpu=bool(data.get("gpu",True))
                def run(proj,pid,update):
                    folder=CTX.workspace/"projects"/pid
                    filename="video_"+time.strftime("%Y%m%d_%H%M%S")+".mp4"
                    output=folder/"exports"/filename
                    report=core.render_project(proj,folder/"temp",output,quality,gpu,callback=update)
                    report["project_id"]=pid
                    (folder/"last_export_report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
                    return {"message":"MP4を書き出し、全編デコード検査に合格しました。教材としての内容確認は未実施です。","data":report}
                CTX.start_job("MP4を生成中",run)
                self.json_out({"ok":True})
            else:self.json_out({"ok":False,"error":"未対応の操作です。"},404)
        except Exception as exc:self._fail(exc)


def serve(port:int=0,launch_browser=True,ctx:Context|None=None):
    global CTX
    CTX=ctx or Context()
    http=ThreadingHTTPServer(("127.0.0.1",port),Handler)
    url=f"http://127.0.0.1:{http.server_port}"
    print("AI VIDEO STUDIO",url,flush=True)
    print("元動画は変更されません。ローカルPC内で処理します。",flush=True)
    if launch_browser:
        import webbrowser
        import threading
        threading.Timer(1.0,lambda:webbrowser.open(url)).start()
    try:http.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:pass
    finally:http.server_close()
