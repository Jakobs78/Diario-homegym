import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCompletedSet, assessExerciseLive, buildLiveSessionSnapshot } from '../mycoatch/liveCoach.js';

function exercise(sets, extra = {}) {
    return {
        name: 'Panca Piana con Bilanciere',
        reps: '6-8', targetRpe: '@8', recupero: '180s',
        pattern: 'horizontal_push', category: 'Petto',
        loggedSets: sets,
        ...extra
    };
}
const confirmed = (weight, reps, rpe, extra = {}) =>
    ({ weight, reps, rpe, isLocked: true, completed: true, ...extra });
const empty = () => ({ weight: '', reps: '', rpe: '', isLocked: false, completed: false });

test('non considera serie non confermate, anche se i campi sembrano completati', () => {
    const ex = exercise([{ weight: '80', reps: '8', rpe: '8', isLocked: false }, empty()]);
    assert.equal(assessExerciseLive(ex), null);
    const snap = buildLiveSessionSnapshot({ exercises: [ex] });
    assert.equal(snap.checkedSets, 0);
    assert.equal(snap.tonnageKg, 0);
    assert.equal(snap.rpeRecordedSets, 0);
    assert.equal(snap.lastAdvice, null);
});

test('non completa set con placeholder range, peso vuoto o RPE inventato', () => {
    assert.match(validateCompletedSet({ weight: '80', reps: '6-8', rpe: '8' }).message, /ripetizioni realmente/i);
    assert.equal(validateCompletedSet({ weight: '', reps: '8', rpe: '8' }).ok, false);
    assert.equal(validateCompletedSet({ weight: 80, reps: 8, rpe: '11' }).ok, false);
    assert.equal(validateCompletedSet({ weight: 80, reps: 8, rpe: '5' }).ok, false);
    assert.equal(validateCompletedSet({ weight: '0', reps: 8, rpe: '8' }).ok, false);
    assert.equal(validateCompletedSet({ weight: '80.5', reps: '8', rpe: '@8' }).ok, true);
    const withoutRpe = validateCompletedSet({ weight: '80,5', reps: '8', rpe: '' });
    assert.equal(withoutRpe.ok, true);
    assert.equal(withoutRpe.rpe, null);
});

test('se RPE non misurato, evita e1RM e suggerimenti arbitrari di carico', () => {
    const advice = assessExerciseLive(exercise([confirmed(80, 8, ''), empty()]));
    assert.equal(advice.code, 'missing_rpe');
    assert.equal(advice.e1rm, null);
    assert.equal(advice.suggestedWeight, null);
    assert.equal(advice.confidence, 'performance_only');
});

test('RPE alto consiglia cautela e diminuzione facoltativa, senza scrivere sui set', () => {
    const ex = exercise([confirmed(80, 6, 9.5), empty()]);
    const snapshot = JSON.stringify(ex);
    const advice = assessExerciseLive(ex, 0);
    assert.equal(advice.code, 'high_effort');
    assert.equal(advice.severity, 'caution');
    assert.equal(advice.suggestedWeight, 75);
    assert.equal(advice.nextSetIndex, 1);
    assert.ok(advice.e1rm > 0);
    assert.equal(JSON.stringify(ex), snapshot);
});

test('una sola serie buona non fa aumentare il peso', () => {
    const ex = exercise([confirmed(80, 8, 7), empty(), empty()]);
    const advice = assessExerciseLive(ex);
    assert.equal(advice.code, 'strong_set');
    assert.equal(advice.suggestedWeight, null);
});

test('due serie buone con RPE realmente misurato possono suggerire un piccolo incremento', () => {
    const ex = exercise([confirmed(80, 8, 7), confirmed(80, 8, 7), empty()]);
    const advice = assessExerciseLive(ex);
    assert.equal(advice.code, 'optional_increment');
    assert.equal(advice.nextSetIndex, 2);
    assert.equal(advice.suggestedWeight, 82.5);
    assert.equal(ex.loggedSets[2].weight, '');
});

test('serie troppo facili con RPE mancante non soddisfano double progression', () => {
    const ex = exercise([confirmed(80, 8, ''), confirmed(80, 8, ''), empty()]);
    assert.equal(assessExerciseLive(ex).suggestedWeight, null);
});

