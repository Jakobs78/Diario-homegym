import {setPrescription} from './setPrescription.js';
import {bodyweightMetadata} from './bodyweight.js';
import {isExerciseSkipped} from '../js/sessionSkip.js';
import {specialSeries} from './seriesTechnique.js';
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

const conciseReason = value => clean(value).replace(/\s*Disponibilità del peso da verificare\./g,'').trim();
const sourceKey = source => source ? JSON.stringify([source.year,source.mesoIndex,source.weekNumber,source.dayIndex,source.exerciseIndex,source.archiveIndex??null]) : null;
const referenceLabel = reference => {
    const s=reference.source;if(!s)return '';
    const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(reference.date??''));
    return `Riferimento del consiglio: ${m?m[3]+'/'+m[2]+'/'+m[1]+' · ':''}settimana ${s.weekNumber}, giorno ${s.dayIndex+1} (${s.year}, mesociclo ${s.mesoIndex+1}).`;
};
const decimal = value => String(value).replace('.',',');
function appliedChange(entry){
    const c=entry.change;if(!c)return entry;
    const where=entry.series.length===1?'alla serie '+entry.series[0]:'alle serie '+entry.series.join(', ');
    const target=c.bodyweight&&Number(c.weight)===0?c.reps+' reps a corpo libero (0 kg)':decimal(c.weight)+' kg'+(c.bodyweight?' di zavorra':'')+' × '+c.reps+' reps';
    const lead=c.kind==='increase'?(c.today?'La serie appena conclusa indica margine per un piccolo aumento. ':c.basis==='mixed_reps'?'Più serie hanno superato il range rispettando l’RPE previsto. ':'Visto che hai raggiunto il massimo delle ripetizioni in tutte le serie precedenti, rispettando l’RPE previsto, '):
        c.kind==='reduce_reps'?(c.today?'La serie appena conclusa è risultata più difficile dell’RPE previsto. ':'Nella seduta precedente questa serie è risultata più difficile dell’RPE previsto. '):'';
    let text;
    if(c.manual)text='Suggerisco '+target+' '+(entry.series.length===1?'per la serie ':'per le serie ')+entry.series.join(', ')+'.';
    else if(c.kind==='reps')text='Ho aggiunto '+(c.delta===1?'una ripetizione':c.delta+' ripetizioni')+' '+where+': '+target+'.';
    else if(c.kind==='calibration')text=(c.pending?'Riferimento provvisorio ':'Carico di riferimento ')+where+': '+target+(c.pending?'. Verifica il carico durante la seduta.':'. Basato sulla serie indicata come carico trovato.');
    else if(c.kind==='increase')text='Ho aumentato '+(c.bodyweight?'la zavorra ':'il carico ')+where+': '+target+'.';
    else if(c.kind==='reduce_reps')text='Mantieni il carico '+where+' e prova '+target+'.';
    else if(c.kind==='reduce')text='Ho ridotto il carico '+where+': '+target+'. La serie precedente è risultata più difficile del target.';
    else text='Ho adattato il carico '+where+': '+target+(c.today?' in base alla serie appena confermata.':' in base al massimale stimato.');
    const action=text;
    if(['increase','reduce','estimate','reps','reduce_reps'].includes(c.kind)){
        const effort=c.rpe!==null&&c.rpe!==undefined?' Rispetta l’RPE '+decimal(c.rpe)+'.':' Rispetta l’RPE previsto.';
        text+=effort;
        if(c.kind==='increase')text+=' Lavora nel range '+(c.minReps===c.maxReps?c.minReps:c.minReps+'–'+c.maxReps)+' reps: non fermarti automaticamente al minimo se hai ancora margine. Se raggiungi lo sforzo previsto prima del minimo, riduci il carico nella serie successiva.';
        if(c.kind==='reps'&&c.close)text+=' Manca poco. Cerca di chiudere tutte le serie al limite alto; fermati prima se raggiungi l’RPE previsto.';
        if(c.kind==='increase'&&c.largeJump)text+=' Il salto di peso è consistente: la riuscita va verificata durante la seduta.';
        if(c.kind==='reduce_reps')text+=' Verifica lo sforzo effettivo: una ripetizione in meno non garantisce l’RPE previsto. Se è ancora troppo alto al minimo del range, riduci il carico.';
    }
    const detail=text.slice(action.length)+(c.warning?' '+c.warning:'');
    return {...entry,text:lead+action+detail,lead,action,detail,labelSeries:false};
}

