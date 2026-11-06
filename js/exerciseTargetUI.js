import {exerciseLoadSummary} from './exerciseLoadSummary.js';
import {formatExerciseSummary,escapeHtml} from './helpers.js';
export function exerciseTargetMarkup(ex,prefills,options={}){
 const load=exerciseLoadSummary(ex,prefills,options);
 return '<strong>OBIETTIVO:</strong> '+formatExerciseSummary(ex,{weightLabel:load.text})+
  (load.original&&!load.text.endsWith(load.original)?'<div class="exercise-original-load">Carico della scheda: '+escapeHtml(load.original)+'</div>':'');
}
