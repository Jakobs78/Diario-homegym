/**
 * Conservative repetition trend and block-to-block response signals.
 * These observations do not measure hypertrophy or prove a causal effect.
 * No missing RPE, unconfirmed set, special set, or deload can qualify.
 */

const same = (a, b, tolerance = 0) =>
    Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;

function validExposure(ex) {
    const range = ex?.repRange;
    return Boolean(ex && !ex.isDeload && ex.weekId &&
        Number.isFinite(ex.workingKg) && ex.workingKg >= 0 &&
        range && Number.isInteger(range.min) && Number.isInteger(range.max) &&
        range.min > 0 && range.max >= range.min &&
        ex.completedSets > 0 && ex.completedSets === ex.plannedSets &&
        ex.allStraightSets === true && ex.uniformWeight === true &&
        ex.allRpeMeasured === true && ex.allRpeWithinTarget === true &&
        Number.isFinite(ex.targetRpe) &&
        Number.isInteger(ex.minWorkingReps) && ex.minWorkingReps > 0 &&
        ex.minWorkingReps >= range.min && ex.minWorkingReps <= range.max);
}

function comparable(a, b) {
    return a && b &&
        same(a.workingKg, b.workingKg, Math.max(0.01, a.workingKg * 0.02)) &&
        a.repRange.min === b.repRange.min && a.repRange.max === b.repRange.max &&
        a.completedSets === b.completedSets && a.plannedSets === b.plannedSets &&
        same(a.targetRpe, b.targetRpe);
}

function weeklyObservations(exposures) {
    const weeks = new Map();
    for (const ex of exposures || []) {
        if (!ex || ex.isDeload || !ex.weekId) continue;
        const id = ex.weekId;
        if (!weeks.has(id)) weeks.set(id, []);
        weeks.get(id).push(ex);
    }
    // Every exposure during the same week must qualify, rather than cherry-picking
    // the best session. A conservative minimum is compared at unchanged load.
    return [...weeks].map(([id, entries]) => {
        const first = entries[0];
        if (!entries.every(validExposure) ||
            !entries.every(ex => comparable(first, ex))) return null;
        return {
            ...first, weekId: id,
            minWorkingReps: Math.min(...entries.map(ex => ex.minWorkingReps)),
            blockId: first.year + '/' + first.mesocycleIndex
        };
    });
}

const noTrend = () => ({status: 'insufficient_data', repsDelta: null, metric: null});

/**
 * Require three consecutive observable weeks, same load, target, range and
 * completed work. A single repeated session is not a longitudinal trend.
 */
export function evaluateRepetitionTrend(exposures = []) {
    const last = weeklyObservations(exposures).slice(-3);
    if (last.length < 3 || last.some(x => x === null) ||
        !last.every(ex => comparable(last[0], ex))) return noTrend();
    const [first, middle, recent] = last.map(x => x.minWorkingReps);
    const repsDelta = recent - first;
    const status = repsDelta >= 1 ? 'progressing' :
        repsDelta <= -2 ? 'regressing' :
        recent === first && middle === first ? 'possible_stall' : 'stable';
    return {status, repsDelta, metric: 'working_reps',
        evidenceWeeks: last.map(x => x.weekId)};
}

/**
 * Read-only observational feedback over the two latest blocks.
 * Four distinct comparable weeks are required (two per block).
 * An observed improvement is NOT proof that a programming change caused it.
 */
export function compareBlockResponse(exposures = []) {
    const source = weeklyObservations(exposures);
    if (source.length < 4 || source.some(x => x === null)) return null;
    const blocks = new Map();
    for (const week of source) {
        if (!blocks.has(week.blockId)) blocks.set(week.blockId, []);
        blocks.get(week.blockId).push(week);
    }
    const last = [...blocks].slice(-2);
    if (last.length < 2 || last.some(([, weeks]) => weeks.length < 2)) return null;
    const previous = last[0][1].slice(-2);
    const current = last[1][1].slice(-2);
    const four = [...previous, ...current];
    if (!four.every(ex => comparable(four[0], ex))) return null;
    const before = (previous[0].minWorkingReps + previous[1].minWorkingReps) / 2;
    const after = (current[0].minWorkingReps + current[1].minWorkingReps) / 2;
    const deltaReps = after - before;
    return {
        metric: 'min_reps_at_comparable_load', previousBlock: last[0][0],
        currentBlock: last[1][0], workingKg: four[0].workingKg,
        previousAvgMinReps: before, currentAvgMinReps: after,
        deltaReps, status: deltaReps >= 1 ? 'improved' :
            deltaReps <= -1 ? 'declined' : 'stable',
        interpretation: 'Confronto descrittivo a carico, range e RPE target costanti; non prova la causa del cambiamento.'
    };
}
