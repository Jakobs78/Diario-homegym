import test from 'node:test';
import assert from 'node:assert/strict';
import { previousExercisePerformance, historicalSessionPace } from '../mycoatch/liveHistory.js';
import { buildLiveSessionSnapshot } from '../mycoatch/liveCoach.js';

function workingSet(kg = 80, reps = 8, rpe = 8) {
    return { weight: kg, reps, rpe, isLocked: true, completed: true };
}
function ex(name = 'Panca Piana con Bilanciere', count = 6, rpe = 8) {
    return { name, loggedSets: Array.from({ length: count }, () => workingSet(80, 8, rpe)) };
}
function day(number, options = {}) {
    return {
        dayNumber: number, dayName: options.name || 'Upper A',
        completed: options.completed ?? true,
        totalDurationMinutes: options.minutes ?? 20,
        exercises: [ex(options.exercise || 'Panca Piana con Bilanciere',
            options.count ?? 6, options.rpe === undefined ? 8 : options.rpe)]
    };
}

function yearsWithCurrent(current, priorDays, futureDays = []) {
    return { history: { years: {
        2025: { mesocycles: [{
            weeks: priorDays.map((entry, i) => ({ weekNumber: i + 1,
                days: [entry] }))
        }] },
        2026: { mesocycles: [{ weeks: [
            { weekNumber: 1, days: [current] }
        ] }] },
        2027: { mesocycles: [{ weeks: futureDays.map((entry, i) =>
            ({ weekNumber: i + 1, days: [entry] })) }] }
    }} };
}

test('confronta solo prestazioni storiche realmente antecedenti al giorno aperto', () => {
    const current = day(1, { completed: false });
    const past = day(1, { exercise: 'PANCA' });
    past.exercises[0].loggedSets[0].weight = 85;
    const future = day(1);
    future.exercises[0].loggedSets[0].weight = 200;
    const history = yearsWithCurrent(current, [past], [future]);
    const previous = previousExercisePerformance(history, current, 'Bench Press');
    assert.equal(previous.kg, 85);
    assert.ok(previous.e1rm > 85);
});

test('rpe storico assente: nessun e1RM precedente fabbricato', () => {
    const current = day(1, { completed: false });
    const previous = day(1, { rpe: '' });
    const history = yearsWithCurrent(current, [previous]);
    const prior = previousExercisePerformance(history, current, 'Panca Piana con Bilanciere');
    assert.equal(prior.kg, 80);
    assert.equal(prior.e1rm, null);
    const snap = buildLiveSessionSnapshot(current, { history });
    assert.equal(snap.e1rmChangePercent, null);
});

test('il ritmo non viene inventato con meno di tre sedute complete', () => {
    const current = day(1, { completed: false });
    assert.equal(historicalSessionPace(yearsWithCurrent(current, [day(1), day(1)]), current), null);
});

test('calibrazione robusta dalla mediana di sedute concluse comparabili', () => {
    const current = day(1, { completed: false });
    const history = yearsWithCurrent(current,
        [day(1, { minutes: 19 }), day(1, { minutes: 20 }),
            day(1, { minutes: 21 })]);
    const pace = historicalSessionPace(history, current);
    assert.equal(pace.samples, 3);
    assert.equal(pace.secondsPerSet, 200);
    assert.equal(pace.source, 'completed_sessions_actual_elapsed');
});

test('esclude modelli di seduta lontani e durate poco attendibili', () => {
    const current = day(1, { completed: false });
    const prior = [
        day(1, { minutes: 8 }), // durata irrealistica
        day(1, { minutes: 90, count: 1 }), // soltanto una serie
        day(1, { minutes: 25, name: 'Lower A' }), // giornata incompatibile
        day(1, { minutes: 24 })
    ];
    assert.equal(historicalSessionPace(yearsWithCurrent(current, prior), current), null);
});

test('proiezione live può utilizzare il ritmo reale solo dopo tre sedute precedenti', () => {
    const current = day(1, { completed: false });
    current.sessionStart = 2000000000000 - 10 * 60000;
    current.exercises[0].loggedSets[0] = workingSet(80, 8, 8);
    current.exercises[0].loggedSets[1] = workingSet(80, 8, 8);
    for (let i = 2; i < 6; i++) current.exercises[0].loggedSets[i] = {
        weight: '', reps: '', rpe: '', isLocked: false
    };
    current.exercises[0].reps = '6-8';
    current.exercises[0].targetRpe = '@8';
    const history = yearsWithCurrent(current,
        [day(1, { minutes: 19 }), day(1, { minutes: 20 }), day(1, { minutes: 21 })]);
    const snapshot = buildLiveSessionSnapshot(current, {
        history, now: 2000000000000
    });
    assert.equal(snapshot.paceCalibration.samples, 3);
    assert.equal(snapshot.elapsedSeconds, 600);
    assert.ok(snapshot.projectedMinutes > 10);
    assert.ok(snapshot.previousExercise);
    assert.ok(snapshot.e1rmChangePercent !== null);
});

test('confermato ma malformato non viene contato come seduta utile per la calibrazione', () => {
    const current = day(1, { completed: false });
    const past = day(1);
    past.exercises[0].loggedSets.forEach(s => { s.reps = '8-10'; });
    const history = yearsWithCurrent(current, [past, past, past]);
    assert.equal(historicalSessionPace(history, current), null);
    assert.equal(previousExercisePerformance(history, current, 'panca'), null);
});
