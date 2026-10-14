import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalExerciseKey, canonicalExerciseName } from '../mycoatch/exerciseIdentity.js';
import { analyzeTrainingHistory } from '../mycoatch/historyInsights.js';
import { planAdaptiveDecisions } from '../mycoatch/adaptiveDecisions.js';
import { compareMesocyclePlans, formatCoachReview } from '../mycoatch/mesocycleComparison.js';
import { generateSmartMesocycle } from '../mycoatch/engine.js';
import { MyCoatch } from '../mycoatch/index.js';

const baseConfig = { durationWeeks: 4, daysPerWeek: 4, maxSessionMinutes: 60,
    userAge: 49, focus: 'hybrid' };

const set = (kg, reps, rpe, isLocked = true) => ({
    weight: String(kg), reps: String(reps), rpe, isLocked
});

function plannedExercise(name, tuples, options = {}) {
    const loggedSets = tuples.map(t => set(...t));
    return {
        name, set: `${loggedSets.length} set`,
        reps: options.reps || '6-8',
        rpe: options.targetRpe || '@8',
        targetRpe: options.targetRpe || '@8',
        kgMin: String(tuples.at(-1)?.[0] || ''),
        loggedSets
    };
}

function mesocycle(name, exposureWeeks, exerciseName = 'Panca Piana con Bilanciere', options = {}) {
    return {
        name,
        weeks: exposureWeeks.map((sets, index) => ({
            weekNumber: index + 1,
            days: [{
                dayNumber: 1,
                exercises: [plannedExercise(exerciseName, sets, options)]
            }]
        }))
    };
}

function historyOf(...years) {
    return { history: { years: Object.fromEntries(years) } };
}
const years = (year, ...mesocycles) => [String(year), { mesocycles }];

test('alias prudenti: PANCA equivale a panca piana ma non a panca inclinata', () => {
    const k = canonicalExerciseKey;
    assert.equal(k('PANCA'), k('Panca Piana con Bilanciere'));
    assert.equal(k('Bench Press'), k('Panca Piana con Bilanciere'));
    assert.equal(k('RDL'), k('Stacco Rumeno (RDL)'));
    assert.equal(k('squat'), k('Squat con Bilanciere'));
    assert.notEqual(k('Panca Inclinata con Manubri'), k('Panca Piana con Bilanciere'));
    assert.notEqual(k('Front Squat'), k('Squat con Bilanciere'));
    assert.notEqual(k('Stacco da Terra Convenzionale'), k('Stacco Rumeno (RDL)'));
    assert.equal(canonicalExerciseName('BANANA PRESS'), 'BANANA PRESS');
});

test('analizza tutto lo storico attraverso anni e mesocicli, non solo il piu recente', () => {
    const old = mesocycle('Vecchio', [
        [[70, 8, '@8']], [[72.5, 8, '@8']]
    ], 'PANCA');
    const newer = mesocycle('Nuovo', [
        [[75, 8, '@8']], [[77.5, 8, '@8']]
    ]);
    const history = historyOf(years(2025, old), years(2026, newer));
    const report = analyzeTrainingHistory(history);
    const bench = report.byExercise[canonicalExerciseKey('panca')];
    assert.equal(report.inspectedYears, 2);
    assert.equal(report.inspectedMesocycles, 2);
    assert.equal(report.sessionsAnalyzed, 4);
    assert.equal(bench.exposures.length, 4);
    assert.equal(bench.lastKg, 77.5);
    assert.equal(bench.status, 'progressing');
});

test('mesi non iniziati e set spuntati solo parzialmente non inventano dati', () => {
    const old = mesocycle('Completato', [[[70, 6, '@8']]]);
    const empty = {
        name: 'Nuovo ancora da iniziare',
        weeks: [{ weekNumber: 1, days: [{ dayNumber: 1, exercises: [{
            name: 'Panca Piana con Bilanciere',
            loggedSets: [set(120, 10, '@8', false)]
        }] }] }]
    };
    const report = analyzeTrainingHistory(historyOf(years(2026, old, empty)));
    assert.equal(report.inspectedMesocycles, 2);
    assert.equal(report.sessionsAnalyzed, 1);
    assert.equal(report.byExercise[canonicalExerciseKey('panca')].lastKg, 70);
    assert.equal(report.lastMesocycle.name, 'Nuovo ancora da iniziare');
});

test('senza RPE reale non inventa trend e1RM o progressione di carico', () => {
    const meso = mesocycle('Storico incompleto', [
        [[70, 8, '']], [[72.5, 8, null]], [[75, 8, '']]
    ]);
    const report = analyzeTrainingHistory(historyOf(years(2026, meso)));
    const bench = report.byExercise[canonicalExerciseKey('panca')];
    assert.equal(bench.status, 'insufficient_data');
    assert.equal(bench.lastKg, 75);
    assert.equal(bench.readyForLoad, false);
    assert.equal(planAdaptiveDecisions(report).byExercise[canonicalExerciseKey('panca')].action, 'maintain');
});

test('double progression: incrementa modestamente con due esposizioni complete entro RPE', () => {
    const meso = mesocycle('Progressione', [
        [[75, 7, '@8']], [[77.5, 8, '@8']], [[80, 8, '@7.5']]
    ]);
    const report = analyzeTrainingHistory(historyOf(years(2026, meso)));
    const decision = planAdaptiveDecisions(report).byExercise[canonicalExerciseKey('panca')];
    assert.equal(decision.action, 'increase_load');
    assert.equal(decision.lastKg, 80);
    assert.equal(decision.plannedKg, 82.5);
    const proposed = MyCoatch.generateNextFromHistory(historyOf(years(2026, meso)), baseConfig);
    assert.equal(proposed.weeks[0].days[0].exercises[0].kgMin, '82.5');
    assert.match(proposed.weeks[0].days[0].exercises[0].notes, /piccolo incremento proposto/);
    assert.equal(proposed.coachReport.inspectedMesocycles, 1);
});

