import { canonicalExerciseKey, canonicalExerciseName } from './exerciseIdentity.js';
import { numericValue, estimateE1rm } from './historyAnalysis.js';
import { EXERCISE_DATABASE } from './exercisesDB.js';

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
    const logged = Array.isArray(exercise.loggedSets) ? exercise.loggedSets :
        (Array.isArray(exercise.sets) ? exercise.sets : []);
    const valid = logged.flatMap(set => {
        if (!set || (set.isLocked !== true && set.completed !== true)) return [];
        const kg = numericValue(set.weight ?? set.actualKg);
        const reps = numericValue(set.reps ?? set.actualReps);
        if (kg === null || kg <= 0 || reps === null || reps <= 0) return [];
        const rpe = parseRpe(set.rpe);
        return [{ kg, reps, rpe, e1rm: rpe !== null &&
            !String(set.reps ?? set.actualReps).includes('+') ?
            estimateE1rm(kg, reps, rpe) : null }];
    });
    if (!valid.length) return null;

    const targetRpe = parseRpe(exercise.targetRpe ?? exercise.rpe);
    const repsTarget = parseRepRange(exercise.reps);
    const rawCount = logged.length ||
        Number.parseInt(String(exercise.set || ''), 10) || valid.length;
    const plannedSets = Math.max(valid.length, rawCount);
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
        totalReps: valid.reduce((sum, set) => sum + set.reps, 0),
        tonnage: valid.reduce((sum, set) => sum + set.kg * set.reps, 0),
        allRepsAtTop: max !== undefined && valid.length >= plannedSets &&
            valid.every(set => set.reps >= max),
        allRepsBelowMin: min !== undefined && valid.every(set => set.reps < min),
        allRpeWithinTarget: targetRpe !== null && validRpe.length === valid.length &&
            valid.every(set => set.rpe <= targetRpe),
        rpeOvershoot: targetRpe !== null && avgRpe !== null &&
            avgRpe >= targetRpe + 1
    };
}

function determineExerciseStatus(exposures) {
    const standard = exposures.filter(e => !e.isDeload);
    const e1rm = standard.filter(e => e.e1rm !== null);
    const recent = e1rm.slice(-3);
    if (recent.length < 3) return { status: 'insufficient_data', percent: null };
    const first = recent[0].e1rm;
    const second = recent[1].e1rm;
    const last = recent[2].e1rm;
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
                    let anyCompleted = false;
                    for (const ex of (day.exercises || [])) {
                        const parsed = inspectExercise(ex, {
                            year, mesocycleIndex: mi, week: weekNumber,
                            day: Number(day.dayNumber) || 1,
                            weekId
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

    const exerciseNotes = {};
    const stalledExercises = [];
    for (const [key, item] of Object.entries(byExercise)) {
        const standard = item.exposures.filter(e => !e.isDeload);
        const previous = standard.at(-1) || item.exposures.at(-1);
        const lastTwo = standard.slice(-2);
        const status = determineExerciseStatus(item.exposures);
        const avgRpe = mean(standard.slice(-3).map(e => e.avgRpe)
            .filter(value => value !== null));
        const recentOvershoots = lastTwo.length === 2 &&
            lastTwo.every(e => e.rpeOvershoot);
        const recentMisses = lastTwo.length === 2 &&
            lastTwo.every(e => e.allRepsBelowMin);
        const readyForLoad = lastTwo.length === 2 &&
            lastTwo.every(e => e.allRepsAtTop && e.allRpeWithinTarget) &&
            lastTwo.every(e => e.repRange && e.repRange.max === lastTwo[1].repRange.max);
        const fatigueConcern = recentOvershoots ||
            (recentMisses && status.status === 'regressing');
        item.status = status.status;
        item.e1rmChangePct = status.percent;
        item.lastKg = previous?.topKg ?? null;
        item.lastTargetRpe = previous?.targetRpe ?? null;
        item.lastReps = previous?.repRange ?? null;
        item.avgRpe = round(avgRpe);
        item.readyForLoad = readyForLoad;
        item.fatigueConcern = fatigueConcern;
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
