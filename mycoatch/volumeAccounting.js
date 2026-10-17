/**
 * Analisi descrittiva del volume di allenamento.
 *
 * Una serie diretta = 1 unita; una serie con coinvolgimento secondario
 * significativo = 0.5 unita. Il coefficiente 0.5 e' un modello contabile
 * esplorativo, NON una percentuale misurata di crescita, attivazione o fatica.
 *
 * Non sommare questi valori come se fossero serie fisiche distinte;
 * uno stesso set puo' contribuire a piu' distretti. Il catalogo definisce
 * i distretti: nessuna attribuzione per esercizi sconosciuti.
 *
 * Base: Pelland et al., Sports Medicine 2026, DOI 10.1007/s40279-025-02344-w.
 */
import { EXERCISE_DATABASE } from './exercisesDB.js';
import { canonicalExerciseKey } from './exerciseIdentity.js';

export const INDIRECT_SET_CREDIT = 0.5;
export const VOLUME_ACCOUNTING_METHOD = 'catalog_direct_1_indirect_0_5_exploratory';
export const TRACKED_MUSCLES = Object.freeze([
    'Petto', 'Back_Lats', 'Back_Thickness', 'Spalle', 'Quadricipiti',
    'Femorali', 'Glutei', 'Polpacci', 'Bicipiti', 'Tricipiti', 'Core'
]);

const catalog = new Map(EXERCISE_DATABASE.map(exercise => [
    canonicalExerciseKey(exercise.name), exercise
]));
const round = value => Math.round(value * 100) / 100;
const numericReps = value => {
    const s = String(value ?? '').trim();
    // Per tecniche come "10+8+6" conta una sola serie e soltanto la prima
    // porzione verificabile, senza attribuire tre serie distinte.
    const n = /^\d{1,3}(?:\+\d{1,3})*$/.test(s) ? Number(s.split('+')[0]) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= 100;
};
const validWeight = value => {
    if (value === null || value === undefined || String(value).trim() === '') return false;
    const s = String(value).trim().replace(',', '.');
    return /^\d+(?:\.\d+)?$/.test(s) && Number(s) > 0;
};
const isWork = set => !set?.isWarmup && !set?.warmup && !set?.is_warmup;
const isConfirmed = set => set?.isLocked === true || set?.completed === true;

/** Conteggia soltanto serie confermate con kg e reps realmente presenti. */
export function completedWorkingSetCount(exercise) {
    const logs = Array.isArray(exercise?.loggedSets) ? exercise.loggedSets :
        Array.isArray(exercise?.sets) ? exercise.sets : [];
    return logs.filter(set => set && isWork(set) && isConfirmed(set) &&
        (validWeight(set.weight ?? set.actualKg) ||
            (catalog.get(canonicalExerciseKey(exercise.name))?.equipment === 'bodyweight' &&
             String(set.weight ?? set.actualKg).trim() === '0')) &&
        numericReps(set.reps ?? set.actualReps)).length;
}

export function contributionsForExercise(name, setCount) {
    const key = canonicalExerciseKey(name);
    const meta = catalog.get(key);
    if (!meta || !Number.isInteger(setCount) || setCount < 1) return null;
    const secondary = [...new Set(meta.secondaryMuscles || [])].filter(group =>
        TRACKED_MUSCLES.includes(group) && group !== meta.category
    );
    return {
        key,
        exercise: meta.name,
        category: meta.category,
        physicalSets: setCount,
        direct: { [meta.category]: setCount },
        indirect: Object.fromEntries(secondary.map(group =>
            [group, round(setCount * INDIRECT_SET_CREDIT)]))
    };
}

export function emptyMuscleVolumes() {
    return Object.fromEntries(TRACKED_MUSCLES.map(muscle => [muscle, {
        directSets: 0,
        indirectSetCredits: 0,
        fractionalSets: 0
    }]));
}

/**
 * Usabile sul programma effettivamente collocato DOPO i tagli per durata
 * o sui soli set confermati dello storico. Non muta le strutture d'ingresso.
 */
export function summarizeMuscleVolume(exercises = [], { mode = 'planned' } = {}) {
    if (!['planned', 'confirmed'].includes(mode)) {
        throw new Error('Modalita volume non valida');
    }
    const muscles = emptyMuscleVolumes();
    const unknownExercises = [];
    const invalidSetCounts = [];
    let physicalSets = 0;
    for (const exercise of exercises) {
        const count = mode === 'confirmed'
            ? completedWorkingSetCount(exercise)
            : Number(exercise?.setsCount ??
                (Array.isArray(exercise?.sets) ? exercise.sets.filter(isWork).length : NaN));
        if (!Number.isInteger(count) || count < 0) {
            invalidSetCounts.push(exercise?.name || 'sconosciuto');
            continue;
        }
        if (count === 0) continue;
        const credits = contributionsForExercise(exercise.name, count);
        if (!credits) {
            unknownExercises.push(exercise?.name || 'sconosciuto');
            continue;
        }
        physicalSets += count;
        for (const [muscle, sets] of Object.entries(credits.direct)) {
            muscles[muscle].directSets += sets;
        }
        for (const [muscle, sets] of Object.entries(credits.indirect)) {
            muscles[muscle].indirectSetCredits += sets;
        }
    }
    for (const item of Object.values(muscles)) {
        item.directSets = round(item.directSets);
        item.indirectSetCredits = round(item.indirectSetCredits);
        item.fractionalSets = round(item.directSets + item.indirectSetCredits);
    }
    return {
        method: VOLUME_ACCOUNTING_METHOD,
        note: 'Crediti descrittivi, non misure di ipertrofia ne soglie individuali di recupero.',
        physicalSets,
        byMuscle: muscles,
        unknownExercises: [...new Set(unknownExercises)],
        invalidSetCounts: [...new Set(invalidSetCounts)]
    };
}

export function summarizeWeeklyMuscleVolume(days = [], options = {}) {
    const exercises = (days || []).flatMap(day =>
        Array.isArray(day?.exercises) ? day.exercises : []);
    return summarizeMuscleVolume(exercises, options);
}

