/**
 * Prescrizioni specifiche per esercizio: euristiche di coaching, NON soglie
 * fisiologiche universali. I dati registrati restano separati dai target.
 */
const HIGH_REP_ISOLATIONS = Object.freeze({
    'Alzate Laterali con Manubri': '15-25',
    'Alzate Laterali ai Cavi': '15-25',
    'Alzate Posteriori con Manubri': '15-25',
    'Face Pull ai Cavi': '15-25',
    'Reverse Fly ai Cavi': '15-25'
});

function repRange(value) {
    const m = /^(\d+)-(\d+)$/.exec(String(value || '').trim());
    if (!m) return null;
    const min = Number(m[1]), max = Number(m[2]);
    return min > 0 && max >= min && max <= 100 ? {min, max} : null;
}

/** Mantiene i range anatomico/funzionali prima del generico 10-15. */
export function prescribeExerciseReps(exercise, {
    focus = 'hybrid', index = 0, experience = null,
    calibrationWeek = false, weekNumber = 1, isDeload = false,
    loadDecision = null
} = {}) {
    const isolation = exercise.pattern === 'isolation';
    let reps = HIGH_REP_ISOLATIONS[exercise.name] ||
        (repRange(exercise.defaultReps) ? exercise.defaultReps : '8-12');
    if (!isolation && focus === 'strength' && index === 0) reps = '3-5';
    else if (!isolation && focus === 'hypertrophy' && index === 0) reps = '6-8';

    // Nella Full Body a quattro giorni, le due esposizioni dello stesso
    // fondamentale hanno funzioni distinte. Non applicare un unico range a
    // tutti gli atleti o ai template già esistenti.
    if (focus === 'hybrid' && !isolation &&
        ['strength', 'volume'].includes(exercise.repIntent)) {
        const lower = exercise.pattern === 'squat' || exercise.pattern === 'hinge';
        reps = exercise.repIntent === 'strength' ? '4-6' : (lower ? '6-10' : '8-12');
    }

    if (calibrationWeek && weekNumber === 1 && !isolation) reps = '6-10';
    if (experience === 'beginner') {
        if (HIGH_REP_ISOLATIONS[exercise.name]) reps = '12-20';
        else reps = isolation ? '10-15' : '8-12';
    }

    // Una raccomandazione validata sulle settimane precedenti deve incidere
    // davvero sul range del CSV, senza alzare contemporaneamente anche i kg.
    const range = repRange(reps);
    const next = loadDecision?.action === 'build_reps' ?
        Number(loadDecision.plannedRepGoal) : null;
    if (!isDeload && !calibrationWeek && range &&
        Number.isInteger(next) && next > range.min && next <= range.max) {
        reps = next + '-' + range.max;
    }
    return reps;
}

/** RPE per esercizio, non tutto il giorno al medesimo sforzo. */
export function prescribeExerciseRpe(exercise, {
    weekTargetRpe = 7.5, isDeload = false,
    experience = null, calibrationWeek = false,
    fatigueConcern = false
} = {}) {
    if (isDeload) return 6.5;
    const ceiling = experience === 'beginner' ? 8 : 8.5;
    let target = Number(weekTargetRpe);
    if (!Number.isFinite(target)) target = 7.5;
    // Gli isolamenti possono lavorare più vicino al cedimento rispetto
    // ai grandi multiarticolari, senza richiedere cedimento effettivo.
    if (!calibrationWeek) {
        if (exercise.pattern === 'isolation') target += 0.5;
        else if (exercise.pattern === 'hinge' ||
            exercise.pattern === 'squat' ||
            exercise.estimatedFatigue >= 9) target -= 0.5;
    }
    if (fatigueConcern) target = Math.min(target, 7);
    return Math.min(ceiling, Math.max(6, Math.round(target * 2) / 2));
}

export const HIGH_REP_EXERCISES = HIGH_REP_ISOLATIONS;
