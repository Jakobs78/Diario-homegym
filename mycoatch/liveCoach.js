import { EXERCISE_DATABASE } from './exercisesDB.js';
import { canonicalExerciseKey } from './exerciseIdentity.js';
import { estimateE1rm } from './historyAnalysis.js';
import { previousExercisePerformance, historicalSessionPace } from './liveHistory.js';
import { isWarmupExercise } from '../js/workoutSemantics.js';
import { assessSessionReadiness } from './sessionReadiness.js';

function decimal(value) {
    if (value === null || value === undefined || value === '') return null;
    const clean = String(value).replace('@', '').replace(',', '.').trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(clean)) return null;
    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
}

function repsValue(value, technique = false) {
    const raw = String(value ?? '').trim();
    if (/^\d{1,2}$/.test(raw)) {
        const reps = Number(raw);
        return reps >= 1 && reps <= 40 ? { reps, technique: false } : null;
    }
    if (technique && /^\d{1,2}(?:\+\d{1,2})+$/.test(raw)) {
        const reps = Number(raw.split('+')[0]);
        return reps >= 1 && reps <= 40 ? { reps, technique: true } : null;
    }
    return null;
}

function isConfirmed(set) {
    return set?.isLocked === true || set?.completed === true;
}

function isWarmup(set) {
    return Boolean(set?.isWarmup || set?.warmup || set?.is_warmup);
}

function validRpe(value) {
    const valueNumber = decimal(value);
    return valueNumber !== null && valueNumber >= 6 && valueNumber <= 10
        ? valueNumber : null;
}

function targetRepRange(exercise) {
    const minValue = decimal(exercise?.minReps);
    const maxValue = decimal(exercise?.maxReps);
    if (minValue !== null && maxValue !== null && minValue <= maxValue)
        return { min: minValue, max: maxValue };
    const text = String(exercise?.reps ?? exercise?.targetReps ?? '').trim();
    const match = text.match(/^(\d+)\s*(?:-|–|a)\s*(\d+)$/i);
    if (match && Number(match[1]) <= Number(match[2]))
        return { min: Number(match[1]), max: Number(match[2]) };
    const fixed = decimal(text);
    return fixed !== null && fixed >= 1 && fixed <= 40
        ? { min: fixed, max: fixed } : null;
}

function plannedRpe(exercise) {
    return validRpe(exercise?.targetRpe ?? exercise?.rpeTarget ?? exercise?.rpe);
}

function restSeconds(exercise) {
    const value = String(exercise?.recupero ?? exercise?.restTime ?? exercise?.rest ?? '').trim().toLowerCase();
    const minutes = value.match(/^(\d+):([0-5]\d)$/);
    if (minutes) return Number(minutes[1]) * 60 + Number(minutes[2]);
    const min = value.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|m)$/);
    if (min) return Math.round(Number(min[1].replace(',', '.')) * 60);
    const seconds = value.match(/^(\d+)\s*(?:s|sec|secondi)?$/);
    return seconds ? Number(seconds[1]) : 90;
}

function roundToIncrement(weight, increment) {
    return Math.max(increment, Math.round(weight / increment) * increment);
}

function loadingIncrement(weight, exercise) {
    // Suggerimenti, non prescrizioni obbligatorie: sono disponibili solo
    // step ragionevoli e l'utente deve confermare la disponibilita' dei dischi.
    if (weight < 12.5) return 0.5;
    if (exercise?.pattern === 'isolation' || weight < 25) return 1;
    return 2.5;
}

function isAccessory(exercise) {
    return exercise?.pattern === 'isolation';
}

function hasUnconfirmed(exercise, afterIndex = -1) {
    return (exercise?.loggedSets || []).findIndex((set, index) =>
        index > afterIndex && !isConfirmed(set) && !isWarmup(set));
}

/**
 * Verifica un insieme di valori effettivamente inseriti prima del check.
 * Non confonde rep target nel placeholder con ripetizioni realmente eseguite.
 * Le tecniche speciali possono essere registrate come 10+8+6, ma non producono e1RM.
 */
