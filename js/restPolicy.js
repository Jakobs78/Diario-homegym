import {isExerciseSkipped} from './sessionSkip.js';
import {isWarmupExercise,isWarmupSet} from './workoutSemantics.js';
const confirmed=set=>set?.isLocked===true||set?.completed===true;
export const isCircuit=ex=>['superset','triset','jumpset'].includes(ex?.groupType);
export function circuitMembers(day,exercise){
    if(!isCircuit(exercise))return [];
    const list=day?.exercises||[];const index=list.indexOf(exercise);if(index<0)return [];
    const same=ex=>ex?.groupType===exercise.groupType && String(ex?.groupBase)===String(exercise.groupBase);
    let start=index,end=index;while(start>0&&same(list[start-1]))start--;while(end+1<list.length&&same(list[end+1]))end++;
    return list.slice(start,end+1);
}
export function circuitRoundComplete(members,index){
    const sets=members.filter(ex=>!isWarmupExercise(ex)&&!isExerciseSkipped(ex)).map(ex=>ex.loggedSets?.[index]).filter(s=>s&&!isWarmupSet(s));
    return sets.length>0 && sets.every(confirmed);
}
export function currentCircuitRound(members){
    const count=Math.max(0,...members.map(ex=>ex.loggedSets?.length||0));
    for(let i=0;i<count;i++){
        if(members.some(ex=>!isWarmupExercise(ex)&&!isExerciseSkipped(ex)&&ex.loggedSets?.[i]&&!isWarmupSet(ex.loggedSets[i])&&!confirmed(ex.loggedSets[i])))return i;
    }
    return Math.max(0,count-1);
}
/** One row represents a complete working set, including its recorded drops. */
export function shouldStartRecoveryTimer(exercise,set,setIndex,totalSets,day=null){
    if(!exercise||!set||isExerciseSkipped(exercise)||isWarmupExercise(exercise)||isWarmupSet(set))return false;
    if(isCircuit(exercise))return day
        ? circuitRoundComplete(circuitMembers(day,exercise),setIndex)
        : exercise.isGroupLast===true;
    if(set.intensityTechnique && set.intensityTechnique!=='DROP_SET')return false;
    return true;
}
export function recoveryExercise(day,exercise){
    return circuitMembers(day,exercise).at(-1)||exercise;
}
export function hasPendingWorkingSets(day){
    return (day?.exercises||[]).some(ex=>!isWarmupExercise(ex)&&!isExerciseSkipped(ex)&&
        (ex.loggedSets||[]).some(set=>!isWarmupSet(set)&&!confirmed(set)));
}
