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

function unchangedExisting(before, after) {
    if (after.length !== before.length + 1) return false;
    return before.every(ex => {
        const found = after.find(candidate =>
            canonicalExerciseKey(candidate.name) === canonicalExerciseKey(ex.name));
        return found && found.setsCount === ex.setsCount;
    });
}

function insertByOriginalOrder(selected, newExercise, positions) {
    return [...selected, newExercise].sort((a, b) =>
        positions.get(canonicalExerciseKey(a.name)) -
        positions.get(canonicalExerciseKey(b.name)));
}

export function selectExercisesForTime(exercises, maxSessionMinutes, options = {}) {
    if (!Array.isArray(exercises) || exercises.length < 2) {
        throw new Error('MyCoatch: selezione esercizi incompleta.');
    }
    const positions = new Map(exercises.map((ex, i) => [canonicalExerciseKey(ex.name), i]));
    const protectedExercises = exercises.filter(isProtected);
    if (protectedExercises.length < 2) {
        throw new Error('MyCoatch: servono almeno due movimenti prioritari.');
    }
    const basePlan = optimizeSession(protectedExercises, maxSessionMinutes);
    let selected = basePlan.exercises;
    const ranking = exercises.map((ex, index) => ({ ex, index }))
        .filter(({ex, index}) => !isProtected(ex,index))
        .map(({ex,index}) => scoreAccessory(ex,index,options))
        .sort((a,b) => b.score - a.score || a.index - b.index);
    const accepted = [];
    const skipped = [];
    let plan = basePlan;

    for (const candidate of ranking) {
        const {exercise,score,reason} = candidate;
        if (selected.length >= MAX_DAILY_EXERCISES) {
            skipped.push({exercise:exercise.name,muscle:exercise.category,
                reason:'limite prudenziale di sei esercizi per seduta'});
            continue;
        }
        const proposed = insertByOriginalOrder(selected,exercise,positions);
        let trial;
        try {
            trial = optimizeSession(proposed,maxSessionMinutes);
        } catch {
            skipped.push({exercise:exercise.name,muscle:exercise.category,
                reason:'tempo insufficiente senza ridurre i movimenti prioritari'});
            continue;
        }
        if (!unchangedExisting(selected,trial.exercises) ||
            !trial.exercises.some(x =>
                canonicalExerciseKey(x.name) === canonicalExerciseKey(exercise.name) &&
                x.setsCount === exercise.setsCount)) {
            skipped.push({exercise:exercise.name,muscle:exercise.category,
                reason:'l’aggiunta ridurrebbe serie già programmate'});
            continue;
        }
        selected=trial.exercises;
        plan=trial;
        accepted.push({exercise:exercise.name,muscle:exercise.category,
            score,reason,sets:exercise.setsCount});
    }

    // Non riprogrammare sessioni altrui né completare set simulati:
    // l'audit descrive solo la proposta e non fa parte dello storico.
    return {
        ...plan,
        reducedPrioritySets:(basePlan.reducedPrioritySets||0) +
            (plan === basePlan ? 0 : (plan.reducedPrioritySets||0)),
        selectionAudit: {
            strategy:'time_first_protected_core_coverage_score_v1',
            timeBudgetMinutes:maxSessionMinutes,
            protected:protectedExercises.map(x=>x.name),
            selectedAccessories:accepted,
            excludedAccessories:skipped,
            estimatedMinutes:plan.estimatedMinutes
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
