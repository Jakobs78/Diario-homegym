import {EXERCISE_DATABASE} from './exercisesDB.js';
import {canonicalExerciseKey} from './exerciseIdentity.js';
import {availableDumbbellLoads} from './dumbbellInventory.js';
import {sessionWorkCounts} from '../js/sessionSkip.js';
import {setPrescription,observed} from './setPrescription.js';
import {plannedWorkSetCount} from '../js/workoutSemantics.js';
import {painReported,excludedFromCoaching} from './setReview.js';
export const DUMBBELL_ROW='Rematore con Manubrio a Un Braccio';
export const CABLE_ROW='Rematore Unilaterale al Cavo Basso';
export function rowEquipmentLimit(mesocycle,equipment={}){
 if(!Array.isArray(equipment.ownedDumbbells)||!mesocycle||mesocycle.excludedFromCoaching)return null;
 const days=(mesocycle.weeks||[]).flatMap(w=>w.days||[]);
 if(!days.length||!days.every(day=>sessionWorkCounts(day).finished))return null;
 const loads=availableDumbbellLoads({name:DUMBBELL_ROW},equipment);if(!loads?.length)return null;
 const maximum=Math.max(...loads),matches=[];
 for(const week of mesocycle.weeks||[])for(const day of week.days||[])for(const ex of day.exercises||[]){
  if(canonicalExerciseKey(ex.name)!==canonicalExerciseKey(DUMBBELL_ROW)||ex.isDeload||ex.isDeloadWeek||week.isDeload||week.isDeloadWeek||day.isDeloadWeek||ex.isWarmup||ex.isExcluded)continue;
  matches.push(ex);
 }
 const latest=matches.at(-1);if(!latest||painReported(latest)||latest.sessionSkip)return null;
 const sets=(latest.loggedSets||[]).map((_,i)=>observed(latest,i)).filter(Boolean);
 if(sets.length<plannedWorkSetCount(latest)||!sets.length||(latest.loggedSets||[]).some(excludedFromCoaching))return null;
 if(!sets.every(set=>{
  const p=setPrescription(latest,set.index);
  return set.kg===maximum&&p.reps&&set.reps>=p.reps.max&&p.rpe&&set.rpe!==null&&set.rpe<=p.rpe.max;
 }))return null;
 return {from:DUMBBELL_ROW,to:CABLE_ROW,maximum,
  reason:'Raggiunto il limite dei manubri ('+maximum+' kg per pezzo) con tutte le serie al limite alto e RPE entro target nel mesociclo concluso. Passaggio al cavo per continuare la progressione; carico del cavo da calibrare separatamente.'};
}
export function replacementCatalogExercise(ex,change){
 if(!change||canonicalExerciseKey(ex.name)!==canonicalExerciseKey(change.from))return ex;
 const target=EXERCISE_DATABASE.find(item=>item.name===change.to);
 return target?{...ex,...target,equipmentSubstitution:change,selectionReason:change.reason}:ex;
}
