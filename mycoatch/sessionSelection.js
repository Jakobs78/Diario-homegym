/**
 * Selezione time-first degli accessori.
 *
 * Protegge gli anchor e i due primi movimenti, poi sceglie gli accessori
 * compatibili per copertura settimanale, priorità dichiarata, continuità e
 * recupero. Ogni aggiunta è accettata SOLTANTO se non forza tagli a serie o
 * esercizi già scelti. Tutte le stime usano il medesimo timer della webapp.
 * I numeri sono punteggi trasparenti per ordinare, non misure di crescita.
 */
import { optimizeSession } from './groupOptimizer.js';
import { canonicalExerciseKey } from './exerciseIdentity.js';

const MAX_DAILY_EXERCISES = 6;
const MIN_WEEKLY_DIRECT_FOR_COVERAGE = 4;
const projectedSets = (byMuscle, muscle) =>
    Math.max(0, Number(byMuscle?.[muscle]) || 0);

function isProtected(exercise, index) {
    return index < 2 || Boolean(exercise.anchorKey) || Boolean(exercise.priorityProtected);
}

function scoreAccessory(ex, index, {
    focusMuscleGroup = null, scheduledWeeklySets = {}, history = {}
} = {}) {
    const focus = Boolean(focusMuscleGroup && ex.category === focusMuscleGroup);
    const scheduled = projectedSets(scheduledWeeklySets, ex.category);
    const muscleHistory = history.byMuscle?.[ex.category] || {};
    const observed = Number(muscleHistory.avgWeeklyFractionalSets);
    const observedLow = Number.isFinite(observed) && observed > 0 && observed < 9;
    const personal = history.byExercise?.[canonicalExerciseKey(ex.name)] || {};
    let score = ex.pattern === 'isolation' ? 54 : 78;
    if (ex.isOptional) score -= 24;
    if (focus) score += 50;
    // Il giorno precedente puo' aver gia' programmato lavoro per lo stesso
    // distretto. La copertura diretta e' valutata separata da quella indiretta.
    if (scheduled < MIN_WEEKLY_DIRECT_FOR_COVERAGE) score += 23;
    score -= Math.min(36, scheduled * 4);
    if (observedLow && !personal.fatigueConcern) score += 8;
    if (personal.fatigueConcern) score -= 30;
    if (personal.status === 'progressing') score += 7;
    if (personal.status === 'possible_stall') score -= 8;
    // Posizione come tie-break soltanto; non come definizione della priorità.
    return { score, index, exercise: ex,
        reason: focus ? 'distretto dichiarato prioritario' :
            scheduled < MIN_WEEKLY_DIRECT_FOR_COVERAGE
                ? 'copertura diretta settimanale ancora bassa'
                : ex.isOptional ? 'complementare facoltativo'
                    : 'completamento dello schema motorio e del volume' };
}

function planPreservesProtected(reference, proposal) {
    // Un accessorio può far risparmiare tempo solo con un diverso assetto
    // degli accessori, MA non può imporre ulteriori tagli ai fondamentali.
    return reference.every(core => {
        const retained = proposal.find(ex =>
            canonicalExerciseKey(ex.name) === canonicalExerciseKey(core.name));
        return retained && retained.setsCount >= core.setsCount;
    });
}

function planUtility(plan, candidates, basePlan) {
    const scores = candidates.reduce((total,candidate) => {
        const actual = plan.exercises.find(ex =>
            canonicalExerciseKey(ex.name) ===
            canonicalExerciseKey(candidate.exercise.name));
        if (!actual) return Number.NEGATIVE_INFINITY;
        // Ogni distretto effettivamente presente vale più dell'ennesima
        // serie del medesimo accessorio. Volume sacrificato => costo esplicito.
        const missingSets = Math.max(0,candidate.exercise.setsCount-actual.setsCount);
        return total + candidate.score + 10 +
            Math.max(0,actual.setsCount-2)*4 - missingSets*7;
    },0);
    const extraCoreCuts = Math.max(0,(plan.reducedPrioritySets||0) -
        (basePlan.reducedPrioritySets||0));
    return scores - extraCoreCuts*1000;
}

