/**
 * Read-only historical replay of MyCoatch decisions.
 * At every checkpoint the operational history is rebuilt strictly from
 * performances known by that date. No post-checkpoint observations are
 * fed into the preceding recommendation (anti-lookahead audit).
 *
 * This is a deterministic regression test tool, NOT a validated predictor
 * of strength, hypertrophy, fatigue or future RPE.
 */
import { prepareRecentEvidence } from './recentEvidence.js';
import { analyzeTrainingHistory } from './historyInsights.js';
import { planAdaptiveDecisions } from './adaptiveDecisions.js';

const validTimestamp = raw => {
    const date = raw instanceof Date ? new Date(raw.getTime()) :
        typeof raw === 'string' ? new Date(raw) : new Date(NaN);
    if (!Number.isFinite(date.getTime()) ||
        (typeof raw === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)))
        throw Error('Il replay richiede date complete e valide in formato ISO 8601.');
    return date;
};

/**
 * Fixed chronological checkpoints supplied by an auditor. The function
 * is deliberately NOT wired into the workout generator or automatic writes.
 */
export function replayCoachingDecisions(data,{
    checkpoints=[],loadingSteps={}
}={}) {
    if (!data || typeof data !== 'object' || Array.isArray(data))
        throw Error('Storico non valido per il replay.');
    if (!Array.isArray(checkpoints) || checkpoints.length === 0 ||
        checkpoints.length > 52)
        throw Error('Seleziona da 1 a 52 date di verifica.');
    const dates = checkpoints.map(validTimestamp);
    if (dates.some((date,i) => i > 0 && date <= dates[i-1]))
        throw Error('Le date di verifica devono essere strettamente crescenti.');

    // Store only independently useful facts, never raw sets, account data,
    // medical notes or a purported accuracy figure without observed RPE.
    const snapshots = dates.map(cutoff => {
        const {history,audit} = prepareRecentEvidence(data,{now:cutoff});
        const observed = analyzeTrainingHistory(history,{calendarWeeks:true});
        const result = planAdaptiveDecisions(observed,{loadingSteps});
        const byExercise=Object.fromEntries(Object.entries(result.byExercise)
            .map(([key,d])=>[key,{
                exercise:d.exercise,
                action:d.action,
                previousWorkingKg:d.workingKg,
                proposedKg:d.plannedKg,
                proposedReps:d.plannedRepGoal,
                evidenceWeeks:[...d.evidenceWeeks],
                confidence:d.confidence,
                explanation:d.reason
            }]));
        return {
            cutoff:cutoff.toISOString(),
            evidence:{
                recentConfirmedSets:audit.recentSets,
                excludedFutureSets:audit.futureSets,
                excludedOldSets:audit.excludedOldSets,
                undatedSets:audit.undatedSets,
                reentry:audit.reentry,
                sessionsAnalyzed:observed.sessionsAnalyzed
            },
            byExercise,
            byMuscle:Object.fromEntries(Object.entries(result.byMuscle)
                .map(([muscle,d])=>[muscle,{
                    action:d.action,delta:d.volumeDelta,reason:d.reason
                }])),
            // This is a decision trace, not a success-rate metric.
            interpretation:'Decisioni ottenute soltanto dai dati disponibili al cutoff. Non si stimano guadagni di muscolo o RPE futuri.'
        };
    });
    return {schemaVersion:1,kind:'mycoatch-retrospective-replay',
        snapshots,diagnostic:'Replay controfattuale descrittivo. I successivi risultati dell’atleta non costituiscono una validazione clinica.'};
}
