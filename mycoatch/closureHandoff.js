/**
 * Explicit link between a closed diary mesocycle and the next MyCoatch
 * proposal. The locator contains no workouts or account identifiers.
 * Resolve against the current history at generation time, not a cached copy.
 */
import { summarizeMesocycleClosure } from '../js/mesocycleClosure.js';

export function locateClosedMesocycle(data, mesocycle) {
    if (!mesocycle || mesocycle.coachClosure?.status !== 'closed') return null;
    for (const [year, bucket] of Object.entries(data?.history?.years || {})) {
        const index = (bucket?.mesocycles || []).indexOf(mesocycle);
        if (index >= 0) return {
            year, index, closedAt: mesocycle.coachClosure.closedAt
        };
    }
    return null;
}

export function resolveClosedMesocycle(data, locator) {
    if (locator === null || locator === undefined) return null;
    const { year, index, closedAt } = locator;
    if (!/^\d{4}$/.test(String(year)) || !Number.isInteger(index) || index < 0 ||
        typeof closedAt !== 'string') {
        throw Error('Riferimento alla chiusura non valido: riapri il report.');
    }
    const mesocycle = data?.history?.years?.[year]?.mesocycles?.[index];
    if (mesocycle?.coachClosure?.status !== 'closed' || mesocycle.locked !== true ||
        mesocycle.coachClosure.closedAt !== closedAt) {
        throw Error('Il mesociclo di origine non risulta più concluso e bloccato: riapri il report prima di generare.');
    }
    if(mesocycle.excludedFromCoaching)throw Error('Questo mesociclo è escluso dal coaching: riattivalo nel report per usarlo come origine.');
    // Never save the report into history. All figures are recalculated from
    // confirmed, validated working sets, including an explicitly early closure.
    const review = summarizeMesocycleClosure(mesocycle);
    return { mesocycle, review, locator: { year, index, closedAt } };
}
