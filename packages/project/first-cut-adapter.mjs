import {validateFirstCutSelection} from './first-cut.mjs';
import {verifyBindings} from './local-store.mjs';
export async function createFirstCutRequest(project,bindings,request){
  const {videos,eligible}=validateFirstCutSelection(project,request),ids=new Set(eligible.map(s=>s.assetId));
  if(!Array.isArray(bindings))throw new Error('INVALID_BINDINGS');
  const paths=await verifyBindings({...project,sourceRefs:eligible,timeline:[],audioClips:[]},bindings.filter(b=>ids.has(b.assetId)));
  return {schema:'aivs-local-first-cut-bundle-v1',projectId:project.projectId,projectRevision:project.revision,mode:request.mode,
    sourceIdentities:videos,sources:eligible.map(s=>({...s,path:paths[s.assetId]})),analysisWindowSec:1200};
}
