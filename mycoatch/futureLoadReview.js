/**
 * Explicit, reversible MyCoatch update of untouched FUTURE exposures only.
 * Preview is pure. The source performance and original prescriptions are
 * never changed. The update is mesocycle-local and auditable in diary JSON.
 */
import { getExerciseSignature } from '../js/helpers.js';
import { recommendNextSessionLoad } from './loadProposal.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const confirmed=s=>s?.isLocked===true||s?.completed===true;
const warm=s=>Boolean(s?.isWarmup||s?.warmup||s?.is_warmup);
const isWarm=ex=>Boolean(ex?.isWarmup||ex?.isExcluded||ex?.is_excluded);
const numeric=value=>{
    if(value===null||value===undefined||String(value).trim()==='')return null;
    const n=Number(String(value).replace(',','.'));
    return Number.isFinite(n)?n:null;
};
const special=ex=>Boolean(
    ex?.isDropset||ex?.isDeload||ex?.isDeloadWeek||ex?.groupType||
    ex?.topset||ex?.topsetKg||ex?.topsetKgMin||ex?.topsetKgMax||
    (ex?.sets||[]).some(s=>s?.isTopset||s?.isDropset||s?.intensityTechnique||
        s?.targetKg!==undefined||s?.kg!==undefined||
        s?.plannedKg!==undefined||s?.targetWeight!==undefined)
);
const dayStarted=day=>Boolean(day?.completed||day?.sessionStart||
    day?.accumulatedSeconds>0||day?.isPaused||day?.date||day?.sessionCompletedAt||
    day?.coachCheckin||(day?.sessionArchives||[]).length||
    (day?.exercises||[]).some(ex=>
        Boolean(ex?.userNotes?.trim?.()) ||
        (ex?.loggedSets||[]).some(s=>
            confirmed(s)||Boolean(s?.completedAt)||
            ['weight','reps','rpe'].some(field=>
                s[field]!==undefined&&s[field]!==null&&String(s[field]).trim()!=='')
        )));
const weekOrder=w=>Number(w?.weekNumber);
const sameTarget=(a,b)=>String(a??'').trim()===String(b??'').trim();
const samePlan=(source,future)=>
    sameTarget(source.reps||source.targetReps,future.reps||future.targetReps) &&
    sameTarget(source.targetRpe||source.rpeTarget||source.rpe,
               future.targetRpe||future.rpeTarget||future.rpe);
const sameBaseline=(source,future)=>{
    const start=numeric(source.kgMin??source.kgMax);
    const next=numeric(future.kgMin??future.kgMax);
    const nextMax=numeric(future.kgMax??future.kgMin);
    return start!==null&&start>0&&next!==null&&nextMax!==null&&
        Math.abs(next-start)<.001 && Math.abs(nextMax-start)<.001;
};
const idFor=(w,d,i)=>[Number(w),Number(d),Number(i)].join(':');
const getDay=(meso,w,d)=>(meso?.weeks||[]).find(x=>weekOrder(x)===Number(w))?.days?.[d];
const activeRecord=(meso,id)=>(meso?.coachFutureLoadReviews||[])
    .find(record=>record.id===id && record.undoneAt===undefined);
const sameSource=(record,ex)=>record?.sourceSignature===JSON.stringify(ex?.loggedSets||[]);
const sameFuture=(candidate,ex)=>ex &&
    sameTarget(ex.kgMin,candidate.before.kgMin) &&
    sameTarget(ex.kgMax,candidate.before.kgMax);

