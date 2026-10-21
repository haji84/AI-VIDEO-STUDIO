#!/usr/bin/env node
/** Validate a private saved-project sync request with the common authority. */
import {writeFile} from 'node:fs/promises';
import {loadSession,readLocalJson,assertUnprotected} from '../packages/project/local-store.mjs';
import {createSyncRequest} from '../packages/project/sync-adapter.mjs';
try{
  const opts={},args=process.argv.slice(2);
  for(let i=0;i<args.length;i+=2){if(!['--project','--bindings','--request','--output'].includes(args[i])||!args[i+1]||opts[args[i]])throw new Error('INVALID_ARGUMENTS');opts[args[i]]=args[i+1];}
  if(Object.keys(opts).length!==4)throw new Error('USAGE: --project --bindings --request --output');
  const project=(await loadSession(opts['--project'])).current,bindings=JSON.parse(await readLocalJson(opts['--bindings']));
  const bundle=await createSyncRequest(project,bindings,JSON.parse(await readLocalJson(opts['--request'])));
  await assertUnprotected(opts['--output'],[...Object.values(opts),...bindings.map(b=>b.path)].filter(x=>x!==opts['--output']));
  await writeFile(opts['--output'],JSON.stringify(bundle)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({ok:true}));
}catch(error){console.error(JSON.stringify({ok:false,code:error.message}));process.exitCode=1;}
