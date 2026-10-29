import {EXERCISE_DATABASE} from '../mycoatch/exercisesDB.js';
/**
 * Read-only end-of-mesocycle review. Uses only confirmed, validated working
 * sets; never changes the journal or treats an archived repeat as a scheduled
 * session completed. Outcomes are observations, not hypertrophy measurements.
 */
import { isWarmupExercise, plannedWorkSetCount } from './workoutSemantics.js';
import {buildMesocycleAnalysis,formatAnalysisLines,analysisExerciseRows} from '../mycoatch/mesocycleAnalysis.js';
import { canonicalExerciseKey } from '../mycoatch/exerciseIdentity.js';

const rounded = (n, digits = 1) => Number(n.toFixed(digits));
const rpeSumFor = rows => rows.reduce((sum, row) => sum + row.rpe, 0);

function inspectDay(day, weekNumber) {
    let plannedSets = 0, confirmedSets = 0, invalidConfirmedSets = 0;
    let measuredRpe = 0, rpeSum = 0;
    let skippedSets=0;
    const exerciseResults = [];
    const exercises = (day?.exercises || []).filter(ex => !isWarmupExercise(ex));
    for (const ex of exercises) {
        const expected = plannedWorkSetCount(ex);
        plannedSets += expected;
        if (!expected) continue;
        const assessed=analysisExerciseRows(ex);
        const rows=assessed.valid;
        invalidConfirmedSets+=assessed.invalid.length;
        skippedSets+=assessed.skipped;
        // Use the same expected work-set count for completion and RPE
        // coverage (including legacy imports whose log rows are the only
        // available prescription).
        const countedRows = rows.slice(0, expected);
        const realRpe = countedRows.filter(row => row.rpe !== null);
        measuredRpe += realRpe.length;
        rpeSum += realRpe.reduce((sum, row) => sum + row.rpe, 0);
        confirmedSets += countedRows.length;
        if (countedRows.length) exerciseResults.push({
            name: ex.name,
            weekNumber, validSets: countedRows.length,
            minKg: Math.min(...countedRows.map(row => row.weight)),
            maxKg: Math.max(...countedRows.map(row => row.weight)),
            minReps: Math.min(...countedRows.map(row => row.numericReps)),
            maxReps: Math.max(...countedRows.map(row => row.numericReps)),
            rpeMeasured: realRpe.length,
            averageRpe: realRpe.length ? rounded(rpeSumFor(realRpe) / realRpe.length) : null
        });
    }
    const status = plannedSets === 0 ? 'no_plan' :
        confirmedSets+skippedSets === plannedSets && invalidConfirmedSets === 0
            ? 'complete' : confirmedSets ? 'partial' : 'not_started';
    return {
        weekNumber, dayNumber: day?.dayNumber ?? null,
        dayName: day?.dayName || 'Giorno ' + (day?.dayNumber ?? '?'),
        status, plannedSets, confirmedSets, invalidConfirmedSets,skippedSets,
        measuredRpe, rpeSum, exerciseResults,
        archivedRepeats: Array.isArray(day?.sessionArchives) ? day.sessionArchives.length : 0
    };
}

