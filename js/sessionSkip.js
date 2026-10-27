import {isWarmupExercise,isWarmupSet,validPerformedSet,plannedWorkSetCount} from './workoutSemantics.js';
export const isExerciseSkipped=ex=>!isWarmupExercise(ex)&&ex?.sessionSkip?.active===true;
export function setExerciseSkipped(ex,active,note=ex?.userNotes,now=new Date().toISOString()){
    if(isWarmupExercise(ex))throw Error('Il riscaldamento non richiede questa esclusione.');
    if(active&&!String(note??'').trim())throw Error('Scrivi nelle note personali il motivo per cui salti l’esercizio.');
    if(active&&!(ex.loggedSets||[]).some(s=>!isWarmupSet(s)&&!s.isLocked&&!s.completed))throw Error('Non ci sono serie di lavoro da saltare.');
    ex.userNotes=String(note??'');
    ex.sessionSkip={active:Boolean(active),updatedAt:now};
}
export function sessionWorkCounts(day){
    let planned=0,confirmed=0,skipped=0;
    for(const ex of day?.exercises||[]){
        if(isWarmupExercise(ex))continue;
        const count=plannedWorkSetCount(ex);planned+=count;
        const done=(ex.loggedSets||[]).filter(s=>validPerformedSet(ex,s)).length;
        confirmed+=done;
        const invalid=(ex.loggedSets||[]).filter(s=>!isWarmupSet(s)&&(s.isLocked||s.completed)&&!validPerformedSet(ex,s)).length;
        if(isExerciseSkipped(ex))skipped+=Math.max(0,count-done-invalid);
    }
    const required=planned-skipped;
    return {planned,confirmed,skipped,required,finished:planned>0&&confirmed===required};
}
