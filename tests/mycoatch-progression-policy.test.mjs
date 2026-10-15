import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTrainingHistory } from '../mycoatch/historyInsights.js';
import { planAdaptiveDecisions } from '../mycoatch/adaptiveDecisions.js';
import { evaluateExerciseProgression } from '../mycoatch/progressionPolicy.js';
import { canonicalExerciseKey } from '../mycoatch/exerciseIdentity.js';
import { MyCoatch } from '../mycoatch/index.js';
import { previousExercisePerformance, historicalSessionPace } from '../mycoatch/liveHistory.js';

const bench = 'Panca Piana con Bilanciere';
const key = canonicalExerciseKey(bench);
const settings = { durationWeeks: 4, daysPerWeek: 4, maxSessionMinutes: 75,
    focus: 'hybrid', userAge: 35 };

function performed(weight = 80, reps = 8, rpe = 7.5, overrides = {}) {
    return {
        weight: String(weight), reps: String(reps),
        rpe: rpe === null ? '' : String(rpe),
        isLocked: true, completed: true,
        ...overrides
    };
}
function exercise(sets, config = {}) {
    return {
        name: config.name || bench,
        set: String(config.planned || sets.length) + ' set',
        reps: config.range || '6-8',
        targetRpe: config.targetRpe || '@8',
        rpe: config.targetRpe || '@8',
        loggedSets: sets
    };
}
function makeHistory(weeks) {
    return { history: { years: { 2026: {
        mesocycles: [{ name: 'Mesociclo prova', weeks: weeks.map((days, index) => ({
            weekNumber: index + 1,
            days: days.map((exercises, dayIndex) => ({
                dayNumber: dayIndex + 1,
                dayName: 'Upper A',
                exercises
            }))
        })) }]
    } } } };
}
const oneExerciseWeek = (kg, reps, rpe, config = {}) =>
    [[exercise([performed(kg, reps, rpe)], config)]];
const analyse = weeks => {
    const history = makeHistory(weeks);
    const report = analyzeTrainingHistory(history);
    return { report, decision: planAdaptiveDecisions(report).byExercise[
        Object.keys(report.byExercise)[0]], history };
};

test('double progression: 2 settimane di lavoro completo a metà range => +1 ripetizione, kg stabili', () => {
    const { decision, report, history } = analyse([
        oneExerciseWeek(80, 7, 7.5),
        oneExerciseWeek(80, 7, 7)
    ]);
    assert.equal(decision.action, 'build_reps');
    assert.equal(decision.lastKg, 80);
    assert.equal(decision.workingKg, 80);
    assert.equal(decision.plannedKg, 80);
    assert.equal(decision.plannedRepGoal, 8);
    assert.equal(decision.evidenceWeeks.length, 2);
    assert.equal(report.byExercise[key].readyForLoad, false);
    const snapshot = JSON.stringify(history);
    const meso = MyCoatch.generateNextFromHistory(history, settings);
    const first = meso.weeks[0].days[0].exercises[0];
    assert.equal(first.kgMin, '80');
    assert.match(first.notes, /\[PROGRESSIONE MYCOATCH\]/);
    assert.match(first.notes, /prova 8 ripetizioni/);
    assert.equal(JSON.stringify(history), snapshot, 'MyCoatch non deve scrivere sullo storico');
});

test('2 settimane distinte e tutte le serie a target: incremento prudente', () => {
    const { report, decision } = analyse([
        oneExerciseWeek(80, 8, 7.5),
        oneExerciseWeek(80, 8, 8)
    ]);
    assert.equal(report.byExercise[key].readyForLoad, true);
    assert.equal(decision.action, 'increase_load');
    assert.equal(decision.plannedKg, 82.5);
    assert.equal(decision.confidence, 'low');
    assert.match(decision.reason, /Due settimane diverse/);
});

