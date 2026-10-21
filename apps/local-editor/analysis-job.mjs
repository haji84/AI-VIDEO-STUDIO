/** One bounded private analysis at a time; reports never confirm themselves. */
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {saveSession,readLocalJson,hashFile} from '../../packages/project/local-store.mjs';
export async function createAnalysisManager({folder,root,getSession,getBindings,atomicJson,name,worker,label,validateSelection,validateReport,assertCurrent,applyReport,verifyApply}){
  const journal=join(folder,'last-'+name+'.json');let job={status:'NOT_RUN'},report,pending=Promise.resolve(),journalFound=false;
  try{
    const saved=JSON.parse(await readLocalJson(journal));journalFound=true;
    if(saved.status==='RUNNING')job={status:'INTERRUPTED',error:label+'が中断されました。再解析できます'};
    else if(saved.status==='PASS'&&/^[a-f0-9]{32}$/.test(saved.id)){
      const file=join(folder,name,saved.id,'report.json');if(await hashFile(file)!==saved.reportSha256)throw new Error(name.toUpperCase()+'_REPORT_CHANGED');
      report=validateReport(JSON.parse(await readLocalJson(file)));job={id:saved.id,status:'PASS'};
    }else if(saved.status==='FAIL')job={status:'FAIL',error:'前の'+label+'は失敗しました。再解析できます'};
  }catch(error){if(journalFound||error.code!=='ENOENT')job={status:'FAIL',error:'前の'+label+'記録を確認できません。再解析してください'};}
  function state(){let stale=false;if(report)try{assertCurrent(getSession().current,report);}catch{stale=true;}
    return {...job,...(report?{report,stale}:{})};}
  return {state,busy:()=>job.status==='RUNNING',wait:()=>pending,
    async start(request){
      if(job.status==='RUNNING')throw new Error(name.toUpperCase()+'_BUSY');validateSelection(getSession().current,request);
      const id=randomUUID().replaceAll('-',''),dir=join(folder,name,id);await mkdir(dir,{recursive:true});
      const bindings=getBindings();await saveSession(join(dir,'project.json'),getSession(),{protectedPaths:bindings.map(b=>b.path)});
      await atomicJson(join(dir,'bindings.json'),bindings);await atomicJson(join(dir,'request.json'),request);
      job={id,status:'RUNNING'};report=undefined;await atomicJson(journal,job);
      const child=spawn(process.env.AIVS_PYTHON||(process.platform==='win32'?'python':'python3'),
        ['-m',worker,'--project',join(dir,'project.json'),'--bindings',join(dir,'bindings.json'),
         '--request',join(dir,'request.json'),'--workspace',join(dir,'analysis'),'--output',join(dir,'report.json')],{cwd:root,stdio:['ignore','pipe','pipe']});
      let errors='';child.stdout.resume();child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-3000);});
      pending=new Promise(done=>{let finished=false;async function finish(code){if(finished)return;finished=true;
        try{if(code===0){const file=join(dir,'report.json'),checked=validateReport(JSON.parse(await readLocalJson(file))),completed={id,status:'PASS'};
            await atomicJson(journal,{...completed,reportSha256:await hashFile(file)});report=checked;job=completed;}
          else {const failed={id,status:'FAIL',error:label+'を実行できませんでした。素材と実行環境を確認してください'};await writeFile(join(dir,'error.txt'),errors,{mode:0o600});await atomicJson(journal,failed);job=failed;}}
        catch{job={id,status:'FAIL',error:label+'記録を保存できませんでした。再解析してください'};report=undefined;}finally{done();}}
        child.once('error',error=>{errors=error.message;finish(1);});child.once('close',finish);
      });return state();
    },
    async apply(id,confirmed){
      if(job.status!=='PASS'||!report||id!==job.id)throw new Error(name.toUpperCase()+'_ANALYSIS_NOT_FOUND');
      const p=getSession().current,next=applyReport(p,report,confirmed);
      await verifyApply(p,getBindings(),report);
      return next;
    }};
}
