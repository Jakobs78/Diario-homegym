import {isExerciseSkipped} from '../js/sessionSkip.js';
import {specialSeries} from './seriesTechnique.js';
import {confirmed,warm,number,setPrescription} from './setPrescription.js';
import {isWarmupExercise,validPerformedSet} from '../js/workoutSemantics.js';
import {exerciseIdentity} from './exerciseIdentity.js';

const text=value=>String(value??'').trim();
const decimal=value=>String(value).replace('.',',');
export const feedbackRange=range=>range?range.min===range.max?decimal(range.min):decimal(range.min)+'–'+decimal(range.max):'—';
const indices=rows=>rows.map(row=>row.index+1).join(', ');
const filled=value=>text(value)!=='';

function contextOf(history,day){
    for(const [year,data] of Object.entries(history?.history?.years||{}))
        for(const [mesoIndex,meso] of (data.mesocycles||[]).entries())
            for(const week of meso.weeks||[]){const dayIndex=(week.days||[]).indexOf(day);
                if(dayIndex>=0)return {year:Number(year),mesoIndex,weekNumber:Number(week.weekNumber),dayIndex,meso};}
    return null;
}
function sourceMatches(source,context,exerciseIndex){
    return source&&Number(source.year)===context.year&&source.mesoIndex===context.mesoIndex&&
        Number(source.weekNumber)===context.weekNumber&&source.dayIndex===context.dayIndex&&
        source.exerciseIndex===exerciseIndex&&(source.archiveIndex??null)===null;
}
function evidenceMatches(reference,exercise){
    return reference.seriesEvidence?.length>0&&reference.seriesEvidence.every(row=>{
        const logged=exercise.loggedSets?.[row.index];
        return !warm(exercise.sets?.[row.index])&&validPerformedSet(exercise,logged)&&
            number(logged.weight)===number(row.kg)&&number(logged.reps)===number(row.reps)&&number(logged.rpe)===number(row.rpe);
    });
}

// Describe only proposals already present in the next pending exposure.
// Never infer an increase from a good performance or edit the plan here.
function nextProposal(exercise,exerciseIndex,context){
    if(!context||context.meso.excludedFromCoaching||context.meso.locked||context.meso.coachClosure?.status==='closed')return null;
    for(const week of [...(context.meso.weeks||[])].sort((a,b)=>Number(a.weekNumber)-Number(b.weekNumber)))
        for(const [dayIndex,day] of (week.days||[]).entries()){
            if(Number(week.weekNumber)<context.weekNumber||Number(week.weekNumber)===context.weekNumber&&dayIndex<=context.dayIndex||day.completed)continue;
            const target=(day.exercises||[]).find(ex=>!isWarmupExercise(ex)&&exerciseIdentity(ex)===exerciseIdentity(exercise)&&
                (ex.loggedSets||[]).some((row,i)=>!confirmed(row)&&!warm(row)&&!warm(ex.sets?.[i])));
            if(!target)continue;
            const changes=[];
            for(const [index,p] of (target.coachSetProposals||[]).entries()){
                if(!p||confirmed(target.loggedSets?.[index])||warm(target.loggedSets?.[index])||warm(target.sets?.[index]))continue;
                if(!['build_reps','increase_load','estimated_history','today_estimate','increase_today','reduce_today'].includes(p.kind))continue;
                const reference=p.basedOn?.[0];
                if(!sourceMatches(reference?.source,context,exerciseIndex)||!evidenceMatches(reference,exercise))continue;
                const kg=number(p.weight),reps=number(p.reps),oldKg=number(reference.weight),oldReps=number(reference.reps);
                if(kg===null||reps===null||oldKg===null||oldReps===null||kg===oldKg&&reps===oldReps)continue;
                const manual=['weight','reps','rpe'].some(field=>filled(target.loggedSets?.[index]?.[field])&&number(target.loggedSets[index][field])!==number(p[field]));
                changes.push({index,weight:kg,reps,weightDelta:kg-oldKg,repsDelta:reps-oldReps,manual});
            }
            return changes.length?{weekNumber:Number(week.weekNumber),dayNumber:day.dayNumber??dayIndex+1,changes}:null;
        }
    return null;
}

