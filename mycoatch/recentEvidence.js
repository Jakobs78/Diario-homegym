import { historyWindow } from '../js/historyWindow.js';
import { isWarmupExercise, isWarmupSet } from '../js/workoutSemantics.js';

// Versioned coaching heuristics, not physiological thresholds.
export const RECENT_EVIDENCE_DAYS=42;
export const REENTRY_GAP_DAYS=28;
const DAY=86400000;
const confirmed=s=>s?.isLocked===true || s?.completed===true;

export function performanceTimestamp(set,session){
    const value=set?.performedAt || session?.sessionDate || session?.date ||
        set?.completedAt || session?.sessionCompletedAt;
    if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))return null;
    const date=value.slice(0,10);
    const calendar=Date.parse(date+'T00:00:00Z');
    if(!Number.isFinite(calendar) || new Date(calendar).toISOString().slice(0,10)!==date)return null;
    const stamp=Date.parse(value);
    return Number.isFinite(stamp)?stamp:null;
}

/** A separate copy for current coaching; the complete journal stays untouched. */
export function prepareRecentEvidence(data,{now=new Date()}={}){
    const window=historyWindow(data,now);
    const history=structuredClone(window.operational);
    const audit={version:1,windowDays:RECENT_EVIDENCE_DAYS,
        operationalYears:4,startYear:window.start,endYear:window.end,
        excludedOldSets:0,undatedSets:0,futureSets:0,recentSets:0,incompatibleEquipmentSets:0,
        lastPerformedAt:null,reentry:false};
    let latest=null;
    for(const year of Object.values(history.years))for(const meso of year.mesocycles||[])
    for(const week of meso.weeks||[])for(const day of week.days||[]){
        for(const session of [...(day.sessionArchives||[]),day])for(const ex of session.exercises||[]){
            if(meso.excludedFromCoaching){for(const set of ex.loggedSets||ex.sets||[]){set.isLocked=false;set.completed=false;}continue;}
            if(isWarmupExercise(ex))continue;
            for(const set of ex.loggedSets || ex.sets || []){
                if(!confirmed(set) || isWarmupSet(set))continue;
                const stamp=performanceTimestamp(set,session);
                let valid=false;
                if(stamp===null)audit.undatedSets++;
                else if(stamp>now.getTime()+60000)audit.futureSets++;
                else {
                    latest=Math.max(latest??stamp,stamp);
                    if(now.getTime()-stamp>RECENT_EVIDENCE_DAYS*DAY)audit.excludedOldSets++;
                    else {valid=true;audit.recentSets++;}
                }
                const station=data?.athlete?.stationConfigurations?.machine;
                if(station&&/cav|cable|machine|macchina/i.test(String(ex.equipment||'')+' '+String(ex.name||''))&&set.equipmentSnapshot?.station!==station){valid=false;audit.incompatibleEquipmentSets++;}
                if(!valid){set.isLocked=false;set.completed=false;}
                else set.completedAt=new Date(stamp).toISOString();
            }
        }
    }
    audit.lastPerformedAt=latest===null?null:new Date(latest).toISOString();
    audit.reentry=latest!==null && now.getTime()-latest>REENTRY_GAP_DAYS*DAY;
    // A long break warrants recalibration, not a percentage applied to old kg.
    if(audit.reentry){
        for(const year of Object.values(history.years))for(const meso of year.mesocycles||[])
        for(const week of meso.weeks||[])for(const day of week.days||[])
        for(const session of [...(day.sessionArchives||[]),day])for(const ex of session.exercises||[])
        for(const set of ex.loggedSets || ex.sets || []){set.isLocked=false;set.completed=false;}
    }
    return {history,audit,originalHistory:window.operational};
}
