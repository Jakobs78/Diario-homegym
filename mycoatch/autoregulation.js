/**
 * Compatibilità dell'API MyCoatch di autoregolazione.
 *
 * Tutte le decisioni si basano su serie effettivamente confermate.
 * Un RPE mancante resta sconosciuto. Due sedute nella stessa settimana
 * NON autorizzano un incremento del carico.
 *
 * L'analisi longitudinale di tutti i mesocicli resta in historyInsights.js.
 * Qui accettiamo anche un array isolato di esercizi per i vecchi chiamanti.
 */
import { estimateE1rm } from './historyAnalysis.js';
import { evaluateExerciseProgression } from './progressionPolicy.js';

const numeric = value => {
    if (value === undefined || value === null || value === '' ||
        typeof value === 'boolean') return null;
    const str = String(value).trim().replace(',', '.');
    return /^(?:\d+)(?:\.\d+)?$/.test(str) ? Number(str) : null;
};
const measuredRpe = value => {
    if (value === null || value === undefined || value === '') return null;
    const normalized = String(value).trim().replace(/^@/, '').replace(',', '.');
    const n = /^(?:\d+)(?:\.\d+)?$/.test(normalized)
        ? Number(normalized) : NaN;
    return Number.isFinite(n) && n >= 6 && n <= 10 ? n : null;
};
const positiveReps = value => {
    const n = numeric(value);
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
};
const parseReps = value => {
    const v = String(value ?? '').trim();
    const matched = /^(\d+)\s*[-–]\s*(\d+)$/.exec(v);
    if (matched) {
        const min = Number(matched[1]), max = Number(matched[2]);
        return min > 0 && min <= max && max <= 100 ? { min, max } : null;
    }
    const single = positiveReps(v);
    return single === null ? null : { min: single, max: single };
};
const validDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return null;
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value ? parsed : null;
};
function weekOf(value) {
    const date = validDate(value);
    if (!date) return null;
    // UTC start-of-Monday prevents two sessions on Monday and Sunday
    // from masquerading as two distinct adaptation weeks.
    const dow = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dow);
    return 'calendar/' + date.toISOString().slice(0, 10);
}
const confirmed = set => set?.isLocked === true || set?.completed === true;
const special = (ex, set) => Boolean(
    ex?.isDropset || ex?.groupType === 'dropset' ||
    set?.isDropset || set?.intensityTechnique ||
    /\+/.test(String(set?.reps ?? ''))
);

function extractWeekId(exercise) {
    if (typeof exercise?.weekId === 'string' && exercise.weekId.trim())
        return exercise.weekId.trim();
    const week = Number(exercise?.weekNumber ?? exercise?.week);
    const year = Number(exercise?.year);
    const meso = exercise?.mesocycleIndex ?? exercise?.mesocycleId;
    if (Number.isInteger(week) && week >= 1 && Number.isInteger(year) &&
        year > 2000 && meso !== null && meso !== undefined &&
        String(meso).trim()) {
        return String(year) + '/' + String(meso) + '/' + week;
    }
    // Use the actual performed date if present; NEVER invent calendar weeks
    // based on array indices.
    return weekOf(exercise?.performedOn ?? exercise?.date ?? exercise?.sessionDate);
}

