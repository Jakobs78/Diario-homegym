/**
 * Read-only end-of-mesocycle review. Uses only confirmed, validated working
 * sets; never changes the journal or treats an archived repeat as a scheduled
 * session completed. Outcomes are observations, not hypertrophy measurements.
 */
import { isWarmupExercise, isWarmupSet, plannedWorkSetCount } from './workoutSemantics.js';
import { validateCompletedSet } from '../mycoatch/liveCoach.js';
import { canonicalExerciseKey } from '../mycoatch/exerciseIdentity.js';

const rounded = (n, digits = 1) => Number(n.toFixed(digits));
const confirmed = set => set?.isLocked === true || set?.completed === true;

function performance(ex, set) {
    if (!confirmed(set) || isWarmupSet(set)) return null;
    const record = validateCompletedSet(set, ex, set);
    return record.ok ? record : null;
}

function inspectDay(day, weekNumber) {
    let plannedSets = 0, confirmedSets = 0, invalidConfirmedSets = 0;
    let measuredRpe = 0, rpeSum = 0;
    const samples = [];
    const exercises = (day?.exercises || []).filter(ex => !isWarmupExercise(ex));
    for (const ex of exercises) {
        const expected = plannedWorkSetCount(ex);
        plannedSets += expected;
        if (!expected) continue;
        const sets = Array.isArray(ex.loggedSets) ? ex.loggedSets :
            Array.isArray(ex.sets) ? ex.sets : [];
        let valid = 0;
        const rows = [];
        for (const set of sets) {
            if (isWarmupSet(set)) continue;
            const result = performance(ex, set);
            if (confirmed(set) && !result) invalidConfirmedSets++;
            if (!result) continue;
            valid++;
            rows.push(result);
            if (result.rpe !== null) {
                measuredRpe++;
                rpeSum += result.rpe;
            }
        }
        confirmedSets += Math.min(expected, valid);
        if (valid >= expected && rows.length) {
            samples.push({
                key: canonicalExerciseKey(ex.name),
                name: ex.name, kg: Math.min(...rows.map(row => row.weight)),
                minReps: Math.min(...rows.map(row => row.numericReps)),
                comparable: rows.every(row => !row.technique) &&
                    rows.every(row => row.weight === rows[0].weight),
                weekNumber
            });
        }
    }
    const status = plannedSets === 0 ? 'no_plan' :
        confirmedSets === plannedSets && invalidConfirmedSets === 0
            ? 'complete' : confirmedSets ? 'partial' : 'not_started';
    return {
        weekNumber, dayNumber: day?.dayNumber ?? null,
        dayName: day?.dayName || 'Giorno ' + (day?.dayNumber ?? '?'),
        status, plannedSets, confirmedSets, invalidConfirmedSets,
        measuredRpe, rpeSum, samples,
        archivedRepeats: Array.isArray(day?.sessionArchives) ? day.sessionArchives.length : 0
    };
}

