import {nextRepTargets} from './repProgression.js';
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
    if(next){
        const targets=nextRepTargets(sets.map(s=>s.reps),p.reps.max);
        return {kind:'build_reps',weight:matched.kg,reps:targets.reps[sets.indexOf(matched)],nextSetIndex:next.index,nextReps:targets.reps,reason:targets.reason};
    }
    if(isBodyweightExercise(ex))return maintain;

    const increase=Number.isFinite(increment)&&increment>0?increment:Math.max(1,Math.round(matched.kg*HIGH_REP_POLICY.defaultIncrease*2)/2);
    const weight=Math.min(700,Math.floor((matched.kg+increase)*100+1e-7)/100);
    if(weight<=matched.kg+.001)return maintain;
    if(increase/matched.kg>0.30)return {...maintain,reason:'Il prossimo incremento supera il 30%: mantieni il riferimento e verifica un carico intermedio o una revisione del range.'};
    const modest=increase/matched.kg<=HIGH_REP_POLICY.maxIncrease;
    return {kind:'increase_load',progressionBasis:'high_reps',weight,reps:modest?Math.max(p.reps.min,p.reps.max-1):p.reps.min,theoretical:weight,
        reason:'Tutte le serie hanno raggiunto il limite alto con RPE entro obiettivo. Propongo un incremento pratico da verificare; non uso il massimale stimato. '+
            (modest?'Lavora nel range '+p.reps.min+'–'+p.reps.max+' senza fermarti automaticamente al minimo.':'Il salto di carico è consistente: parti dal limite basso del range e correggi il peso se raggiungi l’RPE prima delle reps previste.')};
}
