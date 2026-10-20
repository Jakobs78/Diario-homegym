import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSmartMesocycle } from '../mycoatch/engine.js';
import { estimateDayMinutes } from '../mycoatch/timeEstimator.js';
import { optimizeSession } from '../mycoatch/groupOptimizer.js';
import { rebalanceWeeklyAccessories } from '../mycoatch/weeklyVolumeBalancer.js';
import { compareMesocyclePlans, formatCoachReview } from '../mycoatch/mesocycleComparison.js';
import { MyCoatch } from '../mycoatch/index.js';
import { applyTrisetDropsetGrouping } from '../js/helpers.js';

const build = (daysPerWeek, maxSessionMinutes) => generateSmartMesocycle({
    name: 'Test di riequilibrio',
    daysPerWeek, maxSessionMinutes, durationWeeks: 4,
    userAge: 49, focus: 'hybrid'
}, { byExercise: {}, stalledExercises: [], exerciseNotes: {} });

function checkBalance(week) {
    const actual = {};
    for (const day of week.days)
        for (const ex of day.exercises) {
            actual[ex.category] = (actual[ex.category] || 0) + ex.setsCount;
            assert.equal(ex.setsCount, ex.sets.length,
                `Set non coerenti: ${ex.name}`);
            assert.ok(ex.sets.every((set, index) => set.setNumber === index + 1));
        }
    const plan = week.volumeBalance;
    assert.equal(plan.scheduledSets,
        Object.values(actual).reduce((sum, n) => sum + n, 0));
    assert.equal(plan.plannedSets - plan.scheduledSets, plan.shortfallSets);
    assert.equal(plan.recoveredSets,
        plan.moves.reduce((sum, move) => sum + move.sets, 0));
    assert.equal(week.days.reduce((sum, day) =>
        sum + day.transferredAccessorySetsIn, 0), plan.recoveredSets);
    assert.equal(week.days.reduce((sum, day) =>
        sum + day.transferredAccessorySetsOut, 0), plan.recoveredSets);
    for (const [muscle, totals] of Object.entries(plan.byMuscle)) {
        assert.equal(actual[muscle] || 0, totals.scheduledSets);
        assert.ok(totals.shortfallSets >= 0);
    }
}

test('4 giorni, 40 minuti: sposta soltanto accessori e non forza collocazioni prestabilite', () => {
    const week = build(4, 40).weeks[0];
    const volume = week.volumeBalance;
    assert.ok(volume.recoveredSets > 0);
    assert.ok(volume.shortfallSets > 0);
    assert.equal(volume.recoveredSets, volume.moves.reduce((sum, m) => sum + m.sets, 0));
    assert.deepEqual(week.days.map(day => day.dayName.split(' ')[0]),
        ['Upper', 'Lower', 'Upper', 'Lower']);
    for (const move of volume.moves) {
        assert.notEqual(move.fromDay, move.toDay);
        assert.ok(move.sets >= 1 && move.sets <= 3);
        const from = week.days[move.fromDay - 1];
        const into = week.days[move.toDay - 1];
        assert.ok(from && into);
        assert.ok(from.dayName !== into.dayName);
        const destination = into.exercises.find(ex => ex.name === move.targetExercise);
        assert.ok(destination, JSON.stringify(move));
        assert.equal(destination.category, move.muscle);
        assert.equal(destination.pattern, 'isolation');
        assert.ok(into.estimatedMinutes <= 40);
    }
    checkBalance(week);
});

test('non sacrifica i fondamentali né accorcia i recuperi per recuperare accessori', () => {
    const short = build(4, 40).weeks[0].days;
    const complete = build(4, 90).weeks[0].days;
    for (let day = 0; day < short.length; day++) {
        assert.deepEqual(short[day].exercises.slice(0, 2).map(ex => ex.name),
            complete[day].exercises.slice(0, 2).map(ex => ex.name));
        assert.deepEqual(short[day].exercises.slice(0, 2).map(ex => ex.restTime),
            complete[day].exercises.slice(0, 2).map(ex => ex.restTime));
        assert.deepEqual(short[day].exercises.slice(0, 2).map(ex => ex.setsCount),
            complete[day].exercises.slice(0, 2).map(ex => ex.setsCount));
    }
});

test('4 giorni, 45 minuti: micro-recupero valido senza falsare le serie', () => {
    const week = build(4, 45).weeks[0];
    const volume = week.volumeBalance;
    assert.ok(volume.recoveredSets >= 0);
    assert.ok(volume.shortfallSets >= 0);
    for (const move of volume.moves) {
        const into = week.days[move.toDay - 1];
        const target = into.exercises.find(ex => ex.name === move.targetExercise);
        assert.ok(target, JSON.stringify(move));
        assert.ok(target.setsCount >= move.sets);
        assert.ok(target.sets.every(set => !set.completed));
        assert.ok(into.estimatedMinutes <= 45);
    }
    checkBalance(week);
});

test('le sedute non sforano il tempo per 3 e 4 giorni e per tutte le 4 settimane', () => {
    for (const daysPerWeek of [3, 4]) {
        for (const minutes of [35, 40, 45, 50, 55, 60, 90]) {
            const mesocycle = build(daysPerWeek, minutes);
            for (const week of mesocycle.weeks) {
                assert.equal(week.days.length, daysPerWeek);
                for (const day of week.days) {
                    assert.ok(day.estimatedMinutes <= minutes,
                        `${daysPerWeek}gg/${minutes}min, settimana ${week.weekNumber}: ${day.dayName}`);
                    assert.equal(day.estimatedMinutes, estimateDayMinutes(day.exercises));
                }
                checkBalance(week);
            }
        }
    }
});