test('fatica ripetuta e regression: riduzione del carico e una serie accessoria in meno', () => {
    const meso = mesocycle('Fatica', [
        [[100, 6, '@8']], [[95, 5, '@9.5']], [[95, 4, '@9.5']]
    ]);
    const report = analyzeTrainingHistory(historyOf(years(2026, meso)));
    const decision = planAdaptiveDecisions(report);
    assert.equal(decision.byExercise[canonicalExerciseKey('panca')].action, 'reduce_load');
    assert.equal(decision.byExercise[canonicalExerciseKey('panca')].plannedKg, 92.5);
    assert.equal(decision.byMuscle.Petto.volumeDelta, -1);
    const proposed = MyCoatch.generateNextFromHistory(historyOf(years(2026, meso)), baseConfig);
    assert.equal(proposed.weeks[0].days[0].exercises[0].kgMin, '92.5');
    const chestAccessory = proposed.weeks[0].days[0].exercises.find(ex => ex.category === 'Petto' && ex.pattern === 'isolation');
    assert.equal(chestAccessory.setsCount, 2);
});

test('stallo con buona aderenza e RPE moderato: +1 serie accessoria se il tempo lo consente', () => {
    const meso = mesocycle('Stallo', [
        [[80, 7, '@7']], [[80, 7, '@7']], [[80, 7, '@7']]
    ]);
    const report = analyzeTrainingHistory(historyOf(years(2026, meso)));
    const decision = planAdaptiveDecisions(report);
    assert.equal(decision.byExercise[canonicalExerciseKey('panca')].action, 'review_stall');
    assert.equal(decision.byMuscle.Petto.volumeDelta, 1);
    const result = MyCoatch.generateNextFromHistory(historyOf(years(2026, meso)), baseConfig);
    const chestAccessory = result.weeks[0].days[0].exercises.find(ex => ex.category === 'Petto' && ex.pattern === 'isolation');
    assert.equal(chestAccessory.setsCount, 4);
    assert.match(chestAccessory.notes, /serie accessoria aggiuntiva/);
});

test('deload RPE basso non diventa riferimento artificioso per il nuovo carico', () => {
    const meso = mesocycle('Scarico', [
        [[80, 8, '@8']], [[82.5, 8, '@8']], [[85, 7, '@8']],
        [[60, 6, '@6.5']]
    ]);
    const report = analyzeTrainingHistory(historyOf(years(2026, meso)));
    const bench = report.byExercise[canonicalExerciseKey('panca')];
    assert.equal(bench.lastKg, 85);
    assert.equal(bench.exposuresCount, 3);
});

test('se lo storico manca, genera una scheda non personalizzata senza inventare misure', () => {
    const meso = MyCoatch.generateNextFromHistory(historyOf(), baseConfig);
    assert.equal(meso.coachReport.sessionsAnalyzed, 0);
    assert.equal(meso.coachReport.inspectedMesocycles, 0);
    assert.equal(meso.weeks[0].days[0].exercises[0].kgMin, '');
    assert.match(meso.coachReport.comparison.warnings.join(''), /^$/);
});

test('prima settimana: confronto strutturato tra il mesociclo precedente e la proposta', () => {
    const meso = mesocycle('Panca di prova', [[[80, 8, '@8']], [[82.5, 8, '@8']], [[85, 8, '@8']]]);
    const report = analyzeTrainingHistory(historyOf(years(2026, meso)));
    const decisions = planAdaptiveDecisions(report);
    const proposed = generateSmartMesocycle(baseConfig, { ...report, decisions }, meso);
    const comparison = compareMesocyclePlans(meso, proposed, { decisions });
    assert.equal(comparison.basedOnPrevious, true);
    assert.equal(comparison.previousName, 'Panca di prova');
    assert.ok(comparison.changes.length > 0);
    const review = formatCoachReview(comparison, {
        inspectedMesocycles: report.inspectedMesocycles,
        sessionsAnalyzed: report.sessionsAnalyzed
    });
    assert.match(review, /ANTEPRIMA DELLA PROPOSTA/);
    assert.match(review, /Confermi la proposta/);
});

test('CSV rimane importabile a 12 colonne, senza dati di regressione extra', () => {
    const meso = mesocycle('Test', [[[70, 7, '@8']], [[72.5, 8, '@8']], [[75, 8, '@8']]]);
    MyCoatch.generateNextFromHistory(historyOf(years(2026, meso)), baseConfig);
    const csv = MyCoatch.exportAsCSV();
    const rows = csv.trim().split('\n');
    assert.equal(rows[0], 'Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset');
    for (const row of rows.slice(1)) {
        assert.equal(row.split(';').length, 12, row);
    }
});

test('la proposta annullata si elimina solo dalla memoria di MyCoatch', () => {
    const history = historyOf(years(2026, mesocycle('Originale', [[[80, 8, '@8']]])));
    const snapshot = JSON.stringify(history);
    MyCoatch.generateNextFromHistory(history, baseConfig);
    assert.ok(MyCoatch.getActiveMesocycleJSON());
    MyCoatch.clearProposal();
    assert.equal(MyCoatch.getActiveMesocycleJSON(), null);
    assert.equal(JSON.stringify(history), snapshot);
});
