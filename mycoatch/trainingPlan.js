import {trainingExposures} from './trainingHistory.js';
import {workingProposal,PROTOCOL_POLICY,selectEvidence} from './protocolLoad.js';
import {confirmed,warm,blockKey} from './setPrescription.js';
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
                if(confirmed(log)||warm(log)||warm(ex.sets?.[index])){proposals.push(null);continue;}
                const source=selectEvidence(ex,index,exposures)[0];
                const sourceKey=source?JSON.stringify([source.source,exerciseIdentity(ex),blockKey(source.match.prescription)]):null;
                const targetKey=[week.weekNumber,di,ei].join(':');
                const held=sourceKey&&reservations.get(sourceKey);
                const eligible=!started(day)&&!week.isDeloadWeek&&!week.isDeload&&(!held||held===targetKey);
                const proposal=workingProposal(ex,index,{exposures,equipment,readiness,allowProgression:eligible});
                if(proposal&&sourceKey&&eligible)reservations.set(sourceKey,targetKey);
                if(proposal){
                    proposal.destination={...context,setIndex:index};
                    proposal.manualFields=['weight','reps','rpe'].filter(field=>fieldHasValue(log?.[field]));
                }
                proposals.push(proposal);
            }
            // Frozen completed rows are never touched, even their past proposal metadata.
            const retained=proposals.map((p,i)=>confirmed(ex.loggedSets?.[i])?ex.coachSetProposals?.[i]??null:p);
            if(!Array.isArray(ex.coachSetProposals)||!same(ex.coachSetProposals,retained)){
                updates.push({destination:context,before:clone(ex.coachSetProposals??[]),after:clone(retained)});
                ex.coachSetProposals=retained;changed=true;
            }
            const notes=[...new Set(retained.filter((p,i)=>p&&!confirmed(ex.loggedSets?.[i])).flatMap(p=>[p.reason,...(p.monitoring?[p.monitoring]:[])]))];
            if(!same(ex.coachAdaptiveNotes??[],notes)){ex.coachAdaptiveNotes=notes;changed=true;}
        }
    }
    if(meso.coachProtocol?.version!==PROTOCOL_POLICY.version){meso.coachProtocol={version:PROTOCOL_POLICY.version,activatedAt:now};changed=true;}
    if(updates.length){
        meso.coachAdjustments ||= [];
        meso.coachAdjustments.push({at:now,policy:PROTOCOL_POLICY.version,changes:updates});
    }
    return changed;
}
