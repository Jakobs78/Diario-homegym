import {bodyweightMetadata} from './bodyweight.js';
import {setPrescription,observed,blockKey,warm} from './setPrescription.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** External kg only: body mass is not guessed and never enters an e1RM formula. */
export function bodyweightWorkingProposal(ex,index,{evidence=[],readiness=null,allowProgression=true,contextUnchanged=true}={}){
    const meta=bodyweightMetadata(ex);if(!meta)return null;
    const p=setPrescription(ex,index),reference=evidence[0]?.match;
    const prescribed=p.kg?.min;
    let kg=prescribed>0?prescribed:meta.unloaded||prescribed===0?0:reference?.kg??0;
    let reps=p.reps?.min??null,kind='bodyweight_reference';
    let reason='Esegui a corpo libero: registra 0 kg se non usi un sovraccarico.';
    if(reference&&p.reps){
        reps=Math.max(p.reps.min,Math.min(p.reps.max,reference.reps));
        const source=evidence[0].exercise;
        const count=Math.max(source.sets?.length||0,source.loggedSets?.length||0,parseInt(source.setsCount??source.set,10)||0);
        const indices=Array.from({length:count},(_,i)=>i).filter(i=>!warm(source.sets?.[i])&&!warm(source.loggedSets?.[i])&&blockKey(setPrescription(source,i))===blockKey(reference.prescription));
        const sets=indices.map(i=>observed(source,i));
        const equivalent=same(p.reps,reference.prescription.reps)&&same(p.rpe,reference.prescription.rpe)&&p.role===reference.prescription.role;
        const ready=readiness?.allowIncrease!==false&&readiness?.level!=='stop';
        if(allowProgression&&contextUnchanged&&equivalent&&ready&&!ex.isDeload&&!ex.isDeloadWeek&&
            p.reps.min<p.reps.max&&sets.length&&sets.every(s=>s&&!s.prescription.special&&s.rpe!==null&&s.rpe<=p.rpe.max&&s.reps>=p.reps.min&&s.reps<=p.reps.max)){
            const next=sets.find(s=>s.reps<p.reps.max);
            if(next?.index===reference.index){reps=Math.min(p.reps.max,reps+1);kind='build_reps';reason='Propongo una ripetizione in più in questa serie, entro il range e l’RPE previsti. Il carico esterno resta invariato.';}
        }
    }
    const today=(ex.loggedSets||[]).slice(0,index).map((_,i)=>observed(ex,i)).filter(Boolean).at(-1);
    if(today&&p.reps&&same(p.reps,today.prescription.reps)&&same(p.rpe,today.prescription.rpe)&&p.role===today.prescription.role){
        kg=prescribed>0?prescribed:meta.unloaded||prescribed===0?0:today.kg;
        if(!reference)reps=Math.max(p.reps.min,Math.min(p.reps.max,today.reps));
        kind='bodyweight_reference';
        if(today.rpe!==null&&p.rpe&&today.rpe>p.rpe.max+.5){reps=Math.max(p.reps.min,Math.min(reps,today.reps-1));kind='bodyweight_reduce_reps';reason='La serie precedente è risultata più difficile del target: propongo meno ripetizioni entro il range, senza modificare il carico esterno.';}
    }
    if(readiness?.level==='stop')return {weight:null,reps,rpe:p.rpe?.max??null,kind:'pain_caution',reason:'Dolore segnalato: rivaluta il movimento prima di proseguire.',loadMode:'bodyweight',basedOn:[]};
    return {weight:kg,reps,rpe:p.rpe?.max??null,kind,reason,loadMode:'bodyweight',range:null,verified:true,stableE1rm:null,monitoring:null,
        basedOn:evidence.map(item=>({source:item.source??null,date:item.date??null,series:item.match.index,weight:item.match.kg,reps:item.match.reps,rpe:item.match.rpe,seriesEvidence:item.sets.map(s=>({index:s.index,kg:s.kg,reps:s.reps,rpe:s.rpe}))}))};
}
