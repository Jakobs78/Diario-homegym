import {compatiblePlates,PLATE_SIZES} from './barbellInventory.js';
/**
 * Pure, non-writing suggestion for the NEXT workout, not an automatic
 * modification of the current workout. Every working set must be checked.
 * A low RPE (e.g. 6 observed versus 7 prescribed) is evidence only when
 * repeated across ALL the exercise's homogeneous working sets.
 */
import { getPlateBreakdown } from '../js/helpers.js';
import { plannedWorkSetCount } from '../js/workoutSemantics.js';
import {estimateE1rm} from './historyAnalysis.js';
const number=value=>{
    if(value===undefined||value===null||value==='')return null;
    const n=Number(String(value).replace('@','').replace(',','.'));
    return Number.isFinite(n)?n:null;
};
const confirmed=set=>set?.isLocked===true||set?.completed===true;
const warmup=set=>Boolean(set?.isWarmup||set?.warmup||set?.is_warmup);
const isSpecial=(ex,set)=>Boolean(ex?.isDropset||ex?.groupType==='dropset'||
    ex?.groupType==='restpause'||set?.intensityTechnique||set?.dropSegments?.length||
    String(set?.reps||'').includes('+'));
const repsRange=ex=>{
    const text=String(ex?.reps||ex?.targetReps||'').trim();
    const match=text.match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!match) return null;
    const min=Number(match[1]),max=Number(match[2]||match[1]);
    return min>0 && min<=max && max<=40 ? {min,max} : null;
};
export const DEFAULT_LOADING_STEPS=Object.freeze({
    barbell:2.5,dumbbell:1,machine:2.5
});
export function equipmentCategory(ex={}) {
    const s=String(ex.equipment||'').toLowerCase()+' '+String(ex.name||'').toLowerCase();
    if(/dumbbell|manubrio|manubri/.test(s))return 'dumbbell';
    if(/cable|cavi|lat.machine|macchina|machine|seated|leg press/.test(s))return 'machine';
    return 'barbell';
}
export function getAvailableLoadStep(ex, settings={},weight=null) {
    settings={...settings,...(settings.loadingSteps || {})};
    const type=equipmentCategory(ex);
    const custom=number(settings?.[type]);
    const standard=type==='dumbbell'&&weight!==null&&weight<12.5?0.5:
        type==='machine'&&weight!==null&&weight<12.5?0.5:
        DEFAULT_LOADING_STEPS[type];
    return {
        type,
        step:custom!==null&&custom>=0.25&&custom<=25?custom:standard,
        configured:custom!==null&&custom>=0.25&&custom<=25
    };
}
const roundLoad=value=>Math.round(value*100)/100;

/** Finite, exact inventory search. A step alone never proves ownership. */
export function resolveNearbyLoad(ex, requested, settings={}, {min=0.01,max=700,origin=0}={}) {
    const raw=number(requested);
    if(raw===null || raw<=0 || raw>700)return {weight:null,verified:false,reason:'invalid_load'};
    const {type,step,configured}=getAvailableLoadStep(ex,settings,raw);
    if(type==='barbell' && (settings.plateInventories || settings.platePairs)){
        const binding=compatiblePlates(ex,settings);
        if(!binding)return {weight:null,verified:true,reason:'missing_assignment'};
        let totals=new Set([0]);
        for(const plate of PLATE_SIZES){
            const count=Math.max(0,Math.min(24,Math.trunc(Number(binding.inventory[String(plate)])||0)));
            const next=new Set(totals);
            for(const total of totals)for(let n=1;n<=count;n++){
                const sum=total+Math.round(plate*8)*n;
                if(sum<=2800)next.add(sum);
            }
            totals=next;
        }
        const candidates=[...totals].map(x=>roundLoad(binding.weight+x/4)).filter(x=>x>=min-1e-8&&x<=max+1e-8)
            .sort((a,b)=>Math.abs(a-raw)-Math.abs(b-raw)||a-b);
        return {weight:candidates[0]??null,verified:true,reason:candidates.length?'inventory':'unavailable_load'};
    }
    const candidates=[origin+Math.floor((raw-origin)/step)*step,origin+Math.ceil((raw-origin)/step)*step]
        .map(roundLoad).filter(x=>x>=min-1e-8&&x<=max+1e-8&&x>0)
        .sort((a,b)=>Math.abs(a-raw)-Math.abs(b-raw)||a-b);
    return {weight:candidates[0]??null,verified:false,reason:configured?'configured_step':'indicative_step'};
}

/**
 * Recommendations require every work set to be valid, checked, homogeneous,
 * straight (no top/backoff/dropset) and with RPE genuinely confirmed by ✓.
 * No recommendation on pain, a deload, unconfirmed rows or missing RPE.
 */
