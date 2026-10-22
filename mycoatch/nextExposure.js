import {exerciseIdentity} from './exerciseIdentity.js';
import {isWarmupExercise,isWarmupSet,validPerformedSet,plannedWorkSetCount} from '../js/workoutSemantics.js';
import {recommendNextSessionLoad,resolveNearbyLoad,equipmentCategory} from './loadProposal.js';
/** One decision payload for the next exposure; never mutate prescriptions or results. */
export function recommendNextExposure(previous,upcoming,equipment={},readiness=null){
    if(!previous||!upcoming||isWarmupExercise(previous)||isWarmupExercise(upcoming)||upcoming.coachWeeklyLoadReview||upcoming.isDeload||upcoming.isDeloadWeek)return null;
    if(exerciseIdentity(previous)!==exerciseIdentity(upcoming)||equipmentCategory(previous)!==equipmentCategory(upcoming))return null;
    if(String(previous.reps)!==String(upcoming.reps)||Number(String(previous.targetRpe??previous.rpe).replace(/^@/,'').replace(',','.'))!==Number(String(upcoming.targetRpe??upcoming.rpe).replace(/^@/,'').replace(',','.'))||plannedWorkSetCount(previous)!==plannedWorkSetCount(upcoming))return null;
    const planned=ex=>Number(String(ex.kgMin??ex.kgMax??'').replace(',','.'));
    if(planned(previous)>0&&planned(upcoming)>0&&planned(previous)!==planned(upcoming))return null;
    if([previous,upcoming].some(ex=>ex.topset||ex.topsetKg||ex.isDropset||ex.groupType||(ex.sets||[]).some(s=>s.intensityTechnique) || new Set((ex.sets||[]).map(s=>s.targetKg).filter(v=>v!==undefined&&v!=='')).size>1))return null;
    const sets=(previous.loggedSets||[]).filter(s=>!isWarmupSet(s));
    if(sets.length<plannedWorkSetCount(previous)||!sets.length||sets.some(s=>!validPerformedSet(previous,s)||s.intensityTechnique||s.dropSegments?.length))return null;
    const station=equipment.stationConfigurations?.machine;
    if(equipmentCategory(upcoming)==='machine'&&station&&sets.some(s=>s.equipmentSnapshot?.station!==station))return null;
    const weights=sets.map(s=>Number(String(s.weight).replace(',','.')));
    if(!weights.every(w=>w===weights[0]&&w>0))return null;
    const reps=sets.map(s=>Number(s.reps));
    const range=String(upcoming.reps).match(/^(\d+)(?:[-–](\d+))?$/);
    if(!range||reps.some(n=>!Number.isInteger(n)||n<Number(range[1])||n>Number(range[2]||range[1])))return null;
    const priorRest=String(previous.restTime??previous.rest??previous.recupero??'');
    const nextRest=String(upcoming.restTime??upcoming.rest??upcoming.recupero??'');
    const restChanged=priorRest!==nextRest;
    const decision=recommendNextSessionLoad(previous,{equipmentSettings:equipment,readiness});
    const result={weight:weights[0],reps,kind:'maintain',previousWeight:weights[0],restChanged,
        reason:'Riferimento aggiornato dalle serie allenanti confermate della seduta precedente. Verifica oggi tecnica, recupero e RPE; non è un aumento obbligatorio.',
        basedOn:sets.map(s=>({weight:s.weight,reps:s.reps,rpe:s.rpe??null,performedAt:s.performedAt||s.completedAt||null})),confidence:'provisional'};
    if(readiness?.level==='stop')return {...result,weight:null,suppressLoad:true,reason:'Dolore segnalato: rivaluta il movimento prima di proporre un carico.'};
    if(restChanged)result.reason+=' Recuperi diversi: nessun incremento trasferito automaticamente.';
    if(!restChanged&&decision?.nextReps)return {...result,reps:decision.nextReps,kind:'build_reps',reason:decision.reason};
    if(!restChanged&&decision?.suggestedWeight&&decision.verified){result.weight=decision.suggestedWeight;result.kind='increase_load';result.reason=decision.reason;result.reps=reps.map(()=>decision.repGoal||Number(range[1]));}
    const available=resolveNearbyLoad(upcoming,result.weight,equipment,{min:result.weight,max:result.weight});
    if(available.verified&&available.weight===null)return {...result,weight:null,suppressLoad:true,reason:'La prestazione precedente resta visibile, ma il suo carico non è componibile con l’attrezzatura attuale: calibra il nuovo carico.'};
    return result;
}