test('due sedute nella stessa settimana non bastano a decidere l’incremento', () => {
    const { report, decision } = analyse([
        [exercise([performed(80, 8, 7)]), exercise([performed(80, 8, 7.5)])]
    ]);
    assert.equal(report.byExercise[key].progressionEvidence.distinctWeeks, 1);
    assert.equal(report.byExercise[key].readyForLoad, false);
    assert.equal(decision.action, 'maintain');
    assert.ok(decision.caveats.includes('servono_due_settimane_distinte'));
});

test('set incompleto o non spuntato blocca progressione anche se altre serie sono buone', () => {
    const full = exercise([performed(80, 8, 7.5), performed(80, 8, 7.5)], { planned: 2 });
    const incomplete = exercise([performed(80, 8, 7.5), performed(80, 8, 7.5,
        { isLocked: false, completed: false })], { planned: 2 });
    const { decision } = analyse([[ [full] ], [ [incomplete] ]]);
    assert.equal(decision.action, 'maintain');
    assert.ok(decision.caveats.includes('serie_incomplete'));
});

test('drop set e tecniche speciali non giustificano aumento kg automatico', () => {
    const special = exercise([performed(80, '10+8+6', 7)], { planned: 1 });
    const { report, decision } = analyse([
        oneExerciseWeek(80, 8, 7), [[special]]
    ]);
    assert.equal(report.byExercise[key].readyForLoad, false);
    assert.equal(decision.action, 'maintain');
    assert.equal(report.byExercise[key].exposures.at(-1).e1rm, null);
    assert.ok(decision.caveats.includes('tecnica_speciale_o_carichi_misti'));
});

test('RPE non dichiarato non viene stimato né autorizza progressione', () => {
    const { report, decision } = analyse([
        oneExerciseWeek(80, 8, null),
        oneExerciseWeek(80, 8, null)
    ]);
    assert.equal(decision.action, 'maintain');
    assert.equal(decision.plannedKg, 80);
    assert.equal(report.byExercise[key].status, 'insufficient_data');
    assert.equal(report.byExercise[key].exposures[0].e1rm, null);
    assert.ok(decision.caveats.includes('rpe_mancante_o_sopra_target'));
});

test('settimana con due sedute: una difficile impedisce aumento scegliendo il migliore', () => {
    const week1 = [exercise([performed(80, 8, 7)])];
    const week2good = [exercise([performed(80, 8, 7)])];
    const week2hard = [exercise([performed(80, 6, 9)])];
    const { decision, report } = analyse([
        [week1], [week2good, week2hard]
    ]);
    assert.equal(report.byExercise[key].progressionEvidence.distinctWeeks, 2);
    assert.equal(report.byExercise[key].readyForLoad, false);
    assert.equal(decision.action, 'maintain');
});

test('non suggerire +2.5 kg su un fondamentale da 20 kg: percentuale eccessiva', () => {
    const { decision } = analyse([
        oneExerciseWeek(20, 8, 7),
        oneExerciseWeek(20, 8, 7)
    ]);
    assert.equal(decision.action, 'maintain');
    assert.equal(decision.plannedKg, 20);
    assert.match(decision.reason, /superiore al 10%/);
});

test('top-set 100 e backoff 80: mai proporre 100 kg per TUTTE le serie', () => {
    const multiple = exercise([performed(100, 8, 8), performed(80, 8, 7.5)],
        { planned: 2 });
    const { report, decision, history } = analyse([[[multiple]], [[multiple]]]);
    assert.equal(report.byExercise[key].lastKg, 100);
    assert.equal(report.byExercise[key].lastWorkingKg, 80);
    assert.equal(report.byExercise[key].readyForLoad, false);
    assert.equal(decision.plannedKg, 80);
    assert.equal(decision.action, 'maintain');
    const proposed = MyCoatch.generateNextFromHistory(history, settings);
    assert.equal(proposed.weeks[0].days[0].exercises[0].kgMin, '80');
});