function observedChanges(days) {
    const byExercise = new Map();
    for (const day of days.filter(day => day.status === 'complete')) {
        for (const item of day.samples) {
            if (!item.key || !item.comparable) continue;
            if (!byExercise.has(item.key)) byExercise.set(item.key, new Map());
            const weeks = byExercise.get(item.key);
            const old = weeks.get(item.weekNumber);
            if (!old || item.minReps < old.minReps) weeks.set(item.weekNumber, item);
        }
    }
    const changes = [];
    for (const weeks of byExercise.values()) {
        const values = [...weeks.values()].sort((a, b) =>
            Number(a.weekNumber) - Number(b.weekNumber));
        if (values.length < 2) continue;
        const first = values[0], last = values.at(-1);
        const sameKg = Math.abs(first.kg - last.kg) < 0.01;
        changes.push({
            name: last.name, firstWeek: first.weekNumber, lastWeek: last.weekNumber,
            firstKg: first.kg, lastKg: last.kg,
            firstMinReps: first.minReps, lastMinReps: last.minReps,
            metric: sameKg ? 'repetitions_at_same_load' : 'different_loads',
            deltaReps: sameKg ? last.minReps - first.minReps : null
        });
    }
    return changes.sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

export function summarizeMesocycleClosure(mesocycle) {
    const weeks = Array.isArray(mesocycle?.weeks) ? [...mesocycle.weeks].sort(
        (a, b) => Number(a.weekNumber) - Number(b.weekNumber)) : [];
    const days = weeks.flatMap(week => (week.days || []).map(day =>
        inspectDay(day, week.weekNumber)));
    const sessions = days.filter(day => day.status !== 'no_plan');
    const plannedSessions = sessions.length;
    const completedSessions = sessions.filter(day => day.status === 'complete').length;
    const partialSessions = sessions.filter(day => day.status === 'partial').length;
    const skippedSessions = sessions.filter(day => day.status === 'not_started').length;
    const plannedSets = sessions.reduce((n, day) => n + day.plannedSets, 0);
    const completedSets = sessions.reduce((n, day) => n + day.confirmedSets, 0);
    const invalidConfirmedSets = sessions.reduce((n, day) => n + day.invalidConfirmedSets, 0);
    const measuredRpeSets = sessions.reduce((n, day) => n + day.measuredRpe, 0);
    const rpeSum = sessions.reduce((n, day) => n + day.rpeSum, 0);
    const review = {
        version: 1, name: mesocycle?.name || 'Mesociclo',
        weeks: weeks.length, plannedSessions, completedSessions,
        partialSessions, skippedSessions, plannedSets, completedSets,
        invalidConfirmedSets, measuredRpeSets,
        averageRpe: measuredRpeSets ? rounded(rpeSum / measuredRpeSets) : null,
        adherencePercent: plannedSessions ?
            rounded(100 * completedSessions / plannedSessions, 0) : null,
        setCompletionPercent: plannedSets ?
            rounded(100 * completedSets / plannedSets, 0) : null,
        archivedRepeats: days.reduce((n, day) => n + day.archivedRepeats, 0),
        status: !plannedSessions ? 'no_plan' :
            completedSessions === plannedSessions ? 'complete' :
                completedSets ? 'partial' : 'not_started',
        incompleteDays: sessions.filter(day => day.status !== 'complete').map(day => ({
            weekNumber: day.weekNumber, dayNumber: day.dayNumber, dayName: day.dayName,
            status: day.status, confirmedSets: day.confirmedSets, plannedSets: day.plannedSets
        })),
        exerciseChanges: observedChanges(sessions)
    };
    // In-memory optimistic lease: a change to ANY workout/log field between
    // preview and confirmation invalidates the review, even if totals agree.
    // Non-enumerable: never exported in ChatGPT summaries or closure metadata.
    Object.defineProperty(review, '_sourceSnapshot', {
        value: JSON.stringify(mesocycle?.weeks || []), enumerable: false
    });
    return review;
}

/** Minimal metadata in the existing mesocycle JSON; no duplicate workout data. */
export function closeMesocycleInMemory(mesocycle, report, {at = new Date().toISOString(),
    acknowledgeIncomplete = false} = {}) {
    if (!mesocycle || !Array.isArray(mesocycle.weeks) || !report?.plannedSessions)
        throw Error('Nessun programma di allenamento valido da concludere.');
    if (mesocycle.coachClosure?.status === 'closed')
        throw Error('Il mesociclo risulta già concluso.');
    // Re-evaluate immediately before writing: previews are never authority.
    const current = summarizeMesocycleClosure(mesocycle);
    if (report._sourceSnapshot !== JSON.stringify(mesocycle.weeks) ||
        JSON.stringify(current) !== JSON.stringify(report))
        throw Error('Le sedute sono cambiate: rivedi il riepilogo prima di concludere.');
    if (current.status !== 'complete' && acknowledgeIncomplete !== true)
        throw Error('Il mesociclo è incompleto: conferma esplicitamente la chiusura anticipata.');
    const date = new Date(at);
    if (!Number.isFinite(date.getTime()))
        throw Error('Data di chiusura non valida.');
    mesocycle.coachClosure = {
        status: 'closed', version: 1, closedAt: date.toISOString(),
        incompleteAcknowledged: current.status !== 'complete',
        review: {
            plannedSessions: current.plannedSessions,
            completedSessions: current.completedSessions,
            partialSessions: current.partialSessions,
            skippedSessions: current.skippedSessions,
            plannedSets: current.plannedSets, completedSets: current.completedSets
        }
    };
    mesocycle.locked = true;
    return mesocycle.coachClosure;
}

export function formatMesocycleClosureForChat(review) {
    const lines = [
        'HOMEGYM DIARY — REPORT FINALE MESOCICLO (dati confermati)',
        'Mesociclo: blocco selezionato',
        'Settimane programmate: ' + review.weeks,
        'Sedute completate: ' + review.completedSessions + '/' + review.plannedSessions,
        'Sedute parziali: ' + review.partialSessions,
        'Sedute non iniziate: ' + review.skippedSessions,
        'Serie valide confermate: ' + review.completedSets + '/' + review.plannedSets,
        'Serie confermate con dati non validi: ' + review.invalidConfirmedSets,
        'RPE misurati: ' + review.measuredRpeSets + '/' + review.completedSets,
        'RPE medio dei valori realmente misurati: ' + (review.averageRpe ?? 'non disponibile'),
        'Aderenza (sedute complete): ' + (review.adherencePercent ?? '-') + '%',
        'Sedute ripetute archiviate (non conteggiate nell’aderenza): ' + review.archivedRepeats,
        'ESERCIZI — confronto descrittivo fra settimane con giornate complete:'
    ];
    if (!review.exerciseChanges.length) lines.push('Nessun confronto affidabile tra settimane disponibile.');
    for (const ex of review.exerciseChanges) {
        lines.push(ex.name + ': sett. ' + ex.firstWeek + ' (' + ex.firstKg +
            ' kg, minimo ' + ex.firstMinReps + ' reps) → sett. ' + ex.lastWeek +
            ' (' + ex.lastKg + ' kg, minimo ' + ex.lastMinReps + ' reps)' +
            (ex.deltaReps === null ? ' · carichi diversi: non inferire miglioramento dalle reps.' :
                ' · variazione reps allo stesso carico: ' +
                (ex.deltaReps > 0 ? '+' : '') + ex.deltaReps));
    }
    if (review.incompleteDays.length) {
        lines.push('SEDUTE NON COMPLETE (da verificare, senza inventare allenamenti):');
        for (const d of review.incompleteDays)
            lines.push('Sett. ' + d.weekNumber + ', ' + d.dayName + ': ' +
                d.confirmedSets + '/' + d.plannedSets + ' serie.');
    }
    lines.push('Nota: questo report non misura ipertrofia e non stabilisce la causa dei cambiamenti.');
    lines.push('Il report esclude i campi identificativi dell’account; controlla eventuali nomi personalizzati prima di condividerlo.');
    return lines.join('\n');
}