export function previewFutureLoadReview(meso,weekNum,dayIndex,exerciseIndex,{equipmentSettings={},readiness=null}={}) {
    const day=getDay(meso,weekNum,dayIndex);
    const source=day?.exercises?.[exerciseIndex];
    const id=idFor(weekNum,dayIndex,exerciseIndex);
    if(!meso||meso.locked||!source || !day?.completed ||
        isWarm(source)||special(source) ||activeRecord(meso,id))return null;
    const advice=recommendNextSessionLoad(source,{readiness,equipmentSettings});
    if(!advice?.eligible || advice.suggestedWeight===null ||
        !(advice.suggestedWeight>advice.previousWeight))return null;
    // A proposal never overwrites another applied future review.
    const reserved=new Set((meso.coachFutureLoadReviews||[])
        .filter(x=>!x.undoneAt).flatMap(x=>x.changes||[])
        .map(c=>idFor(c.weekNumber,c.dayIndex,c.exerciseIndex)));
    const changes=[];
    const weeks=[...(meso.weeks||[])].sort((a,b)=>weekOrder(a)-weekOrder(b));
    const sourceDayNumber=Number(day.dayNumber ?? dayIndex+1);
    for(const week of weeks){
        const n=weekOrder(week);
        if(n<Number(weekNum)||week.isDeloadWeek||week.isDeload)continue;
        for(const [di,futureDay] of (week.days||[]).entries()){
            const dn=Number(futureDay.dayNumber??di+1);
            if(n===Number(weekNum)&&dn<=sourceDayNumber)continue;
            if(dayStarted(futureDay))continue;
            for(const [ei,future] of (futureDay.exercises||[]).entries()){
                if(reserved.has(idFor(n,di,ei))||isWarm(future)||special(future)||
                    getExerciseSignature(future)!==getExerciseSignature(source)||
                    !samePlan(source,future)||!sameBaseline(source,future)||
                    (future.loggedSets||[]).length!==(source.loggedSets||[]).length)continue;
                changes.push({weekNumber:n,dayIndex:di,exerciseIndex:ei,
                    dayName:futureDay.dayName||'Giorno '+dn,
                    exerciseName:future.name,
                    before:{kgMin:future.kgMin,kgMax:future.kgMax},
                    after:String(advice.suggestedWeight)});
            }
        }
    }
    if(!changes.length)return null;
    return {id,source:{weekNumber:Number(weekNum),dayIndex,exerciseIndex,
        name:source.name,from:advice.previousWeight,to:advice.suggestedWeight},
        reason:advice.reason,confidence:advice.confidence,
        sourceSignature:JSON.stringify(source.loggedSets||[]),
        changes};
}
export function getAppliedFutureLoadReview(meso,weekNum,dayIndex,exerciseIndex) {
    return activeRecord(meso,idFor(weekNum,dayIndex,exerciseIndex))||null;
}
export function canUndoFutureLoadReview(meso,record) {
    if(!record||meso?.locked||record.undoneAt)return false;
    return (record.changes||[]).length>0 && record.changes.every(change=>{
        const day=getDay(meso,change.weekNumber,change.dayIndex);
        const ex=day?.exercises?.[change.exerciseIndex];
        return day && !dayStarted(day) && ex &&
            String(ex.kgMin)===String(change.after) &&
            String(ex.kgMax)===String(change.after);
    });
}
export function applyFutureLoadReview(meso,preview,options={}) {
    if(!preview || meso?.locked)throw Error('Mesociclo bloccato o proposta assente.');
    const next=previewFutureLoadReview(
        meso,preview.source.weekNumber,preview.source.dayIndex,
        preview.source.exerciseIndex,options
    );
    if(!next||JSON.stringify(next)!==JSON.stringify(preview))
        throw Error('Prestazioni o sedute future cambiate: aggiorna l’anteprima.');
    const record=clone({...next,appliedAt:new Date().toISOString()});
    // Validate the complete batch before modifying anything.
    for(const change of record.changes){
        const day=getDay(meso,change.weekNumber,change.dayIndex);
        const ex=day?.exercises?.[change.exerciseIndex];
        if(dayStarted(day)||!sameFuture(change,ex))
            throw Error('Una seduta è iniziata: nessuna prescrizione modificata.');
    }
    for(const change of record.changes){
        const ex=getDay(meso,change.weekNumber,change.dayIndex)
            .exercises[change.exerciseIndex];
        ex.kgMin=change.after;ex.kgMax=change.after;
    }
    meso.coachFutureLoadReviews ||= [];
    meso.coachFutureLoadReviews.push(record);
    return record;
}
export function undoFutureLoadReview(meso,record) {
    const stored=activeRecord(meso,record?.id);
    if(!stored||!canUndoFutureLoadReview(meso,stored))
        throw Error('Non posso annullare: mesociclo bloccato o seduta futura già iniziata/modificata.');
    for(const change of stored.changes){
        const ex=getDay(meso,change.weekNumber,change.dayIndex)
            .exercises[change.exerciseIndex];
        if(change.before.kgMin===undefined)delete ex.kgMin;
        else ex.kgMin=change.before.kgMin;
        if(change.before.kgMax===undefined)delete ex.kgMax;
        else ex.kgMax=change.before.kgMax;
    }
    stored.undoneAt=new Date().toISOString();
    return {restored:stored.changes.length};
}