/** Read-only per-set comparison: no averages, recommendations or journal writes. */
export function buildSessionExerciseFeedback(day,history=null){
    const context=contextOf(history,day);
    return (day.exercises||[]).flatMap((exercise,exerciseIndex)=>{
        if(isWarmupExercise(exercise))return [];
        const count=Math.max(exercise.sets?.length||0,exercise.loggedSets?.length||0,parseInt(exercise.setsCount??exercise.set,10)||0);
        const rows=Array.from({length:count},(_,index)=>{
            const log=exercise.loggedSets?.[index]||{},target=setPrescription(exercise,index);
            if(warm(log)||warm(exercise.sets?.[index]))return null;
            const valid=validPerformedSet(exercise,log),rp=number(log.rpe);
            const rpe=rp!==null&&rp>=5&&rp<=10?rp:null;
            const reps=number(log.reps??log.actualReps);
            const special=specialSeries(exercise,index,log),separateBase=Boolean(log.dropSegments?.length)&&!String(log.reps).includes('+');
            return {index,confirmed:confirmed(log),valid,actualReps:valid?text(log.reps??log.actualReps):isExerciseSkipped(exercise)?'Saltata':'—',
                reps:valid?reps:null,rpe:valid?rpe:null,target,
                comparableRpe:!special||separateBase,
                comparableReps:valid&&(!special||separateBase)&&Number.isInteger(reps)&&Boolean(target.reps)};
        }).filter(Boolean);
        if(!rows.length)return [];
        const valid=rows.filter(row=>row.valid),messages=[];
        const skipped=isExerciseSkipped(exercise);
        const missing=rows.filter(row=>!row.confirmed&&!skipped),invalid=rows.filter(row=>row.confirmed&&!row.valid);
        if(skipped)messages.push('Saltato per questa seduta. Note personali: '+String(exercise.userNotes||'Motivo non disponibile.'));
        if(missing.length)messages.push('Serie non confermate: '+indices(missing)+'.');
        if(invalid.length)messages.push('Dati da verificare nelle serie '+indices(invalid)+'.');
        const reps=valid.filter(row=>row.comparableReps);
        const below=reps.filter(row=>row.reps<row.target.reps.min),above=reps.filter(row=>row.reps>row.target.reps.max);
        if(reps.length){
            if(below.length)messages.push('Reps sotto obiettivo nelle serie '+indices(below)+'.');
            if(above.length)messages.push('Reps oltre l’obiettivo nelle serie '+indices(above)+'.');
            if(!below.length&&!above.length){
                const upper=reps.every(row=>row.target.reps.max>row.target.reps.min&&row.reps===row.target.reps.max);
                messages.push(upper&&reps.length===rows.length?'Tutte le '+reps.length+' serie al limite superiore delle reps.':
                    'Reps entro l’obiettivo in '+reps.length+'/'+rows.length+' serie.');
            }
        }
        const special=valid.filter(row=>row.target.special&&!row.comparableReps);
        if(special.length)messages.push('Tecnica speciale nelle serie '+indices(special)+': reps riportate senza confronto numerico diretto.');
        const unknown=valid.filter(row=>!row.target.reps&&!row.target.special);
        if(unknown.length)messages.push('Obiettivo reps non disponibile per le serie '+indices(unknown)+'.');
        const missingRpe=valid.filter(row=>row.rpe===null);
        if(missingRpe.length)messages.push('RPE mancante o non valido nelle serie '+indices(missingRpe)+'.');
        const rpe=valid.filter(row=>row.rpe!==null&&row.target.rpe&&row.comparableRpe);
        const hard=rpe.filter(row=>row.rpe>row.target.rpe.max),easy=rpe.filter(row=>row.rpe<row.target.rpe.min);
        if(hard.length)messages.push('Sforzo superiore al previsto nelle serie '+indices(hard)+'.');
        if(easy.length)messages.push('Sforzo inferiore al previsto nelle serie '+indices(easy)+'.');
        if(rpe.length&&!hard.length&&!easy.length)messages.push('RPE entro l’obiettivo in '+rpe.length+'/'+rows.length+' serie.');
        const techniqueRpe=valid.filter(row=>row.rpe!==null&&!row.comparableRpe);
        if(techniqueRpe.length)messages.push('RPE della tecnica nelle serie '+indices(techniqueRpe)+': non confrontato con il target della sola base.');
        const unknownRpe=valid.filter(row=>row.rpe!==null&&!row.target.rpe);
        if(unknownRpe.length)messages.push('Obiettivo RPE non disponibile per le serie '+indices(unknownRpe)+'.');
        return [{name:exercise.name,exerciseIndex,rows,messages,next:skipped?null:nextProposal(exercise,exerciseIndex,context)}];
    });
}
