import {sessionResolved} from './sessionSequence.js';
import {isWarmupExercise,plannedWorkSetCount} from '../js/workoutSemantics.js';

/** Actual activity only: untouched prefilled reps/kg must not start a session. */
export function sessionStarted(day) {
    return Boolean(day?.isPaused || day?.sessionStart || Number(day?.accumulatedSeconds)>0 ||
        day?.sessionCompletedAt || (Array.isArray(day?.exercises)?day.exercises:[]).some(ex=>
            (Array.isArray(ex?.loggedSets)?ex.loggedSets:Array.isArray(ex?.sets)?ex.sets:[]).some(set=>set?.isLocked===true || set?.completed===true ||
                Object.entries(set?.manualFields||{}).some(([field,manual])=>
                    manual===true && set?.[field]!==null && set?.[field]!==undefined && String(set[field]).trim()!==''))));
}

function orderedSessions(plan) {
    return [...(Array.isArray(plan?.weeks)?plan.weeks:[])].filter(Boolean).sort((a,b)=>Number(a.weekNumber)-Number(b.weekNumber))
        .flatMap(week=>[...(Array.isArray(week.days)?week.days:[])].filter(Boolean).sort((a,b)=>Number(a.dayNumber)-Number(b.dayNumber))
            .filter(day=>Array.isArray(day.exercises)&&day.exercises.some(ex=>ex&&!isWarmupExercise(ex)&&plannedWorkSetCount(ex)>0))
            .map(day=>({week,day})));
}

export function planResumeTarget(plan) {
    const pending=orderedSessions(plan).filter(({day})=>!sessionResolved(day));
    // Preserve the sequence among multiple unfinished sessions that have started.
    const target=pending.find(({day})=>sessionStarted(day)) || pending[0];
    if(!target)return null;
    const {week,day}=target;
    const name=String(day.dayName||'').trim();
    const label=name || 'Giorno '+day.dayNumber;
    const started=sessionStarted(day);
    return {weekNumber:week.weekNumber,dayNumber:day.dayNumber,dayName:name,started,
        label:(started?'Riprendi ':'Inizia ')+label+' – settimana '+week.weekNumber};
}

const usable=plan=>plan && !plan.locked && plan.coachClosure?.status!=='closed' && orderedSessions(plan).length>0;

/** Never consults UI navigation. A stable plan ID survives array reordering. */
export function trainingResumeDestination(data) {
    const years=data?.history?.years||{};
    const plans=Object.keys(years).filter(year=>/^\d{4}$/.test(year))
        .sort((a,b)=>Number(b)-Number(a))
        .flatMap(year=>(Array.isArray(years[year]?.mesocycles)?years[year].mesocycles:[])
            .map((plan,index)=>({year,index,plan})).filter(item=>item.plan).reverse());
    const pointer=data?.activeTrainingPlan;
    let chosen=pointer?.mesocycleId?plans.find(item=>item.plan.id===pointer.mesocycleId):null;
    if(chosen&&!usable(chosen.plan))return null;
    if(!chosen){
        const candidates=plans.filter(item=>usable(item.plan));
        // Legacy diaries have no explicit marker. Prefer an unfinished session already started.
        chosen=candidates.find(item=>planResumeTarget(item.plan)?.started) || candidates[0];
    }
    if(!chosen)return null;
    const target=planResumeTarget(chosen.plan);
    return {year:chosen.year,mesoIndex:chosen.index,mesocycleId:chosen.plan.id??null,
        planName:chosen.plan.name||'Programma',target};
}

/** Explicit selection/import/start only. Ordinary history browsing never calls this. */
export function activateTrainingPlan(data,year,index) {
    const plan=data?.history?.years?.[String(year)]?.mesocycles?.[index];
    if(!usable(plan))throw Error('Questa scheda non è disponibile per allenarti: è vuota o in sola lettura.');
    plan.id ||= 'meso_'+crypto.randomUUID();
    data.activeTrainingPlan={mesocycleId:plan.id};
    return data.activeTrainingPlan;
}

/** Do not count an unattended night or erase previously measured activity. */
export function pauseOvernightSession(day,now=new Date()) {
    if(!day?.sessionStart || sessionResolved(day))return false;
    const started=new Date(day.sessionStart);
    if(!Number.isFinite(started.getTime()) || started.toDateString()===now.toDateString())return false;
    day.sessionStart=null;
    day.isPaused=true;
    return true;
}
