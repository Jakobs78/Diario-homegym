import {isBodyweightExercise} from './bodyweight.js';
import {isExerciseSkipped} from '../js/sessionSkip.js';
import {setPrescription,observed,blockKey,warm} from './setPrescription.js';

// Conservative application defaults, not validated physiological cut-offs.
export const HIGH_REP_POLICY=Object.freeze({maxIncrease:0.05,defaultIncrease:0.025});
/** Direct performance progression only: never calculates an estimated 1RM. */
export function highRepProgression(ex,index,{readiness=null,increment=null}={}){
    const p=setPrescription(ex,index);
    if(!p.reps||p.reps.max<=12||!p.rpe||p.special||p.role!=='work'||isExerciseSkipped(ex)||
        ex.isWarmup||ex.isExcluded||ex.is_excluded||ex.isDeload||ex.isDeloadWeek||
        readiness?.allowIncrease===false||readiness?.level==='stop')return null;
    const count=Math.max(ex.sets?.length||0,ex.loggedSets?.length||0,parseInt(ex.setsCount??ex.set,10)||0);
    const indices=Array.from({length:count},(_,i)=>i).filter(i=>!warm(ex.sets?.[i])&&!warm(ex.loggedSets?.[i])&&blockKey(setPrescription(ex,i))===blockKey(p));
    const sets=indices.map(i=>observed(ex,i));
    if(!sets.length||sets.some(s=>!s||s.prescription.special||s.rpe===null||s.rpe<6||s.rpe>p.rpe.max||s.reps<p.reps.min))return null;
    const matched=sets.find(s=>s.index===index);if(!matched)return null;
    const reps=Math.min(p.reps.max,matched.reps);
    const maintain={kind:'maintain',weight:matched.kg,reps,reason:'Mantengo il carico confermato: prima consolida il range e l’RPE previsti.'};
    // Different working weights and fixed prescriptions require a separate review.
    if(p.reps.min===p.reps.max||!sets.every(s=>s.kg===sets[0].kg)||sets.some(s=>s.reps>p.reps.max+2))return maintain;
    const next=sets.find(s=>s.reps<p.reps.max);
    if(next)return {kind:'build_reps',weight:matched.kg,reps:Math.min(p.reps.max,reps+(next.index===index?1:0)),nextSetIndex:next.index,
        reason:'Mantengo i kg: propongo una ripetizione in più soltanto alla serie '+(next.index+1)+', entro il range e l’RPE previsti.'};
    if(isBodyweightExercise(ex))return maintain;
    const cap=matched.kg*HIGH_REP_POLICY.maxIncrease;
    const increase=Number.isFinite(increment)&&increment>0&&increment<=cap+.000001?increment:matched.kg*HIGH_REP_POLICY.defaultIncrease;
    const weight=Math.min(700,Math.floor((matched.kg+increase)*100+1e-7)/100);
    if(weight<=matched.kg+.001)return maintain;
    return {kind:'increase_load',progressionBasis:'high_reps',weight,reps:p.reps.min,theoretical:weight,
        reason:'Tutte le serie hanno raggiunto il limite alto con RPE entro obiettivo. Propongo un piccolo aumento e riparto da '+p.reps.min+' reps, da verificare nella prossima seduta; non uso il massimale stimato.'};
}