export function validateCompletedSet(values, exercise = {}, set = {}) {
    const weight = decimal(values?.weight);
    const bodyweight = EXERCISE_DATABASE.some(ex => ex.equipment === 'bodyweight' &&
        canonicalExerciseKey(ex.name) === canonicalExerciseKey(exercise.name));
    if (weight === null || weight < 0 || (weight === 0 && !bodyweight) || weight > 700) {
        return { ok: false, message: 'Inserisci il peso realmente usato in kg, maggiore di zero.' };
    }
    const tech = Boolean(set?.intensityTechnique || exercise?.isDropset ||
        set?.isDropset || exercise?.groupType === 'dropset');
    const repsInfo = repsValue(values?.reps, tech);
    if (!repsInfo) {
        return {
            ok: false,
            message: tech ? 'Indica le ripetizioni reali (es. 10 oppure 10+8+6).'
                : 'Inserisci le ripetizioni realmente eseguite (es. 8), non il range previsto.'
        };
    }
    const rawRpe = String(values?.rpe ?? '').trim();
    const rpe = rawRpe === '' ? null : validRpe(rawRpe);
    if (rawRpe !== '' && rpe === null) {
        return { ok: false, message: 'RPE non valido: usa un numero da 6 a 10 oppure lascia vuoto.' };
    }
    return {
        ok: true,
        weight,
        reps: String(values.reps).trim(),
        numericReps: repsInfo.reps,
        technique: repsInfo.technique || Boolean(set?.intensityTechnique || set?.dropSegments?.length),
        rpe,
        message: rpe === null ? 'Serie registrata senza RPE; stima della fatica limitata.' : ''
    };
}

function normalizedConfirmedSet(set, exercise) {
    if (!isConfirmed(set) || isWarmup(set)) return null;
    const parsed = validateCompletedSet(set, exercise, set);
    if (!parsed.ok) return null;
    return {
        weight: parsed.weight,
        reps: parsed.numericReps,
        rpe: parsed.rpe,
        technique: parsed.technique || set.intensityTechnique==='DROP_SET' || Boolean(set.dropSegments?.length),
        timestamp: typeof set.completedAt === 'string' ? Date.parse(set.completedAt) : NaN
    };
}

function lastCompletedIndex(exercise) {
    const sets = exercise?.loggedSets || [];
    const confirmed = sets.map((s, i) => ({
        s, i, timestamp: Date.parse(s?.completedAt ?? '') || 0
    })).filter(({ s }) => isConfirmed(s) && !isWarmup(s));
    if (!confirmed.length) return -1;
    confirmed.sort((a, b) => a.timestamp - b.timestamp || a.i - b.i);
    return confirmed.at(-1).i;
}

/**
 * Unica fonte per il coaching della singola serie, usata sia dalla card
 * che dalla panoramica della seduta. Legge ESCLUSIVAMENTE serie confermate.
 */
