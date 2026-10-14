import { canonicalExerciseKey } from './exerciseIdentity.js';

function prescribedSets(exercise) {
    return Number.parseInt(String(exercise?.set || exercise?.setsCount || ''), 10) ||
        exercise?.loggedSets?.length || exercise?.sets?.length || null;
}

function normalizedPrevious(meso) {
    const weeks = Array.isArray(meso?.weeks) ? meso.weeks : [];
    // Prendi l'ultima settimana operativa, evitando scarichi programmati.
    const main = [...weeks].reverse().find(week =>
        (week.days || []).some(day => (day.exercises || []).some(ex => {
            const rpe = Number(String(ex.targetRpe || ex.rpe || '').replace('@', '').replace(',', '.'));
            return rpe > 6.5;
        }))) || weeks.at(-1);
    const results = new Map();
    for (const day of (main?.days || [])) {
        for (const ex of (day.exercises || [])) {
            const key = `${day.dayNumber}:${canonicalExerciseKey(ex.name)}`;
            results.set(key, {
                name: ex.name, sets: prescribedSets(ex), reps: ex.reps,
                kg: ex.kgMin ?? '', rpe: ex.rpe
            });
        }
    }
    return results;
}

export function compareMesocyclePlans(previous, generated, analysis) {
    const before = normalizedPrevious(previous);
    const after = generated?.weeks?.[0]?.days || [];
    const changes = [];
    const matched = new Set();

    for (const day of after) {
        for (const ex of day.exercises || []) {
            const key = `${day.dayNumber}:${canonicalExerciseKey(ex.name)}`;
            matched.add(key);
            const old = before.get(key);
            const decision = analysis?.decisions?.byExercise?.[canonicalExerciseKey(ex.name)];
            const now = {
                sets: ex.setsCount, reps: ex.reps,
                kg: ex.kgMin || null, rpe: ex.rpe
            };
            const numericKg = value => {
                const n = Number(String(value ?? '').replace(/kg/gi, '').replace(',', '.').trim());
                return String(value ?? '').trim() ? (Number.isFinite(n) ? n : String(value)) : null;
            };
            if (!old || old.sets !== now.sets || String(old.reps) !== String(now.reps) ||
                numericKg(old.kg) !== numericKg(now.kg) ||
                String(old.rpe ?? '') !== String(now.rpe ?? '')) {
                changes.push({
                    day: day.dayNumber,
                    exercise: ex.name,
                    kind: old ? 'modified' : 'added',
                    previous: old || null,
                    proposed: now,
                    explanation: decision?.reason ||
                        'Selezione/serie adattate al template e alla durata disponibile.'
                });
            }
        }
    }

    for (const [key, old] of before.entries()) {
        if (!matched.has(key)) {
            changes.push({
                day: Number(key.split(':')[0]),
                exercise: old.name,
                kind: 'removed',
                previous: old,
                proposed: null,
                explanation: 'Non presente nella prima settimana proposta: verificare volume complessivo e alternative.'
            });
        }
    }

    return {
        basedOnPrevious: Boolean(previous),
        previousName: previous?.name || null,
        estimatedMinutesByDay: after.map(day => ({
            day: day.dayNumber, minutes: day.estimatedMinutes
        })),
        changes,
        adaptations: analysis?.decisions?.summary || [],
        warnings: after.flatMap(day => {
            const warnings = [];
            if (day.reducedAccessorySets || day.removedAccessoryExercises) {
                warnings.push(`Giorno ${day.dayNumber}: per il limite di tempo sono state ridotte ${day.reducedAccessorySets} serie e rimossi ${day.removedAccessoryExercises} accessori. Controllare il volume settimanale.`);
            }
            return warnings;
        })
    };
}

/**
 * Testo compatto da mostrare come conferma prima del download.
 * Il CSV mantiene lo schema a 12 colonne.
 */
export function formatCoachReview(comparison, report) {
    const lines = ['MYCOATCH — ANTEPRIMA DELLA PROPOSTA'];
    lines.push(`Storico analizzato: ${report.inspectedMesocycles} mesocicli, ${report.sessionsAnalyzed} sedute con serie confermate.`);
    if (!comparison.basedOnPrevious) {
        lines.push('Nessun mesociclo precedente disponibile: non sono possibili adattamenti personali.');
    }
    lines.push('Durate previste (stime): ' + comparison.estimatedMinutesByDay
        .map(d => `G${d.day} ${d.minutes} min`).join(' · '));

    for (const a of comparison.adaptations.slice(0, 5)) {
        lines.push(`• ${a.target}: ${a.reason}`);
    }
    lines.push(`Confronto vecchio/nuovo: ${comparison.changes.length} modifiche nella prima settimana.`);
    for (const c of comparison.changes.slice(0, 6)) {
        const format = info => info ?
            `${info.sets ?? '?'}×${info.reps ?? '?'} ${info.kg ? '@' + info.kg + 'kg' : '(carico non noto)'}` :
            'non presente';
        lines.push(`G${c.day} · ${c.exercise}: ${format(c.previous)} → ${format(c.proposed)}`);
    }
    for (const warning of comparison.warnings.slice(0, 4)) lines.push('Attenzione: ' + warning);
    lines.push('', 'Le decisioni si basano su stime e sullo storico, non su misure dirette di crescita muscolare.');
    lines.push('Confermi la proposta e vuoi scaricare il CSV?');
    return lines.join('\n');
}