export function exerciseCoachModel(ex,{prefills=[],readOnly=false,liveAdvice=null,
    nextExposureAdvice=null,crossExposureAdvice=null,nextRepAdvice=null,historySource=null}={}) {
    const count=Math.max(ex.loggedSets?.length||0,ex.sets?.length||0,ex.coachSetProposals?.length||0);
    const indices=Array.from({length:count},(_,i)=>i).filter(i=>pending(ex,i));
    const hasLoad=indices.length>0 && indices.every(i=>number(prefills[i]?.weight ?? ex.loggedSets?.[i]?.weight ?? ex.coachSetProposals?.[i]?.weight)!==null);
    const instructions=exerciseInstructionNotes(ex,{hasLoad:readOnly?true:hasLoad});
    const groups=new Map();
    const bodyMetadata=bodyweightMetadata(ex),bodyweight=bodyMetadata!==null;
    const add=(text,index=null,severity='info',change=null)=>{
        if(!clean(text))return;
        const k=(change?'':key(text))+JSON.stringify(change),entry=groups.get(k)||{text,series:[],severity,...(change?{change}:{})};
        if(severity==='caution')entry.severity=severity;
        if(index!==null)entry.series.push(index+1);
        groups.set(k,entry);
    };
    const references=new Map();
    if(!readOnly && !isExerciseSkipped(ex) && !ex.isWarmup && !ex.isExcluded && !ex.is_excluded){
        for(const i of indices){
            const p=ex.coachSetProposals?.[i];if(!p||specialSeries(ex,i))continue;
            const reference=p.basedOn?.[0];
            const previous=(ex.loggedSets||[]).slice(0,i).filter(s=>confirmed(s)&&!warm(s)).at(-1);
            const today=['today','increase_today','reduce_today','reduce_reps_today','today_estimate','prescribed_step'].includes(p.kind);
            const origin=today?previous:reference;
            const kg=number(origin?.weight),reps=number(origin?.reps);
            const weightChanged=(!bodyweight||bodyMetadata.loadable)&&kg!==null && number(p.weight)!==null && Math.abs(number(p.weight)-kg)>.001;
            const repsChanged=reps!==null && number(p.reps)!==null && number(p.reps)!==reps;
            const loadProblem=!bodyweight&&/non componibile|non è componibile/i.test(p.reason||'');
            const recoveryMessage=conciseReason(p.reason).match(/(?:Recupero precedente|Tecnica diversa:)[\s\S]*$/)?.[0]||(/recuper[oi] divers[oi]/i.test(p.reason||'')?'Recupero diverso: verifica il riferimento prima di trasferire la progressione.':'');
            const recoveryChanged=Boolean(recoveryMessage);
            const caution=p.kind==='pain_caution' || p.kind==='reduce_today'||p.kind==='bodyweight_reduce_reps'||p.kind==='reduce_reps_today'||p.kind==='reduce_reps_history';
            const update=p.kind==='bodyweight_add_load'||(['increase_load','increase_today','build_reps','estimated_history','today_estimate','calibration_reference'].includes(p.kind) || p.kind==='today'&&/Margine di sforzo/.test(p.reason||'')) && (weightChanged||repsChanged);
            const calibration=number(p.weight)===null && p.kind!=='pain_caution' && !hasLoad;
            if(caution||loadProblem||update||calibration||recoveryChanged){
                const shown=prefills[i]??ex.loggedSets?.[i]??{};
                const manual=['weight','reps','rpe'].some(field=>number(p[field])!==null&&number(shown[field])!==null&&number(shown[field])!==number(p[field]));
                const warning=loadProblem?clean(p.reason).match(/Carico teorico non componibile[^.]*(?:\.|$)(?:\s*Alternativa[^.]*(?:\.|$))?/i)?.[0]||'Il carico proposto non risulta componibile con l’inventario dichiarato.':'';
                let change=null;
                if(number(p.weight)!==null&&number(p.reps)!==null){
                    if(repsChanged&&number(p.reps)>reps&&!weightChanged)change={kind:'reps',delta:number(p.reps)-reps,weight:p.weight,reps:p.reps,manual};
                    else if(['increase_load','increase_today'].includes(p.kind))change={kind:'increase',weight:p.weight,reps:p.reps,today,manual,basis:p.progressionBasis};
                    else if(['reduce_reps_today','reduce_reps_history'].includes(p.kind))change={kind:'reduce_reps',weight:p.weight,reps:p.reps,today,manual};
                    else if(p.kind==='reduce_today')change={kind:'reduce',weight:p.weight,reps:p.reps,manual};
                    else if(p.kind==='calibration_reference')change={kind:'calibration',weight:p.weight,reps:p.reps,manual,pending:/provvisorio/.test(p.reason||'')};
                    else if(update&&!bodyweight)change={kind:'estimate',weight:p.weight,reps:p.reps,today,manual};
                }
                if(change){
                    const targetPrescription=setPrescription(ex,i);
                    change.bodyweight=bodyweight;change.rpe=p.rpe??targetPrescription.rpe?.max??null;
                    change.minReps=targetPrescription.reps?.min??p.reps;change.maxReps=targetPrescription.reps?.max??p.reps;
                    change.close=/chiudere tutte le serie/.test(p.reason||'');
                    change.largeJump=!bodyweight&&kg>0&&Number(p.weight)/kg>1.10;
                }
                const target=p.kind!=='bodyweight_add_load'&&number(p.weight)!==null
                    ? `${decimal(p.weight)} kg${number(p.reps)!==null?' × '+p.reps+' reps':''}. ` : '';
                const description=conciseReason(p.reason).replace(warning,'').replace(recoveryMessage,'').replace(/Recuper[oi] divers[oi]:[^.]*(?:\.|$)/i,'').trim();
                if(change||caution||calibration||!recoveryChanged&&!loadProblem)add(target+description,i,caution?'caution':'info',change);
                if(loadProblem)add(warning,i,'caution');
                if(recoveryChanged)add(recoveryMessage);
                for(const item of p.basedOn||[])if(item?.source&&sourceKey(item.source)!==sourceKey(historySource))references.set(sourceKey(item.source),referenceLabel(item));
            }
            if(p.monitoring && /in calo/i.test(p.monitoring))add(p.monitoring,null,'caution');
        }
        if(!ex.coachSetProposals){
            for(const note of ex.coachAdaptiveNotes||[]){
                if(!routineCoachText(note))add(note);
            }
            if(nextExposureAdvice && (nextExposureAdvice.kind!=='maintain' || nextExposureAdvice.restChanged || nextExposureAdvice.suppressLoad)){
                add((nextExposureAdvice.weight?decimal(nextExposureAdvice.weight)+' kg. ':'')+conciseReason(nextExposureAdvice.reason));
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
                    let message=clean(liveAdvice.message);
                    for(const p of ex.coachSetProposals||[])if(p?.reason)message=message.replace(p.reason,'');
                    message=conciseReason(message);
                    message=message.replace(/Esercizio completato; registra il risultato e valuta il prossimo\./g,'').trim();
                    add(message,null,liveAdvice.severity);
                }
        }
    }
    return {instructions,updates:[...groups.values()].map(appliedChange),references:[...references.values()]};
}