export function recommendNextSessionLoad(ex,{
    readiness=null,equipmentSettings=null
}={}) {
    if(!ex || ex.isWarmup || ex.isExcluded || ex.is_excluded ||
        ex.isDeload || ex.isDeloadWeek || readiness?.allowIncrease===false ||
        readiness?.level==='stop')return null;
    const entries=(ex.loggedSets||[]).filter(s=>!warmup(s));
    if(entries.length<2 || entries.length<plannedWorkSetCount(ex) ||
        entries.some(s=>!confirmed(s)))return null;
    const range=repsRange(ex);
    const target=number(ex.targetRpe??ex.rpeTarget??ex.rpe);
    if(!range || target===null || target<6 || target>10)return null;
    const values=entries.map(set=>{
        const kg=number(set.weight),reps=number(set.reps),rpe=number(set.rpe);
        return kg!==null&&kg>0&&reps!==null&&Number.isInteger(reps)&&
            reps>0&&reps<=40&&rpe!==null&&rpe>=6&&rpe<=10&&
            !isSpecial(ex,set)?{kg,reps,rpe}:null;
    });
    if(values.some(v=>!v))return null;
    const kg=values[0].kg;
    // Mixed loads can reflect top sets/backoffs: never use one suggestion
    // for a different prescribed intensity.
    if(!values.every(v=>v.kg===kg&&v.reps>=range.min&&v.rpe<=target))return null;
    const extraReps=values.every(v=>v.reps>=range.max&&v.reps<=range.max+2&&v.rpe<=target);
    // First build repetitions. Even easy working sets below the top of the
    // range never authorize a load increase from one training session.
    if(!extraReps){
        if(!values.every(v=>v.reps<=range.max&&v.rpe<=target))return null;
        const nextReps=values.map(v=>v.reps);
        const index=nextReps.findIndex(reps=>reps<range.max);
        if(index<0)return null;
        nextReps[index]++;
        return {eligible:true,suggestedWeight:null,previousWeight:kg,nextReps,
            reason:'Mantieni '+kg+' kg: prova +1 ripetizione in una sola serie ('+nextReps.join('/')+'), entro il range e l’RPE previsti.',
            evidence:'build_reps',configured:false,type:equipmentCategory(ex)};
    }
    const {step,type,configured}=getAvailableLoadStep(ex,equipmentSettings||{},kg);
    const cap=type==='dumbbell'?0.1:0.05;
    let resolved=resolveNearbyLoad(ex,kg+step,equipmentSettings || {},{min:kg+.01,max:kg*(1+cap),origin:kg});
    let repGoal=null;
    if(resolved.weight===null && range.min<range.max && range.max<=12 && target<=9.5){
        const estimates=values.map(v=>estimateE1rm(v.kg,v.reps,v.rpe));
        if(estimates.every(value=>value!==null)){
            const raw=Math.min(...estimates)/(1+(range.min+10-target)/30);
            resolved=resolveNearbyLoad(ex,raw,equipmentSettings || {},{
                min:kg+.01,max:Math.min(kg*1.10,raw),origin:kg
            });
            if(resolved.weight!==null)repGoal=range.min;
        }
    }
    if(resolved.weight===null)return {eligible:true,suggestedWeight:null,previousWeight:kg,step,
        reason:'Nessun incremento compatibile confermato. Mantieni i kg e le ripetizioni consolidate; verifica bilanciere, dischi o microcarichi. Un ampliamento del range richiede una revisione esplicita.',
        evidence:'equipment_hold',configured,type};
    const proposed=resolved.weight;
    return {
        eligible:true,suggestedWeight:proposed,previousWeight:kg,step,
        evidence:'top_reps',
        repGoal,
        reason:'Tutte le serie confermate hanno raggiunto il limite alto con RPE entro target.'+
            (repGoal?' Con il nuovo peso riparti da '+repGoal+' ripetizioni, senza superare l’RPE previsto.':''),
        configured,type,
        verified:resolved.verified,
        confidence:'single_session_provisional',
        advisory:'Proposta per la prossima seduta, non modifica automatica della scheda. Rivaluta tecnica, recupero e disponibilità reale dei pesi.'
    };
}


/** A configured inventory is authoritative, including an empty inventory.
 * Without inventory, increments remain indicative, never verified stock.
 */
export function resolvePlannedLoad(ex, weight, settings={}) {
    const kg=number(weight);
    if(kg===null || kg<=0 || kg>700)return {weight:null,verified:false};
    const {step,type}=getAvailableLoadStep(ex,settings,kg);
    if(type==='barbell' && (settings.plateInventories || settings.platePairs)){
        const compatible=compatiblePlates(ex,settings);
        if(!compatible)return {weight:null,verified:true,reason:'missing_assignment'};
        const {weight:bar,inventory}=compatible;
        const exact=Math.abs(kg-bar)<0.001 ||
            kg>bar && getPlateBreakdown(kg,bar,inventory)?.exact;
        return {weight:exact?kg:null,verified:true,...(!exact?{reason:'unavailable_load'}:{})};
    }
    return {weight:Math.round(Math.round(kg/step)*step*100)/100,verified:false};
}
