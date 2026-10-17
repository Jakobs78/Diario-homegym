import { HIGH_REP_EXERCISES } from './prescriptionPolicy.js';
import { canonicalExerciseKey, canonicalExerciseName } from './exerciseIdentity.js';
import { numericValue, estimateE1rm } from './historyAnalysis.js';
import { EXERCISE_DATABASE } from './exercisesDB.js';
import { evaluateExerciseProgression } from './progressionPolicy.js';
import { isWarmupExercise, plannedWorkSetCount } from '../js/workoutSemantics.js';
import { contributionsForExercise, TRACKED_MUSCLES, VOLUME_ACCOUNTING_METHOD } from './volumeAccounting.js';

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
    if (!exercise || isWarmupExercise(exercise)) return null;
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
        const bodyweight = catalog.get(canonicalExerciseKey(exercise.name))?.equipment === 'bodyweight';
        if (kg === null || kg < 0 || (kg === 0 && !bodyweight) || reps === null ||
            !Number.isInteger(reps) || reps <= 0 || reps > 100) return [];
        const rpe = parseRpe(set.rpe);
        const special = Boolean(set.intensityTechnique || set.dropSegments?.length || set.isDropset ||
            exercise.isDropset || exercise.groupType === 'dropset' ||
            repsText.includes('+'));
        return [{
            kg, reps, rpe, special,completedAt:set.completedAt,
            e1rm: !HIGH_REP_EXERCISES[catalog.get(canonicalExerciseKey(exercise.name))?.name] && rpe !== null && !special ? estimateE1rm(kg, reps, rpe) : null
        }];
    });
    if (!valid.length) return null;

    const targetRpe = parseRpe(exercise.targetRpe ?? exercise.rpe);
    const repsTarget = parseRepRange(exercise.reps);
    const plannedSets = Math.max(valid.length, plannedWorkSetCount(exercise));
    const validRpe = valid.map(set => set.rpe).filter(rpe => rpe !== null);
    const e1rms = valid.map(set => set.e1rm).filter(v => v !== null);
    const avgRpe = mean(validRpe);
    // RPE basso puo' essere una calibrazione, non uno scarico.
    const isDeload = typeof context.isDeloadWeek === 'boolean'
        ? context.isDeloadWeek : (targetRpe !== null && targetRpe <= 6.5);
    const key = canonicalExerciseKey(exercise.name);
    const meta = catalog.get(key);
    const min = repsTarget?.min;
    const max = repsTarget?.max;
    const calendarIds=context.calendarWeeks ? valid.map(set=>{
        const date=new Date(set.completedAt);
        if(!Number.isFinite(date.getTime()))return null;
        const monday=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
        monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
        return monday.toISOString().slice(0,10);
    }) : [];
    const calendarComparable=!context.calendarWeeks ||
        calendarIds.every(id=>id!==null && id===calendarIds[0]);

    return {
        ...context,
        weekId:context.calendarWeeks && calendarComparable ? calendarIds[0] : context.weekId,
        key,
        name: canonicalExerciseName(exercise.name),
        category: meta?.category || 'Non classificato',
        equipment: meta?.equipment || null,
        targetRpe,
        repRange: repsTarget,
        isDeload,
        completedSets: valid.length,
        measuredRpeSets: validRpe.length,
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
        // One RPE point below today's target in every checked working set
        // is evidence of available reserve, not an estimated RPE.
        allLowRpeWithValidReps: targetRpe !== null &&
            min !== undefined && valid.length === plannedSets &&
            validRpe.length === valid.length &&
            valid.every(set => !set.special && set.reps >= min &&
                set.reps <= (max ?? min) + 2 && set.rpe <= targetRpe - 1),
        allRpeWithinTarget: calendarComparable && targetRpe !== null && validRpe.length === valid.length &&
            valid.every(set => set.rpe <= targetRpe),
        allRpeMeasured: valid.length === plannedSets &&
            validRpe.length === valid.length,
        rpeOvershoot: targetRpe !== null && avgRpe !== null &&
            valid.length === plannedSets && validRpe.length === valid.length &&
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
export function analyzeTrainingHistory(userHistory,{calendarWeeks=false}={}) {
    const history = userHistory?.history || userHistory || {};
    const years = history.years || {};
    const byExercise = {};
    const weeks = new Map();
    // Separiamo i crediti frazionari dai set diretti legacy.
    const fractionalWeeks = new Map();
    const prescribedWeeks = new Map();
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
                        const actualWeeks=new Set();
                        if(calendarWeeks)for(const ex of session.exercises)
                        for(const set of ex?.loggedSets || ex?.sets || []){
                            if(!(set.isLocked===true || set.completed===true))continue;
                            const date=new Date(set.completedAt);
                            if(!Number.isFinite(date.getTime()))continue;
                            const monday=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
                            monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
                            actualWeeks.add(monday.toISOString().slice(0,10));
                        }
                        const volumeWeekId=calendarWeeks
                            ? actualWeeks.size===1 ? [...actualWeeks][0] : null : weekId;
                        let anyCompleted = false;
                        for (const ex of session.exercises) {
                            // Missing exercise logs are not perfect adherence. Count
                            // prescriptions separately, but never invent performance.
                            const targetRpe = parseRpe(ex?.targetRpe ?? ex?.rpe);
                            const deload = typeof week.isDeloadWeek === 'boolean'
                                ? week.isDeloadWeek : targetRpe !== null && targetRpe <= 6.5;
                            if (ex && !isWarmupExercise(ex) && !deload && volumeWeekId) {
                                if (!prescribedWeeks.has(volumeWeekId)) prescribedWeeks.set(volumeWeekId,new Map());
                                const totals=prescribedWeeks.get(volumeWeekId);
                                const muscle=catalog.get(canonicalExerciseKey(ex.name))?.category || 'Non classificato';
                                totals.set(muscle,(totals.get(muscle)||0)+plannedWorkSetCount(ex));
                            }
                            const parsed = inspectExercise(ex, {
                                year, mesocycleIndex: mi, week: weekNumber,
                                day: Number(day.dayNumber) || 1,
                                isDeloadWeek: typeof week.isDeloadWeek === 'boolean'
                                    ? week.isDeloadWeek : undefined,
                                weekId, sessionId: session.sessionId,calendarWeeks
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
                            if (parsed.isDeload || !volumeWeekId) continue;
                            const volumeCredits = contributionsForExercise(
                                parsed.name, parsed.completedSets);
                            if (volumeCredits) {
                                if (!fractionalWeeks.has(volumeWeekId)) {
                                    fractionalWeeks.set(volumeWeekId, new Map());
                                }
                                const fractionalByMuscle = fractionalWeeks.get(volumeWeekId);
                                const record = (muscle) => {
                                    if (!fractionalByMuscle.has(muscle)) {
                                        fractionalByMuscle.set(muscle, {
                                            direct: 0, indirect: 0, withRpe: 0
                                        });
                                    }
                                    return fractionalByMuscle.get(muscle);
                                };
                                const measuredRatio = parsed.measuredRpeSets /
                                    parsed.completedSets;
                                for (const [muscle, count] of Object.entries(volumeCredits.direct)) {
                                    const totals = record(muscle);
                                    totals.direct += count;
                                    totals.withRpe += count * measuredRatio;
                                }
                                for (const [muscle, count] of Object.entries(volumeCredits.indirect)) {
                                    const totals = record(muscle);
                                    totals.indirect += count;
                                    totals.withRpe += count * measuredRatio;
                                }
                            }
                            if (!weeks.has(volumeWeekId)) weeks.set(volumeWeekId, new Map());
                            const weekMuscles = weeks.get(volumeWeekId);
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
        if(calendarWeeks)item.exposures.sort((a,b)=>a.weekId.localeCompare(b.weekId));
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
        item.lastWorkingKg = progression.lastWeekWorkingKg ??
            previous?.workingKg ?? null;
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
        exerciseNotes[key] = HIGH_REP_EXERCISES[item.name]
            ? 'Confronta ripetizioni, tecnica e RPE a parità di carico: il solo e1RM non definisce uno stallo su questo isolamento.'
            : statusText[item.status];
    }

    const byMuscle = {};
    const sortedWeekIds = [...weeks.keys()];
    if(calendarWeeks)sortedWeekIds.sort();
    for (const muscle of new Set([...weeks.values()].flatMap(m => [...m.keys()]))) {
        const records = sortedWeekIds.flatMap(weekId => {
            const record = weeks.get(weekId).get(muscle);
            return record ? [{ weekId, ...record }] : [];
        });
        const recent = sortedWeekIds.slice(-3).map(weekId => {
            const record=weeks.get(weekId).get(muscle);
            return {weekId,...(record || {completedSets:0,plannedSets:0,
                observedRpe:[],distinctExercises:new Set()})};
        });
        const completed = recent.reduce((sum, e) => sum + e.completedSets, 0);
        const planned = recent.reduce((sum, e) => sum + Math.max(e.plannedSets,
            prescribedWeeks.get(e.weekId)?.get(muscle) || 0), 0);
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

    // I crediti indiretti non entrano nei contatori storici di serie dirette.
    // Per la media si usa la stessa finestra di settimane recenti, incluso
    // lo zero se il muscolo non e' stato allenato in una settimana.
    const recentWeekIds = sortedWeekIds.slice(-3);
    for (const muscle of TRACKED_MUSCLES) {
        const records = recentWeekIds.map(id =>
            fractionalWeeks.get(id)?.get(muscle) || { direct: 0, indirect: 0, withRpe: 0 });
        const direct = records.reduce((sum, item) => sum + item.direct, 0);
        const indirect = records.reduce((sum, item) => sum + item.indirect, 0);
        const fractional = direct + indirect;
        if (!fractional) continue;
        if (!byMuscle[muscle]) {
            byMuscle[muscle] = {
                weeksObserved: 0, avgWeeklySets: 0, recentAdherence: null,
                avgRpe: null, setsPerWeek: [], exerciseKeys: [],
                status: 'secondary_exposure_only_no_direct_performance_signal'
            };
        }
        const weeksCount = Math.max(1, recentWeekIds.length);
        const rpeMeasured = records.reduce((sum, item) => sum + item.withRpe, 0);
        Object.assign(byMuscle[muscle], {
            avgWeeklyDirectSets: round(direct / weeksCount),
            avgWeeklyIndirectCredits: round(indirect / weeksCount),
            avgWeeklyFractionalSets: round(fractional / weeksCount),
            fractionalRpeCoverage: round(rpeMeasured / fractional, 2),
            recentFractionalByWeek: records.map(item =>
                round(item.direct + item.indirect)),
            fractionalAccountingMethod: VOLUME_ACCOUNTING_METHOD
        });
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

