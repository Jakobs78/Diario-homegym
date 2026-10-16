import { canonicalExerciseKey } from './exerciseIdentity.js';
import { estimateE1rm } from './historyAnalysis.js';

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const clean = String(value).replace('@', '').replace(',', '.').trim();
    if (!/^\d+(?:\.\d+)?$/.test(clean)) return null;
    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
}

function confirmed(set) {
    return (set?.isLocked === true || set?.completed === true) &&
        !set?.isWarmup && !set?.warmup && !set?.is_warmup;
}

function simpleValidSets(exercise) {
    return (exercise?.loggedSets || []).flatMap(set => {
        if (!confirmed(set)) return [];
        const kg = numberOrNull(set.weight);
        const reps = numberOrNull(set.reps);
        const rpe = numberOrNull(set.rpe);
        if (!kg || !Number.isInteger(reps) || reps <= 0 || reps > 40) return [];
        const cleanRpe = rpe !== null && rpe >= 6 && rpe <= 10 ? rpe : null;
        const e1rm = cleanRpe !== null ? estimateE1rm(kg, reps, cleanRpe) : null;
        return [{ kg, reps, rpe: cleanRpe, e1rm }];
    });
}

function* previousDays(history, currentDay) {
    const years = history?.history?.years || history?.years || {};
    const orderedYears = Object.keys(years).sort((a, b) => Number(a) - Number(b));
    for (const year of orderedYears) {
        const mesocycles = years[year]?.mesocycles || [];
        for (const meso of mesocycles) {
            const weeks = [...(meso.weeks || [])]
                .sort((a, b) => Number(a.weekNumber) - Number(b.weekNumber));
            for (const week of weeks) {
                const days = [...(week.days || [])]
                    .sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber));
                for (const day of days) {
                    // A completed day repeated by the athlete retains an
                    // append-only archive (PR #14). The archived attempts
                    // happened BEFORE the newly empty/current attempt.
                    const archives = Array.isArray(day.sessionArchives) ?
                        day.sessionArchives : [];
                    for (const archived of archives) {
                        yield {
                            dayName: archived.dayName || day.dayName,
                            completed: true,
                            totalDurationMinutes: archived.totalDurationMinutes,
                            exercises: archived.exercises || []
                        };
                    }
                    if (day === currentDay) return;
                    yield day;
                }
            }
        }
    }
}

/**
 * Ultima serie confrontabile osservata PRIMA di quella corrente.
 * Nessuna deduzione e1RM quando manca un RPE realmente inserito.
 */
export function previousExercisePerformance(history, currentDay, exerciseName) {
    const key = canonicalExerciseKey(exerciseName);
    let last = null;
    if (!key) return null;
    for (const day of previousDays(history, currentDay)) {
        for (const ex of day.exercises || []) {
            if (ex.isWarmup || ex.isExcluded || ex.is_excluded || canonicalExerciseKey(ex.name) !== key) continue;
            const sets = simpleValidSets(ex);
            if (!sets.length) continue;
            last = sets
                .map((set, index) => ({ ...set, index }))
                .sort((a, b) => {
                    // Il migliore e1RM confrontabile, se RPE disponibile; in
                    // caso contrario ultima serie effettiva per ordinalita'.
                    if (a.e1rm !== null && b.e1rm !== null) return a.e1rm - b.e1rm;
                    return a.index - b.index;
                }).at(-1);
        }
    }
    return last;
}

function median(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] :
        (sorted[middle - 1] + sorted[middle]) / 2;
}

function exercisePattern(day) {
    return String(day?.dayName || '').split(/\s|\(/)[0].toLowerCase();
}

/**
 * Nessuna previsione "appresa" senza almeno tre sedute comparabili concluse.
 * La calibrazione e' una stima su tempo realmente registrato per serie,
 * non una modifica del tempo disponibile scelto dall'utente.
 */
export function historicalSessionPace(history, currentDay) {
    const sample = [];
    const activeSets = (currentDay?.exercises || []).filter(ex => !ex.isWarmup && !ex.isExcluded && !ex.is_excluded)
        .reduce((sum, ex) => sum + (ex.loggedSets || []).length, 0);
    if (!activeSets) return null;

    const activePattern = exercisePattern(currentDay);
    for (const day of previousDays(history, currentDay)) {
        if (!day.completed) continue;
        if (exercisePattern(day) !== activePattern) continue;
        const duration = Number(day.totalDurationMinutes);
        if (!Number.isFinite(duration) || duration < 10 || duration > 180) continue;
        const valid = (day.exercises || []).filter(ex => !ex.isWarmup && !ex.isExcluded && !ex.is_excluded)
            .reduce((sum, ex) => sum + simpleValidSets(ex).length, 0);
        if (valid < 4 || valid < activeSets * 0.65 || valid > activeSets * 1.35) continue;
        const secondsPerSet = duration * 60 / valid;
        if (secondsPerSet >= 50 && secondsPerSet <= 360) sample.push(secondsPerSet);
    }
    if (sample.length < 3) return null;
    const recent = sample.slice(-8);
    return {
        secondsPerSet: Math.round(median(recent)),
        samples: recent.length,
        source: 'completed_sessions_actual_elapsed'
    };
}
