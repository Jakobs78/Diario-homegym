import {isBodyweightExercise} from '../mycoatch/bodyweight.js';
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
    if(isWarmupExercise(exercise))return 0;
    const slots=Math.max(0,...counts.slice(0,2),exercise?.sets?.length||0,exercise?.loggedSets?.length||0);
    const warmIndices=new Set();
    for(const rows of [exercise?.sets,exercise?.loggedSets])if(Array.isArray(rows))rows.forEach((set,i)=>{if(isWarmupSet(set))warmIndices.add(i);});
    return Math.max(0,slots-warmIndices.size);
}


export function validPerformedSet(exercise,set) {
    if(!set || !isEffectiveTrainingSet(exercise,set) || !(set.isLocked===true||set.completed===true))return false;
    const raw=String(set.weight??set.actualKg??'').trim().replace(',','.');
    const kg=raw===''?NaN:Number(raw);
    const reps=String(set.reps??set.actualReps??'').trim();
    return Number.isFinite(kg)&&kg>=0&&kg<=700&&
        /^[1-9]\d{0,2}(?:\+[1-9]\d{0,2})*$/.test(reps)&&
        (kg>0 || isBodyweightExercise(exercise));
}
export function localCalendarDay(at=new Date()) {
    return [at.getFullYear(),String(at.getMonth()+1).padStart(2,'0'),String(at.getDate()).padStart(2,'0')].join('-');
}
