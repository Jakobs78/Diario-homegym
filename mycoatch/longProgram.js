import {generateSmartMesocycle} from './engine.js';

/** A programme week is a sequence of sessions, never a calendar deadline. */
export function programSchedule({durationWeeks=4,programWeeks=0}={}) {
    const raw=programWeeks;
    if(raw!==0 && raw!=='0' && (!['number','string'].includes(typeof raw) || !String(raw).trim()))
        throw Error('Scegli la durata del percorso in settimane.');
    const total=Number(raw);
    if(!Number.isInteger(total)||total<0||total>52)
        throw Error('Il percorso deve durare da 1 a 52 settimane, oppure scegli il solo mesociclo.');
    const block=Number(durationWeeks);
    if(!Number.isInteger(block)||block<1||block>12)throw Error('Mesociclo non valido (1–12 settimane).');
    if(total && total<block)throw Error('Il percorso non può essere più breve del mesociclo.');
    return {programWeeks:total,totalWeeks:total||block,blockWeeks:block};
}

export function extendTrainingProgram(first,config,analysis,previous) {
    const schedule=programSchedule(config);
    if(!schedule.programWeeks)return first;
    const result=structuredClone(first);
    const blocks=[];
    let offset=0;
    while(offset<schedule.totalWeeks){
        const count=Math.min(schedule.blockWeeks,schedule.totalWeeks-offset);
        const block=offset===0?first:generateSmartMesocycle({...config,durationWeeks:count},analysis,previous||first);
        const order=blocks.length+1;
        blocks.push({order,weekFrom:offset+1,weekTo:offset+count,durationWeeks:count,
            objective:config.focus||'hybrid',conditional:order>1,
            reviewBeforeStart:order>1,label:'Mesociclo '+order});
        const weeks=structuredClone(block.weeks).map((week,i)=>({...week,
            weekNumber:offset+i+1,weekInMesocycle:i+1,mesocycleNumber:order,
            conditional:order>1}));
        if(offset===0)result.weeks=weeks;else result.weeks.push(...weeks);
        offset+=count;
    }
    result.program={schemaVersion:1,totalWeeks:schedule.totalWeeks,
        blockWeeks:schedule.blockWeeks,sessionsPerWeek:Number(config.daysPerWeek),
        weekBasis:'session_sequence',blocks,
        notice:'Le settimane sono giri di sedute, senza scadenze di calendario. I mesocicli successivi sono proposte da verificare sui risultati reali; nessun aumento futuro di carico è dato per acquisito.'};
    return result;
}

/** Drop generation-only diagnostics from NEW long plans, never from existing history. */
export function compactProgramForJournal(plan) {
    if(!plan.program)return plan;
    const result=structuredClone(plan);
    delete result.coachReport; // detailed review remains available before import / in the AI download
    delete result.macrocycle;
    for(const week of result.weeks){
        delete week.weeklyCoverage;
        delete week.volumeBalance;
        for(const day of week.days||[]){
            delete day.selectionAudit;
            for(const ex of day.exercises||[])delete ex.coachDecision;
        }
    }
    return result;
}
