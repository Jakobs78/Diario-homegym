import {excludedFromCoaching} from './setReview.js';
/** Read-only block review. Tolerances are software rules, not biological cutoffs. */
import {isExerciseSkipped} from '../js/sessionSkip.js';
import {isWarmupExercise,isWarmupSet,plannedWorkSetCount} from '../js/workoutSemantics.js';
import {validateCompletedSet} from './liveCoach.js';
import {exerciseIdentity} from './exerciseIdentity.js';
import {setPrescription} from './setPrescription.js';
import {specialSeries} from './seriesTechnique.js';
import {performanceTimestamp} from './recentEvidence.js';
import {validateSessionCheckin} from './sessionReadiness.js';
import {contributionsForExercise,emptyMuscleVolumes,TRACKED_MUSCLES} from './volumeAccounting.js';

const round=n=>Math.round(n*100)/100;
const confirmed=s=>s?.isLocked===true||s?.completed===true;
export const ANALYSIS_METHOD='confirmed_matched_series_v1';
export const ANALYSIS_LABELS={improving:'Miglioramento osservato',stable:'Prestazione stabile',
    declining:'Calo ripetuto',decline_observed:'Calo da verificare',insufficient_data:'Dati insufficienti'};
export const muscleLabel=m=>({Back_Lats:'Dorsali (ampiezza)',Back_Thickness:'Dorso (spessore)'}[m]||m);

/** Shared counting rules across screen, dossier and PDF. No mutation. */
export function analysisExerciseRows(ex){
    const count=plannedWorkSetCount(ex);
    const logs=Array.isArray(ex?.loggedSets)?ex.loggedSets:Array.isArray(ex?.sets)?ex.sets:[];
    const valid=[],invalid=[];
    logs.forEach((set,index)=>{
        if(isWarmupSet(set)||isWarmupSet(ex.sets?.[index])||!confirmed(set))return;
        const record=validateCompletedSet(set,ex,set);
        if(!record.ok){invalid.push(index);return;}
        if(valid.length<count)valid.push({index,set,...record,target:setPrescription(ex,index)});
    });
    const skipped=isExerciseSkipped(ex)?Math.max(0,count-valid.length-invalid.length):0;
    return {planned:count,valid,invalid,skipped,missing:Math.max(0,count-valid.length-skipped-invalid.length)};
}