test('rispetta il recupero a fine superserie/triset senza sostituirlo', () => {
    const ex = exercise([confirmed(10, 12, 8), empty()], {
        pattern: 'isolation', reps: '10-12',
        groupType: 'superset', isGroupLast: false
    });
    const advice = assessExerciseLive(ex);
    assert.match(advice.message, /dopo l’ultimo esercizio del gruppo/);
    assert.equal(ex.recupero, '180s');
});

test('dropset registrato come 10+8+6: niente e1RM o tonnellaggio ipotetico', () => {
    const ex = exercise([confirmed(20, '10+8+6', 9, { intensityTechnique: 'DROP_SET' })]);
    const advice = assessExerciseLive(ex);
    assert.equal(advice.code, 'special_technique');
    assert.equal(advice.e1rm, null);
    const snap = buildLiveSessionSnapshot({ exercises: [ex] });
    assert.equal(snap.validSets, 1);
    assert.equal(snap.tonnageKg, 0);
});

test('set confermato ma malformato nello storico: avviso, mai conteggio prestazioni', () => {
    const ex = exercise([confirmed(80, '6-8', '@8'), empty()]);
    const snap = buildLiveSessionSnapshot({ exercises: [ex] });
    assert.equal(snap.checkedSets, 1);
    assert.equal(snap.invalidSets, 1);
    assert.equal(snap.validSets, 0);
    assert.equal(snap.tonnageKg, 0);
    assert.equal(assessExerciseLive(ex).code, 'incomplete_log');
});

test('tempo trascorso, pausa, budget e previsione: non afferma misure inesistenti', () => {
    const now = 1730000000000;
    const ex = exercise([confirmed(80, 8, 8), confirmed(80, 8, 8), empty(), empty()], {
        notes: '[DURATA STIMATA] 32 minuti su 40 disponibili.'
    });
    const activeDay = {
        sessionStart: now - 20 * 60000,
        accumulatedSeconds: 60,
        exercises: [ex]
    };
    const progress = buildLiveSessionSnapshot(activeDay, { now });
    assert.equal(progress.checkedSets, 2);
    assert.equal(progress.percent, 50);
    assert.equal(progress.elapsedSeconds, 21 * 60);
    assert.equal(progress.estimatedMinutes, 32);
    assert.equal(progress.budgetMinutes, 40);
    assert.ok(progress.projectedMinutes > 21);
    const paused = buildLiveSessionSnapshot({
        ...activeDay, isPaused: true
    }, { now });
    assert.equal(paused.elapsedSeconds, 60);
    assert.equal(paused.paused, true);
});

test('check di tutti i set senza RPE: completato senza inventare fatica', () => {
    const ex = exercise([confirmed(50, 8, ''), confirmed(50, 8, '')]);
    const snap = buildLiveSessionSnapshot({ exercises: [ex], completed: true,
        totalDurationMinutes: 28 });
    assert.equal(snap.finished, true);
    assert.equal(snap.elapsedSeconds, 1680);
    assert.equal(snap.tonnageKg, 800);
    assert.equal(snap.rpeRecordedSets, 0);
});

test('serie escluse e warmup non distorcono il totale e il volume', () => {
    const exercises = [
        exercise([confirmed(20, 5, 8, { isWarmup: true }), confirmed(80, 8, 8),
            empty()]),
        exercise([confirmed(100, 8, 8)], { isExcluded: true })
    ];
    const snapshot = buildLiveSessionSnapshot({ exercises });
    assert.equal(snapshot.totalSets, 2);
    assert.equal(snapshot.checkedSets, 1);
    assert.equal(snapshot.tonnageKg, 640);
    assert.equal(snapshot.percent, 50);
});

test('ultimo set per timestamp, non per ordine visivo, quando i check sono fuori sequenza', () => {
    const old = confirmed(80, 6, 8, { completedAt: '2026-01-01T11:00:00.000Z' });
    const newer = confirmed(75, 8, 8, { completedAt: '2026-01-01T12:00:00.000Z' });
    const ex = exercise([newer, old, empty()]);
    const advice = assessExerciseLive(ex);
    assert.equal(advice.setIndex, 0);
});

test('nessun carico suggerito quando non ci sono set futuri, anche a RPE altissimo', () => {
    const ex = exercise([confirmed(80, 8, 10)]);
    const advice = assessExerciseLive(ex);
    assert.equal(advice.suggestedWeight, null);
    assert.equal(advice.nextSetIndex, -1);
});
