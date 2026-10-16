import { FUNDAMENTAL_CHOICES } from './exerciseSelection.js';
import { canonicalExerciseKey } from './exerciseIdentity.js';
import { validateCompletedSet } from './liveCoach.js';

const ANCHORS = Object.freeze(['bench', 'squat', 'military', 'hinge']);
const ANCHOR_NAMES = Object.freeze({
    bench: 'Panca', squat: 'Squat',
    military: 'Spinta verticale', hinge: 'Hip hinge'
});
const KNOWN_VARIANTS = new Map(
    ANCHORS.flatMap(key =>
        FUNDAMENTAL_CHOICES[key].map(name => [canonicalExerciseKey(name), key])
    )
);

function isConfirmed(set) {
    return set?.isLocked === true || set?.completed === true;
}

function isWorkingSet(set) {
    return !set?.isWarmup && !set?.warmup && !set?.is_warmup;
}

export function isGuidedCalibrationWeek(week) {
    return Boolean(week?.days?.some(day =>
        (day.exercises || []).some(ex =>
            String(ex.notes ?? '').includes('[CALIBRAZIONE MYCOATCH]'))
    ));
}

/**
 * Audit derivato dallo storico già disponibile. Non scrive, non scala kg,
 * non inventa RPE ed è compatibile con le serie importate da CSV a 12 colonne.
 * I confronti sugli esercizi cardine usano varianti esplicite, NON fusioni
 * tra panca piana, inclinata e altri movimenti diversi.
 */
export function reviewCalibrationWeek(week) {
    if (!isGuidedCalibrationWeek(week)) return null;

    const samples = Object.fromEntries(ANCHORS.map(key => [key, {
        label: ANCHOR_NAMES[key],
        recorded: false,
        exercise: null,
        weight: null,
        reps: null,
        rpe: null
    }]));
    let totalSets = 0;
    let confirmedSets = 0;
    let validSets = 0;
    let invalidSets = 0;
    let withoutRpe = 0;
    let completeDays = 0;

    for (const day of week.days || []) {
        let daySets = 0;
        let dayValid = 0;
        for (const exercise of day.exercises || []) {
            if (exercise?.isWarmup || exercise?.isExcluded || exercise?.is_excluded) continue;
            const anchor = KNOWN_VARIANTS.get(canonicalExerciseKey(exercise.name));
            for (const set of exercise.loggedSets || exercise.sets || []) {
                if (!isWorkingSet(set)) continue;
                totalSets++;
                daySets++;
                if (!isConfirmed(set)) continue;
                confirmedSets++;
                const entry = validateCompletedSet(set, exercise, set);
                if (!entry.ok || entry.technique) {
                    invalidSets++;
                    continue;
                }
                validSets++;
                dayValid++;
                if (entry.rpe === null) withoutRpe++;
                if (anchor) {
                    // La serie piu' recente inserita nell'ordine del diario e'
                    // solo un riferimento descrittivo, non un 1RM o una dose.
                    const sample = samples[anchor];
                    sample.recorded = true;
                    sample.exercise = exercise.name;
                    sample.weight = entry.weight;
                    sample.reps = entry.numericReps;
                    sample.rpe = entry.rpe;
                }
            }
        }
        if (daySets > 0 && daySets === dayValid) completeDays++;
    }

    const days = week.days?.length || 0;
    const anchorsRecorded = ANCHORS.filter(key => samples[key].recorded).length;
    const ready = days > 0 && completeDays === days &&
        anchorsRecorded === ANCHORS.length && invalidSets === 0;
    const status = ready ? 'ready' : validSets ? 'in_progress' : 'not_started';

    return {
        status,
        readyForReview: ready,
        days,
        completeDays,
        totalSets,
        confirmedSets,
        validSets,
        invalidSets,
        withoutRpe,
        anchorsRecorded,
        anchorsTotal: ANCHORS.length,
        anchors: samples,
        missingAnchors: ANCHORS.filter(key => !samples[key].recorded)
            .map(key => ANCHOR_NAMES[key]),
        message: ready
            ? 'La prima settimana è registrata. Puoi richiedere una nuova proposta MyCoatch basata sulle serie reali; la scheda importata non viene modificata automaticamente.'
            : 'Conferma kg e ripetizioni realmente svolti. Aggiungi l’RPE quando lo conosci: migliora la precisione dei confronti, ma non è obbligatorio.'
    };
}

/**
 * Cerca solo un mesociclo che contiene materialmente il giorno visualizzato,
 * così la revisione non combina dati di persone o blocchi diversi.
 * Vale anche quando si naviga nelle settimane 2–4.
 */
export function calibrationContextForDay(workoutData, currentDay) {
    if (!currentDay) return null;
    for (const year of Object.values(workoutData?.history?.years || {})) {
        for (const meso of year?.mesocycles || []) {
            const weeks = meso?.weeks || [];
            if (!weeks.some(week => (week.days || []).includes(currentDay))) continue;
            const firstWeek = weeks.find(week => Number(week.weekNumber) === 1) || weeks[0];
            if (!firstWeek) return null;
            return reviewCalibrationWeek(firstWeek);
        }
    }
    return null;
}

/**
 * Riepilogo non sensibile per l'anteprima del mesociclo SUCCESSIVO.
 * Legge solo l'ultima proposta importata e riconosce esplicitamente il tag
 * della settimana guidata. Non fa inferenze da un generico mese precedente.
 * Non ritorna valori kg/RPE individuali, soltanto qualita' del campione.
 */
export function calibrationHandoffForMesocycle(mesocycle) {
    if (!Array.isArray(mesocycle?.weeks) || !mesocycle.weeks.length) return null;
    const firstWeek = mesocycle.weeks.find(week => Number(week.weekNumber) === 1) ||
        mesocycle.weeks[0];
    const reviewed = reviewCalibrationWeek(firstWeek);
    if (!reviewed) return null;
    return {
        source: 'guided_first_week_confirmed_sets',
        status: reviewed.status,
        readyForReview: reviewed.readyForReview,
        days: reviewed.days,
        completeDays: reviewed.completeDays,
        validSets: reviewed.validSets,
        totalSets: reviewed.totalSets,
        withoutRpe: reviewed.withoutRpe,
        missingAnchors: [...reviewed.missingAnchors],
        anchorsRecorded: reviewed.anchorsRecorded,
        anchorsTotal: reviewed.anchorsTotal,
        // Una calibrazione completata non prova che il resto del mesociclo
        // sia finito: proponiamo una REVISIONE, non l'avanzamento obbligatorio.
        requiresAthleteDecision: true
    };
}
