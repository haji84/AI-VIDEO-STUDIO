/** One bounded local sync analysis at a time; reports never confirm themselves. */
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {saveSession,readLocalJson,hashFile} from '../../packages/project/local-store.mjs';
import {createSyncRequest,validateSyncSelection} from '../../packages/project/sync-adapter.mjs';
import {validateSyncReport,assertCurrentSyncReport,applySyncCandidate} from './sync-edits.mjs';
export async function createSyncManager({folder,root,getSession,getBindings,atomicJson}){
  const journal=join(folder,'last-sync.json');let job={status:'NOT_RUN'},report,pending=Promise.resolve();
  try{
    const saved=JSON.parse(await readLocalJson(journal));
    if(saved.status==='RUNNING')job={status:'INTERRUPTED',error:'同期解析が中断されました。再解析できます'};
    else if(saved.status==='PASS'&&/^[a-f0-9]{32}$/.test(saved.id)){
      const file=join(folder,'sync',saved.id,'report.json');if(await hashFile(file)!==saved.reportSha256)throw new Error('SYNC_REPORT_CHANGED');
      report=validateSyncReport(JSON.parse(await readLocalJson(file)));job={id:saved.id,status:'PASS'};
    }
  }catch(error){if(error.code!=='ENOENT')job={status:'FAIL',error:'前の同期記録を確認できません。再解析してください'};}
  function state(){let stale=false;if(report)try{assertCurrentSyncReport(getSession().current,report);}catch{stale=true;}
    return {...job,...(report?{report,stale}:{})};}
  return {state,busy:()=>job.status==='RUNNING',wait:()=>pending,
    async start(request){
      if(job.status==='RUNNING')throw new Error('SYNC_BUSY');validateSyncSelection(getSession().current,request);
      const id=randomUUID().replaceAll('-',''),dir=join(folder,'sync',id);await mkdir(dir,{recursive:true});
      const bindings=getBindings();await saveSession(join(dir,'project.json'),getSession(),{protectedPaths:bindings.map(b=>b.path)});
      await atomicJson(join(dir,'bindings.json'),bindings);await atomicJson(join(dir,'request.json'),request);
      job={id,status:'RUNNING'};report=undefined;await atomicJson(journal,job);
      const child=spawn(process.env.AIVS_PYTHON||(process.platform==='win32'?'python':'python3'),
        ['-m','engine.sync_saved_project','--project',join(dir,'project.json'),'--bindings',join(dir,'bindings.json'),
         '--request',join(dir,'request.json'),'--workspace',join(dir,'analysis'),'--output',join(dir,'report.json')],{cwd:root,stdio:['ignore','pipe','pipe']});
      let errors='';child.stdout.resume();child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-3000);});
      pending=new Promise(done=>{let finished=false;async function finish(code){if(finished)return;finished=true;
        try{if(code===0){const file=join(dir,'report.json');report=validateSyncReport(JSON.parse(await readLocalJson(file)));job={id,status:'PASS'};
            await atomicJson(journal,{...job,reportSha256:await hashFile(file)});}
          else {job={id,status:'FAIL',error:'同期解析を実行できませんでした。素材と実行環境を確認してください'};await writeFile(join(dir,'error.txt'),errors,{mode:0o600});await atomicJson(journal,job);}}
        catch{job={id,status:'FAIL',error:'同期記録を保存できませんでした。再解析してください'};report=undefined;}finally{done();}}
        child.once('error',error=>{errors=error.message;finish(1);});child.once('close',finish);
      });return state();
    },
    async apply(id,confirmed){
      if(job.status!=='PASS'||!report||id!==job.id)throw new Error('SYNC_ANALYSIS_NOT_FOUND');
      const p=getSession().current,next=applySyncCandidate(p,report,confirmed);
      await createSyncRequest(p,getBindings(),{masterId:report.masterIdentity.assetId,targetId:report.targetIdentity.assetId});
      return next;
    }};
}
