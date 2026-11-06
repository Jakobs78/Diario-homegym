import {analysisExerciseRows} from './mesocycleAnalysis.js';
import {isWarmupExercise,plannedWorkSetCount} from '../js/workoutSemantics.js';

export function sessionResolved(day) {
    const work=(day?.exercises||[]).filter(ex=>!isWarmupExercise(ex));
    return work.length>0 && work.every(ex=>{
        const count=plannedWorkSetCount(ex),rows=analysisExerciseRows(ex);
        return count>0 && rows.invalid.length===0 && rows.valid.length+rows.skipped>=count;
    });
}

/** Read-only, driven by confirmed work/skips; completed flags and wall clock cannot advance it. */
export function nextProgramSession(plan) {
    let completed=0,total=0,next=null;
    for(const week of [...(plan?.weeks||[])].sort((a,b)=>a.weekNumber-b.weekNumber))
        for(const day of [...(week.days||[])].sort((a,b)=>a.dayNumber-b.dayNumber)){
            total++;
            if(sessionResolved(day))completed++;
            else if(!next)next={weekNumber:week.weekNumber,dayNumber:day.dayNumber,
                mesocycleNumber:week.mesocycleNumber||1,dayName:day.dayName||'Seduta '+day.dayNumber};
        }
    return {completed,total,next};
}
