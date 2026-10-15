import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSmartMesocycle } from '../mycoatch/engine.js';
import { groupAccessories, optimizeSession } from '../mycoatch/groupOptimizer.js';
import { estimateDaySeconds, estimateDayMinutes } from '../mycoatch/timeEstimator.js';
import { shouldStartRecoveryTimer } from '../js/restPolicy.js';
import { applyTrisetDropsetGrouping } from '../js/helpers.js';
import { MyCoatch } from '../mycoatch/index.js';

const history = { byExercise: {}, exerciseNotes: {}, stalledExercises: [] };
const config = { daysPerWeek: 4, durationWeeks: 4, userAge: 49, focus: 'hybrid' };
const makeMeso = maxSessionMinutes =>
    generateSmartMesocycle({ ...config, maxSessionMinutes }, history);

function accessory(name, category, setsCount = 3) {
    return {
        name, category, pattern: 'isolation', equipment: 'cable',
        setsCount, reps: '10-15', restTime: '90s',
        notes: 'Esecuzione controllata',
        sets: Array.from({ length: setsCount }, (_, i) => ({ setNumber: i + 1 }))
    };
}

test('i limiti da 30, 45, 60, 90 min influenzano tutte le sedute del blocco', () => {
    for (const minutes of [30, 45, 60, 90]) {
        const meso = makeMeso(minutes);
        assert.equal(meso.weeks.length, 4);
        for (const week of meso.weeks)
            for (const day of week.days) {
                assert.equal(day.timeBudgetMinutes, minutes);
                assert.ok(day.estimatedMinutes <= minutes, `${minutes}: ${day.dayName} = ${day.estimatedMinutes}`);
                assert.equal(day.estimatedMinutes, estimateDayMinutes(day.exercises));
            }
    }
});

test('a 30 minuti taglia gli accessori invece dei fondamentali', () => {
    const short = makeMeso(30).weeks[0].days[0];
    const long = makeMeso(60).weeks[0].days[0];
    assert.ok(short.exercises.length < long.exercises.length);
    assert.deepEqual(short.exercises.slice(0, 2).map(ex => ex.name),
        long.exercises.slice(0, 2).map(ex => ex.name));
    assert.deepEqual(short.exercises.slice(0, 2).map(ex => ex.restTime),
        long.exercises.slice(0, 2).map(ex => ex.restTime));
    assert.match(short.exercises[0].notes, /TEMPO RIDOTTO/);
});

test('sedute da 45 minuti possono preservare piu accessori usando superserie', () => {
    const day = makeMeso(45).weeks[0].days[0];
    assert.equal(day.exercises.length, 5);
    assert.ok(day.groupCount >= 1);
    assert.ok(day.estimatedMinutes <= 45);
    assert.match(day.exercises[0].notes, /DURATA STIMATA/);
});

test('i superset si generano soltanto dopo i fondamentali e su isolamenti compatibili', () => {
    const day = makeMeso(60).weeks[0].days[0];
    const members = day.exercises.filter(ex => ex.groupType);
    assert.equal(members.length, 2);
    assert.ok(members.every(ex => ex.pattern === 'isolation'));
    assert.equal(day.exercises[0].groupType, undefined);
    assert.equal(day.exercises[1].groupType, undefined);
    assert.equal(members[0].groupBase, members[1].groupBase);
    assert.ok(!members[0].isGroupLast && members[1].isGroupLast);
    assert.match(members[0].notes, /SUPERSERIE/i);
    assert.doesNotMatch(members[1].notes, /SUPERSERIE/i);
});

test('triset: tre accessori contigui, un unico tag e recupero soltanto alla fine', () => {
    const exercises = [
        { ...accessory('Panca', 'Petto'), pattern: 'horizontal_push', restTime: '180s' },
        { ...accessory('Lat', 'Back_Lats'), pattern: 'vertical_pull', restTime: '150s' },
        accessory('Croci', 'Petto', 3),
        accessory('Alzate laterali', 'Spalle', 3),
        accessory('Curl', 'Bicipiti', 3)
    ];
    const grouped = groupAccessories(exercises, 3);
    assert.deepEqual(grouped.slice(2).map(x => x.groupType), ['triset','triset','triset']);
    assert.deepEqual(grouped.slice(2).map(x => Boolean(x.isGroupLast)), [false,false,true]);
    assert.match(grouped[2].notes, /TRISET/);
    assert.doesNotMatch(grouped[3].notes, /TRISET/);
    assert.doesNotMatch(grouped[4].notes, /TRISET/);
    assert.ok(Number.parseInt(grouped[4].restTime, 10) >= 120);
    assert.ok(estimateDaySeconds(grouped) < estimateDaySeconds(exercises));

    // Simula la normalizzazione fatta dall'importatore CSV.
    const imported = [{ exercises: grouped.map((ex, i) => ({
        block: i + 1, name: ex.name, notes: ex.notes, recupero: ex.restTime
    })) }];
    applyTrisetDropsetGrouping(imported);
    assert.deepEqual(imported[0].exercises.slice(2).map(ex => ex.groupType),
        ['triset', 'triset', 'triset']);
    const group = imported[0].exercises.slice(2);
    assert.equal(shouldStartRecoveryTimer(group[0], {}, 0, 3), false);
    assert.equal(shouldStartRecoveryTimer(group[1], {}, 0, 3), false);
    assert.equal(shouldStartRecoveryTimer(group[2], {}, 0, 3), true);
});

