import test from 'node:test';
import assert from 'node:assert/strict';
import { isMesocycleCompleted, repeatCompletedSessionPreservingHistory,
    safeArchiveCount } from '../js/historySafety.js';

const performed = (weight = 80, reps = '8', rpe = '8') => ({
    weight, reps, rpe, isLocked: true, completed: true,
    completedAt: '2026-10-14T18:23:00.000Z'
});
const workoutDay = () => ({
    dayNumber: 1, dayName: 'Upper A', date: '2026-10-14',
    completed: true, sessionCompletedAt: '2026-10-14T18:30:00.000Z',
    totalDurationMinutes: 53, accumulatedSeconds: 3180,
    exercises: [{
        name: 'Panca Piana con Bilanciere',
        notes: 'Note originali', loggedSets: [
            performed(), performed(82.5, '7', '8.5')
        ],
        sets: [performed(), performed(82.5, '7', '8.5')]
    }]
});
const meso = day => ({ weeks: [{
    weekNumber: 1, days: [day]
}] });

test('la scheda è completa solo se le serie hanno check e valori REALI', () => {
    const day = workoutDay();
    assert.equal(isMesocycleCompleted(meso(day)), true);
    const unchecked = structuredClone(day);
    unchecked.exercises[0].loggedSets[0].isLocked = false;
    unchecked.exercises[0].loggedSets[0].completed = false;
    assert.equal(isMesocycleCompleted(meso(unchecked)), false);
    const missing = structuredClone(day);
    missing.exercises[0].loggedSets[0].weight = '';
    assert.equal(isMesocycleCompleted(meso(missing)), false);
    const range = structuredClone(day);
    range.exercises[0].loggedSets[0].reps = '6-8';
    assert.equal(isMesocycleCompleted(meso(range)), false);
    assert.equal(isMesocycleCompleted({ weeks: [] }), false);
    assert.equal(isMesocycleCompleted(null), false);
});

test('ripetizione: salva TUTTE le serie originali prima di svuotare quelle future', () => {
    const day = workoutDay();
    const snapshot = structuredClone(day);
    const archive = repeatCompletedSessionPreservingHistory(day, {
        capturedAt: '2026-10-14T18:35:00.000Z'
    });
    assert.equal(safeArchiveCount(day), 1);
    assert.equal(archive.exercises[0].loggedSets[0].weight, 80);
    assert.equal(archive.exercises[0].loggedSets[1].weight, 82.5);
    assert.deepEqual(archive.exercises, snapshot.exercises);
    assert.equal(archive.sessionDate, snapshot.date);
    assert.equal(archive.sessionCompletedAt, snapshot.sessionCompletedAt);
    assert.equal(archive.totalDurationMinutes, 53);
    assert.equal(day.date, undefined);
    assert.equal(day.sessionCompletedAt, undefined);
    assert.equal(day.completed, false);
    assert.equal(day.accumulatedSeconds, 0);
    assert.equal(day.exercises[0].notes, snapshot.exercises[0].notes);
    assert.deepEqual(day.exercises[0].loggedSets.map(set =>
        [set.weight, set.reps, set.rpe, set.isLocked]),
    [['', '', '', false], ['', '', '', false]]);
    assert.ok(day.exercises[0].sets.every(set => set.weight === '' && !set.isLocked));
    assert.equal(archive.exercises[0].loggedSets[0].completedAt,
        '2026-10-14T18:23:00.000Z');
});

test('replay ripetuti appendono archivi senza alterare i precedenti', () => {
    const day = workoutDay();
    repeatCompletedSessionPreservingHistory(day, {
        capturedAt: '2026-10-14T18:35:00.000Z'
    });
    const original = JSON.stringify(day.sessionArchives[0]);
    day.exercises[0].loggedSets.forEach((set, i) => {
        Object.assign(set, performed(85 + i * 2.5, '6', '7'));
    });
    day.completed = true;
    repeatCompletedSessionPreservingHistory(day, {
        capturedAt: '2026-10-16T10:00:00.000Z'
    });
    assert.equal(safeArchiveCount(day), 2);
    assert.equal(JSON.stringify(day.sessionArchives[0]), original);
    assert.equal(day.sessionArchives[1].exercises[0].loggedSets[0].weight, 85);
});

test('reset non archivia mezze sedute e non altera i dati se la guardia rifiuta', () => {
    const day = workoutDay();
    day.exercises[0].loggedSets[1].isLocked = false;
    day.exercises[0].loggedSets[1].completed = false;
    const before = JSON.stringify(day);
    assert.throws(() => repeatCompletedSessionPreservingHistory(day),
        /non risulta completata/);
    assert.equal(JSON.stringify(day), before);
    assert.equal(safeArchiveCount(day), 0);
});

test('riscaldamenti ed esercizi esclusi restano conservati nel backup', () => {
    const day = workoutDay();
    day.exercises[0].loggedSets.unshift({ weight: 20, reps: '10',
        rpe: '', isLocked: false, isWarmup: true });
    day.exercises.push({
        name: 'Accessorio escluso', isExcluded: true,
        loggedSets: [{ weight: 4, reps: '12', isLocked: false }]
    });
    const archive = repeatCompletedSessionPreservingHistory(day);
    assert.equal(archive.exercises.length, 2);
    assert.equal(archive.exercises[0].loggedSets[0].weight, 20);
    assert.equal(archive.exercises[1].loggedSets[0].weight, 4);
    assert.equal(day.exercises[0].loggedSets[0].weight, '');
});

test('lo snapshot è serializzabile nel payload già esistente, senza tabella SQL', () => {
    const data = { athlete: { email: 'fixture@example.invalid' }, history: {
        years: { '2026': { mesocycles: [meso(workoutDay())] } }
    } };
    const current = data.history.years['2026'].mesocycles[0].weeks[0].days[0];
    repeatCompletedSessionPreservingHistory(current);
    const restored = JSON.parse(JSON.stringify(data));
    assert.equal(restored.history.years['2026'].mesocycles[0].weeks[0].days[0]
        .sessionArchives[0].exercises[0].loggedSets[0].weight, 80);
});
