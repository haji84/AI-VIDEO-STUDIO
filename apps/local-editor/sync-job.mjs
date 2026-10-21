import {createAnalysisManager} from './analysis-job.mjs';
import {createSyncRequest,validateSyncSelection} from '../../packages/project/sync-adapter.mjs';
import {validateSyncReport,assertCurrentSyncReport,applySyncCandidate} from './sync-edits.mjs';
export function createSyncManager(options){return createAnalysisManager({...options,name:'sync',worker:'engine.sync_saved_project',label:'同期解析',
 validateSelection:validateSyncSelection,validateReport:validateSyncReport,assertCurrent:assertCurrentSyncReport,applyReport:applySyncCandidate,
 verifyApply:(p,b,r)=>createSyncRequest(p,b,{masterId:r.masterIdentity.assetId,targetId:r.targetIdentity.assetId})});}
