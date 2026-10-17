import {compatiblePlates} from './barbellInventory.js';
/**
 * Pure, non-writing suggestion for the NEXT workout, not an automatic
 * modification of the current workout. Every working set must be checked.
 * A low RPE (e.g. 6 observed versus 7 prescribed) is evidence only when
 * repeated across ALL the exercise's homogeneous working sets.
 */
import { getPlateBreakdown } from '../js/helpers.js';
import { plannedWorkSetCount } from '../js/workoutSemantics.js';
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
    if(!values.every(v=>v.kg===kg&&v.reps>=range.min))return null;
    const extraReps=values.every(v=>v.reps>=range.max&&v.reps<=range.max+2&&v.rpe<=target);
    const lowerEffort=values.every(v=>v.rpe<=target-1 && v.reps>=range.min &&
        v.reps<=range.max+2);
    if(!extraReps&&!lowerEffort)return null;
    const {step,type,configured}=getAvailableLoadStep(ex,equipmentSettings||{},kg);
    const cap=type==='dumbbell'?0.1:0.05;
    if(step/kg>cap+1e-9)return {
        eligible:true,suggestedWeight:null,previousWeight:kg,step,
        reason:'Prestazione superiore al target, ma il più piccolo incremento indicato è troppo grande rispetto al carico. Servono microcarichi o un’altra seduta di conferma.',
        evidence:extraReps?'extra_reps':'lower_rpe',configured,type
    };
    const proposed=roundLoad(kg+step);
    if(type==='barbell' && (equipmentSettings?.plateInventories || equipmentSettings?.platePairs)){
        const compatible=compatiblePlates(ex,equipmentSettings);
        const plates=compatible && getPlateBreakdown(proposed,compatible.weight,compatible.inventory);
        if(!plates?.exact)return {
            eligible:true,suggestedWeight:null,previousWeight:kg,step,
            reason:'Verifica il bilanciere, il diametro e i dischi compatibili: il nuovo carico non è confermato componibile. Mantieni il peso o completa l’attrezzatura.',
            evidence:extraReps?'extra_reps':'lower_rpe',configured,type
        };
    }
    return {
        eligible:true,suggestedWeight:proposed,previousWeight:kg,step,
        evidence:extraReps?'extra_reps':'lower_rpe',
        reason:extraReps
            ? 'Tutte le serie confermate hanno raggiunto il limite alto delle ripetizioni con RPE entro target.'
            : 'Tutte le serie confermate hanno rispettato le ripetizioni con RPE almeno un punto sotto il target.',
        configured,type,
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
        if(!compatible)return {weight:null,verified:true};
        const {weight:bar,inventory}=compatible;
        const exact=Math.abs(kg-bar)<0.001 ||
            kg>bar && getPlateBreakdown(kg,bar,inventory)?.exact;
        return {weight:exact?kg:null,verified:true};
    }
    return {weight:Math.round(Math.round(kg/step)*step*100)/100,verified:false};
}
