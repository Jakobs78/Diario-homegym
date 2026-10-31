import {coachingReviewSignature} from './setReview.js';
import {isBodyweightExercise} from './bodyweight.js';
import {isExerciseSkipped} from '../js/sessionSkip.js';
import {trainingExposures} from './trainingHistory.js';
import {workingProposal,PROTOCOL_POLICY,selectEvidence,relatedSets} from './protocolLoad.js';
import {confirmed,warm,blockKey,setPrescription} from './setPrescription.js';
import {exerciseIdentity} from './exerciseIdentity.js';
import {assessSessionReadiness} from './sessionReadiness.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const started=day=>Boolean(day.completed||day.sessionStart||day.accumulatedSeconds>0||day.sessionCompletedAt||
    (day.exercises||[]).some(ex=>(ex.loggedSets||[]).some(confirmed)));
const fieldHasValue=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
export function reconcileTrainingPlan(data,{year,mesoIndex,now=new Date().toISOString()}={}){
    const meso=data?.history?.years?.[String(year)]?.mesocycles?.[mesoIndex];
    if(!meso||meso.locked||meso.coachClosure?.status==='closed')return false;
    const pending=(meso.weeks||[]).some(w=>(w.days||[]).some(day=>(day.exercises||[]).some(ex=>{
        if(ex.isWarmup||ex.isExcluded||ex.is_excluded)return false;
        const count=Math.max(ex.sets?.length||0,ex.loggedSets?.length||0,parseInt(ex.setsCount??ex.set,10)||0);
        return Array.from({length:count},(_,i)=>i).some(i=>!confirmed(ex.loggedSets?.[i])&&!warm(ex.loggedSets?.[i])&&!warm(ex.sets?.[i]));
    })));
    if(!pending)return false;
    const equipment={...data.athlete,...(data.athlete?.loadingSteps||{})};
    const reservations=new Map();let changed=false;
    const updates=[];
    for(const week of [...(meso.weeks||[])].sort((a,b)=>Number(a.weekNumber)-Number(b.weekNumber))){
        for(const [di,day] of (week.days||[]).entries())for(const [ei,ex] of (day.exercises||[]).entries()){
            const context={year:Number(year),mesoIndex,weekNumber:Number(week.weekNumber),dayIndex:di,exerciseIndex:ei};
            const exposures=trainingExposures(data,context,ex);
            const readiness=assessSessionReadiness(day.coachCheckin);
            const count=Math.max(ex.sets?.length||0,ex.loggedSets?.length||0,parseInt(ex.setsCount??ex.set,10)||0);
            const proposals=[];
            for(let index=0;index<count;index++){
                const log=ex.loggedSets?.[index];
                const targetKey=[week.weekNumber,di,ei].join(':');
                const previous=ex.coachSetProposals?.[index];
                const previousOrigin=previous?.basedOn?.[0];
                const previousSource=previousOrigin&&exposures.find(item=>same(item.source,previousOrigin.source));
                const unchangedSource=previousSource&&previousOrigin.reviewSignature===coachingReviewSignature(previousSource.exercise)&&same(previousOrigin.seriesEvidence,
                    relatedSets(previousSource.exercise,setPrescription(ex,index),index).map(s=>({index:s.index,kg:s.kg,reps:s.reps,rpe:s.rpe})));
                const transferred=previous?.kind==='increase_load'||previous?.kind==='build_reps';
                if(started(day)&&transferred&&unchangedSource){
                    const consumed=JSON.stringify([previousSource.source,exerciseIdentity(ex),blockKey(setPrescription(previousSource.exercise,previousOrigin.series))]);
                    reservations.set(consumed,targetKey);
                }
                if(isExerciseSkipped(ex)||confirmed(log)||warm(log)||warm(ex.sets?.[index])||setPrescription(ex,index).special){proposals.push(null);continue;}
                const source=selectEvidence(ex,index,exposures)[0];
                const sourceKey=source?JSON.stringify([source.source,exerciseIdentity(ex),blockKey(source.match.prescription)]):null;
                const held=sourceKey&&reservations.get(sourceKey);
                const eligible=!started(day)&&!week.isDeloadWeek&&!week.isDeload&&(!held||held===targetKey);
                const keepStarted=!isBodyweightExercise(ex)&&started(day)&&transferred&&unchangedSource&&
                    !(ex.loggedSets||[]).some(confirmed)&&readiness.level!=='stop'&&readiness.allowIncrease!==false;
                const proposal=keepStarted?clone(previous):workingProposal(ex,index,{exposures,equipment,readiness,allowProgression:eligible||isBodyweightExercise(ex)&&started(day)&&transferred&&unchangedSource});
                if(proposal&&sourceKey&&eligible&&['increase_load','build_reps'].includes(proposal.kind))reservations.set(sourceKey,targetKey);
                if(proposal){
                    proposal.destination={...context,setIndex:index};
                    proposal.manualFields=['weight','reps','rpe'].filter(field=>fieldHasValue(log?.[field]));
                }
                proposals.push(proposal);
            }
            // Frozen completed rows are never touched, even their past proposal metadata.
            const retained=proposals.map((p,i)=>confirmed(ex.loggedSets?.[i])?ex.coachSetProposals?.[i]??null:p);
            if(!Array.isArray(ex.coachSetProposals)||!same(ex.coachSetProposals,retained)){
                const fields=p=>p?{weight:p.weight,reps:p.reps,rpe:p.rpe,kind:p.kind}:null;
                const differences=retained.flatMap((p,index)=>same(fields(ex.coachSetProposals?.[index]),fields(p))?[]:
                    [{setIndex:index,before:fields(ex.coachSetProposals?.[index]),after:fields(p)}]);
                if(differences.length)updates.push({destination:context,series:differences});
                ex.coachSetProposals=retained;changed=true;
            }
            const notes=[...new Set(retained.filter((p,i)=>p&&!confirmed(ex.loggedSets?.[i])).flatMap(p=>[p.reason,...(p.monitoring?[p.monitoring]:[])]))];
            if(!same(ex.coachAdaptiveNotes??[],notes)){ex.coachAdaptiveNotes=notes;changed=true;}
        }
    }
    if(meso.coachProtocol?.version!==PROTOCOL_POLICY.version){meso.coachProtocol={version:PROTOCOL_POLICY.version,activatedAt:now};changed=true;}
    if(updates.length){
        meso.coachAdjustments ||= [];
        meso.coachAdjustments.push({format:2,at:now,policy:PROTOCOL_POLICY.version,changes:updates});
    }
    return changed;
}