export function summarizeMesocycleClosure(mesocycle) {
    const weeks = Array.isArray(mesocycle?.weeks) ? [...mesocycle.weeks].sort(
        (a, b) => Number(a.weekNumber) - Number(b.weekNumber)) : [];
    const days = weeks.flatMap(week => (week.days || []).map(day =>
        inspectDay(day, week.weekNumber)));
    const sessions = days.filter(day => day.status !== 'no_plan');
    const plannedSessions = sessions.length;
    const resolvedSessions=sessions.filter(day=>day.status==='complete').length;
    const completedSessions = sessions.filter(day => day.status === 'complete'&&!day.skippedSets).length;
    const sessionsWithSkips=sessions.filter(day=>day.status==='complete'&&day.skippedSets>0).length;
    const partialSessions = sessions.filter(day => day.status === 'partial').length;
    const skippedSessions = sessions.filter(day => day.status === 'not_started').length;
    const plannedSets = sessions.reduce((n, day) => n + day.plannedSets, 0);
    const completedSets = sessions.reduce((n, day) => n + day.confirmedSets, 0);
    const invalidConfirmedSets = sessions.reduce((n, day) => n + day.invalidConfirmedSets, 0);
    const measuredRpeSets = sessions.reduce((n, day) => n + day.measuredRpe, 0);
    const rpeSum = sessions.reduce((n, day) => n + day.rpeSum, 0);
    const analysis=buildMesocycleAnalysis(mesocycle);
    const review = {
        version: 1, name: mesocycle?.name || 'Mesociclo',
        weeks: weeks.length, plannedSessions, completedSessions,sessionsWithSkips,
        partialSessions, skippedSessions, plannedSets, completedSets,
        invalidConfirmedSets, measuredRpeSets,
        missingSets:Math.max(0,plannedSets-completedSets-sessions.reduce((n,d)=>n+d.skippedSets,0)-invalidConfirmedSets),
        skippedSets:sessions.reduce((n,day)=>n+day.skippedSets,0),
        averageRpe: measuredRpeSets ? rounded(rpeSum / measuredRpeSets) : null,
        adherencePercent: plannedSessions ?
            rounded(100 * completedSessions / plannedSessions, 0) : null,
        setCompletionPercent: plannedSets ?
            rounded(100 * completedSets / plannedSets, 0) : null,
        archivedRepeats: days.reduce((n, day) => n + day.archivedRepeats, 0),
        status: !plannedSessions ? 'no_plan' :
            resolvedSessions === plannedSessions ? 'complete' :
                completedSets ? 'partial' : 'not_started',
        incompleteDays: sessions.filter(day => day.status !== 'complete').map(day => ({
            weekNumber: day.weekNumber, dayNumber: day.dayNumber, dayName: day.dayName,
            status: day.status, confirmedSets: day.confirmedSets, plannedSets: day.plannedSets
        })),
        analysis,
        exerciseChanges: analysis.exercises.filter(ex=>ex.metric).map(ex=>({...ex})),
        exerciseCoverage: analysis.exercises.map(ex=>({name:ex.name,
            classificationStatus:EXERCISE_DATABASE.some(meta=>canonicalExerciseKey(meta.name)===ex.key)?'catalog':'unmapped',
            confirmedSets:ex.confirmedSets,comparisonStatus:ex.status!=='insufficient_data'?'available':
                ex.confirmedSets?'insufficient_comparable_dated_weeks':'no_valid_working_sets'})),
        // Programmed weeks are not calendar weeks; show recorded coverage,
        // never substitute empty sessions with zero-RPE observations.
        weeklyResults: weeks.map(week => {
            const scheduled = sessions.filter(day =>
                String(day.weekNumber) === String(week.weekNumber));
            const withRpe = scheduled.reduce((n, day) => n + day.measuredRpe, 0);
            const rpeTotal = scheduled.reduce((n, day) => n + day.rpeSum, 0);
            return {
                weekNumber: week.weekNumber,
                plannedSets: scheduled.reduce((n, day) => n + day.plannedSets, 0),
                completedSets: scheduled.reduce((n, day) => n + day.confirmedSets, 0),
                skippedSets: scheduled.reduce((n, day) => n + day.skippedSets, 0),
                missingSets: scheduled.reduce((n, day) => n + Math.max(0,day.plannedSets-day.confirmedSets-day.skippedSets-day.invalidConfirmedSets), 0),
                rpeMeasured: withRpe,
                averageRpe: withRpe ? rounded(rpeTotal / withRpe) : null
            };
        }),
        // Descriptive per-exercise evidence includes partial sessions too;
        // never exports raw notes, accounts, timestamps or athlete IDs.
        exerciseResults: sessions.flatMap(day => day.exerciseResults.map(ex => ({
            ...ex, dayNumber: day.dayNumber
        })))
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
        'Mesociclo: ' + review.name,
        'Settimane programmate: ' + review.weeks,
        'Sedute completate: ' + review.completedSessions + '/' + review.plannedSessions,
        'Sedute concluse con esclusioni: ' + (review.sessionsWithSkips||0),
        'Sedute parziali: ' + review.partialSessions,
        'Sedute non iniziate: ' + review.skippedSessions,
        'Serie valide confermate: ' + review.completedSets + '/' + review.plannedSets,
        'Serie saltate intenzionalmente: '+(review.skippedSets||0),
        'Serie confermate con dati non validi: ' + review.invalidConfirmedSets,
        'RPE misurati: ' + review.measuredRpeSets + '/' + review.completedSets,
        'RPE medio dei valori realmente misurati: ' + (review.averageRpe ?? 'non disponibile'),
        'Aderenza (sedute complete): ' + (review.adherencePercent ?? '-') + '%',
        'Sedute ripetute archiviate (non conteggiate nell’aderenza): ' + review.archivedRepeats,
        'ESERCIZI — confronto descrittivo delle serie complete in settimane reali distinte:'
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
    lines.push('COPERTURA E RPE PER SETTIMANA PROGRAMMATA:');
    for (const w of review.weeklyResults || [])
        lines.push('Sett. ' + w.weekNumber + ': ' + w.completedSets +
            '/' + w.plannedSets + ' serie confermate; RPE misurati ' +
            w.rpeMeasured + '/' + w.completedSets +
            ', media ' + (w.averageRpe ?? 'non disponibile') + '.');
    lines.push('COPERTURA DI TUTTI GLI ESERCIZI:');
    for(const item of review.exerciseCoverage||[])lines.push(item.name+': '+item.confirmedSets+' serie valide; '+(item.comparisonStatus==='available'?'confronto disponibile':item.comparisonStatus==='no_valid_working_sets'?'nessuna serie allenante valida':'settimane datate e confrontabili insufficienti'));
    lines.push('CARICHI E RIPETIZIONI EFFETTIVI (anche sedute parziali; intervalli descrittivi, non progressioni):');
    if (!review.exerciseResults?.length) lines.push('Nessuna serie valida confermata.');
    for (const ex of review.exerciseResults || [])
        lines.push('Sett. ' + ex.weekNumber + ', G' + (ex.dayNumber ?? '?') +
            ', ' + ex.name + ': ' + ex.validSets + ' serie; ' + ex.minKg +
            '–' + ex.maxKg + ' kg, ' + ex.minReps + '–' + ex.maxReps +
            ' reps; RPE ' + ex.rpeMeasured + '/' + ex.validSets +
            ', media ' + (ex.averageRpe ?? 'non disponibile') + '.');
    if (review.incompleteDays.length) {
        lines.push('SEDUTE NON COMPLETE (da verificare, senza inventare allenamenti):');
        for (const d of review.incompleteDays)
            lines.push('Sett. ' + d.weekNumber + ', ' + d.dayName + ': ' +
                d.confirmedSets + '/' + d.plannedSets + ' serie.');
    }
    lines.push(...formatAnalysisLines(review.analysis));
    lines.push('Nota: questo report non misura ipertrofia e non stabilisce la causa dei cambiamenti.');
    lines.push('Il report esclude i campi identificativi dell’account; controlla eventuali nomi personalizzati prima di condividerlo.');
    return lines.join('\n');
}
