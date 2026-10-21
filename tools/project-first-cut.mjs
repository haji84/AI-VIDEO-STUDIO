#!/usr/bin/env node
/** Local checked bundle/report; no user media or paths in portable evidence. */
import {writeFile} from 'node:fs/promises';
import {loadSession,readLocalJson,assertUnprotected} from '../packages/project/local-store.mjs';
import {createFirstCutRequest} from '../packages/project/first-cut-adapter.mjs';
import {validateFirstCutReport} from '../packages/project/first-cut.mjs';
try{
 const opts={},args=process.argv.slice(2);
 for(let i=0;i<args.length;i+=2){if(!['--project','--bindings','--request','--output','--report'].includes(args[i])||!args[i+1]||opts[args[i]])throw new Error('INVALID_ARGUMENTS');opts[args[i]]=args[i+1];}
 if(Object.keys(opts).length===1&&opts['--report'])validateFirstCutReport(JSON.parse(await readLocalJson(opts['--report'])));
 else{
  if(Object.keys(opts).length!==4||!['--project','--bindings','--request','--output'].every(k=>opts[k]))throw new Error('INVALID_ARGUMENTS');
  const p=(await loadSession(opts['--project'])).current,b=JSON.parse(await readLocalJson(opts['--bindings']));
  const bundle=await createFirstCutRequest(p,b,JSON.parse(await readLocalJson(opts['--request'])));
  await assertUnprotected(opts['--output'],[...Object.values(opts),...b.map(x=>x.path)].filter(x=>x!==opts['--output']));
  await writeFile(opts['--output'],JSON.stringify(bundle)+'\n',{flag:'wx',mode:0o600});
 }
 console.log(JSON.stringify({ok:true}));
}catch(e){console.error(JSON.stringify({ok:false,code:e.message}));process.exitCode=1;}
