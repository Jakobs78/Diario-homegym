import { canonicalExerciseKey, canonicalExerciseName } from './exerciseIdentity.js';
import { numericValue, estimateE1rm } from './historyAnalysis.js';
import { EXERCISE_DATABASE } from './exercisesDB.js';
import { evaluateExerciseProgression } from './progressionPolicy.js';

const catalog = new Map(EXERCISE_DATABASE.map(ex => [canonicalExerciseKey(ex.name), ex]));
const orderedKeys = object => Object.keys(object || {}).sort((a, b) => Number(a) - Number(b));
const mean = numbers => numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
const round = (number, places = 1) => number === null ? null :
    Number(number.toFixed(places));

function parseRepRange(value) {
    const match = String(value ?? '').match(/^\s*(\d+)\s*(?:-|–|a)\s*(\d+)\s*$/i);
    if (match) return { min: Number(match[1]), max: Number(match[2]) };
    const fixed = String(value ?? '').match(/^\s*(\d+)\s*$/);
    return fixed ? { min: Number(fixed[1]), max: Number(fixed[1]) } : null;
}

function parseRpe(value) {
    const v = numericValue(value);
    return v !== null && v >= 6 && v <= 10 ? v : null;
}

function inspectExercise(exercise, context) {
    if (!exercise || exercise.isExcluded) return null;
    const logged = Array.isArray(exercise.loggedSets) ? exercise.loggedSets :
        (Array.isArray(exercise.sets) ? exercise.sets : []);
    const valid = logged.flatMap(set => {
        if (!set || (set.isLocked !== true && set.completed !== true) ||
            set.isWarmup || set.warmup || set.is_warmup) return [];
        const kg = numericValue(set.weight ?? set.actualKg);
        const repsText = String(set.reps ?? set.actualReps ?? '');
        // Per dropset/triset registrati come "10+8+6" conta solo la prima
        // porzione ai fini del volume; l'e1RM rimane deliberatamente ignoto.
        const reps = numericValue(repsText.includes('+') ? repsText.split('+')[0] : repsText);
        if (kg === null || kg <= 0 || reps === null ||
            !Number.isInteger(reps) || reps <= 0 || reps > 100) return [];
        const rpe = parseRpe(set.rpe);
        const special = Boolean(set.intensityTechnique || set.isDropset ||
            exercise.isDropset || exercise.groupType === 'dropset' ||
            repsText.includes('+'));
        return [{
            kg, reps, rpe, special,
            e1rm: rpe !== null && !special ? estimateE1rm(kg, reps, rpe) : null
        }];
    });
    if (!valid.length) return null;

    const targetRpe = parseRpe(exercise.targetRpe ?? exercise.rpe);
    const repsTarget = parseRepRange(exercise.reps);
    const prescribed = Number.parseInt(String(exercise.set || ''), 10);
    const countWithoutWarmups = logged.filter(set =>
        !set?.isWarmup && !set?.warmup && !set?.is_warmup).length;
    const plannedSets = Math.max(valid.length,
        Number.isFinite(prescribed) && prescribed > 0 ? prescribed : countWithoutWarmups);
    const validRpe = valid.map(set => set.rpe).filter(rpe => rpe !== null);
    const e1rms = valid.map(set => set.e1rm).filter(v => v !== null);
    const avgRpe = mean(validRpe);
    const isDeload = targetRpe !== null && targetRpe <= 6.5;
    const key = canonicalExerciseKey(exercise.name);
    const meta = catalog.get(key);
    const min = repsTarget?.min;
    const max = repsTarget?.max;

    return {
        ...context,
        key,
        name: canonicalExerciseName(exercise.name),
        category: meta?.category || 'Non classificato',
        equipment: meta?.equipment || null,
        targetRpe,
        repRange: repsTarget,
        isDeload,
        completedSets: valid.length,
        plannedSets,
        avgRpe,
        e1rm: e1rms.length ? Math.max(...e1rms) : null,
        topKg: Math.max(...valid.map(set => set.kg)),
        // The top set is NOT a safe default for all back-off sets.
        workingKg: Math.min(...valid.map(set => set.kg)),
        uniformWeight: valid.every(set => set.kg === valid[0].kg),
        allStraightSets: valid.every(set => !set.special),
        minWorkingReps: Math.min(...valid.map(set => set.reps)),
        allRepsInRange: min !== undefined && max !== undefined &&
            valid.length === plannedSets &&
            valid.every(set => set.reps >= min && set.reps <= max),
        totalReps: valid.reduce((sum, set) => sum + set.reps, 0),
        tonnage: valid.reduce((sum, set) => sum + set.kg * set.reps, 0),
        // Overshooting a narrow prescription by 10+ reps does not by
        // itself validate a safe load jump; at most +2 reps over top.
        allRepsAtTop: max !== undefined && valid.length === plannedSets &&
            valid.every(set => set.reps >= max && set.reps <= max + 2),
        allRepsBelowMin: min !== undefined && valid.every(set => set.reps < min),
        allRpeWithinTarget: targetRpe !== null && validRpe.length === valid.length &&
            valid.every(set => set.rpe <= targetRpe),
        rpeOvershoot: targetRpe !== null && avgRpe !== null &&
            avgRpe >= targetRpe + 1
    };
}