function inspectLegacyExercise(exercise) {
    if (!exercise || exercise.isExcluded) return null;
    const records = Array.isArray(exercise.loggedSets)
        ? exercise.loggedSets : (Array.isArray(exercise.sets) ? exercise.sets : []);
    if (!records.length) return null;
    const valid = records.flatMap(set => {
        if (!confirmed(set) || set?.isWarmup || set?.warmup ||
            set?.is_warmup) return [];
        const weight = numeric(set?.weight ?? set?.actualKg);
        const reps = positiveReps(set?.reps ?? set?.actualReps);
        if (weight === null || weight <= 0 || weight > 700 ||
            reps === null) return [];
        const rpe = measuredRpe(set?.rpe);
        return [{ weight, reps, rpe, special: special(exercise, set) }];
    });
    if (!valid.length) return null;

    const workingSets = records.filter(set =>
        !set?.isWarmup && !set?.warmup && !set?.is_warmup);
    const explicitCount = Number.parseInt(
        String(exercise.setsCount ?? exercise.set ?? ''), 10);
    const plannedSets = Math.max(valid.length, workingSets.length,
        Number.isInteger(explicitCount) && explicitCount > 0 ? explicitCount : 0);
    const range = parseReps(exercise.targetReps ?? exercise.reps);
    const targetRpe = measuredRpe(
        exercise.targetRpe ?? exercise.rpeTarget ?? exercise.rpe);
    const allRpeMeasured = valid.every(s => s.rpe !== null);
    const validEstimates = valid.map(s =>
        s.rpe === null || s.special ? null :
            estimateE1rm(s.weight, s.reps, s.rpe)).filter(v => v !== null);
    const currentKg = Math.min(...valid.map(s => s.weight));
    const topKg = Math.max(...valid.map(s => s.weight));
    const avgReps = valid.reduce((sum, set) => sum + set.reps, 0) / valid.length;
    const avgRpe = allRpeMeasured
        ? valid.reduce((sum, set) => sum + set.rpe, 0) / valid.length : null;
    const hasSpecial = valid.some(s => s.special);
    return {
        currentKg,
        topKg,
        minTargetReps: range?.min ?? null,
        maxTargetReps: range?.max ?? null,
        avgReps,
        avgRpe,
        targetRpe,
        currentE1RM: validEstimates.length === valid.length
            ? Math.max(...validEstimates) : null,
        completedSets: valid.length,
        plannedSets,
        hasSpecial,
        progressExposure: {
            weekId: extractWeekId(exercise),
            isDeload: targetRpe !== null && targetRpe <= 6.5,
            repRange: range,
            completedSets: valid.length, plannedSets,
            allStraightSets: !hasSpecial,
            uniformWeight: valid.every(s => s.weight === valid[0].weight),
            workingKg: currentKg,
            topKg,
            minWorkingReps: Math.min(...valid.map(s => s.reps)),
            allRepsAtTop: Boolean(range) && valid.length === plannedSets &&
                valid.every(s => s.reps >= range.max && s.reps <= range.max + 2),
            allRepsInRange: Boolean(range) && valid.length === plannedSets &&
                valid.every(s => s.reps >= range.min && s.reps <= range.max),
            allRepsBelowMin: Boolean(range) &&
                valid.every(s => s.reps < range.min),
            allRpeWithinTarget: targetRpe !== null &&
                allRpeMeasured && valid.length === plannedSets &&
                valid.every(s => s.rpe <= targetRpe),
            rpeOvershoot: targetRpe !== null && allRpeMeasured &&
                valid.length === plannedSets && avgRpe >= targetRpe + 1
        }
    };
}

/** Strict e1RM: missing/invalid RPE does not produce a number. */
export function calculateE1RM(weight, reps, rpe = null) {
    const kg = numeric(weight), count = positiveReps(reps), effort = measuredRpe(rpe);
    return kg === null || count === null || effort === null ||
        kg <= 0 ? null : estimateE1rm(kg, count, effort);
}

/** RPE defaults to unknown rather than fabricated @8. */
export function cleanRpeValue(rawRpe, fallback = null) {
    const actual = measuredRpe(rawRpe);
    return actual === null ? measuredRpe(fallback) : actual;
}

export function calculateSmartIncrement(currentKg, isIsolation = false) {
    const kg = numeric(currentKg);
    if (kg === null || kg <= 0) return null;
    if (kg <= 12 || isIsolation) return kg < 6 ? 0.5 : kg <= 12 ? 1 : 1.25;
    return kg >= 100 ? 5 : 2.5;
}

/**
 * An unstructured exercise array can support observational feedback, but
 * cannot justify training loads unless 2 DISTINCT dated / identified weeks
 * have complete, comparable performances with measured RPE.
 */
