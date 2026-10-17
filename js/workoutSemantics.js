/**
 * An exercise flagged "excluded from maxes" in legacy diaries is a warm-up.
 * Never count warm-up work as effective training volume/fatigue, but preserve
 * the performed sets and their checkboxes in the journal and JSON backup.
 */
export function isWarmupExercise(exercise) {
    return exercise?.isWarmup === true ||
        exercise?.isExcluded === true || exercise?.is_excluded === true;
}

export function isWarmupSet(set) {
    return set?.isWarmup === true || set?.warmup === true ||
        set?.is_warmup === true;
}

export function isEffectiveTrainingSet(exercise,set) {
    return !isWarmupExercise(exercise) && !isWarmupSet(set);
}

/** Preserve the largest explicit prescription when an import has fewer log rows. */
export function plannedWorkSetCount(exercise) {
    const counts = [exercise?.setsCount, exercise?.set].map(value => {
        const match = String(value ?? '').trim().match(/^(\d+)(?:\s*(?:sets?|serie))?$/i);
        return match ? Number(match[1]) : 0;
    });
    for (const rows of [exercise?.sets, exercise?.loggedSets]) {
        counts.push(Array.isArray(rows) ? rows.filter(s => !isWarmupSet(s)).length : 0);
    }
    return Math.max(0, ...counts);
}

