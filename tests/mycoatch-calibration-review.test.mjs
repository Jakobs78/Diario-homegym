import test from 'node:test';
import assert from 'node:assert/strict';
import { isGuidedCalibrationWeek, reviewCalibrationWeek, calibrationContextForDay }
    from '../mycoatch/calibrationReview.js';

const series = (kg = 50, reps = 8, rpe = 7, done = true) => ({
    weight: kg, reps, rpe, isLocked: done, completed: done
});
const exercise = (name, logs = [series()], notes = '[CALIBRAZIONE MYCOATCH]') => ({
    name, notes, loggedSets: logs
});
function buildWeek() {
    return {
        weekNumber: 1,
        days: [
            { dayNumber: 1, dayName: 'Upper A', exercises: [
                exercise('Panca Piana con Bilanciere')
            ] },
            { dayNumber: 2, dayName: 'Lower A', exercises: [
                exercise('Squat con Bilanciere', [series(70, 8, 7)])
            ] },
            { dayNumber: 3, dayName: 'Upper B', exercises: [
                exercise('Military Press con Bilanciere', [series(30, 8, 7)])
            ] },
            { dayNumber: 4, dayName: 'Lower B', exercises: [
                exercise('Stacco Rumeno (RDL)', [series(65, 10, 7)])
            ] }
        ]
    };
}

test('calibrazione disponibile soltanto con tag esplicito MyCoatch, non nello storico generico', () => {
    assert.equal(isGuidedCalibrationWeek(buildWeek()), true);
    assert.equal(reviewCalibrationWeek({ weekNumber: 1, days: [{
        exercises: [exercise('Panca Piana con Bilanciere', [series()], 'nota generica')]
    }] }), null);
    assert.equal(reviewCalibrationWeek(null), null);
});

test('quattro alzate confermate e giornate complete rendono pronta la revisione senza prescrizioni', () => {
    const week = buildWeek();
    const before = JSON.stringify(week);
    const result = reviewCalibrationWeek(week);
    assert.equal(result.status, 'ready');
    assert.equal(result.readyForReview, true);
    assert.equal(result.days, 4);
    assert.equal(result.completeDays, 4);
    assert.equal(result.anchorsRecorded, 4);
    assert.equal(result.validSets, 4);
    assert.deepEqual(result.missingAnchors, []);
    assert.equal(result.anchors.squat.weight, 70);
    assert.equal(result.anchors.hinge.reps, 10);
    assert.match(result.message, /non viene modificata automaticamente/);
    assert.equal(JSON.stringify(week), before);
});

test('un solo giorno non autorizza la calibrazione delle quattro alzate', () => {
    const week = buildWeek();
    for (const day of week.days.slice(1))
        for (const ex of day.exercises)
            for (const log of ex.loggedSets)
                log.completed = log.isLocked = false;
    const result = reviewCalibrationWeek(week);
    assert.equal(result.status, 'in_progress');
    assert.equal(result.readyForReview, false);
    assert.equal(result.completeDays, 1);
    assert.equal(result.anchorsRecorded, 1);
    assert.deepEqual(result.missingAnchors,
        ['Squat', 'Spinta verticale', 'Hip hinge']);
});

test('rpe non registrato resta un dato mancante, non blocca kg/reps effettivamente confermati', () => {
    const week = buildWeek();
    week.days[0].exercises[0].loggedSets[0].rpe = '';
    const result = reviewCalibrationWeek(week);
    assert.equal(result.readyForReview, true);
    assert.equal(result.withoutRpe, 1);
    assert.equal(result.anchors.bench.rpe, null);
    assert.equal(result.anchors.bench.weight, 50);
});

test('una serie incompleta, target fittizio o tecnica speciale non diventa carico calibrato', () => {
    const week = buildWeek();
    const set = week.days[0].exercises[0].loggedSets[0];
    set.reps = '8-12';
    let result = reviewCalibrationWeek(week);
    assert.equal(result.readyForReview, false);
    assert.equal(result.invalidSets, 1);
    assert.equal(result.anchors.bench.recorded, false);
    set.reps = '10+8+6';
    set.intensityTechnique = 'DROP_SET';
    result = reviewCalibrationWeek(week);
    assert.equal(result.anchorsRecorded, 3);
    assert.equal(result.validSets, 3);
    assert.equal(result.invalidSets, 1);
    assert.equal(result.readyForReview, false);
});

test('varianti scelte dall’atleta sono riconosciute senza scambiare le identità', () => {
    const week = buildWeek();
    week.days[0].exercises[0].name = 'Panca Inclinata Con Manubri';
    week.days[1].exercises[0].name = 'Front Squat';
    week.days[2].exercises[0].name = 'Spinte con Manubri da Seduto';
    week.days[3].exercises[0].name = 'Stacco Da Terra Convenzionale';
    const check = reviewCalibrationWeek(week);
    assert.equal(check.readyForReview, true);
    assert.equal(check.anchors.bench.exercise, 'Panca Inclinata Con Manubri');
    assert.equal(check.anchors.hinge.exercise, 'Stacco Da Terra Convenzionale');
});

test('la revisione segue solo la settimana di calibrazione del mesociclo aperto', () => {
    const week = buildWeek();
    const second = { weekNumber: 2, days: [
        { dayNumber: 1, exercises: [exercise('Panca Piana con Bilanciere',
            [series(80, 8, 9)], 'settimana regolare')] }
    ] };
    const other = {
        weekNumber: 1,
        days: [{ dayNumber: 1, exercises: [
            exercise('Panca Piana con Bilanciere', [series(100, 8, 8)])
        ] }]
    };
    const workoutData = { history: { years: { 2025: {
        mesocycles: [{ weeks: [other] }]
    }, 2026: {
        mesocycles: [{ weeks: [week, second] }]
    } } } };
    const before = JSON.stringify(workoutData);
    const result = calibrationContextForDay(workoutData, second.days[0]);
    assert.ok(result);
    assert.equal(result.anchors.bench.weight, 50);
    assert.equal(result.readyForReview, true);
    assert.equal(calibrationContextForDay(workoutData, { exercises: [] }), null);
    assert.equal(JSON.stringify(workoutData), before);
});

test('Full Body 3 giorni: military e hip hinge nello stesso giorno contano distintamente', () => {
    const week = buildWeek();
    const fullBody = {
        weekNumber: 1, days: [
            { dayNumber: 1, exercises: [week.days[0].exercises[0]] },
            { dayNumber: 2, exercises: [
                week.days[2].exercises[0], week.days[3].exercises[0]
            ] },
            { dayNumber: 3, exercises: [week.days[1].exercises[0]] }
        ]
    };
    const result = reviewCalibrationWeek(fullBody);
    assert.equal(result.days, 3);
    assert.equal(result.completeDays, 3);
    assert.equal(result.anchorsRecorded, 4);
    assert.equal(result.readyForReview, true);
});