test('settimana di scarico: nessun trasferimento che alteri il recupero previsto', () => {
    for (const time of [30, 40, 60]) {
        const week = build(4, time).weeks[3];
        assert.equal(week.volumeBalance.isDeloadWeek, true);
        assert.deepEqual(week.volumeBalance.moves, []);
        assert.equal(week.volumeBalance.recoveredSets, 0);
        assert.ok(week.days.every(day =>
            day.transferredAccessorySetsIn === 0 &&
            day.transferredAccessorySetsOut === 0));
    }
});

test('30 minuti: non promette falsamente il recupero di volume', () => {
    const week = build(4, 30).weeks[0];
    assert.ok(week.volumeBalance.recoveredSets >= 0);
    assert.ok(week.volumeBalance.shortfallSets > 0);
    assert.equal(week.volumeBalance.recoveredSets,
        week.volumeBalance.moves.reduce((sum, move) => sum + move.sets, 0));
    const mesocycle = build(4, 30);
    const review = formatCoachReview(
        compareMesocyclePlans(null, mesocycle, {}),
        { inspectedMesocycles: 0, sessionsAnalyzed: 0 }
    );
    assert.match(review, /sono state eliminate \d+ serie rispetto alla proposta iniziale/);
    assert.match(review, /Confermi la proposta/);
});

test('3 giorni da 35 minuti: conserva squat fondamentale e segnala la riduzione delle serie', () => {
    const mesocycle = build(3, 35);
    const firstWeek = mesocycle.weeks[0];
    const missing = firstWeek.volumeBalance.missingCompoundExercises;
    assert.ok(!missing.some(ex => ex.muscle === 'Quadricipiti'));
    assert.ok(firstWeek.days[0].exercises.some(ex => ex.pattern === 'squat'),
        'lo squat nel terzo slot Full Body A non deve essere cancellato');
    assert.ok(firstWeek.days.some(day => day.reducedPrioritySets > 0),
        'se serve, tagliare serie dei movimenti protetti invece del fondamentale');
    const review = formatCoachReview(
        compareMesocyclePlans(null, mesocycle, {}),
        { inspectedMesocycles: 0, sessionsAnalyzed: 0 }
    );
    assert.match(review, /serie dei movimenti prioritari/);
    assert.match(review, /Valuta più minuti/);
});

test('ogni serie trasferita rimane un accessorio e non crea carichi o RPE fittizi', () => {
    const week = build(4, 40).weeks[0];
    for (const move of week.volumeBalance.moves) {
        const receiver = week.days.find(d => d.dayNumber === move.toDay);
        const exercise = receiver.exercises.find(ex => ex.name === move.targetExercise);
        assert.ok(exercise);
        assert.equal(exercise.pattern, 'isolation');
        assert.ok(exercise.sets.every(set =>
            set.actualKg === '' && set.actualReps === '' && set.completed === false));
    }
});

test('riottimizzare una superserie non produce tag doppi o blocchi fantasma', () => {
    const existing = build(4, 60).weeks[0].days[0];
    const originalTagCount = existing.exercises.flatMap(ex =>
        [...ex.notes.matchAll(/\[SUPERSERIE\]/g)]).length;
    assert.equal(originalTagCount, 1);

    const next = optimizeSession(existing.exercises, 60);
    const tagCount = next.exercises.flatMap(ex =>
        [...ex.notes.matchAll(/\[SUPERSERIE\]/g)]).length;
    assert.equal(tagCount, 1);
    assert.equal(next.exercises.filter(ex => ex.groupType).length, 2);
    const imported = [{
        exercises: next.exercises.map((ex, index) => ({
            block: index + 1, name: ex.name, notes: ex.notes, recupero: ex.restTime
        }))
    }];
    applyTrisetDropsetGrouping(imported);
    assert.equal(imported[0].exercises.filter(ex => ex.groupType === 'superset').length, 2);
});

test('il bilanciatore non altera gli array di partenza', () => {
    const full = build(4, 60).weeks[0];
    const days = full.days;
    const wanted = days.map(day => day.exercises.map(ex => ({ ...ex, sets: [...ex.sets] })));
    const old = JSON.stringify(days);
    const oldWanted = JSON.stringify(wanted);
    const result = rebalanceWeeklyAccessories(days, wanted, 60);
    assert.equal(JSON.stringify(days), old);
    assert.equal(JSON.stringify(wanted), oldWanted);
    assert.equal(result.report.shortfallSets, 0);
    assert.deepEqual(result.report.moves, []);
});

test('CSV mantiene le 12 colonne e conserva i blocchi di superserie', () => {
    MyCoatch.generateNextFromHistory({ history: { years: {} } }, {
        daysPerWeek: 4, durationWeeks: 4, userAge: 49,
        focus: 'hybrid', maxSessionMinutes: 40
    });
    const csv = MyCoatch.exportAsCSV();
    const rows = csv.trim().split('\n');
    assert.equal(rows[0],
        'Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset');
    for (const row of rows.slice(1)) assert.equal(row.split(';').length, 12);
    assert.doesNotMatch(csv, /\[VOLUME RIDISTRIBUITO\]|\[DURATA STIMATA\]/);
    assert.match(csv, /\[SPLIT MYCOATCH\]/);
    const report = MyCoatch.getActiveMesocycleJSON().coachReport.weeklyVolumeBalance;
    assert.equal(report[0].recoveredSets,
        report[0].moves.reduce((sum, move) => sum + move.sets, 0));
    assert.ok(report[0].recoveredSets > 0);
});