export function analyzeUserHistory(exerciseHistory) {
    if (!Array.isArray(exerciseHistory) || !exerciseHistory.length) return null;
    const analyzed = exerciseHistory.map(inspectLegacyExercise).filter(Boolean);
    if (!analyzed.length) return null;

    const last = analyzed.at(-1);
    const progression = evaluateExerciseProgression(
        analyzed.map(x => x.progressExposure));
    const notes = [...progression.caveats];
    const result = {
        ...last,
        action: 'MAINTAIN',
        suggestedKgIncrement: 0,
        nextTargetKg: null,
        suggestedReps: null,
        progression,
        evidenceWeeks: progression.evidenceWeeks,
        message: 'Mantieni il carico e registra prestazioni confrontabili in settimane diverse.'
    };

    if (progression.readyForLoad && !progression.fatigueConcern) {
        const step = calculateSmartIncrement(
            progression.lastWeekWorkingKg, last.currentKg <= 12);
        if (step && step / progression.lastWeekWorkingKg <= 0.10) {
            result.action = 'INCREMENT_LOAD';
            result.suggestedKgIncrement = step;
            result.nextTargetKg = Math.round((progression.lastWeekWorkingKg + step) * 4) / 4;
            result.message = 'Due settimane diverse complete a fine range, RPE reale entro il target: valuta un piccolo incremento se l’attrezzatura lo permette.';
        } else {
            notes.push('incremento_standard_eccessivo');
        }
    } else if (progression.readyForReps) {
        result.action = 'BUILD_REPS';
        result.suggestedReps = progression.nextRepTarget;
        result.message = 'Mantieni i kg e prova una ripetizione aggiuntiva senza superare il target RPE.';
    } else if (progression.fatigueConcern) {
        result.action = 'REVIEW_FATIGUE';
        result.message = 'RPE misurato alto in settimane distinte: verifica recupero e tecnica prima di correggere i kg.';
    } else if (progression.repeatedBelowMin) {
        result.action = 'REVIEW_MISSED_REPS';
        result.message = 'Ripetizioni sotto target in due settimane: rivaluta il range senza attribuire automaticamente il calo alla fatica.';
    }
    result.caveats = [...new Set(notes)];
    return result;
}

export function generateNextSessionReminder(lastAnalysis) {
    if (!lastAnalysis || !lastAnalysis.progression?.recentWeeksQualified)
        return null;
    const last = lastAnalysis;
    if (last.action === 'INCREMENT_LOAD' &&
        Number.isFinite(last.nextTargetKg)) {
        return {
            type: 'LOAD_STEP',
            badge: 'Incremento suggerito: ' + last.nextTargetKg + ' kg',
            prompt: last.message + ' Non viene applicato automaticamente.'
        };
    }
    if (last.action === 'BUILD_REPS' &&
        Number.isInteger(last.suggestedReps)) {
        return {
            type: 'REP_STEP',
            badge: 'Prossimo obiettivo: ' + last.suggestedReps + ' ripetizioni',
            prompt: last.message + ' Non viene applicato automaticamente.'
        };
    }
    return null;
}

/**
 * Legacy live helper: suggestions are advisory only.
 * The regular user-facing live coach uses liveCoach.js instead.
 */
export function evaluateRealTimePerformance(setObj, targetReps = '8-10', targetRpe = null) {
    if (!confirmed(setObj)) return null;
    const kg = numeric(setObj.weight), reps = positiveReps(setObj.reps);
    if (kg === null || kg <= 0 || reps === null) return null;
    const measured = measuredRpe(setObj.rpe);
    const target = measuredRpe(targetRpe);
    const range = parseReps(targetReps);

    if (measured === null || target === null || !range) {
        return {
            weight: kg, reps, rpe: measured,
            e1rm: null, status: 'INSUFFICIENT_EFFORT_DATA',
            suggestedNextWeight: null, isTargetMet: null,
            feedbackNote: 'Kg e ripetizioni confermati, ma RPE o target non validi: nessun carico suggerito.'
        };
    }

    const e1rm = calculateE1RM(kg, reps, measured);
    const under = reps < range.min;
    const highRpe = measured > target + 1;
    const over = reps > range.max;
    const status = highRpe ? 'OVERSHOOT_RPE' :
        under ? 'UNDER_REPS' : over ? 'OVER_REPS' : 'IN_RANGE';
    // Do not suggest jumps from a single set. Only gradual assessments
    // from 2 different completed weeks can recommend a new working weight.
    return {
        weight: kg, reps, rpe: measured, e1rm,
        status,
        suggestedNextWeight: null,
        isTargetMet: !under && !over && Math.abs(measured - target) <= 1,
        feedbackNote: highRpe
            ? 'RPE superiore al target: verifica tecnica e recupero. Nessun aumento automatico.'
            : under ? 'Ripetizioni sotto il minimo: non cambiare i kg senza altre informazioni.'
                : over ? 'Ripetizioni oltre il range: registra e rivaluta dopo più sedute.'
                    : 'Serie confermata entro il range: prosegui con tecnica controllata.'
    };
}
