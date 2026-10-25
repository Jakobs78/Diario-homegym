// Presentation policy only. Never writes proposals, prescriptions or results.
import {confirmed,warm} from './setPrescription.js';

const clean = value => String(value ?? '').trim();
const number = value => clean(value) === '' ? null :
    Number.isFinite(Number(clean(value).replace(',','.'))) ? Number(clean(value).replace(',','.')) : null;
const key = text => clean(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ');
const distinct = texts => [...new Map(texts.filter(Boolean).map(text=>[key(text),text])).values()];
const pending = (ex,i) => !confirmed(ex.loggedSets?.[i]) && !warm(ex.loggedSets?.[i]) && !warm(ex.sets?.[i]);
export const routineCoachText = text => /^(?:Serie confermata\.|Mantieni tecnica e recupero previsti\.|Nessun aggiornamento(?: necessario)?\.?$|Tutto regolare\.?$|Ripropongo il riferimento|Riferimento della serie confermata|Range oltre 12 reps: ripropongo)|Prestazioni recenti simili/i.test(clean(text));

export function actionableLiveAdvice(advice, {hasProtocol=false,finished=false}={}) {
    if(!advice)return false;
    if(['pain_caution','incomplete_log'].includes(advice.code))return true;
    if(finished || advice.nextSetIndex < 0)return false;
    if(advice.code==='missing_rpe')return true;
    if(advice.severity==='caution')return true;
    return !hasProtocol && advice.code==='optional_increment' &&
        number(advice.suggestedWeight)!==null && number(advice.suggestedWeight)!==number(advice.weight);
}

export function exerciseInstructionNotes(ex,{hasLoad=false}={}) {
    return distinct(clean(ex.notes).split(/\s*\|\s*|\r?\n/).map(part=>{
        // Selection/duration and per-set target metadata already have their
        // own report or cells. Preserve unknown text and all original data.
        if(/^\[(?:SPLIT MYCOATCH|DURATA STIMATA|SCELTA MYCOATCH|OBIETTIVO REPS PER SERIE|VOLUME RIDISTRIBUITO|TEMPO RIDOTTO)\]/i.test(part))return '';
        if(/^Stesso carico, una ripetizione aggiuntiva in una sola serie\.?$/i.test(part))return '';
        if(hasLoad && /^(?:Carico:\s*(?:calibra|configura)|Carico da (?:scegliere|calibrare|verificare)|\[(?:CALIBRAZIONE MYCOATCH|ATTREZZATURA DA CONFIGURARE|CARICO STIMATO|RIFERIMENTO ATLETA)\])/i.test(part))return '';
        return part.replace(/\s*Target RPE \d+(?:[.,]\d+)?: circa \d+(?:[.,]\d+)? ripetizioni in riserva \(stima soggettiva\)\.?/g,'').trim();
    }));
}

export function exerciseCoachModel(ex,{prefills=[],readOnly=false,liveAdvice=null,
    nextExposureAdvice=null,crossExposureAdvice=null,nextRepAdvice=null}={}) {
    const count=Math.max(ex.loggedSets?.length||0,ex.sets?.length||0,ex.coachSetProposals?.length||0);
    const indices=Array.from({length:count},(_,i)=>i).filter(i=>pending(ex,i));
    const hasLoad=indices.length>0 && indices.every(i=>number(prefills[i]?.weight ?? ex.loggedSets?.[i]?.weight ?? ex.coachSetProposals?.[i]?.weight)!==null);
    const instructions=exerciseInstructionNotes(ex,{hasLoad:readOnly?true:hasLoad});
    const groups=new Map();
    const add=(text,index=null,severity='info')=>{
        if(!clean(text))return;
        const k=key(text),entry=groups.get(k)||{text,series:[],severity};
        if(severity==='caution')entry.severity=severity;
        if(index!==null)entry.series.push(index+1);
        groups.set(k,entry);
    };
    let evidence=null;
    if(!readOnly && !ex.isWarmup && !ex.isExcluded && !ex.is_excluded){
        for(const i of indices){
            const p=ex.coachSetProposals?.[i];if(!p)continue;
            const reference=p.basedOn?.[0];
            const previous=(ex.loggedSets||[]).slice(0,i).filter(s=>confirmed(s)&&!warm(s)).at(-1);
            const today=['today','increase_today','reduce_today','today_estimate','prescribed_step'].includes(p.kind);
            const origin=today?previous:reference;
            const kg=number(origin?.weight),reps=number(origin?.reps);
            const weightChanged=kg!==null && number(p.weight)!==null && Math.abs(number(p.weight)-kg)>.001;
            const repsChanged=reps!==null && number(p.reps)!==null && number(p.reps)!==reps;
            const loadProblem=/non componibile|non è componibile|recuperi diversi/i.test(p.reason||'');
            const caution=p.kind==='pain_caution' || p.kind==='reduce_today';
            const update=['increase_load','increase_today','build_reps','estimated_history','today_estimate'].includes(p.kind) && (weightChanged||repsChanged);
            const calibration=number(p.weight)===null && p.kind!=='pain_caution' && !hasLoad;
            if(caution||loadProblem||update||calibration){
                const target=number(p.weight)!==null
                    ? `Proposta ${p.weight} kg${number(p.reps)!==null?' × '+p.reps+' reps':''}. ` : '';
                add(target+(p.reason||''),i,caution||loadProblem?'caution':'info');
                if(!evidence && reference?.seriesEvidence?.length)evidence=reference.seriesEvidence;
            }
            if(p.monitoring && /in calo/i.test(p.monitoring))add(p.monitoring,null,'caution');
        }
        if(!ex.coachSetProposals){
            for(const note of ex.coachAdaptiveNotes||[]){
                if(!routineCoachText(note))add(note);
            }
            if(nextExposureAdvice && (nextExposureAdvice.kind!=='maintain' || nextExposureAdvice.restChanged || nextExposureAdvice.suppressLoad)){
                add((nextExposureAdvice.weight?nextExposureAdvice.weight+' kg. ':'')+nextExposureAdvice.reason);
            }else if(crossExposureAdvice){
                add('Carico iniziale suggerito: '+crossExposureAdvice.kg+' kg, stimato da una seduta con reps/RPE diversi. Verifica durante l’avvicinamento.');
            }
            if(nextRepAdvice?.kind==='build_reps' && nextExposureAdvice?.kind!=='build_reps')add(nextRepAdvice.reason);
        }
        if(actionableLiveAdvice(liveAdvice,{hasProtocol:Boolean(ex.coachSetProposals),finished:indices.length===0})){
            // Protocol proposals already explain the adjustment. Keep the
            // live warning as well only when it conveys a separate problem.
            if(!ex.coachSetProposals || ![...groups.values()].some(x=>key(x.text).includes(key(liveAdvice.message))))
                {
                    let message=liveAdvice.message;
                    for(const p of ex.coachSetProposals||[])if(p?.reason)message=message.replace(p.reason,'');
                    message=message.replace(/Esercizio completato; registra il risultato e valuta il prossimo\./g,'').trim();
                    add(message,null,liveAdvice.severity);
                }
        }
    }
    return {instructions,updates:[...groups.values()],evidence};
}
