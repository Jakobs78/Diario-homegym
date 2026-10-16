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
