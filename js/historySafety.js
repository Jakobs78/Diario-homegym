import {isExerciseSkipped,sessionWorkCounts} from './sessionSkip.js';
/**
 * Pure/history-only safeguards for the legacy workout diary.
 * No Supabase API, localStorage, timers or coach state in this module.
 */

import { isWarmupExercise, isWarmupSet } from './workoutSemantics.js';

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
 * A resolved plan requires checked actual work or an explicit per-session skip.
 * Typed drafts and untouched unchecked rows never count as performed work.
 */
export function isMesocycleCompleted(mesocycle) {
    if (!Array.isArray(mesocycle?.weeks) || !mesocycle.weeks.length) return false;
    let scheduledSets = 0;
    for (const week of mesocycle.weeks) {
        for (const day of week.days || []) {
            for (const exercise of day.exercises || []) {
                if (isWarmupExercise(exercise)) continue;
                const sets = Array.isArray(exercise.loggedSets) && exercise.loggedSets.length
                    ? exercise.loggedSets : (exercise.sets || []);
                if (!sets.length) return false;
                for (const set of sets) {
                    if (isWarmupSet(set)) continue;
                    scheduledSets++;
                    if(isExerciseSkipped(exercise)&&!confirmed(set))continue;
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
    if (!sessionWorkCounts(day).finished)
        throw new Error('La sessione non risulta completata con dati reali: nessun dato modificato.');

    const archive = jsonClone({
        capturedAt,
        sessionDate: day.date || null,
        sessionCompletedAt: day.sessionCompletedAt || null,
        totalDurationMinutes: day.totalDurationMinutes ?? null,
        accumulatedSeconds: day.accumulatedSeconds ?? 0,
        dayName: day.dayName || null,
        // Il check-in appartiene a QUESTA esecuzione della seduta, non alla
        // scheda che verrà riutilizzata. Archivialo con la sessione vecchia.
        coachCheckin: day.coachCheckin || null,
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
    delete day.coachCheckin;

    for (const ex of day.exercises) {
        delete ex.sessionSkip;
        for (const [index, set] of (ex.loggedSets || []).entries()) {
            set.isLocked = false;
            set.completed = false;
            set.weight = '';
            set.reps = '';
            set.rpe = '';
            delete set.completedAt;
            delete set.dropSegments;delete set.dropSkipped;
            if(set.intensityTechnique==='DROP_SET')delete set.intensityTechnique;
            // Older diaries mirrored performed sets in ex.sets. Clear only
            // that legacy duplicate, never a row carrying prescription fields.
            const legacy=Array.isArray(ex.sets) ? ex.sets[index] : null;
            const hasPrescription=legacy && [
                'targetKg','targetReps','targetRpe','kg','plannedKg','plannedReps',
                'targetWeight','topsetKg'
            ].some(key=>legacy[key]!==undefined && legacy[key]!==null);
            if(legacy && !hasPrescription && (legacy.isLocked || legacy.completed)){
                legacy.isLocked=false;
                legacy.completed=false;
                legacy.weight='';
                legacy.reps='';
                legacy.rpe='';
                delete legacy.completedAt;
                delete legacy.dropSegments;delete legacy.dropSkipped;
            }
        }
    }
    return archive;
}

export function safeArchiveCount(day) {
    return Array.isArray(day?.sessionArchives) ? day.sessionArchives.length : 0;
}

