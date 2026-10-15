/**
 * Pure/history-only safeguards for the legacy workout diary.
 * No Supabase API, localStorage, timers or coach state in this module.
 */

function confirmed(set) {
    return set?.isLocked === true || set?.completed === true;
}

function validLoggedPerformance(set) {
    const kg = Number(String(set?.weight ?? '').replace(',', '.'));
    const reps = String(set?.reps ?? '').trim();
    return Number.isFinite(kg) && kg > 0 &&
        /^(?:[1-9]\d?)(?:\+(?:[1-9]\d?))*$/.test(reps);
}

/**
 * "Completed" must mean checked + actually performed, NOT merely typed text
 * in an unchecked row or an empty/untouched imported exercise.
 */
export function isMesocycleCompleted(mesocycle) {
    if (!Array.isArray(mesocycle?.weeks) || !mesocycle.weeks.length) return false;
    let scheduledSets = 0;
    for (const week of mesocycle.weeks) {
        for (const day of week.days || []) {
            for (const exercise of day.exercises || []) {
                if (exercise.isExcluded) continue;
                const sets = Array.isArray(exercise.loggedSets) && exercise.loggedSets.length
                    ? exercise.loggedSets : (exercise.sets || []);
                if (!sets.length) return false;
                for (const set of sets) {
                    if (set?.isWarmup || set?.is_warmup || set?.warmup) continue;
                    scheduledSets++;
                    if (!confirmed(set) || !validLoggedPerformance(set)) return false;
                }
            }
        }
    }
    return scheduledSets > 0;
}

function jsonClone(data) {
    // This is persisted JSONB/JSON state; fail before mutation for any
    // unexpected non-cloneable value rather than losing athlete data.
    return JSON.parse(JSON.stringify(data));
}

/**
 * Preserve a completed day's performed sets before making the same schedule
 * available for a NEW session. Archives are append-only and remain inside
 * the existing workouts.payload JSON structure.
 */
export function repeatCompletedSessionPreservingHistory(day, { capturedAt = new Date().toISOString() } = {}) {
    if (!day || !Array.isArray(day.exercises) || !day.exercises.length)
        throw new Error('Sessione assente: nessun dato modificato.');
    const working = day.exercises.flatMap(ex => ex.isExcluded ? [] :
        (ex.loggedSets || []).filter(set =>
            !set?.isWarmup && !set?.warmup && !set?.is_warmup));
    if (!working.length || working.some(set => !confirmed(set) || !validLoggedPerformance(set)))
        throw new Error('La sessione non risulta completata con dati reali: nessun dato modificato.');

    const archive = jsonClone({
        capturedAt,
        sessionDate: day.date || null,
        sessionCompletedAt: day.sessionCompletedAt || null,
        totalDurationMinutes: day.totalDurationMinutes ?? null,
        accumulatedSeconds: day.accumulatedSeconds ?? 0,
        dayName: day.dayName || null,
        exercises: day.exercises
    });
    const archiveList = Array.isArray(day.sessionArchives) ? [...day.sessionArchives] : [];
    archiveList.push(archive);

    // Archive construction is atomic relative to the clearing below.
    day.sessionArchives = archiveList;
    day.sessionStart = null;
    day.accumulatedSeconds = 0;
    day.isPaused = false;
    day.completed = false;
    day.totalDurationMinutes = undefined;
    delete day.sessionCompletedAt;
    delete day.date;

    for (const ex of day.exercises) {
        for (const [index, set] of (ex.loggedSets || []).entries()) {
            set.isLocked = false;
            set.completed = false;
            set.weight = '';
            set.reps = '';
            set.rpe = '';
            delete set.completedAt;
            if (Array.isArray(ex.sets) && ex.sets[index]) {
                const planned = ex.sets[index];
                planned.isLocked = false;
                planned.completed = false;
                planned.weight = '';
                planned.reps = '';
                planned.rpe = '';
                delete planned.completedAt;
            }
        }
    }
    return archive;
}

export function safeArchiveCount(day) {
    return Array.isArray(day?.sessionArchives) ? day.sessionArchives.length : 0;
}
