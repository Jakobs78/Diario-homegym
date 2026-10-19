/**
 * Tecniche di intensita' come scelta condizionata, non come obbligo.
 * Dropset: singola estensione dell'ultima serie di un isolamento a basso
 * costo tecnico, senza contarla come una nuova serie fisica completata.
 * Il record CSV supporta il tag [DROP_SET]; nessuna performance e' simulata.
 */
const PREFERRED = new Set([
    'Alzate Laterali con Manubri', 'Alzate Laterali ai Cavi',
    'Alzate Posteriori con Manubri', 'Reverse Fly ai Cavi',
    'Pushdown ai Cavi con Corda', 'Pushdown ai Cavi',
    'Curl ai Cavi Bassi', 'Calf Raise in Piedi con Manubri'
]);

/** Due settimane diverse di serie confermate, RPE misurato e non oltre target. */
export function safeTechniqueEvidence(history) {
    if (!history || history.fatigueConcern === true) return false;
    const recent = new Map();
    for (const ex of history.exposures || []) {
        if (ex.isDeload || !ex.weekId) continue;
        if (!recent.has(ex.weekId)) recent.set(ex.weekId, []);
        recent.get(ex.weekId).push(ex);
    }
    const lastTwo = [...recent.values()].slice(-2);
    return lastTwo.length === 2 && lastTwo.every(entries => entries.every(e =>
        e.completedSets >= 2 && e.completedSets === e.plannedSets &&
        e.allRpeMeasured === true && e.allRpeWithinTarget === true &&
        e.allStraightSets === true && Number.isFinite(e.avgRpe) &&
        e.avgRpe >= 6 && e.avgRpe <= 8 && e.repRange?.max >= 10
    ));
}

export function suggestDropset(exercise, {
    weekNumber = 1, isDeload = false, experience = null,
    calibrationWeek = false, focus = 'hybrid',
    timeBudgetMinutes = 60, availableSeconds = 0,
    history = null
} = {}) {
    if (isDeload || calibrationWeek || weekNumber < 2 ||
        experience !== 'intermediate' && experience !== 'advanced' ||
        focus !== 'hypertrophy' || exercise.groupType ||
        exercise.pattern !== 'isolation' || exercise.setsCount < 2 ||
        !PREFERRED.has(exercise.name) || !safeTechniqueEvidence(history) ||
        !Number.isFinite(Number(exercise.kgMin)) || Number(exercise.kgMin) <= 0 ||
        (history?.lastReps?.max && Number(history.lastReps.max) <
            Number(String(exercise.reps).split('-')[1])) ||
        !Number.isFinite(availableSeconds) || availableSeconds < 40 ||
        timeBudgetMinutes > 90) return null;

    return {
        technique: 'DROP_SET',
        extraSeconds: 40,
        note: '[TECNICA MIRATA] dropset: solo dopo l’ultima serie: riduci il carico di circa 20–25%, esegui altre ripetizioni pulite e interrompi se perdi tecnica. Il segmento extra NON equivale a una nuova serie confermata. Facoltativo.'
    };
}