test('manubri: un incremento reale di 1kg non viene arrotondato via dal generatore', () => {
    const name = 'Panca Inclinata con Manubri';
    const cfg = { name, range: '8-12' };
    const { history, report } = analyse([
        oneExerciseWeek(15, 12, 7.5, cfg),
        oneExerciseWeek(15, 12, 7.5, cfg)
    ]);
    const keyDumbbell = canonicalExerciseKey(name);
    const decision = planAdaptiveDecisions(report).byExercise[keyDumbbell];
    assert.equal(decision.action, 'increase_load');
    assert.equal(decision.plannedKg, 16);
    const generated = MyCoatch.generateNextFromHistory(history, {
        ...settings, availableAccessories: ['rack','flat_bench','incline_bench'],
        preferredLifts: { bench: name }
    });
    assert.equal(generated.weeks[0].days[0].exercises[0].name, name);
    assert.equal(generated.weeks[0].days[0].exercises[0].kgMin, '16');
});

test('due settimane di fatica effettiva => prudente riduzione, una giornata no', () => {
    const oneBad = analyse([
        oneExerciseWeek(95, 6, 8),
        oneExerciseWeek(95, 5, 9.5)
    ]);
    assert.equal(oneBad.decision.action, 'maintain');
    const repeated = analyse([
        oneExerciseWeek(95, 5, 9.5),
        oneExerciseWeek(95, 4, 9.5)
    ]);
    assert.equal(repeated.decision.action, 'reduce_load');
    assert.equal(repeated.decision.plannedKg, 92.5);
});

test('archivio di sedute ripetute: analisi e live recuperano i dati senza contarli come settimane diverse', () => {
    const archived = {
        dayName: 'Upper A', sessionDate: '2026-09-14', totalDurationMinutes: 46,
        exercises: [exercise([performed(75, 7, 7.5)], { planned: 1 })]
    };
    const currentDay = {
        dayNumber: 1, dayName: 'Upper A',
        sessionArchives: [{ ...archived }, { ...archived, sessionDate: '2026-09-15' }],
        exercises: [exercise([{ weight: '', reps: '', rpe: '', isLocked: false }])]
    };
    const history = makeHistory([[[currentDay.exercises[0]]]]);
    history.history.years[2026].mesocycles[0].weeks[0].days[0] = currentDay;
    const snapshot = JSON.stringify(history);
    const report = analyzeTrainingHistory(history);
    const analysed = report.byExercise[key];
    assert.equal(report.sessionsAnalyzed, 2);
    assert.equal(analysed.exposures.length, 2);
    assert.equal(analysed.progressionEvidence.distinctWeeks, 1);
    assert.equal(planAdaptiveDecisions(report).byExercise[key].action, 'maintain');
    const last = previousExercisePerformance(history, currentDay, bench);
    assert.equal(last.kg, 75);
    assert.equal(last.reps, 7);
    assert.equal(JSON.stringify(history), snapshot);
});

test('ritmo storico: usa le tre ripetizioni archiviate di una stessa seduta', () => {
    const archived = [1,2,3].map(i => ({
        dayName: 'Upper A', totalDurationMinutes: 12 + i,
        exercises: [exercise([
            performed(80, 8, 7), performed(80, 8, 7),
            performed(80, 8, 7), performed(80, 8, 7)
        ])]
    }));
    const day = {
        dayName: 'Upper A', dayNumber: 1, sessionArchives: archived,
        exercises: [exercise(Array.from({ length: 4 }, () => ({
            weight: '', reps: '', rpe: '', isLocked: false
        })))]
    };
    const history = makeHistory([[[day.exercises[0]]]]);
    history.history.years[2026].mesocycles[0].weeks[0].days[0] = day;
    const tempo = historicalSessionPace(history, day);
    assert.ok(tempo);
    assert.equal(tempo.samples, 3);
    assert.ok(tempo.secondsPerSet > 600 / 4);
});

test('valutazione senza esposizioni: nessuna progressione automatica', () => {
    assert.deepEqual(evaluateExerciseProgression([]).readyForLoad, false);
    assert.equal(evaluateExerciseProgression([]).nextRepTarget, null);
});