test('l\'ottimizzatore sceglie un triset quando il superset non basta', () => {
    const exercises = [
        { ...accessory('Prima spinta', 'Petto'), pattern: 'horizontal_push', equipment: 'barbell', restTime: '180s' },
        { ...accessory('Prima tirata', 'Back_Lats'), pattern: 'vertical_pull', equipment: 'barbell', restTime: '150s' },
        accessory('Croci', 'Petto', 3),
        accessory('Laterali', 'Spalle', 3),
        accessory('Curl', 'Bicipiti', 3)
    ];
    const result = optimizeSession(exercises, 49);
    assert.ok(result.estimatedMinutes <= 49);
    assert.equal(result.reducedAccessorySets, 0);
    assert.equal(result.groupCount, 1);
    assert.equal(result.exercises[4].groupType, 'triset');
    assert.match(result.exercises[2].notes, /TRISET/);
});

test('timer: superserie, dropset e serie normali', () => {
    assert.equal(shouldStartRecoveryTimer({ groupType: 'superset', isGroupLast: false }, {}, 0, 3), false);
    assert.equal(shouldStartRecoveryTimer({ groupType: 'superset', isGroupLast: true }, {}, 0, 3), true);
    assert.equal(shouldStartRecoveryTimer({ isDropset: true }, {}, 0, 3), false);
    assert.equal(shouldStartRecoveryTimer({ isDropset: true }, {}, 2, 3), true);
    assert.equal(shouldStartRecoveryTimer({ }, { intensityTechnique: 'MYO_REPS' }, 2, 3), false);
    assert.equal(shouldStartRecoveryTimer({ notes: 'senza pausa tra esercizi' }, {}, 0, 3), true);
});

test('un gruppo che coinvolge gli stessi muscoli non viene creato', () => {
    const exercises = [
        accessory('Fondamentale 1', 'Quadricipiti'),
        accessory('Fondamentale 2', 'Back_Lats'),
        accessory('Croci', 'Petto'),
        accessory('Pushdown', 'Tricipiti')
    ];
    const grouped = groupAccessories(exercises, 2);
    assert.ok(grouped.every(ex => !ex.groupType));
});

test('25 minuti: mantiene i fondamentali con volume minimo, senza inventare tempo', () => {
    const meso = makeMeso(25);
    for (const week of meso.weeks) {
        for (const day of week.days) {
            assert.ok(day.estimatedMinutes <= 25);
            assert.equal(day.estimatedMinutes, estimateDayMinutes(day.exercises));
            assert.ok(day.exercises.some(ex => ex.anchorKey), 'fondamentale previsto presente');
            assert.ok(day.exercises.every(ex => ex.setsCount >= 2));
        }
    }
});

test('il CSV mantiene 12 colonne e timer formattati per tutte le durate', () => {
    for (const maxSessionMinutes of [30, 45, 60, 90]) {
        MyCoatch.generateNextFromHistory({ history: { years: {} } },
            { ...config, maxSessionMinutes });
        const csv = MyCoatch.exportAsCSV();
        const rows = csv.trim().split('\n');
        assert.equal(rows[0], 'Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset');
        assert.ok(rows.length > 25);
        for (const row of rows.slice(1)) {
            const values = row.split(';');
            assert.equal(values.length, 12, row);
            assert.match(values[9], /^\d+s$/);
        }
    }
});

test('avvicinamento specifico: incluso nel tempo ma non come serie allenante', () => {
    const session = makeMeso(60).weeks[0].days[0];
    const primary = session.exercises[0];
    assert.equal(primary.setsCount, primary.sets.length);
    assert.ok(estimateDaySeconds([primary]) > (primary.setsCount * 55) + 300);
});
