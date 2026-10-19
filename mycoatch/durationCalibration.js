/**
 * Calibrazione prudente della durata dei NUOVI mesocicli.
 *
 * Il timer del diario inizia dopo la prima serie confermata, quindi non misura
 * riscaldamento e prima serie. Si confronta solamente la porzione equivalente
 * della stima. Non modifica allenamenti passati o già programmati.
 */
import { EXERCISE_DATABASE } from './exercisesDB.js';
import { canonicalExerciseKey } from './exerciseIdentity.js';
import { estimateDaySeconds, firstSetStartOffsetSeconds } from './timeEstimator.js';
import { isWarmupExercise, isWarmupSet } from '../js/workoutSemantics.js';

const RECENT_DAYS=42,MIN_SAMPLES=3,MAX_FACTOR=1.25,DAY=86400000;
const catalog=new Map(EXERCISE_DATABASE.map(ex=>[canonicalExerciseKey(ex.name),ex]));
const checked=set=>set?.isLocked===true || set?.completed===true;

function recentSession(session,now){
    const raw=session?.sessionCompletedAt || session?.sessionDate || session?.date;
    if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(raw))return false;
    const value=Date.parse(raw.length===10 ? raw+'T12:00:00Z' : raw);
    return Number.isFinite(value)&&value<=now&&now-value<=RECENT_DAYS*DAY;
}

function comparableExercise(ex){
    if(isWarmupExercise(ex))return null;
    const performed=(ex.loggedSets||[]).filter(set=>!isWarmupSet(set));
    if(performed.length<2||performed.some(set=>!checked(set)))return null;
    const meta=catalog.get(canonicalExerciseKey(ex.name));
    // Niente biomeccanica inventata per esercizi non ancora censiti:
    // usare metadati affidabili della scheda o quelli del catalogo esistente.
    const pattern=ex.pattern||meta?.pattern;
    const equipment=ex.equipment||meta?.equipment;
    const restTime=ex.restTime||ex.recupero||ex.rest;
    if(!pattern||!equipment||!restTime)return null;
    return {name:ex.name,pattern,equipment,setsCount:performed.length,
        restTime,groupType:ex.groupType,groupBase:ex.groupBase,
        isGroupLast:ex.isGroupLast};
}

function expectedAfterFirstSet(session){
    const exercises=(session?.exercises||[]).filter(ex=>!isWarmupExercise(ex));
    if(exercises.length<2||exercises[0]?.groupType)return null;
    const normalized=exercises.map(comparableExercise);
    if(normalized.some(ex=>!ex))return null;
    try{
        const active=estimateDaySeconds(normalized)-firstSetStartOffsetSeconds(normalized);
        return active>=15*60 ? active : null;
    }catch{return null;}
}

export function deriveDurationCalibration(userHistory,{now=new Date()}={}){
    const today=now instanceof Date?now.getTime():Number(now);
    const result={factor:1,sampleCount:0,method:'recent_confirmed_median_v1',
        windowDays:RECENT_DAYS,limitedToRecordedTimer:true};
    if(!Number.isFinite(today))return result;
    const years=userHistory?.history?.years || userHistory?.years || {};
    const ratios=[];
    for(const year of Object.values(years)){
        for(const meso of year?.mesocycles||[]){
            for(const week of meso?.weeks||[]){
                if(week.isDeloadWeek||week.isDeload)continue;
                for(const day of week.days||[]){
                    const sessions=[...(day.sessionArchives||[])];
                    if(day.completed===true)sessions.push(day);
                    for(const session of sessions){
                        if(!recentSession(session,today))continue;
                        const minutes=Number(session.totalDurationMinutes);
                        if(!Number.isFinite(minutes)||minutes<12||minutes>120)continue;
                        const expected=expectedAfterFirstSet(session);
                        if(!expected)continue;
                        const ratio=minutes*60/expected;
                        // Sospensioni lunghissime e timer errati non addestrano
                        // il modello. Tempi rapidi non riducono il budget.
                        if(ratio>=0.6&&ratio<=1.75)ratios.push(ratio);
                    }
                }
            }
        }
    }
    result.sampleCount=ratios.length;
    if(ratios.length<MIN_SAMPLES)return result;
    ratios.sort((a,b)=>a-b);
    const i=Math.floor(ratios.length/2);
    const median=ratios.length%2?ratios[i]:(ratios[i-1]+ratios[i])/2;
    result.factor=Math.round(Math.min(MAX_FACTOR,Math.max(1,median))*100)/100;
    return result;
}
