#!/usr/bin/env node
/** Local-only saved editing session -> checked existing-engine manifest. */
import {writeFile} from 'node:fs/promises';
import {loadSession,readLocalJson,assertUnprotected} from '../packages/project/local-store.mjs';
import {createManifest} from '../packages/project/manifest-adapter.mjs';

try{
  const opts={};const args=process.argv.slice(2);
  for(let i=0;i<args.length;i+=2){
    if(!['--project','--bindings','--output'].includes(args[i])||!args[i+1]||opts[args[i]])throw new Error('INVALID_ARGUMENTS');
    opts[args[i]]=args[i+1];
  }
  const projectFile=opts['--project'],bindingFile=opts['--bindings'],output=opts['--output'];
  if(!projectFile||!bindingFile||!output)throw new Error('USAGE: --project session.json --bindings local-bindings.json --output manifest.json');
  const session=await loadSession(projectFile),bindings=JSON.parse(await readLocalJson(bindingFile));
  const manifest=await createManifest(session.current,bindings);
  manifest.protectedPaths=[projectFile,bindingFile,...bindings.map(b=>b.path)];
  await assertUnprotected(output,[projectFile,bindingFile,...bindings.map(b=>b.path)]);
  await writeFile(output,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({ok:true,clips:manifest.timeline.length,sources:manifest.sources.length}));
}catch(e){console.error(JSON.stringify({ok:false,code:e.message}));process.exitCode=1;}