export function assessExerciseLive(exercise, exerciseIndex = 0, { readiness = null } = {}) {
    if(isWarmupExercise(exercise))return null;
    const sets = Array.isArray(exercise?.loggedSets) ? exercise.loggedSets : [];
    const lastIndex = lastCompletedIndex(exercise);
    if (lastIndex < 0) return null;
    const currentSet = sets[lastIndex];
    const result = normalizedConfirmedSet(currentSet, exercise);
    if (!result) return {
        exerciseIndex,
        setIndex: lastIndex,
        nextSetIndex: hasUnconfirmed(exercise, lastIndex),
        severity: 'caution',
        code: 'incomplete_log',
        message: 'La serie risulta spuntata, ma mancano kg/reps validi. Verifica la registrazione.',
        suggestedWeight: null,
        rpe: null,
        e1rm: null
    };

    const remainingIndex = hasUnconfirmed(exercise, lastIndex);
    const range = targetRepRange(exercise);
    const targetRpe = plannedRpe(exercise);
    const knownRpe = result.rpe !== null;
    // RPE 10 prescritto = cedimento programmato, non un sovraccarico imprevisto.
    const plannedFailure = targetRpe === 10 && knownRpe && result.rpe >= 9.5;
    const completed = sets.map(set => normalizedConfirmedSet(set, exercise)).filter(Boolean);
    const paired = completed.filter(set => set.rpe !== null && !set.technique);
    const actualE1rm = knownRpe && !result.technique
        ? estimateE1rm(result.weight, result.reps, result.rpe) : null;

    let code = 'on_track';
    let severity = 'ok';
    let message = 'Serie confermata. Mantieni tecnica e recupero previsti.';
    let suggestedWeight = null;

    if (result.technique) {
        code = 'special_technique';
        severity = 'info';
        message = 'Tecnica d’intensità registrata. Non stimare il massimale da una sequenza dropset/rest-pause.';
    } else if (knownRpe && result.rpe >= 9.5 && !plannedFailure) {
        code = 'high_effort';
        severity = 'caution';
        message = 'RPE molto alto: completa il recupero e valuta se mantenere la qualità della prossima serie.';
    } else if (range && result.reps < range.min) {
        code = 'below_reps';
        severity = 'caution';
        message = `Hai fatto ${result.reps} ripetizioni, sotto il minimo di ${range.min}. Verifica recupero e tecnica prima del prossimo set.`;
    } else if (plannedFailure) {
        code = 'planned_failure';
        message = 'RPE 10 previsto dalla scheda: cedimento programmato. Mantieni il carico previsto se tecnica e ripetizioni sono corrette.';
    } else if (knownRpe && targetRpe !== null && result.rpe >= targetRpe + 1) {
        code = 'above_rpe';
        severity = 'caution';
        message = `RPE ${result.rpe} contro target ${targetRpe}: oggi la serie è più faticosa del previsto.`;
    } else if (!knownRpe) {
        code = 'missing_rpe';
        severity = 'info';
        message = 'Serie confermata senza RPE: osserviamo il lavoro, ma non stimiamo e1RM o fatica percepita.';
    } else if (range && result.reps >= range.max &&
        targetRpe !== null && result.rpe <= targetRpe - 0.5) {
        code = 'strong_set';
        severity = 'ok';
        message = 'Limite alto delle ripetizioni raggiunto con margine. Mantieni il carico e cerca conferma nelle serie successive.';
    }

    if (remainingIndex >= 0 && knownRpe && !result.technique && !plannedFailure &&
        (code === 'high_effort' || code === 'above_rpe' || code === 'below_reps')) {
        const multipleHard = paired.slice(-2).filter(set =>
            set.rpe >= 9 || (range && set.reps < range.min)).length >= 2;
        if (result.rpe >= 9.5 || multipleHard) {
            const step = loadingIncrement(result.weight, exercise);
            const lower = roundToIncrement(result.weight * 0.95, step);
            if (lower < result.weight) {
                suggestedWeight = lower;
                message += ` Se la tecnica lo richiede, puoi valutare ${lower} kg nella prossima serie.`;
            }
        }
    }

    // Non suggerire aumenti in seduta da una sola serie fortunata. Richiede
    // almeno due serie consecutive COMPLETE con RPE misurato e buffer evidente.
    if (result.weight > 0 && remainingIndex >= 0 && code === 'strong_set' && paired.length >= 2 &&
        paired.slice(-2).every(set =>
            range && set.reps >= range.max && set.rpe <= targetRpe - 1)) {
        const step = loadingIncrement(result.weight, exercise);
        if (!isAccessory(exercise) || step <= 1.25) {
            suggestedWeight = roundToIncrement(result.weight + step, step);
            message = `Due serie al limite alto con RPE sotto target: se hai margine reale, valuta ${suggestedWeight} kg nel set successivo; altrimenti mantieni ${result.weight} kg.`;
            code = 'optional_increment';
        }
    }

    // Il check-in è una limitazione ulteriore rispetto alla singola serie:
    // mai premiare due set facili con kg aggiuntivi se oggi l'atleta ha
    // riferito fatica, scarso sonno o dolore. Senza check-in il comportamento
    // preesistente rimane immutato e l'incertezza è dichiarata nella UI.
    if (readiness?.level === 'stop') {
        suggestedWeight = null;
        code = 'pain_caution';
        severity = 'caution';
        message = readiness.message;
    } else if (readiness?.allowIncrease === false && code === 'optional_increment') {
        suggestedWeight = null;
        code = 'readiness_hold';
        severity = 'caution';
        message = 'Serie ben riuscite, ma ' + readiness.reasons.join(' e ') +
            ': oggi mantieni il carico, senza aumentarlo.';
    } else if (readiness?.level === 'caution' && remainingIndex >= 0 &&
        (code === 'on_track' || code === 'strong_set')) {
        severity = 'caution';
        message += ' Check-in prudente: evita di rincorrere l’intensità, ' +
            'mantieni i recuperi e rivaluta il prossimo set.';
    }

    if (remainingIndex < 0) {
        message += ' Esercizio completato; registra il risultato e valuta il prossimo.';
        suggestedWeight = null;
    }

    if (exercise?.groupType && !exercise?.isGroupLast && remainingIndex >= 0) {
        message += ' Nella superserie/triset recupera dopo l’ultimo esercizio del gruppo.';
    }

    return {
        exerciseIndex, setIndex: lastIndex, nextSetIndex: remainingIndex,
        severity, code, message, suggestedWeight, weight: result.weight,
        reps: result.reps, rpe: result.rpe,
        e1rm: actualE1rm === null ? null : Math.round(actualE1rm * 10) / 10,
        confidence: knownRpe ? 'rpe_measured' : 'performance_only'
    };
}

