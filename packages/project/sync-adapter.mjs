import {validateProject} from './project.mjs';
import {verifyBindings} from './local-store.mjs';
export function validateSyncSelection(project,request){
  validateProject(project);
  if(!request||Object.getPrototypeOf(request)!==Object.prototype||Object.keys(request).some(k=>!['masterId','targetId'].includes(k))||request.masterId===request.targetId)throw new Error('INVALID_SYNC_REQUEST');
  const master=project.sourceRefs.find(s=>s.assetId===request.masterId),target=project.sourceRefs.find(s=>s.assetId===request.targetId);
  if(!master||!target||master.mediaKind!=='video'||target.mediaKind!=='video')throw new Error('SYNC_TWO_VIDEOS_REQUIRED');
  if(!['master','verified'].includes(master.syncStatus))throw new Error('SYNC_MASTER_UNVERIFIED');
  if(!['unverified','candidate'].includes(target.syncStatus))throw new Error('SYNC_TARGET_PROTECTED');
  if(master.driftPpm!==0||target.driftPpm!==0)throw new Error('SYNC_DRIFT_UNSUPPORTED');
  return {master,target};
}
export async function createSyncRequest(project,bindings,request){
  const {master,target}=validateSyncSelection(project,request);
  const refs=[master,target],ids=new Set(refs.map(s=>s.assetId));
  if(!Array.isArray(bindings))throw new Error('INVALID_BINDINGS');
  const paths=await verifyBindings({...project,sourceRefs:refs,timeline:[],audioClips:[]},bindings.filter(b=>ids.has(b.assetId)));
  return {schema:'aivs-local-sync-bundle-v1',projectId:project.projectId,projectRevision:project.revision,
    master:{...master,path:paths[master.assetId]},target:{...target,path:paths[target.assetId]},analysisWindowSec:300};
}
