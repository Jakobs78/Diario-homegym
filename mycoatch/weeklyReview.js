/**
 * MyCoatch: revisione tra due settimane adiacenti dello STESSO mesociclo.
 * Si basa solo su giornate concluse, serie confermate, RPE misurati e
 * check-in attribuibili alla seduta. Non modifica mai le settimane svolte,
 * non fa stime di dolore/recupero e richiede un clic esplicito.
 */
import { validateCompletedSet } from './liveCoach.js';
import { validateSessionCheckin } from './sessionReadiness.js';

const TARGET_FIELDS = ['targetRpe','rpe','minRpe','maxRpe','coachWeeklyLoadReview'];
const owned = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
const confirmed = set => set?.isLocked === true || set?.completed === true;
const warmup = set => Boolean(set?.isWarmup || set?.is_warmup || set?.warmup);
const numericRpe = value => {
    const raw=String(value??'').trim().replace(/^@/,'').replace(',','.');
    if(!/^\d+(?:\.\d+)?$/.test(raw)) return null;
    const n=Number(raw);
    return n>=6 && n<=10?n:null;
};
function formatRpe(value,old) {
    const text=String(Number(value.toFixed(1)));
    return String(old??'').trim().startsWith('@')?'@'+text:text;
}
function snapshotExercise(ex) {
    return {
        values:Object.fromEntries(TARGET_FIELDS.map(key=>[
            key,owned(ex,key)?{present:true,value:ex[key]}:{present:false}
        ])),
        sets:(ex.sets||[]).map(set=>({
            present:owned(set,'targetRpe'),
            value:set.targetRpe
        }))
    };
}
function restoreValue(object,key,entry) {
    if(entry.present) object[key]=entry.value;
    else delete object[key];
}
function matchesSourceDay(day) {
    if(day?.completed!==true || !Array.isArray(day.exercises))return false;
    return day.exercises.some(ex=>!ex.isExcluded);
}
function attributedCheckin(day) {
    const check=day?.coachCheckin;
    if(!validateSessionCheckin(check).ok || !Number.isFinite(Date.parse(check?.checkedAt||'')))return null;
    const when=String(day?.date||day?.sessionCompletedAt||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(when) ||
       String(check.checkedAt).slice(0,10)!==when)return null;
    return check;
}
function evaluateCompletedDay(day) {
    if(!matchesSourceDay(day))return null;
    let measured=0,hard=0,working=0;
    for(const ex of day.exercises){
        if(ex.isExcluded)continue;
        const sets=ex.loggedSets;
        if(!Array.isArray(sets)||!sets.length)return null;
        let valid=0;
        for(const set of sets){
            if(warmup(set))continue;
            working++;
            if(!confirmed(set))return null;
            const result=validateCompletedSet(set,ex,set);
            if(!result.ok)return null;
            valid++;
            if(result.technique||result.rpe===null)continue;
            measured++;
            const target=numericRpe(ex.targetRpe??ex.rpeTarget??ex.rpe);
            if(result.rpe>=9.5 || (target!==null && result.rpe>=target+1))hard++;
        }
        if(!valid)return null;
    }
    if(!working)return null;
    const check=attributedCheckin(day);
    const strainCheckin=check &&
        [check.sleep==='poor',check.energy==='low',check.soreness==='high']
            .filter(Boolean).length>=2;
    return {
        measured,hard,working,
        pain:Boolean(check?.pain==='present'),
        strain:Boolean(hard>=2 || (hard>=1 && strainCheckin)),
        hasCheckin:Boolean(check)
    };
}
function targetWeekStarted(week) {
    return (week?.days||[]).some(day=>
        day.completed===true || day.sessionStart ||
        (day.accumulatedSeconds||0)>0 ||
        (day.sessionArchives||[]).length>0 ||
        (day.exercises||[]).some(ex=>
            (ex.loggedSets||[]).some(confirmed)));
}
function candidateTargets(week) {
    const result=[];
    for(const [dayIndex,day] of (week?.days||[]).entries()){
        for(const [exerciseIndex,ex] of (day.exercises||[]).entries()){
            if(ex.isExcluded)continue;
            const original=ex.targetRpe??ex.rpeTarget??ex.rpe;
            const n=numericRpe(original);
            if(n===null || n<=6.5)continue; // Scarico già conservativo
            const next=Math.max(6.5,Math.round((n-0.5)*2)/2);
            if(next>=n)continue;
            result.push({
                dayIndex,exerciseIndex,name:ex.name,
                from:formatRpe(n,original),to:formatRpe(next,original)
            });
        }
    }
    return result;
}
export function reviewUpcomingWeek(mesocycle,weekNumber) {
    const none={status:'none',message:'Nessuna revisione disponibile.'};
    if(!mesocycle || !Number.isInteger(Number(weekNumber)) ||
       Number(weekNumber)<2)return none;
    const weeks=mesocycle.weeks||[];
    const source=weeks.find(w=>Number(w.weekNumber)===Number(weekNumber)-1);
    const target=weeks.find(w=>Number(w.weekNumber)===Number(weekNumber));
    if(!source||!target)return none;
    if(target.coachWeeklyReview)return {
        status:'applied',weekNumber:Number(weekNumber),
        message:'Revisione applicata su tua conferma. I carichi delle prossime serie richiedono una calibrazione prudente.',
        changes:target.coachWeeklyReview.changes||[]
    };
    if(mesocycle.locked)return {status:'locked',message:'Mesociclo in sola lettura.'};
    if(targetWeekStarted(target))return {status:'started',
        message:'La nuova settimana è già iniziata: MyCoatch non riscrive gli obiettivi in corso.'};
    if(!Array.isArray(source.days)||source.days.length<2)return none;
    const results=source.days.map(evaluateCompletedDay);
    if(results.some(r=>r===null))return {status:'incomplete',
        message:'Completa tutte le sedute della settimana precedente con serie realmente confermate per abilitare una revisione affidabile.'};
    const pain=results.some(r=>r.pain);
    if(pain)return {status:'pain',
        message:'È stato segnalato dolore in una seduta precedente. MyCoatch non presume che basti abbassare l’RPE: evita il movimento doloroso e richiedi una valutazione professionale se necessario. Nessun piano viene modificato.'};
    const measuredDays=results.filter(r=>r.measured>=2);
    const strainDays=results.filter(r=>r.strain&&r.measured>=2);
    if(measuredDays.length<2)return {status:'insufficient',
        message:'RPE realmente misurati insufficienti su giornate distinte: nessuna modifica proposta.'};
    if(strainDays.length<2)return {status:'steady',
        message:'Nessun segnale ripetuto sufficiente per modificare la prossima settimana.'};
    const changes=candidateTargets(target);
    if(!changes.length)return {status:'steady',
        message:'La settimana successiva ha già target di recupero conservativi.'};
    return {
        status:'ready',weekNumber:Number(weekNumber),
        sourceWeek:Number(source.weekNumber),
        affectedDays:strainDays.length,
        confirmedDays:results.length,
        measuredSets:results.reduce((sum,r)=>sum+r.measured,0),
        changes,
        message:'In '+strainDays.length+' giornate concluse sono emersi RPE misurati ripetutamente oltre target. '+
            'Propongo di ridurre di 0,5 punti il target RPE negli esercizi della settimana '+
            weekNumber+'. Le ripetizioni e le serie restano uguali; il carico andrà ricalibrato '+
            'sul nuovo sforzo invece di riutilizzare automaticamente i kg precedenti. '+
            'Nessuna modifica sarà applicata senza conferma.'
    };
}
export function applyUpcomingWeekReview(mesocycle,weekNumber,expectedReview) {
    const latest=reviewUpcomingWeek(mesocycle,weekNumber);
    if(latest.status!=='ready' ||
       expectedReview?.status!=='ready' ||
       JSON.stringify(latest.changes)!==JSON.stringify(expectedReview.changes) ||
       latest.affectedDays!==expectedReview.affectedDays ||
       latest.measuredSets!==expectedReview.measuredSets) {
        throw new Error('Revisione non più valida: aggiorna la scheda prima di confermare.');
    }
    const week=mesocycle.weeks.find(w=>Number(w.weekNumber)===Number(weekNumber));
    const changes=latest.changes.map(c=>{
        const ex=week.days[c.dayIndex].exercises[c.exerciseIndex];
        if(ex.name!==c.name || numericRpe(ex.targetRpe??ex.rpeTarget??ex.rpe)!==
           numericRpe(c.from))throw new Error('La scheda è cambiata: nessuna modifica applicata.');
        return {...c,original:snapshotExercise(ex)};
    });
    for(const change of changes){
        const ex=week.days[change.dayIndex].exercises[change.exerciseIndex];
        for(const key of ['targetRpe','rpe','minRpe','maxRpe']){
            if(key==='targetRpe'||key==='rpe'||owned(ex,key))
                ex[key]=formatRpe(numericRpe(change.to),ex[key]);
        }
        // Non trasformare gli RPE precompilati in misure. Sono SOLO target.
        for(const set of ex.sets||[])
            if(owned(set,'targetRpe'))set.targetRpe=formatRpe(numericRpe(change.to),set.targetRpe);
        // Vietato riproporre vecchi kg come se fossero adatti al nuovo RPE:
        // solo l'input precompilato viene lasciato vuoto, non il CSV storico.
        ex.coachWeeklyLoadReview=true;
    }
    week.coachWeeklyReview={
        version:1,sourceWeek:latest.sourceWeek,appliedAt:new Date().toISOString(),
        reason:'RPE ripetuti oltre target in '+latest.affectedDays+' giornate complete.',
        changes
    };
    return {status:'applied',changes:changes.length};
}
export function undoUpcomingWeekReview(mesocycle,weekNumber) {
    const week=mesocycle?.weeks?.find(w=>Number(w.weekNumber)===Number(weekNumber));
    const record=week?.coachWeeklyReview;
    if(!record || record.version!==1)throw new Error('Nessuna revisione da ripristinare.');
    if(mesocycle.locked||targetWeekStarted(week))
        throw new Error('La settimana è bloccata o iniziata: non posso sovrascrivere gli obiettivi.');
    for(const c of record.changes){
        const ex=week.days?.[c.dayIndex]?.exercises?.[c.exerciseIndex];
        if(!ex || ex.name!==c.name ||
            numericRpe(ex.targetRpe??ex.rpeTarget??ex.rpe)!==numericRpe(c.to) ||
            ex.coachWeeklyLoadReview!==true)
            throw new Error('Un obiettivo è stato modificato dopo la revisione: ripristino bloccato.');
    }
    for(const c of record.changes){
        const ex=week.days[c.dayIndex].exercises[c.exerciseIndex];
        for(const [key,value] of Object.entries(c.original.values))
            restoreValue(ex,key,value);
        for(const [index,saved] of c.original.sets.entries()){
            const set=ex.sets?.[index];
            if(set)restoreValue(set,'targetRpe',saved);
        }
    }
    delete week.coachWeeklyReview;
    return {status:'undone',changes:record.changes.length};
}
