import {summarizeMuscleVolume,completedWorkingSetCount} from './volumeAccounting.js';
import {catalogExercise} from './catalogLookup.js';
import {exerciseIdentity} from './exerciseIdentity.js';
import {validPerformedSet,isWarmupSet,plannedWorkSetCount,isWarmupExercise} from '../js/workoutSemantics.js';
/** Planned work and confirmed performance remain separate; no kg is apportioned
 * to individual muscles and an RPE never multiplies a physical set count. */
export function muscleWorkReport(days=[]){
 const exercises=days.flatMap(d=>{const e=d.exercises||d.esercizi||[];return Array.isArray(e)?e:Object.values(e);});
 const records=new Map();
 for(const ex of exercises){
  if(isWarmupExercise(ex))continue;
  const meta=catalogExercise(ex),key=exerciseIdentity(ex);
  if(!records.has(key))records.set(key,{name:ex.name,planned:0,performed:0,rpeSum:0,rpeCount:0,
   primary:meta?.muscleProfile.primary||[],secondary:meta?.secondaryMuscles||[],
   stabilizers:meta?.muscleProfile.stabilizers||[],regions:meta?.muscleProfile.regions||[],classified:Boolean(meta)});
  const item=records.get(key);item.planned+=plannedWorkSetCount(ex);item.performed+=completedWorkingSetCount(ex);
  const logs=Array.isArray(ex.loggedSets)?ex.loggedSets:Array.isArray(ex.sets)?ex.sets:[];
  const rpes=logs.filter(s=>(s.isLocked===true||s.completed===true)&&!isWarmupSet(s)&&validPerformedSet(ex,s))
   .map(s=>Number(String(s.rpe??'').replace(',','.'))).filter(n=>n>=1&&n<=10);
  item.rpeSum+=rpes.reduce((a,b)=>a+b,0);item.rpeCount+=rpes.length;
 }
 return {planned:summarizeMuscleVolume(exercises),performed:summarizeMuscleVolume(exercises,{mode:'confirmed'}),
  exercises:[...records.values()].map(({rpeSum,rpeCount,...e})=>({...e,averageRpe:rpeCount?Math.round(rpeSum/rpeCount*10)/10:null}))};
}
/** Archived repeats keep their own date; filter them before aggregating. */
export function muscleWorkSessions(days=[]){
 return days.flatMap(day=>[day,...(Array.isArray(day.sessionArchives)?day.sessionArchives:[]).map(old=>({
  ...old,date:old.sessionDate||old.date||null,weekNumber:day.weekNumber,mesoNumber:day.mesoNumber
 }))]);
}
