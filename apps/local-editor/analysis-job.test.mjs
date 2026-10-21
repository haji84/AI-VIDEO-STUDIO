import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createProject,EditSession} from '../../packages/project/project.mjs';import {createAnalysisManager} from './analysis-job.mjs';
test('analysis remains busy until PASS journal has persisted',{timeout:10000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aivs-analysis-journal-'));let release;const blocked=new Promise(r=>release=r);let saving;const duringSave=new Promise(r=>saving=r);let manager;
 try{
  await mkdir(join(dir,'data'));await writeFile(join(dir,'analysis_probe.py'),"import sys,pathlib\npathlib.Path(sys.argv[sys.argv.index('--output')+1]).write_text('{}')\n");
  const session=new EditSession(createProject({projectId:'project_probe'}));
  manager=await createAnalysisManager({folder:join(dir,'data'),root:dir,getSession:()=>session,getBindings:()=>[],name:'probe',worker:'analysis_probe',label:'解析',validateSelection:()=>{},validateReport:r=>r,assertCurrent:()=>{},applyReport:p=>p,verifyApply:async()=>{},
    atomicJson:async(file,data)=>{if(data.status==='PASS'){saving();await blocked;}await writeFile(file,JSON.stringify(data));}});
  await manager.start({});await duringSave;assert.equal(manager.busy(),true,'editing cannot overlap an unpersisted completion');release();await manager.wait();assert.equal(manager.state().status,'PASS');
 }finally{release();if(manager)await manager.wait();await rm(dir,{recursive:true,force:true});}
});