// Normalize only unambiguous units; ambiguous text remains distinct.
export function analysisRest(ex){
    const text=String(ex?.restTime??ex?.rest??ex?.recupero??'').trim().toLowerCase().replace(',','.');
    const clock=text.match(/^(\d+):([0-5]\d)$/);
    if(clock)return String(Number(clock[1])*60+Number(clock[2]));
    const m=text.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secondi|seconds|min|minuti|minutes|m|['’]|["”])?$/);
    return m?String(Number(m[1])*(/^(min|minuti|minutes|m|['’])$/.test(m[2]||'')?60:1)):text;
}
function monday(stamp){
    if(stamp===null)return null;
    const d=new Date(stamp);d.setUTCHours(0,0,0,0);
    d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
    return d.toISOString().slice(0,10);
}
function sample(ex,day,week,rows){
    if(isExerciseSkipped(ex)||week.isDeloadWeek||week.isDeload||!rows.planned||rows.valid.length!==rows.planned||rows.invalid.length)return null;
    const valid=rows.valid;
    if(valid.some(r=>excludedFromCoaching(r.set)))return null;
    if(valid.some(r=>r.technique||specialSeries(ex,r.index,r.set)))return null;
    const dates=valid.map(r=>performanceTimestamp(r.set,day));
    const calendar=dates.map(monday);
    if(calendar.some(w=>!w||w!==calendar[0]))return null;
    const station=valid.map(r=>r.set.equipmentSnapshot?.station??null);
    const preceding=(day.exercises||[]).slice(0,(day.exercises||[]).indexOf(ex)).filter(e=>!isWarmupExercise(e)).map(exerciseIdentity);
    const group=ex.groupType?(day.exercises||[]).filter(e=>e.groupType===ex.groupType&&e.groupBase===ex.groupBase).map(exerciseIdentity):[];
    const signature=JSON.stringify([preceding,group,analysisRest(ex),ex.equipment??ex.catalogMapping?.equipment??null,
        ex.variant??null,ex.groupType??null,station,valid.map(r=>[r.index,r.target.role,r.target.reps,r.target.rpe])]);
    return {signature,weekNumber:week.weekNumber,calendarWeek:calendar[0],stamp:Math.max(...dates),
        kg:Math.min(...valid.map(r=>r.weight)),minReps:Math.min(...valid.map(r=>r.numericReps)),
        rows:valid.map(r=>({setNumber:r.index+1,role:r.target.role,kg:r.weight,reps:r.numericReps,rpe:r.rpe})),
        contextKnown:/^\d+(?:\.\d+)?$/.test(analysisRest(ex))&&valid.every(r=>r.target.reps&&r.target.rpe)};
}
function compare(first,last){
    if(first.signature!==last.signature)return {status:'insufficient_data',reason:'Prescrizioni, recuperi, ruoli o attrezzatura diversi.'};
    if(first.rows.some((r,i)=>r.rpe===null||last.rows[i].rpe===null||Math.abs(last.rows[i].rpe-r.rpe)>.5))
        return {status:'insufficient_data',reason:'RPE effettivi mancanti o differenti oltre 0,5: sforzo non equivalente.'};
    const pairs=first.rows.map((r,i)=>({a:r,b:last.rows[i]}));
    const sameKg=pairs.every(({a,b})=>Math.abs(a.kg-b.kg)<.01);
    const sameReps=pairs.every(({a,b})=>a.reps===b.reps);
    const gains=pairs.every(({a,b})=>b.kg>=a.kg&&b.reps>=a.reps)&&pairs.some(({a,b})=>b.kg>a.kg||b.reps>a.reps);
    const falls=pairs.every(({a,b})=>b.kg<=a.kg&&b.reps<=a.reps)&&pairs.some(({a,b})=>b.kg<a.kg||b.reps<a.reps);
    const status=!first.contextKnown||!last.contextKnown?'insufficient_data':gains?'improving':falls?'decline_observed':sameKg&&sameReps?'stable':'insufficient_data';
    return {status,metric:sameKg?'repetitions_at_same_load':'different_loads',
        deltaReps:sameKg?last.minReps-first.minReps:null,
        reason:!first.contextKnown||!last.contextKnown?'Recupero o target incompleti: confronto descrittivo, senza giudizio di progresso.':
            status==='insufficient_data'?'Carichi e reps cambiano in direzioni diverse: nessun giudizio univoco.':
            'Confronto delle stesse serie, prescrizioni e recuperi; RPE effettivi entro 0,5 (tolleranza del metodo).'};
}
function addMuscles(target,name,count){
    const credit=contributionsForExercise(name,count);if(!credit)return;
    for(const [m,n] of Object.entries(credit.direct))target[m].directSets+=n;
    for(const [m,n] of Object.entries(credit.indirect))target[m].indirectSetCredits+=n;
    for(const v of Object.values(target))v.fractionalSets=v.directSets+v.indirectSetCredits;
}
function volumeWeek(week){
    const planned=emptyMuscleVolumes(),performed=emptyMuscleVolumes(),skipped=emptyMuscleVolumes();
    let plannedSets=0,performedSets=0,skippedSets=0,invalidSets=0,unclassifiedSets=0;
    for(const day of week.days||[])for(const ex of day.exercises||[]){
        if(isWarmupExercise(ex))continue;
        const r=analysisExerciseRows(ex),name=ex.catalogMapping?.confirmed?ex.catalogMapping.name:ex.name;
        plannedSets+=r.planned;performedSets+=r.valid.length;skippedSets+=r.skipped;invalidSets+=r.invalid.length;
        if(!contributionsForExercise(name,r.planned))unclassifiedSets+=r.planned;
        addMuscles(planned,name,r.planned);addMuscles(performed,name,r.valid.length);addMuscles(skipped,name,r.skipped);
    }
    return {weekNumber:week.weekNumber,isDeload:Boolean(week.isDeloadWeek||week.isDeload),
        plannedSets,performedSets,skippedSets,missingSets:Math.max(0,plannedSets-performedSets-skippedSets-invalidSets),invalidSets,unclassifiedSets,
        complete:plannedSets>0&&performedSets+skippedSets===plannedSets&&!invalidSets,planned,performed,skipped};
}
export function buildMesocycleAnalysis(mesocycle){
    const weeks=[...(mesocycle?.weeks||[])].sort((a,b)=>Number(a.weekNumber)-Number(b.weekNumber));
    const volumeWeeks=weeks.map(volumeWeek),byExercise=new Map();
    let reportedDifficulties=0,normalCheckins=0,validCheckins=0;
    for(const week of weeks)for(const day of week.days||[]){
        const check=validateSessionCheckin(day.coachCheckin);
        const stamp=performanceTimestamp({performedAt:day.coachCheckin?.checkedAt},day);
        const dayStamps=(day.exercises||[]).flatMap(ex=>analysisExerciseRows(ex).valid.map(r=>performanceTimestamp(r.set,day))).filter(s=>s!==null);
        // A historical check-in describes its own dated session, never today's readiness.
        if(check.ok&&stamp!==null&&dayStamps.some(s=>new Date(s).toISOString().slice(0,10)===new Date(stamp).toISOString().slice(0,10))){
            validCheckins++;
            if(check.data.sleep==='poor'||check.data.energy==='low'||check.data.soreness==='high'||check.data.pain==='present')reportedDifficulties++;
            else normalCheckins++;
        }
        for(const ex of day.exercises||[]){
            if(isWarmupExercise(ex))continue;
            const key=exerciseIdentity(ex);if(!key)continue;
            if(!byExercise.has(key))byExercise.set(key,{key,name:ex.name,confirmedSets:0,samples:[]});
            const item=byExercise.get(key),r=analysisExerciseRows(ex);
            item.confirmedSets+=r.valid.length;
            const point=sample(ex,day,week,r);if(point)item.samples.push(point);
        }
    }
    const exercises=[...byExercise.values()].map(item=>{
        const points=item.samples.sort((a,b)=>a.stamp-b.stamp);
        const groups=new Map();
        for(const p of points){if(!groups.has(p.signature))groups.set(p.signature,new Map());groups.get(p.signature).set(p.calendarWeek,p);}
        // Compare within the latest context only; never hide a changed final prescription.
        const latest=points.at(-1),matched=latest?[...groups.get(latest.signature).values()].sort((a,b)=>a.stamp-b.stamp):[];
        let result={status:'insufficient_data',reason:points.length>1?'Condizioni cambiate o settimane reali confrontabili insufficienti.':'Servono almeno due settimane reali con serie complete e confrontabili.'};
        if(matched.length>=2){
            const first=matched[0],last=matched.at(-1),change=compare(first,last);
            result={...change,firstWeek:first.weekNumber,lastWeek:last.weekNumber,firstKg:first.kg,lastKg:last.kg,
                firstMinReps:first.minReps,lastMinReps:last.minReps,firstRows:first.rows,lastRows:last.rows};
            if(change.status==='decline_observed'&&matched.length>=3){
                const recent=matched.slice(-3);
                if(compare(recent[0],recent[1]).status==='decline_observed'&&compare(recent[1],recent[2]).status==='decline_observed')result.status='declining';
            }
        }
        const conditionsChanged=new Set(points.map(p=>p.signature)).size>1;
        return {key:item.key,name:item.name,confirmedSets:item.confirmedSets,...result,label:ANALYSIS_LABELS[result.status],
            evidenceWeeks:matched.length,conditionsChanged,
            contextNote:conditionsChanged?'Altre esposizioni hanno condizioni diverse e sono escluse dal confronto.':null};
    });
    const completeRegular=volumeWeeks.filter(w=>w.complete&&!w.isDeload);
    const first=completeRegular[0],last=completeRegular.at(-1);
    const muscles=TRACKED_MUSCLES.map(m=>({muscle:m,title:muscleLabel(m),
        averagePlannedDirect:weeks.length?round(volumeWeeks.reduce((n,w)=>n+w.planned[m].directSets,0)/weeks.length):null,
        averagePerformedDirect:completeRegular.length?round(completeRegular.reduce((n,w)=>n+w.performed[m].directSets,0)/completeRegular.length):null,
        averageIndirectCredits:completeRegular.length?round(completeRegular.reduce((n,w)=>n+w.performed[m].indirectSetCredits,0)/completeRegular.length):null,
        indirectChange:completeRegular.length>=2?last.performed[m].indirectSetCredits-first.performed[m].indirectSetCredits:null,
        directChange:completeRegular.length>=2?last.performed[m].directSets-first.performed[m].directSets:null,
        plannedDirectChange:completeRegular.length>=2?last.planned[m].directSets-first.planned[m].directSets:null}));
    const suggestions=exercises.map(ex=>({key:ex.key,name:ex.name,
        action:ex.status==='improving'?'maintain_effective_volume':ex.status==='declining'&&reportedDifficulties>=2?'review_reduction':
            ex.status==='stable'&&ex.evidenceWeeks>=3&&normalCheckins>=2&&!reportedDifficulties&&volumeWeeks.every(w=>w.complete&&!w.skippedSets)?'consider_targeted_increase':'review_data',
        text:ex.status==='improving'?'Mantieni il volume che sta funzionando; non occorre aggiungere serie automaticamente.':
            ex.status==='declining'&&reportedDifficulties>=2?'Calo ripetuto e difficoltà riferite nel mesociclo: verifica se coincidono prima di proporre una riduzione mirata o uno scarico. Nessuna causa attribuita automaticamente.':
            ex.status==='stable'&&ex.evidenceWeeks>=3&&normalCheckins>=2&&!reportedDifficulties&&volumeWeeks.every(w=>w.complete&&!w.skippedSets)?'Se il tempo disponibile lo consente, valuta un piccolo aumento mirato nel prossimo mesociclo. Stabilità non significa necessariamente stallo.':
            ex.status==='decline_observed'?'Un confronto in calo non basta: verifica andamento, tecnica e recupero prima di cambiare il volume.':
            ex.status==='declining'?'Calo ripetuto: controlla tecnica, aderenza e recupero. I dati non ne stabiliscono la causa.':
            'Verifica dati e recupero prima di aumentare o ridurre le serie.'}));
    return {method:ANALYSIS_METHOD,exercises,volumeWeeks,muscles,suggestions,
        recovery:{validCheckins,reportedDifficulties,normalCheckins},completeRegularWeeks:completeRegular.length,
        volumeComparison:first&&last&&first!==last?{firstWeek:first.weekNumber,lastWeek:last.weekNumber}:null,
        notice:'Più volume non significa automaticamente più risultati. Medie eseguite e variazioni usano solo settimane concluse non di scarico; le settimane parziali restano visibili. Crediti indiretti: convenzione 0,5, non altre serie fisiche. Le proposte riguardano il prossimo mesociclo: in quello attivo cambiano solo carichi, reps e note.'};
}

export function formatAnalysisLines(analysis){
    if(!analysis)return [];
    const lines=['ANDAMENTO DEGLI ESERCIZI (osservazioni, non misure di ipertrofia):'];
    for(const ex of analysis.exercises){lines.push(ex.name+': '+ex.label+'. '+(ex.firstWeek!==undefined?'Sett. '+ex.firstWeek+': '+ex.firstKg+' kg × minimo '+ex.firstMinReps+' reps → sett. '+ex.lastWeek+': '+ex.lastKg+' kg × minimo '+ex.lastMinReps+' reps. ':'')+ex.reason+(ex.contextNote?' '+ex.contextNote:''));
        for(const [i,row] of (ex.firstRows||[]).entries()){const last=ex.lastRows[i];lines.push('Serie '+row.setNumber+' ('+row.role+'): '+row.kg+' kg × '+row.reps+' @'+row.rpe+' → '+last.kg+' kg × '+last.reps+' @'+last.rpe+'.');}
    }
    lines.push('VOLUME PER SETTIMANA (dirette e crediti indiretti separati):');
    for(const week of analysis.volumeWeeks){
        lines.push('Sett. '+week.weekNumber+(week.isDeload?' [SCARICO]':'')+': '+week.performedSets+'/'+week.plannedSets+' serie eseguite, '+week.skippedSets+' saltate, '+week.missingSets+' mancanti'+(week.complete?' · conclusa.':' · incompleta, nessuna inferenza di calo.'));
        for(const m of TRACKED_MUSCLES){const p=week.planned[m],v=week.performed[m];if(p.fractionalSets||v.fractionalSets)lines.push(muscleLabel(m)+': dirette '+v.directSets+'/'+p.directSets+' previste; crediti indiretti '+v.indirectSetCredits+'/'+p.indirectSetCredits+' previsti.');}
    }
    lines.push('MEDIE SETTIMANALI E VARIAZIONI (non confrontare totali di cicli di durata diversa):');
    for(const m of analysis.muscles){if(!m.averagePlannedDirect&&!m.averagePerformedDirect&&!m.averageIndirectCredits)continue;lines.push(m.title+': dirette previste/settimana '+(m.averagePlannedDirect??'n.d.')+' (tutte le settimane); eseguite '+(m.averagePerformedDirect??'n.d.')+' e crediti indiretti '+(m.averageIndirectCredits??'n.d.')+' (solo settimane concluse non di scarico)'+(m.directChange===null?' · variazione non valutabile.':' · variazione dirette '+(m.directChange>0?'+':'')+m.directChange+'; crediti indiretti '+(m.indirectChange>0?'+':'')+m.indirectChange+'; variazione dirette prevista '+(m.plannedDirectChange>0?'+':'')+m.plannedDirectChange+'.'));}
    lines.push('PROPOSTE PER IL PROSSIMO MESOCICLO (da valutare, non applicate):');
    for(const s of analysis.suggestions)lines.push(s.name+': '+s.text);
    lines.push('Check-in storici pertinenti: '+analysis.recovery.validCheckins+'; difficoltà riferite: '+analysis.recovery.reportedDifficulties+'. Senza check-in non viene stimato il recupero.',analysis.notice);
    return lines;
}
