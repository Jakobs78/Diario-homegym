/**
 * MyCoatch 3.3 — evidence-gated double progression.
 *
 * These are deterministic, conservative coaching heuristics, not physiological
 * measurements. Work sets must be genuinely confirmed and their RPE measured
 * before a load step is suggested. No user data is changed here.
 *
 * References: ACSM Position Stand (2009), doi:10.1249/MSS.0b013e3181915670
 * and Robinson et al. 2024, doi:10.1007/s40279-024-02069-2.
 * A precise numeric RPE/RIR is subjective and never inferred from repetitions.
 */

function groupWorkingWeeks(exposures = []) {
    const weeks = new Map();
    for (const ex of exposures) {
        if (!ex || ex.isDeload || !ex.weekId) continue;
        if (!weeks.has(ex.weekId)) weeks.set(ex.weekId, []);
        weeks.get(ex.weekId).push(ex);
    }
    return [...weeks].map(([id, entries]) => ({ id, entries }));
}

function qualityGate(week) {
    const exercises = week.entries;
    const range = exercises[0]?.repRange;
    const consistentRange = Boolean(range) && exercises.every(e =>
        e.repRange && e.repRange.min === range.min && e.repRange.max === range.max
    );
    const targetRpe=exercises[0]?.targetRpe;
    const consistentEffort=exercises.every(e=>e.targetRpe===targetRpe);
    const allFullyLogged = exercises.every(e =>
        e.completedSets > 0 && e.completedSets === e.plannedSets);
    const allStraight = exercises.every(e =>
        e.allStraightSets === true && e.uniformWeight === true) &&
        exercises.every(e => e.workingKg === exercises[0]?.workingKg);
    const allRpe = exercises.every(e => e.allRpeWithinTarget === true);
    const maxAtTop = exercises.every(e => e.allRepsAtTop === true);
    const allEasy = exercises.every(e => e.allLowRpeWithValidReps === true);
    const aboveMinimum = exercises.every(e => e.allRepsInRange === true);
    return {
        id: week.id,
        complete: allFullyLogged,
        comparable: consistentRange && consistentEffort && allFullyLogged && allStraight,
        targetRpe,
        safe: consistentRange && allFullyLogged && allStraight && allRpe,
        allAtTop: maxAtTop,
        allEasy,
        inRange: aboveMinimum,
        minReps: exercises.length ? Math.min(...exercises
            .map(e => e.minWorkingReps ?? 0)) : null,
        maxReps: range?.max ?? null,
        repRange: range,
        topKg: exercises.length ? Math.max(...exercises.map(e => e.topKg)) : null,
        workingKg: exercises.length ? Math.min(...exercises.map(e => e.workingKg)) : null,
        overshoot: exercises.length > 0 && exercises.every(e => e.rpeOvershoot === true),
        belowMin: exercises.length > 0 && exercises.every(e => e.allRepsBelowMin === true),
        reasons: [
            !consistentRange ? 'range_ripetizioni_variato' : null,
            !allFullyLogged ? 'serie_incomplete' : null,
            !allStraight ? 'tecnica_speciale_o_carichi_misti' : null,
            !allRpe ? 'rpe_mancante_o_sopra_target' : null
        ].filter(Boolean)
    };
}

/**
 * Distinct WEEKS are the unit of evidence; two sessions on Monday and
 * Thursday cannot masquerade as two separate weeks of adaptation.
 * If there are multiple sessions in the same week, ALL must pass.
 */
