import {resolveNearbyLoad} from '../mycoatch/loadProposal.js';
import {exerciseLoadSummary} from './exerciseLoadSummary.js';
import {formatExerciseSummary,escapeHtml} from './helpers.js';
export function exerciseTargetMarkup(ex,prefills,options={}){
 const load=exerciseLoadSummary(ex,prefills,options);
 const missing=!options.readOnly&&prefills.some((p,i)=>{
  const row=ex.loggedSets?.[i];if(row?.isLocked||row?.completed||row?.isWarmup)return false;
  const kg=Number(String(p?.weight??'').replace(',','.'));if(!(kg>0))return false;
  const result=resolveNearbyLoad(ex,kg,options.equipmentSettings||{},{min:kg,max:kg});
  return result.verified&&result.weight===null;
 });
 return '<strong>OBIETTIVO:</strong> '+formatExerciseSummary(ex,{weightLabel:load.text})+
  (missing?'<div class="exercise-load-availability">Carico non presente nell’attrezzatura salvata: scegli tu il peso utilizzabile.</div>':'')+
  (load.original&&!load.text.endsWith(load.original)?'<div class="exercise-original-load">Carico della scheda: '+escapeHtml(load.original)+'</div>':'');
}