/**
 * Adattamento intra-seduta solo su serie REALMENTE confermate.
 * Non dedurre stanchezza clinica, non modificare automaticamente serie,
 * recuperi o peso e non togliere movimenti fondamentali.
 */
export function assessSessionAdjustment(day, readiness = null) {
    const hard = [];
    for (const exercise of day?.exercises || []) {
        if (isWarmupExercise(exercise)) continue;
        const goal = plannedRpe(exercise);
        for (const set of exercise?.loggedSets || []) {
            const real = normalizedConfirmedSet(set, exercise);
            if (!real || real.technique || real.rpe === null) continue;
            // Non conteggiare come fatica inattesa un cedimento previsto (@10).
            if (!(goal === 10 && real.rpe >= 9.5) &&
                (real.rpe >= 9.5 || (goal !== null && real.rpe >= goal + 1))) {
                hard.push({ name: exercise.name, rpe: real.rpe });
            }
        }
    }
    if (readiness?.level === 'stop') return {
        action: 'stop', hardSets: hard.length, accessoryCandidates: [],
        message: 'Dolore presente: evita l’esercizio doloroso e non forzare la seduta. ' +
            'MyCoatch non modifica le serie già registrate.'
    };
    if (hard.length < 2) return null;

    const optional = (day?.exercises || []).filter(ex =>
        !isWarmupExercise(ex) && (ex.pattern === 'isolation' || ex.isOptional) &&
        !ex.anchorKey && !ex.priorityProtected &&
        (ex.loggedSets || []).length > 0 &&
        (ex.loggedSets || []).every(set => !isConfirmed(set) || isWarmup(set))
    ).map(ex => ex.name);
    return {
        action: 'reduce', hardSets: hard.length,
        accessoryCandidates: optional,
        message: 'Più serie confermate con RPE oltre il previsto: ' +
            'rispetta pause complete, non aumentare i kg e valuta di ' +
            (optional.length ?
                'ridurre o saltare solo gli accessori non iniziati (' +
                optional.slice(0,2).join(', ') + ').' :
                'ridurre il carico del prossimo set se la tecnica peggiora.') +
            ' Nessuna serie viene modificata automaticamente.'
    };
}

function elapsedSeconds(day, now) {
    if (day?.completed && Number.isFinite(day.totalDurationMinutes))
        return Math.max(0, day.totalDurationMinutes * 60);
    const stored = Math.max(0, Number(day?.accumulatedSeconds) || 0);
    const active = day?.sessionStart && !day?.isPaused
        ? Math.max(0, (now - Number(day.sessionStart)) / 1000) : 0;
    return Math.floor(stored + active);
}

function plannedTimeMinutes(day) {
    for (const ex of day?.exercises || []) {
        const text = String(ex?.notes || '');
        const found = text.match(/\[DURATA STIMATA\]\s*(\d+)\s*minuti\s+su\s+(\d+)\s+disponibili/i);
        if (found) {
            return {
                planned: Number(found[1]),
                budget: Number(found[2])
            };
        }
    }
    return { planned: null, budget: null };
}

