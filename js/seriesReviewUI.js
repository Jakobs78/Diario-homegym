import {advanceExercise} from './activeExercise.js';
import {SET_REVIEW_REASONS,setReview,reviewLabel,excludedFromCoaching} from '../mycoatch/setReview.js';
import {needsSeriesClarification,clarificationSignature} from '../mycoatch/seriesClarification.js';
import {confirmed,warm} from '../mycoatch/setPrescription.js';
import {trainingExposures} from '../mycoatch/trainingHistory.js';
import {state} from './state.js';
import {saveAndSync} from './storage.js';
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
export function bindSeriesReviews(holder,day,readOnly,render){
 for(const [ei,ex] of (day.exercises||[]).entries()){
  const card=holder.querySelector('.ex-card[data-ex="'+ei+'"]');if(!card||ex.isWarmup||ex.isExcluded||ex.is_excluded)continue;
  const rows=(ex.loggedSets||[]).map((s,i)=>({s,i})).filter(({s,i})=>confirmed(s)&&!warm(s)&&!warm(ex.sets?.[i]));
  if(!rows.length)continue;
  const details=node('details');details.className='series-review';
  details.open=Boolean(ex._reviewOpen)||needsSeriesClarification(ex)&&!ex._reviewDeferred;
  details.append(node('summary','Segnalazioni delle serie'+(rows.some(x=>reviewLabel(x.s))?' · presenti':'')));
  if(details.open){const question=node('p','Hai cambiato il carico o ottenuto risultati molto diversi. È successo qualcosa? Indica il motivo nella serie interessata.');question.className='series-review-question';details.append(question);}
  details.append(node('p','I risultati restano nello storico. Dolore, distrazione e problemi di esecuzione escludono la serie dai calcoli del coaching.'));
  for(const {s,i} of rows){
   const label=node('label','Serie '+(i+1)+' · '+String(s.weight).replace('.',',')+' kg × '+s.reps+' reps');
   const select=node('select');select.setAttribute('aria-label','Motivo serie '+(i+1));select.disabled=readOnly;
   select.append(new Option('Nessuna segnalazione',''));
   for(const [value,text] of Object.entries(SET_REVIEW_REASONS))select.append(new Option(text,value));
   select.value=s.coachReview?.reason||'';label.append(select);details.append(label);
   const note=node('input');note.type='text';note.maxLength=500;note.placeholder='Nota facoltativa per la serie '+(i+1);note.setAttribute('aria-label','Nota serie '+(i+1));note.value=s.coachReview?.note||'';note.disabled=readOnly||!select.value;details.append(note);
   const commit=async()=>{
    if(readOnly)return;
    setReview(s,select.value,note.value);
    if(select.value)ex.coachClarification={signature:clarificationSignature(ex),status:'answered'};else delete ex.coachClarification;
    Object.defineProperty(ex,'_reviewOpen',{value:true,writable:true,configurable:true,enumerable:false});
    await saveAndSync(state.workoutData);render();
   };
   select.addEventListener('change',commit);note.addEventListener('change',commit);
   if(excludedFromCoaching(s))details.append(node('small','Serie conservata; esclusa dai calcoli del coaching.'));
  }
  if(details.open&&!readOnly){
   const finish=node('button','Conferma segnalazioni');finish.type='button';finish.addEventListener('click',async()=>{Object.defineProperty(ex,'_reviewOpen',{value:false,writable:true,configurable:true,enumerable:false});Object.defineProperty(ex,'_reviewDeferred',{value:true,writable:true,configurable:true,enumerable:false});if(await saveAndSync(state.workoutData)===false)return;advanceExercise(day,ei);render();if(day.completed)(await import('./liveCoachUI.js')).showLiveCoachToast(day,{revealSummary:true});});details.append(finish);
   const later=node('button','Rispondo dopo');later.type='button';later.addEventListener('click',async()=>{details.open=false;Object.defineProperty(ex,'_reviewDeferred',{value:true,writable:true,configurable:true,enumerable:false});advanceExercise(day,ei);render();if(day.completed)(await import('./liveCoachUI.js')).showLiveCoachToast(day,{revealSummary:true});});details.append(later);}
  card.append(details);
  // Only unresolved old questions are carried forward. A later consistent performance supersedes them.
 }
 for(const [ei,ex] of (day.exercises||[]).entries()){
  const done=(ex.loggedSets||[]).filter(s=>confirmed(s)&&!warm(s));
  if(done.length>=2&&done.length===(ex.loggedSets||[]).filter(s=>!warm(s)).length&&done.every(s=>s.weight===done[0].weight&&!excludedFromCoaching(s)))continue;
  const evidence=trainingExposures(state.workoutData,{year:state.currentYear,mesoIndex:state.activeMesocycleIndex,weekNumber:state.activeWeek,dayIndex:(state.activeDay||1)-1,exerciseIndex:ei},ex)[0];
  if(!evidence||!needsSeriesClarification(evidence.exercise))continue;
  const card=holder.querySelector('.ex-card[data-ex="'+ei+'"]');if(!card)continue;
  const prompt=node('div');prompt.className='series-review-followup';
  prompt.append(node('p','Nella seduta precedente ci sono risultati diversi da chiarire. Il carico suggerito è provvisorio.'));
  const button=node('button','Chiarisci le serie precedenti');button.type='button';button.disabled=readOnly||Boolean(state.workoutData?.history?.years?.[String(evidence.source.year)]?.mesocycles?.[evidence.source.mesoIndex]?.locked);
  button.addEventListener('click',()=>{
   const panel=node('div');const prior=evidence.exercise;
   for(const [i,s] of (prior.loggedSets||[]).entries()){
    if(!confirmed(s)||warm(s))continue;
    const label=node('label','Serie '+(i+1)+' · '+s.weight+' kg × '+s.reps);
    const select=node('select');select.append(new Option('Scegli il motivo',''));for(const [v,t] of Object.entries(SET_REVIEW_REASONS))select.append(new Option(t,v));
    select.value=s.coachReview?.reason||'';
    select.addEventListener('change',async()=>{setReview(s,select.value);prior.coachClarification={signature:clarificationSignature(prior),status:'answered'};await saveAndSync(state.workoutData);render();});label.append(select);panel.append(label);
   }prompt.append(panel);button.remove();
  });prompt.append(button);card.append(prompt);
 }
}
