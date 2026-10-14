import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCompletedMesocycle } from '../mycoatch/historyAnalysis.js';
import { generateSmartMesocycle } from '../mycoatch/engine.js';
import { EXERCISE_DATABASE } from '../mycoatch/exercisesDB.js';
import { MyCoatch } from '../mycoatch/index.js';

const cfg = { daysPerWeek: 4, durationWeeks: 4, userAge: 49, maxSessionMinutes: 60, focus: 'hybrid' };
const analysis = { byExercise: {}, exerciseNotes: {}, stalledExercises: [] };
const generate = (options = {}, history = analysis) =>
    generateSmartMesocycle({ ...cfg, ...options }, history);
const workout = (samples, locked = true) => ({
    weeks: samples.map(([weight, reps, rpe], i) => ({
        weekNumber: i + 1,
        days: [{ exercises: [{
            name: 'Panca Piana con Bilanciere',
            loggedSets: [{ weight, reps, rpe, isLocked: locked }]
        }] }]
    }))
});

test('quattro settimane e quattro giornate senza slot mancanti', () => {
    const meso = generate();
    assert.equal(meso.weeks.length, 4);
    for (const week of meso.weeks) {
        assert.equal(week.days.length, 4);
        assert.ok(week.days.every(day => day.exercises.length >= 4));
    }
});

test('nessun carico iniziale inventato quando lo storico manca', () => {
    const meso = generate();
    for (const week of meso.weeks)
        for (const day of week.days)
            for (const exercise of day.exercises) {
                assert.equal(exercise.kgMin, '');
                assert.equal(exercise.kgMax, '');
            }
});

test('panca e squat presenti come esercizi primari', () => {
    const days = generate().weeks[0].days;
    assert.equal(days[0].exercises[0].name, 'Panca Piana con Bilanciere');
    assert.equal(days[1].exercises[0].name, 'Squat con Bilanciere');
});

test('attrezzatura del catalogo compatibile con home gym', () => {
    const allowed = new Set(['barbell', 'dumbbell', 'bodyweight', 'lat_machine', 'cable']);
    for (const week of generate().weeks)
        for (const day of week.days)
            for (const exercise of day.exercises) {
                const item = EXERCISE_DATABASE.find(e => e.name === exercise.name);
                assert.ok(item && allowed.has(item.equipment), exercise.name);
            }
});

test('recuperi espliciti e superserie su due esercizi consecutivi', () => {
    for (const week of generate().weeks)
        for (const day of week.days) {
            day.exercises.forEach(ex => assert.match(ex.restTime, /^\d+s$/));
            if (day.exercises.length === 5) {
                assert.match(day.exercises[3].notes, /superserie/i);
                assert.doesNotMatch(day.exercises[4].notes, /superserie/i);
            }
        }
});

test('e1RM in miglioramento rilevato come progressione', () => {
    const report = analyzeCompletedMesocycle(workout([[70, 8, 8], [72.5, 8, 8], [75, 8, 8]]));
    assert.equal(report.byExercise['panca piana con bilanciere'].status, 'progressing');
});

test('non rilevare stalli da due sole settimane', () => {
    const report = analyzeCompletedMesocycle(workout([[70, 8, 8], [70, 8, 8]]));
    assert.equal(report.stalledExercises.length, 0);
});

test('tre esposizioni confrontabili possono segnalare un possibile stallo', () => {
    const report = analyzeCompletedMesocycle(workout([[70, 8, 8], [70, 8, 8], [70, 8, 8]]));
    assert.equal(report.stalledExercises.length, 1);
    assert.equal(report.byExercise['panca piana con bilanciere'].status, 'possible_stall');
});

test('ignorare le serie senza conferma o senza RPE per e1RM', () => {
    const data = { weeks: [{ weekNumber: 1, days: [{ exercises: [{
        name: 'Squat con Bilanciere',
        loggedSets: [
            { weight: 100, reps: 5, rpe: 8, isLocked: false },
            { weight: 95, reps: 5, isLocked: true }
        ]
    }] }] }] };
    const report = analyzeCompletedMesocycle(data);
    assert.equal(report.byExercise['squat con bilanciere'].lastKg, 95);
    assert.equal(report.byExercise['squat con bilanciere'].exposures.length, 0);
});

test('carico storico senza aumento settimanale forzato', () => {
    const report = analyzeCompletedMesocycle(workout([[70, 8, 8], [72.5, 8, 8], [75, 8, 8]]));
    const meso = generate({ deloadWeek: false }, report);
    assert.deepEqual(meso.weeks.map(w => w.days[0].exercises[0].kgMin), ['75', '75', '75', '75']);
});

test('età 49 anni non implica scarico anticipato alla terza settimana', () => {
    const meso = generate();
    assert.notEqual(meso.weeks[2].days[0].exercises[0].rpe, '6.5');
    assert.equal(meso.weeks[3].days[0].exercises[0].rpe, '6.5');
});

test('MyCoatch produce CSV con 12 colonne, timer e note compatibili', () => {
    MyCoatch.generateNextFromHistory({ history: { years: {} } }, cfg);
    const csv = MyCoatch.exportAsCSV();
    const lines = csv.trim().split('\n');
    assert.equal(lines[0], 'Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset');
    assert.ok(lines.length > 60);
    for (const line of lines.slice(1)) {
        const parts = line.split(';');
        assert.equal(parts.length, 12, line);
        assert.match(parts[9], /^\d+s$/);
    }
});
