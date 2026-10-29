import {isBodyweightExercise} from './bodyweight.js';
import {isExerciseSkipped} from '../js/sessionSkip.js';
/**
 * Conservative, read-only INITIAL working-load suggestion when the SAME
 * exercise occurs with a DIFFERENT rep/RPE prescription. Never overwrite a
 * scheduled weight, performed set, deload, special set or athlete override.
 * RIR-based e1RM is a rough estimate, NOT the exact physiological load.
 */
import {exerciseIdentity} from './exerciseIdentity.js';
import {estimateE1rm} from './historyAnalysis.js';

import {resolveNearbyLoad, equipmentCategory} from './loadProposal.js';


const number=v=>{
  if(v===null||v===undefined||String(v).trim()==='')return null;
  const s=String(v).trim().replace(/^@/,'').replace(',','.');
  if(!/^\d+(?:\.\d+)?$/.test(s))return null;
  const n=Number(s);return Number.isFinite(n)?n:null;
};
const repsRange=ex=>{
  const explicitMin=number(ex?.minReps),explicitMax=number(ex?.maxReps);
  if(explicitMin!==null&&explicitMax!==null&&explicitMin<=explicitMax)
    return {min:explicitMin,max:explicitMax};
  const m=String(ex?.reps??ex?.targetReps??'').trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if(!m)return null;
  const min=Number(m[1]),max=Number(m[2]??m[1]);
  return min<=max?{min,max}:null;
};
const confirmed=s=>s?.isLocked===true||s?.completed===true;
const warm=s=>Boolean(s?.isWarmup||s?.warmup||s?.is_warmup);
const special=ex=>Boolean(isExerciseSkipped(ex)||ex?.isWarmup||ex?.isExcluded||ex?.is_excluded||
 ex?.isDeload||ex?.isDeloadWeek||ex?.isDropset||ex?.groupType||
 ex?.topset||ex?.topsetKg||ex?.topsetKgMin||ex?.topsetKgMax||
 (ex?.sets||[]).some(s=>s?.isTopset||s?.intensityTechnique||s?.targetKg!==undefined||s?.kg!==undefined));
const plannedKg=ex=>number(ex?.kgMin??ex?.kgMax)??number(ex?.kgMax);
const count=ex=>Number(ex?.setsCount??ex?.sets?.length??ex?.loggedSets?.length);

function estimateFromSource(source,upcoming){
  if(isBodyweightExercise(source)||isBodyweightExercise(upcoming)||special(source)||special(upcoming))return null;
  if(exerciseIdentity(source)!==exerciseIdentity(upcoming)||
     equipmentCategory(source)!==equipmentCategory(upcoming))return null;
  const range=repsRange(source),next=repsRange(upcoming);
  const sourceRpe=number(source?.targetRpe??source?.rpeTarget??source?.rpe);
  const nextRpe=number(upcoming?.targetRpe??upcoming?.rpeTarget??upcoming?.rpe);
  if(!range||!next||range.min<3||range.max>12||next.min<3||next.max>12||
     sourceRpe===null||sourceRpe<6||sourceRpe>10||
     nextRpe===null||nextRpe<6||nextRpe>9.5)return null;
  // Identical prescriptions are handled by the verified same-exposure prefill.
  if(range.min===next.min&&range.max===next.max&&sourceRpe===nextRpe)return null;
  const sets=source?.loggedSets||[];
  if(sets.length<2||sets.length!==count(source)||sets.some(s=>!confirmed(s)||warm(s)||
      s?.intensityTechnique||s?.dropSegments?.length||String(s?.reps||'').includes('+')))
    return null;
  const observations=sets.map(s=>({
    kg:number(s.weight),reps:number(s.reps),rpe:number(s.rpe)
  }));
  if(observations.some(s=>s.kg===null||s.kg<=0||
      !Number.isInteger(s.reps)||s.reps<range.min||s.reps>range.max||
      s.rpe===null||s.rpe<6||s.rpe>sourceRpe))return null;
  // Uniform straight sets only: top-set/backoff values cannot be mixed.
  const sourceKg=observations[0].kg;
  if(!observations.every(s=>s.kg===sourceKg))return null;
  const estimates=observations.map(s=>estimateE1rm(s.kg,s.reps,s.rpe));
  if(estimates.some(x=>x===null))return null;
  const min=Math.min(...estimates),max=Math.max(...estimates);
  if(max/min>1.08)return null;
  const requested=next.min;
  const raw=min/(1+(requested+(10-nextRpe))/30);
  // Guard against huge changes from one very different loading scheme.
  if(!Number.isFinite(raw)||raw/sourceKg<0.8||raw/sourceKg>1.15)return null;
  return {raw,sourceKg,requested,sourceReps:observations.map(x=>x.reps),
    sourceRpe:observations.map(x=>x.rpe)};
}

/**
 * @param {object} upcoming current planned exercise
 * @param {object[]} recentExposures completed earlier session exercises,
 *   ordered most recent first. Never include current/future workouts.
 * @param {object} equipment athlete's actual equipment and increments
 */
export function recommendCrossExposureLoad(upcoming,recentExposures=[],equipment={}){
  if(!upcoming||special(upcoming)||plannedKg(upcoming)!==null||
      upcoming.coachWeeklyLoadReview||!Array.isArray(recentExposures))return null;
  for(const source of recentExposures){
    const station=equipment.stationConfigurations?.machine;
    if(equipmentCategory(upcoming)==='machine'&&station&&(source.loggedSets||[]).some(s=>s.equipmentSnapshot?.station!==station))continue;
    const evidence=estimateFromSource(source,upcoming);
    if(!evidence)continue;
    const resolved=resolveNearbyLoad(upcoming,evidence.raw,equipment,{min:evidence.raw*.9,max:evidence.raw});
    if(resolved.weight===null||!resolved.verified)continue;
    const kg=resolved.weight;
    return {
      kg,source:'estimated_cross_exposure',confidence:'provisional',
      reason:'Stima prudente da serie confermate dello stesso esercizio con ripetizioni/RPE diversi. '+
        'Carico iniziale indicativo: verifica con avvicinamento e correggi in base all’RPE percepito.',
      basedOn:{name:source.name,kg:evidence.sourceKg,
        reps:evidence.sourceReps,rpe:evidence.sourceRpe,
        targetReps:String(upcoming.reps??upcoming.targetReps),
        targetRpe:number(upcoming.targetRpe??upcoming.rpeTarget??upcoming.rpe)}
    };
  }
  return null;
}
