import {catalogExercise} from '../mycoatch/catalogLookup.js';
import {muscleGroupLabel} from '../mycoatch/muscleCatalog.js';
import {escapeHtml} from './helpers.js';
export function exerciseMusclesMarkup(ex){
 const meta=catalogExercise(ex);
 if(!meta)return '<details class="exercise-muscle-details"><summary>Muscoli coinvolti</summary><p>Esercizio non classificato: le serie restano nel diario, ma non vengono attribuite ai distretti.</p></details>';
 const p=meta.muscleProfile,labels=a=>escapeHtml(a.map(muscleGroupLabel).join(', '));
 return '<details class="exercise-muscle-details"><summary>Muscoli coinvolti</summary>'+
  '<p>Principali: '+labels(p.primary)+'.</p>'+
  (p.secondary.length?'<p>Secondari: '+labels(p.secondary)+'.</p>':'')+
  (p.regions.length?'<p>Dettaglio: '+escapeHtml(p.regions.join(', '))+'.</p>':'')+
  (p.stabilizers.length?'<p>Stabilizzazione: '+escapeHtml(p.stabilizers.join(', '))+'.</p>':'')+
  '<p>Conteggio: 1 serie diretta; 0,5 per i secondari. La stabilizzazione non aggiunge serie. Sono stime del contributo, non percentuali di sforzo.</p></details>';
}
