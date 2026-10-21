import {createAnalysisManager} from './analysis-job.mjs';
import {createFirstCutRequest} from '../../packages/project/first-cut-adapter.mjs';
import {validateFirstCutSelection,validateFirstCutReport,assertCurrentFirstCut,applyFirstCut} from '../../packages/project/first-cut.mjs';
export function createFirstCutManager(options){return createAnalysisManager({...options,name:'first-cut',worker:'engine.first_cut_saved_project',label:'編集候補の解析',
 validateSelection:validateFirstCutSelection,validateReport:validateFirstCutReport,assertCurrent:assertCurrentFirstCut,applyReport:applyFirstCut,
 verifyApply:(p,b,r)=>createFirstCutRequest(p,b,{mode:r.proposal.mode})});}