export function selectExercisesForTime(exercises, maxSessionMinutes, options = {}) {
    if (!Array.isArray(exercises) || exercises.length < 2) {
        throw new Error('MyCoatch: selezione esercizi incompleta.');
    }
    const positions=new Map(exercises.map((ex,i)=>[canonicalExerciseKey(ex.name),i]));
    const protectedExercises=exercises.filter(isProtected);
    if (protectedExercises.length < 2) {
        throw new Error('MyCoatch: servono almeno due movimenti prioritari.');
    }

    // Il nucleo obbligatorio viene programmato per primo. Se non basta il
    // tempo, l'ottimizzatore può ridurne le serie, MA non cancellarlo.
    const optimizerOptions={allowGrouping:options.allowGrouping!==false,
        excludedGroupingMuscles:options.excludedGroupingMuscles || []};
    const basePlan=optimizeSession(protectedExercises,maxSessionMinutes,optimizerOptions);
    const ranking=exercises.map((ex,index)=>({ex,index}))
        .filter(({ex,index})=>!isProtected(ex,index))
        .map(({ex,index})=>scoreAccessory(ex,index,options))
        .sort((a,b)=>b.score-a.score || a.index-b.index);

    // Massimo 4 complementari in una seduta da 6 esercizi: enumerare i
    // sottogruppi (<=16 casi), anziché scegliere con un greedy che può
    // impedire una superserie utile o escludere un distretto prioritario.
    let bestPlan=basePlan;
    let bestCandidates=[];
    let bestScore=0;
    for(let mask=1;mask<(1<<ranking.length);mask++) {
        const included=ranking.filter((_,index)=>(mask & (1<<index))!==0);
        if(protectedExercises.length+included.length>MAX_DAILY_EXERCISES) continue;
        const proposal=[...protectedExercises,...included.map(x=>x.exercise)]
            .sort((a,b)=>positions.get(canonicalExerciseKey(a.name))-
                positions.get(canonicalExerciseKey(b.name)));
        let trial;
        try { trial=optimizeSession(proposal,maxSessionMinutes,optimizerOptions); }
        catch { continue; }
        // Escludi le combinazioni che perderebbero un accessorio intero
        // oppure richiederebbero di sacrificare ancora il lavoro cardine.
        if(trial.exercises.length!==proposal.length ||
            !planPreservesProtected(basePlan.exercises,trial.exercises)) continue;
        const score=planUtility(trial,included,basePlan);
        if(score>bestScore || (score===bestScore &&
            trial.estimatedSeconds<bestPlan.estimatedSeconds)){
            bestScore=score;
            bestPlan=trial;
            bestCandidates=included;
        }
    }

    const selectedKeys=new Set(bestCandidates.map(c=>
        canonicalExerciseKey(c.exercise.name)));
    return {
        ...bestPlan,
        selectionAudit:{
            strategy:'time_first_protected_core_coverage_score_v1',
            timeBudgetMinutes:maxSessionMinutes,
            protected:protectedExercises.map(x=>x.name),
            selectedAccessories:bestCandidates.map(candidate=>{
                const real=bestPlan.exercises.find(x=>
                    canonicalExerciseKey(x.name)===
                    canonicalExerciseKey(candidate.exercise.name));
                return {
                    exercise:candidate.exercise.name,
                    muscle:candidate.exercise.category,
                    score:candidate.score,
                    reason:candidate.reason,
                    sets:real.setsCount
                };
            }),
            excludedAccessories:ranking.filter(c=>
                !selectedKeys.has(canonicalExerciseKey(c.exercise.name)))
                .map(c=>({
                    exercise:c.exercise.name,muscle:c.exercise.category,
                    reason:'non prioritario entro il tempo e la copertura disponibili'
                })),
            estimatedMinutes:bestPlan.estimatedMinutes
        }
    };
}

export function registerSelectedWeeklySets(totals, exercises) {
    for(const ex of exercises || []) {
        if(!ex.category) continue;
        totals[ex.category] = projectedSets(totals, ex.category) +
            Math.max(0,Number(ex.setsCount)||0);
    }
    return totals;
}

/**
 * Slot opzionale per specializzazione: soltanto dove lo split permette un
 * accessorio compatibile, entro 6 slot e su sedute abbastanza lunghe.
 * Se manca attrezzatura il selettore lo riporta, senza inventare attrezzi.
 */
export function addFocusAccessorySlot(slots, {
    dayName = '', focusMuscleGroup = null, maxSessionMinutes = 60
} = {}) {
    if (!Array.isArray(slots) || slots.length >= MAX_DAILY_EXERCISES ||
        !Number.isFinite(Number(maxSessionMinutes)) || maxSessionMinutes < 75 ||
        !focusMuscleGroup) return [...(slots || [])];

    const upper = /^Upper\b/.test(dayName);
    const lower = /^Lower\b/.test(dayName);
    const upperMuscles = new Set(['Petto','Back_Lats','Back_Thickness',
        'Spalle','Bicipiti','Tricipiti']);
    const lowerMuscles = new Set(['Quadricipiti','Femorali','Glutei',
        'Polpacci','Core']);
    if ((upper && !upperMuscles.has(focusMuscleGroup)) ||
        (lower && !lowerMuscles.has(focusMuscleGroup)) ||
        (!upper && !lower)) return [...slots];

    if (slots.some(slot =>
        slot.muscle === focusMuscleGroup && slot.pattern === 'isolation')) {
        // Una seconda variante aggiunge davvero un angolo o una porzione
        // solo se il catalogo ne offre un'altra (es. deltoide posteriore).
        if (focusMuscleGroup !== 'Spalle' && focusMuscleGroup !== 'Petto') return [...slots];
    }
    const preferred = focusMuscleGroup === 'Spalle' ?
        (slots.some(s=>s.muscle==='Spalle' && s.pattern==='isolation' &&
            (s.prefer||[]).some(name=>/Posteriori|Face Pull|Reverse Fly/.test(name)))
            ? ['Alzate Laterali con Manubri','Alzate Laterali ai Cavi']
            : ['Alzate Posteriori con Manubri','Face Pull ai Cavi',
                'Reverse Fly ai Cavi']) : undefined;
    return [...slots, {
        muscle:focusMuscleGroup,pattern:'isolation',optional:true,
        ...(preferred?{prefer:preferred}:{}),
        addedForFocus:true
    }];
}
