import {excludedFromCoaching,painReported} from './setReview.js';
import {isBodyweightExercise} from './bodyweight.js';
import {highRepProgression} from './highRepProgression.js';
import {isExerciseSkipped} from '../js/sessionSkip.js';
/** Rep guidance for the next exposure: advice, never performed data. */
const number=v=>{const s=String(v??'').trim().replace(/^@/,'').replace(',','.');return /^\d+(?:\.\d+)?$/.test(s)?Number(s):null;};
const range=ex=>{const m=String(ex?.reps??ex?.targetReps??'').trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);return m?{min:Number(m[1]),max:Number(m[2])}:null;};
const confirmed=s=>s?.isLocked===true||s?.completed===true;
const special=ex=>Boolean(isExerciseSkipped(ex)||ex?.isDropset||ex?.groupType||ex?.topset||ex?.topsetKg||ex?.topsetKgMin||ex?.topsetKgMax||ex?.isWarmup||ex?.isExcluded||ex?.isDeload||ex?.isDeloadWeek||
    (ex?.sets||[]).some(s=>s?.intensityTechnique||s?.isTopset));
/** Strict all-set gate. One extra repetition per entire exposure at most. */
export function recommendNextSessionReps(previous,upcoming){
    if(painReported(previous)||(previous?.loggedSets||[]).some(excludedFromCoaching)||!previous||!upcoming||previous.name!==upcoming.name||special(previous)||special(upcoming))return null;
    const a=range(previous),b=range(upcoming),target=number(previous.targetRpe??previous.rpeTarget??previous.rpe);
    if(!a||!b||a.min!==b.min||a.max!==b.max||target===null||target<6||target>10||
        number(upcoming.targetRpe??upcoming.rpeTarget??upcoming.rpe)!==target)return null;
    const sets=previous.loggedSets||[];
    const count=Number(previous.setsCount??previous.sets?.length??sets.length);
    const nextCount=Number(upcoming.setsCount??upcoming.sets?.length??(upcoming.loggedSets||[]).length);
    if(count<2||sets.length!==count||nextCount!==count)return null;
    const reps=[],weights=[];
    for(const s of sets){
        const kg=number(s.weight),rep=number(s.reps),rpe=number(s.rpe);
        if(!confirmed(s)||s.isWarmup||s.warmup||s.is_warmup||s.intensityTechnique||
            s.dropSegments?.length||String(s.reps??'').includes('+')||
            kg===null||kg<0||kg===0&&!isBodyweightExercise(previous)||!Number.isInteger(rep)||rep<a.min||rep>a.max+(a.max>12?2:0)||
            rpe===null||rpe<6||rpe>target)return null;
        weights.push(kg);reps.push(rep);
    }
    if(!weights.every(v=>v===weights[0]))return null;
    if(a.max>12){
        if(String(previous.restTime??previous.rest??previous.recupero??'').trim()!==String(upcoming.restTime??upcoming.rest??upcoming.recupero??'').trim())return null;
        const decision=highRepProgression(previous,0);
        if(!decision||decision.kind==='maintain')return null;
        if(decision.kind==='increase_load')return {kind:'upper_range_complete',reps,reason:decision.reason};
        return {kind:'build_reps',reps:reps.map((r,i)=>Math.min(a.max,r+(i===decision.nextSetIndex?1:0))),reason:decision.reason};
    }
    const index=reps.findIndex(r=>r<a.max);
    if(index<0&&isBodyweightExercise(previous))return {kind:'maintain',reps,reason:'Range completato: mantieni il carico esterno e verifica tecnica e RPE.'};
    if(index<0)return {kind:'upper_range_complete',reps,reason:'Tutte le serie al limite alto: MyCoatch valuterà l’incremento minimo disponibile.'};
    const suggested=[...reps];suggested[index]++;
    return {kind:'build_reps',reps:suggested,reason:'Obiettivo prossima seduta: +1 ripetizione in una sola serie, stesso carico e RPE previsto.'};
}
