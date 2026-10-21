#!/usr/bin/env node
/** Local-only CLI. Converts saved low-level signal JSON into an editable proposal. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {proposeEdit} from '../packages/edit-planner/auto-edit.mjs';

function cli(args){
  const files=[],params={mode:'training',multiView:'recommend'};
  let out=null;
  for(let i=0;i<args.length;i++){
    const token=args[i];
    if(token==='--signals')files.push(args[++i]);
    else if(token==='--mode')params.mode=args[++i];
    else if(token==='--multiview')params.multiView=args[++i];
    else if(token==='--output')out=args[++i];
    else throw new Error('UNKNOWN_ARGUMENT');
  }
  if(!files.length||!out||files.some(x=>!x))throw new Error('USAGE: --signals analysis1.json [--signals analysisN.json] --output proposal.json');
  if(files.some(x=>resolve(x)===resolve(out)))throw new Error('OUTPUT_CANNOT_OVERWRITE_EVIDENCE');
  const sources=files.map(file=>{
    const doc=JSON.parse(readFileSync(file,'utf8'));
    if(doc.schema!=='aivs-local-signals-v1'||!doc.source)throw new Error('INCOMPATIBLE_SIGNAL_SCHEMA');
    return doc.source;
  });
  const p=proposeEdit({sources,...params});
  writeFileSync(out,JSON.stringify(p,null,2)+'\n',{flag:'wx'});
  return {clips:p.timeline.length,durationSeconds:p.durationSeconds,cameras:p.evidence.cameraCount,blocked:p.evidence.blockedCameraIds.length};
}
try{console.log(JSON.stringify({ok:true,...cli(process.argv.slice(2))}));}
catch(e){console.error(JSON.stringify({ok:false,code:e.message}));process.exitCode=1;}
