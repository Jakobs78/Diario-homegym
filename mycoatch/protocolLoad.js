import {isExerciseSkipped} from '../js/sessionSkip.js';
/** Deterministic protocol 1.4. Numeric tolerances are engineering defaults, not physiological laws. */
import {setPrescription,observed,blockKey,warm} from './setPrescription.js';
import {estimateE1rm} from './historyAnalysis.js';
import {resolveNearbyLoad,equipmentCategory,getAvailableLoadStep} from './loadProposal.js';
export const PROTOCOL_POLICY=Object.freeze({version:'1.4',historyExposures:3,rpeTolerance:0.5,stableSpread:0.10,rangeHalfWidth:0.025,maxIncrease:0.05,maxDumbbellIncrease:0.10,maxReduction:0.10});
const round=x=>Math.round(x*100)/100;
const median=values=>{const a=[...values].sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function recoveryKey(ex){
    const raw=String(ex?.restTime??ex?.rest??ex?.recupero??'').trim().toLowerCase().replace(/,/g,'.');
    const match=raw.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secondi|secondo|seconds|min|minuti|minuto|minutes|m|['’]|["”])?$/);
    return match?String(Number(match[1])*(/^(min|minuti|minuto|minutes|m|['’])$/.test(match[2]||'')?60:1)):raw.replace(/\s+/g,' ');
}
export function relatedSets(ex,p,index){
    if(isExerciseSkipped(ex))return [];
    const rows=(ex?.loggedSets||[]).map((_,i)=>observed(ex,i)).filter(s=>s&&!s.prescription.special);
    const role=rows.filter(s=>s.prescription.role===p.role);
    const candidates=role.length?role:rows.filter(s=>s.prescription.role==='work'&&p.role!=='top');
    return candidates.sort((a,b)=>(a.index===index?-1:b.index===index?1:a.index-b.index));
}
export function selectEvidence(ex,index,exposures=[]){
    const p=setPrescription(ex,index);
    const candidates=exposures.map(item=>item?.exercise?item:{exercise:item,source:null});
    const comparable=[],adaptable=[];
    for(const item of candidates){
        const sets=relatedSets(item.exercise,p,index);
        if(!sets.length)continue;
        const match=sets[0],q=match.prescription;
        const entry={...item,sets,match};
        (p.role===q.role&&same(p.reps,q.reps)&&same(p.rpe,q.rpe)?comparable:adaptable).push(entry);
    }
    return [...comparable,...adaptable].slice(0,PROTOCOL_POLICY.historyExposures);
}
function estimate(set){return set?.prescription.special||set?.prescription.reps?.max>12||set?.rpe===null?null:estimateE1rm(set.kg,set.reps,set.rpe);}
function desiredWeight(capacity,p,reps){return capacity&&p.rpe?capacity/(1+(reps+Math.max(0,10-p.rpe.max))/30):null;}
function resolve(ex,raw,equipment,{increasing=false,base=raw}={}){
    if(!Number.isFinite(raw)||!(raw>0)||raw>700)return {weight:null,verified:false};
    const type=equipmentCategory(ex);
    const configured=getAvailableLoadStep(ex,equipment,raw).configured;
    const known=Array.isArray(equipment.availableLoads?.[type])||type==='barbell'&&(equipment.plateInventories||equipment.platePairs);
    if(!known&&!configured)return {weight:round(raw),theoretical:round(raw),verified:false,reason:'indicative_load'};
    const resolved=resolveNearbyLoad(ex,raw,equipment,{min:increasing?base+.001:Math.max(.01,raw*.975),max:Math.min(raw*1.025,increasing?base*(1+(type==='dumbbell'?PROTOCOL_POLICY.maxDumbbellIncrease:PROTOCOL_POLICY.maxIncrease)):700),origin:base});
    // Missing or explicitly unavailable stock never erases the theoretical recommendation.
    if(resolved.weight!==null)return {...resolved,weight:round(resolved.weight),theoretical:round(raw)};
    const alternative=resolved.verified?resolveNearbyLoad(ex,raw,equipment,{min:.01,max:raw,origin:base}):null;
    return {weight:round(raw),theoretical:round(raw),verified:false,alternativeWeight:alternative?.verified?alternative.weight:null,
        reason:resolved.verified?'theoretical_unavailable':'indicative_load'};
}
export function nextBlockDecision(ex,index,equipment={},readiness=null){
    const p=setPrescription(ex,index);
    const count=Math.max(ex?.sets?.length||0,ex?.loggedSets?.length||0,parseInt(ex?.setsCount??ex?.set,10)||0);
    const indices=Array.from({length:count},(_,i)=>i).filter(i=>!warm(ex?.loggedSets?.[i])&&!warm(ex?.sets?.[i])&&blockKey(setPrescription(ex,i))===blockKey(p));
    const sets=indices.map(i=>observed(ex,i));
    if(isExerciseSkipped(ex)||!sets.length||sets.some(s=>!s||s.prescription.special)||!p.reps||!p.rpe||p.special||ex.isDeload||ex.isDeloadWeek||ex.isWarmup||ex.isExcluded)return null;
    if(sets.some(s=>s.rpe===null||s.rpe>p.rpe.max||s.reps<p.reps.min))return null;
    const matched=sets.find(s=>s.index===index)||sets[0];
    if(p.reps.max>12)return {kind:'maintain',weight:matched.kg,reps:Math.min(p.reps.max,Math.max(p.reps.min,matched.reps)),reason:'Range oltre 12 reps: ripropongo i carichi confermati, senza aumento automatico. Cambiare il range richiede una revisione esplicita.'};
    if(readiness?.allowIncrease===false||readiness?.level==='stop')return null;
    // Fixed-rep strength uses capacity estimation rather than double progression.
    if(p.reps.min===p.reps.max)return null;
    const mixed=!sets.every(s=>s.reps>=p.reps.max);
    const buildReps=()=>{
        const next=sets.find(s=>s.reps<p.reps.max);
        return {kind:'build_reps',weight:matched.kg,reps:Math.min(p.reps.max,matched.reps+(next?.index===index?1:0)),reason:'Mantengo i kg: prima porto la serie meno favorevole verso il limite alto delle reps, rispettando l’RPE.'};
    };
    // Mixed progression is a conservative application rule, not a certainty
    // inferred from average repetitions. Every measured set must support it.
    const estimates=sets.map(estimate);
    const mixedEligible=mixed&&sets.filter(s=>s.reps>p.reps.max).length>=2&&
        sets.every(s=>s.kg===sets[0].kg)&&estimates.every(v=>v!==null);
    if(mixed&&!mixedEligible)return sets.some(s=>s.reps>p.reps.max)?null:buildReps();
    const cap=equipmentCategory(ex)==='dumbbell'?PROTOCOL_POLICY.maxDumbbellIncrease:PROTOCOL_POLICY.maxIncrease;
    const step=getAvailableLoadStep(ex,equipment,matched.kg);
    const knownInventory=equipment.availableLoads?.[equipmentCategory(ex)]||equipment.plateInventories||equipment.platePairs;
    const increment=step.configured||knownInventory?step.step:matched.kg*(equipmentCategory(ex)==='dumbbell'?.05:.025);
    const capacity=mixed?Math.min(...estimates):median(estimates.filter(v=>v!==null));
    const sustainable=desiredWeight(capacity,p,p.reps.min);
    const allowed=Math.min(matched.kg+increment,matched.kg*(1+cap),sustainable??Infinity);
    const raw=mixed?Math.floor(allowed*100+1e-7)/100:allowed;
    if(!(raw>matched.kg+.001))return mixed?buildReps():null;
    const resolved=resolve(ex,raw,equipment,{increasing:true,base:matched.kg});
    if(mixed&&(resolved.weight===null||resolved.weight>sustainable+.001))return buildReps();
    return {kind:'increase_load',progressionBasis:mixed?'mixed_reps':'upper_range',weight:resolved.weight,reps:p.reps.min,verified:resolved.verified,theoretical:resolved.theoretical,
        reason:mixed?'Almeno due serie oltre il range con RPE entro target: propongo un piccolo aumento sostenuto anche dalla serie meno favorevole e riparto da '+p.reps.min+' reps.':'Tutte le serie del blocco hanno raggiunto il limite alto rispettando l’RPE. Aumento il carico e riparto da '+p.reps.min+' reps.'};
}
export function workingProposal(ex,index,{exposures=[],equipment={},readiness=null,allowProgression=true}={}){
    const p=setPrescription(ex,index);
    if(isExerciseSkipped(ex)||p.special||ex?.isWarmup||ex?.isExcluded||ex?.is_excluded||warm(ex?.loggedSets?.[index])||warm(ex?.sets?.[index]))return null;
    const station=equipment.stationConfigurations?.machine;
    const usable=station&&equipmentCategory(ex)==='machine'?exposures.filter(item=>{
        const source=item.exercise??item;return !(source.loggedSets||[]).some(s=>s.equipmentSnapshot?.station&&s.equipmentSnapshot.station!==station);
    }):exposures;
    const evidence=selectEvidence(ex,index,usable),recent=evidence[0];
    const reference=recent?.match;
    let progressionBasis=null;
    let reps=p.reps?.min??null,kg=p.kg?.min??null,kind='prescription',range=null,verified=false,alternativeWeight=null;
    let reason=kg?'Carico iniziale della scheda; verifica la risposta durante l’avvicinamento.':'Manca uno storico pertinente: carico da calibrare.';
    const capacities=evidence.map(item=>estimate(item.match)).filter(v=>v!==null);
    const stable=capacities.length>=2&&Math.max(...capacities)/Math.min(...capacities)<=1+PROTOCOL_POLICY.stableSpread?median(capacities):null;
    const capacity=stable??capacities[0]??null;
    if(reference&&p.reps){
        const comparable=same(reference.prescription.reps,p.reps)&&same(reference.prescription.rpe,p.rpe);
        reps=Math.min(p.reps.max,Math.max(p.reps.min,reference.reps));kg=reference.kg;kind='history';
        reason='Ripropongo il riferimento delle serie confermate dello stesso esercizio'+(recent.date?' del '+String(recent.date).slice(0,10):'')+'.';
        if((!comparable||p.reps.min===p.reps.max&&reference.rpe!==null&&Math.abs(reference.rpe-(p.rpe?.max??reference.rpe))>PROTOCOL_POLICY.rpeTolerance)&&p.reps.max<=12&&capacity&&p.rpe&&!p.special){
            kg=desiredWeight(capacity,p,reps);kind='estimated_history';
            reason='Carico adattato alle reps e all’RPE di questa serie usando il massimale stimato dallo storico pertinente.';
        }
        const contextUnchanged=recoveryKey(recent.exercise)===recoveryKey(ex);
        const progressCompatible=same(reference.prescription.reps,p.reps)&&reference.prescription.role===p.role&&p.rpe?.max>=reference.prescription.rpe?.max;
        if(!contextUnchanged)reason+=' Recupero diverso: la progressione della seduta precedente non viene trasferita; il carico è valutato per i target attuali.';
        if(allowProgression&&!ex.isDeload&&!ex.isDeloadWeek&&progressCompatible&&contextUnchanged&&recent.checkin?.pain!=='present'){
            const decision=nextBlockDecision(recent.exercise,reference.index,equipment,readiness);
            if(decision){progressionBasis=decision.progressionBasis??null;({weight:kg,reps,kind}=decision);reason=decision.reason;verified=Boolean(decision.verified);}
        }
    }
    // Only confirmed rows BEFORE this series inform today's proposal. Fatigue does not rewrite stable capacity.
    const today=(ex.loggedSets||[]).slice(0,index).map((_,i)=>observed(ex,i)).filter(s=>s&&!s.prescription.special);
    const last=today.at(-1);
    if(last&&p.reps&&!p.special){
        const q=last.prescription;
        const homogeneous=same(p.reps,q.reps)&&same(p.rpe,q.rpe)&&same(p.kg,q.kg)&&p.role===q.role;
        const todayCapacity=estimate(last);
        const programmedStep=p.kg&&q.kg&&!same(p.kg,q.kg);
        if(!homogeneous&&programmedStep){
            kg=p.kg.min;reps=p.reps.min;kind='prescribed_step';reason='Mantengo il carico specifico di questa serie e la sua funzione nel programma.';
        }else if(!homogeneous&&todayCapacity&&p.reps.max<=12&&p.rpe){
            kg=desiredWeight(todayCapacity,p,p.reps.min);reps=p.reps.min;kind='today_estimate';
            reason='Proposta adattata dalla serie appena confermata al target specifico di questa serie; top set e back-off mantengono carichi distinti.';
        }else if(homogeneous){
            kg=last.kg;reps=Math.min(p.reps.max,Math.max(p.reps.min,last.reps));kind='today';
            reason='Riferimento della serie confermata oggi, con recupero e target invariati.';
            const delta=last.rpe!==null&&p.rpe?last.rpe-p.rpe.max:null;
            if(delta!==null&&(delta>PROTOCOL_POLICY.rpeTolerance||last.reps<p.reps.min)){
                const estimated=desiredWeight(todayCapacity,p,p.reps.min);
                kg=Math.max(last.kg*(1-PROTOCOL_POLICY.maxReduction),Math.min(last.kg,estimated??last.kg*.95));reps=p.reps.min;kind='reduce_today';
                reason='La serie è risultata più difficile del target: riduco la proposta successiva, senza abbassare automaticamente il riferimento storico.';
            }else if(delta!==null&&delta<=-1&&p.reps.max<=12&&readiness?.allowIncrease!==false){
                if(last.reps<p.reps.max){reps=Math.min(p.reps.max,last.reps+1);reason='Margine di sforzo: propongo una ripetizione in più entro il range, mantenendo i kg.';}
                else{kg=last.kg*1.025;kind='increase_today';reason='Serie chiaramente più facile del target: piccolo aumento indicativo per la prossima serie.';}
            }
        }
    }
    if(readiness?.level==='stop')return {weight:null,reps,rpe:p.rpe?.max??null,kind:'pain_caution',reason:'Dolore segnalato: rivaluta il movimento prima di usare una proposta di carico.',basedOn:[]};
    if(kg!==null){
        const resolved=resolve(ex,kg,equipment,{increasing:kind.startsWith('increase'),base:kind==='increase_today'?last.kg:reference?.kg??last?.kg??kg});
        const preserve=['history','today'].includes(kind);
        kg=preserve?round(kg):resolved.weight;verified=verified||resolved.verified&&Math.abs(resolved.weight-kg)<.001;
        if(!verified)reason+=' Disponibilità del peso da verificare.';
        if(resolved.reason==='theoretical_unavailable'){
            alternativeWeight=resolved.alternativeWeight??null;
            reason+=' Carico teorico non componibile con l’inventario dichiarato.';
            if(alternativeWeight!==null)reason+=' Alternativa più leggera disponibile: '+alternativeWeight+' kg.';
        }
        if(p.reps&&p.reps.min===p.reps.max&&p.reps.max<=12&&capacity){
            range={min:round(kg*(1-PROTOCOL_POLICY.rangeHalfWidth)),max:round(kg*(1+PROTOCOL_POLICY.rangeHalfWidth))};
        }
    }
    if(p.reps?.max>12)reason='Range oltre 12 reps: ripropongo il carico pertinente senza aumenti automatici. '+(kind==='reduce_today'?reason:'Verifica lo sforzo dopo ogni serie.');
    const change=capacities.length>=3?(capacities[0]/capacities.at(-1)-1)*100:null;
    const monitoring=change===null?null:change<=-5?'Prestazioni recenti in calo: verifica recupero e andamento nelle prossime sedute.':Math.abs(change)<1?'Prestazioni recenti simili: continua a registrare reps e RPE prima di valutare uno stallo.':null;
    return {weight:kg,reps,progressionBasis,rpe:p.rpe?.max??null,kind,reason,range,verified,alternativeWeight,monitoring,confidence:stable?'consistent_history':reference?'provisional':'calibration',stableE1rm:stable,
        basedOn:evidence.map(item=>({source:item.source??null,date:item.date??null,series:item.match.index,weight:item.match.kg,reps:item.match.reps,rpe:item.match.rpe,seriesEvidence:item.sets.map(s=>({index:s.index,kg:s.kg,reps:s.reps,rpe:s.rpe}))}))};
}