function timeRemainingSeconds(day) {
    let result = 0;
    let unstarted = 0;
    for (const ex of day?.exercises || []) {
        if (isWarmupExercise(ex)) continue;
        const sets = (ex.loggedSets || []).filter(set => !isWarmup(set));
        const remaining = sets.filter(set => !isConfirmed(set)).length;
        if (!remaining) continue;
        result += remaining * (ex.pattern === 'isolation' ? 50 : 55);
        const allDone = sets.length - remaining;
        if (allDone === 0) unstarted++;
        // Non contare pause all'interno di superset/triset.
        if (!ex.groupType || ex.isGroupLast) {
            result += Math.max(0, remaining - (allDone === 0 ? 1 : 0)) *
                restSeconds(ex);
        }
    }
    result += unstarted * 55;
    return Math.max(0, result);
}

/**
 * Riepilogo aggiornabile senza server/API: progresso, tonnellaggio CONFERMATO,
 * e1RM osservato con RPE, ritmo e consigli per l'esercizio in corso.
 */
export function buildLiveSessionSnapshot(day, { now = Date.now(), history = null } = {}) {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    const readiness = assessSessionReadiness(day?.coachCheckin, { now });
    let total = 0, checked = 0, valid = 0, tonnage = 0, rpeCount = 0;
    let lastAdvice = null;
    let latestTimestamp = -1;
    let warnedInvalid = false;

    exercises.forEach((exercise, exerciseIndex) => {
        if (isWarmupExercise(exercise)) return;
        (exercise.loggedSets || []).forEach(set => {
            if (isWarmup(set)) return;
            total++;
            if (!isConfirmed(set)) return;
            checked++;
            const result = normalizedConfirmedSet(set, exercise);
            if (!result) {
                warnedInvalid = true;
                return;
            }
            valid++;
            // Le ripetizioni dei dropset compositi non sono interamente
            // ricostruibili dal formato 10+8+6: tonnellaggio escluso.
            if (!result.technique) tonnage += result.weight * result.reps;
            if (result.rpe !== null) rpeCount++;
        });
        const advice = assessExerciseLive(exercise, exerciseIndex, { readiness });
        if (advice) {
            const timestamp = Date.parse(exercise.loggedSets[advice.setIndex]?.completedAt ?? '') || 0;
            // Usa il timestamp disponibile; nei dati legacy preferisce l'ordine
            // dell'elenco invece di inventare una cronologia.
            const effective = timestamp || (exerciseIndex * 100 + advice.setIndex);
            if (!lastAdvice || effective >= latestTimestamp) {
                lastAdvice = advice;
                latestTimestamp = effective;
            }
        }
    });

    const seconds = elapsedSeconds(day, now);
    const pace = history && checked && checked < total
        ? historicalSessionPace(history, day) : null;
    const baselineRemaining = checked && checked < total ? timeRemainingSeconds(day) : null;
    const remaining = baselineRemaining === null ? null : pace
        ? Math.round((baselineRemaining + (total - checked) * pace.secondsPerSet) / 2)
        : baselineRemaining;
    const previous = history && lastAdvice
        ? previousExercisePerformance(history, day, exercises[lastAdvice.exerciseIndex]?.name)
        : null;
    const e1rmChangePercent = previous?.e1rm !== null && previous?.e1rm > 0 &&
        lastAdvice?.e1rm !== null && lastAdvice?.e1rm !== undefined
        ? Math.round(1000 * (lastAdvice.e1rm / previous.e1rm - 1)) / 10 : null;
    const sessionAdjustment = assessSessionAdjustment(day, readiness);
    const time = plannedTimeMinutes(day);
    const projected = remaining === null ? null
        : Math.ceil((seconds + remaining) / 60);
    const possibleOverrun = time.budget !== null && projected !== null &&
        checked >= 2 && seconds >= 5 * 60 && projected > time.budget + 2;

    return {
        totalSets: total,
        checkedSets: checked,
        validSets: valid,
        invalidSets: checked - valid,
        percent: total ? Math.round(100 * checked / total) : 0,
        tonnageKg: Math.round(tonnage * 10) / 10,
        rpeRecordedSets: rpeCount,
        elapsedSeconds: seconds,
        estimatedMinutes: time.planned,
        budgetMinutes: time.budget,
        projectedMinutes: projected,
        remainingSeconds: remaining,
        possibleOverrun,
        lastAdvice,
        readiness,
        sessionAdjustment,
        previousExercise: previous,
        e1rmChangePercent,
        paceCalibration: pace,
        finished: total > 0 && checked === total && !warnedInvalid,
        paused: Boolean(day?.isPaused),
        readOnly: Boolean(day?.completed)
    };
}