function evaluateStream(exposures = []) {
    const weekly = groupWorkingWeeks(exposures);
    const lastTwo = weekly.slice(-2).map(qualityGate);
    const last = lastTwo.at(-1) || null;
    const enoughWeeks = lastTwo.length === 2;
    const similarTargets = enoughWeeks && lastTwo[0].repRange &&
        lastTwo[1].repRange &&
        lastTwo[0].repRange.min === lastTwo[1].repRange.min &&
        lastTwo[0].repRange.max === lastTwo[1].repRange.max;
    // Due settimane di carichi di lavoro COMPARABILI. Se l'atleta ha gia'
    // aumentato autonomamente i kg, raccogli nuove conferme prima di
    // suggerire un altro salto, anche quando il nuovo carico e' facile.
    const comparableLoads = enoughWeeks && lastTwo[0].workingKg > 0 &&
        lastTwo[1].workingKg > 0 &&
        Math.abs(lastTwo[1].workingKg / lastTwo[0].workingKg - 1) <= 0.02;
    const qualified = Boolean(enoughWeeks && similarTargets &&
        lastTwo.every(w => w.safe) && comparableLoads);
    // Two distinct comparable weeks are still required before a new
    // mesocycle's load is increased. Either top reps, OR at least one
    // confirmed RPE point in reserve across every valid working set.
    const readyForLoad = qualified &&
        lastTwo.every(w => w.allAtTop || w.allEasy);
    const readyForReps = qualified && !readyForLoad &&
        last !== null && last.inRange && !last.allAtTop &&
        last.minReps < last.maxReps;
    const nextRepTarget = readyForReps
        ? Math.min(last.maxReps, last.minReps + 1) : null;

    // Persistent difficulty is a signal for review, NOT a diagnosis
    // of overtraining or a mandate to change the programme.
    const comparableDifficulty = enoughWeeks && similarTargets && comparableLoads &&
        lastTwo[0].targetRpe===lastTwo[1].targetRpe &&
        lastTwo.every(w=>w.comparable);
    const repeatedBelowMin = comparableDifficulty &&
        lastTwo.every(w => w.complete && w.belowMin);
    // Missed reps alone cannot diagnose fatigue. Only two weeks of
    // *measured* RPE substantially over the prescription suggest it.
    const fatigueConcern = comparableDifficulty && lastTwo.every(w => w.overshoot);

    return {
        readyForLoad,
        readyForReps,
        nextRepTarget,
        fatigueConcern,
        repeatedBelowMin,
        lastWeekWorkingKg: last?.workingKg ?? null,
        distinctWeeks: weekly.length,
        evidenceWeeks: lastTwo.map(w => w.id),
        recentWeeksQualified: qualified,
        progressionTrigger: readyForLoad ? (
            lastTwo.every(w=>w.allAtTop) ? 'top_reps' : 'low_rpe'
        ) : null,
        nextActionHint: readyForLoad ? 'small_load_increase' :
            readyForReps ? 'add_one_rep' :
            fatigueConcern ? 'review_fatigue' :
            repeatedBelowMin ? 'review_missed_reps' : 'hold_and_record',
        caveats: [
            !enoughWeeks ? 'servono_due_settimane_distinte' : null,
            enoughWeeks && !similarTargets ? 'target_ripetizioni_differente' : null,
            enoughWeeks && !comparableLoads ? 'carichi_non_confrontabili' : null,
            ...lastTwo.flatMap(w => w.reasons)
        ].filter((value, index, list) => value !== null &&
            list.indexOf(value) === index)
    };
}


export function exposureRoleKey(ex){
    return String(ex?.exposureRole||ex?.repIntent||'')+'|'+String(ex?.repRange?.min??'')+'-'+String(ex?.repRange?.max??'')+'@'+String(ex?.targetRpe??'');
}
export function evaluateExerciseProgression(exposures=[]){
    const streams=new Map();
    for(const ex of exposures){const key=exposureRoleKey(ex);if(!streams.has(key))streams.set(key,[]);streams.get(key).push(ex);}
    const byRole=Object.fromEntries([...streams].map(([key,entries])=>[key,evaluateStream(entries)]));
    const selectedRole=exposureRoleKey(exposures.at(-1));
    return {...(byRole[selectedRole]||evaluateStream([])),selectedRole,byRole};
}