function determineExerciseStatus(exposures) {
    const standard = exposures.filter(e => !e.isDeload);
    // Tre esposizioni nello stesso microciclo non provano uno stallo
    // distribuito nel tempo. Unisci per settimana e confronta almeno 3 settimane.
    const byWeek = new Map();
    for (const exposure of standard.filter(e => e.e1rm !== null)) {
        byWeek.set(exposure.weekId, Math.max(byWeek.get(exposure.weekId) || 0, exposure.e1rm));
    }
    const recent = [...byWeek.values()].slice(-3);
    if (recent.length < 3) return { status: 'insufficient_data', percent: null };
    const first = recent[0];
    const second = recent[1];
    const last = recent[2];
    const percent = round(100 * (last / first - 1));
    if (last < first * 0.97) return { status: 'regressing', percent };
    if (last <= first * 1.01 && last <= second * 1.015)
        return { status: 'possible_stall', percent };
    if (last > first * 1.02) return { status: 'progressing', percent };
    return { status: 'stable', percent };
}

/**
 * Legge tutti gli anni e i mesocicli disponibili nello storico normalizzato
 * della webapp, senza accedere a dati di altri utenti.
 * Le serie non confermate non contano mai come allenamenti completati.
 */
export function analyzeTrainingHistory(userHistory) {
    const history = userHistory?.history || userHistory || {};
    const years = history.years || {};
    const byExercise = {};
    const weeks = new Map();
    let sessionsAnalyzed = 0;
    let inspectedMesocycles = 0;
    let lastMesocycle = null;

    for (const year of orderedKeys(years)) {
        const mesocycles = years[year]?.mesocycles || [];
        for (let mi = 0; mi < mesocycles.length; mi++) {
            const meso = mesocycles[mi];
            if (!Array.isArray(meso?.weeks)) continue;
            inspectedMesocycles++;
            lastMesocycle = meso;

            const sortedWeeks = [...meso.weeks].sort((a, b) =>
                Number(a.weekNumber) - Number(b.weekNumber));
            for (const week of sortedWeeks) {
                const weekNumber = Number(week.weekNumber) || 1;
                const weekId = `${year}/${mi}/${weekNumber}`;
                const days = [...(week.days || [])].sort((a, b) =>
                    Number(a.dayNumber) - Number(b.dayNumber));
                for (const day of days) {
                    // PR #14 stores repeated-session results in sessionArchives.
                    // Read those as *separate actual sessions*, preserving weekId
                    // so redoing one planned day cannot count as longitudinal
                    // progress across two weeks. Never mutate these archives.
                    const priorSessions = (Array.isArray(day.sessionArchives) ?
                        day.sessionArchives : []).map((archive, archiveIndex) => ({
                        exercises: archive.exercises || [],
                        sessionId: weekId + '/' + day.dayNumber + '/archived/' + archiveIndex
                    }));
                    const sessions = [...priorSessions, {
                        exercises: day.exercises || [],
                        sessionId: weekId + '/' + day.dayNumber + '/current'
                    }];
                    for (const session of sessions) {
                        let anyCompleted = false;
                        for (const ex of session.exercises) {
                            const parsed = inspectExercise(ex, {
                                year, mesocycleIndex: mi, week: weekNumber,
                                day: Number(day.dayNumber) || 1,
                                weekId, sessionId: session.sessionId
                            });
                            if (!parsed) continue;
                            anyCompleted = true;
                            if (!byExercise[parsed.key]) {
                                byExercise[parsed.key] = {
                                    name: parsed.name, category: parsed.category,
                                    equipment: parsed.equipment, exposures: []
                                };
                            }
                            byExercise[parsed.key].exposures.push(parsed);
                            if (parsed.isDeload) continue;
                            if (!weeks.has(weekId)) weeks.set(weekId, new Map());
                            const weekMuscles = weeks.get(weekId);
                            if (!weekMuscles.has(parsed.category)) {
                                weekMuscles.set(parsed.category, {
                                    completedSets: 0, plannedSets: 0, tonnage: 0,
                                    observedRpe: [], distinctExercises: new Set()
                                });
                            }
                            const stats = weekMuscles.get(parsed.category);
                            stats.completedSets += parsed.completedSets;
                            stats.plannedSets += parsed.plannedSets;
                            stats.tonnage += parsed.tonnage;
                            stats.distinctExercises.add(parsed.key);
                            if (parsed.avgRpe !== null) stats.observedRpe.push(parsed.avgRpe);
                        }
                        if (anyCompleted) sessionsAnalyzed++;
                    }
                }
            }
        }
    }

    const exerciseNotes = {};
    const stalledExercises = [];
    for (const [key, item] of Object.entries(byExercise)) {
        const standard = item.exposures.filter(e => !e.isDeload);
        const previous = standard.at(-1) || item.exposures.at(-1);
        const status = determineExerciseStatus(item.exposures);
        const avgRpe = mean(standard.slice(-3).map(e => e.avgRpe)
            .filter(value => value !== null));
        const progression = evaluateExerciseProgression(item.exposures);
        const { readyForLoad, readyForReps, nextRepTarget, fatigueConcern } = progression;
        item.status = status.status;
        item.e1rmChangePct = status.percent;
        item.lastKg = previous?.topKg ?? null;
        item.lastWorkingKg = previous?.workingKg ?? null;
        item.lastTargetRpe = previous?.targetRpe ?? null;
        item.lastReps = previous?.repRange ?? null;
        item.avgRpe = round(avgRpe);
        item.readyForLoad = readyForLoad;
        item.readyForReps = readyForReps;
        item.nextRepTarget = nextRepTarget;
        item.fatigueConcern = fatigueConcern;
        item.progressionEvidence = progression;
        item.completedSets = item.exposures.reduce((sum, e) =>
            sum + e.completedSets, 0);
        item.exposuresCount = standard.length;
        item.previousExercise = previous || null;

        if (status.status === 'possible_stall') {
            stalledExercises.push(item.name);
        }
        const statusText = {
            insufficient_data: 'Storico RPE insufficiente per valutare il trend e1RM.',
            regressing: 'e1RM in calo nelle ultime tre esposizioni: verificare fatica e condizioni di esecuzione.',
            possible_stall: 'Possibile stallo e1RM su tre esposizioni, da confermare con contesto e recupero.',
            progressing: 'e1RM in crescita nelle ultime tre esposizioni.',
            stable: 'e1RM stabile: monitorare senza modifiche automatiche drastiche.'
        };
        exerciseNotes[key] = statusText[item.status];
    }

    const byMuscle = {};
    const sortedWeekIds = [...weeks.keys()];
    for (const muscle of new Set([...weeks.values()].flatMap(m => [...m.keys()]))) {
        const records = sortedWeekIds.flatMap(weekId => {
            const record = weeks.get(weekId).get(muscle);
            return record ? [{ weekId, ...record }] : [];
        });
        const recent = records.slice(-3);
        const completed = recent.reduce((sum, e) => sum + e.completedSets, 0);
        const planned = recent.reduce((sum, e) => sum + e.plannedSets, 0);
        const rpes = recent.flatMap(e => e.observedRpe);
        const trendSamples = recent.map(e => e.completedSets);
        byMuscle[muscle] = {
            weeksObserved: records.length,
            avgWeeklySets: round(completed / Math.max(1, recent.length)),
            recentAdherence: planned ? round(completed / planned, 2) : null,
            avgRpe: round(mean(rpes)),
            setsPerWeek: trendSamples,
            exerciseKeys: [...new Set(recent.flatMap(e => [...e.distinctExercises]))],
            status: 'workload_observed_not_hypertrophy_measurement'
        };
    }

    return {
        byExercise, byMuscle, exerciseNotes, stalledExercises,
        sessionsAnalyzed, inspectedMesocycles,
        inspectedYears: orderedKeys(years).length,
        lastMesocycle,
        recommendation: stalledExercises.length ? 'review_recommended' :
            sessionsAnalyzed ? 'data_available' : 'insufficient_data',
        source: 'multi_mesocycle_confirmed_sets'
    };
}
