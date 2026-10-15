import test from 'node:test';
import assert from 'node:assert/strict';
import { MyCoatch } from '../mycoatch/index.js';
import { analyzeTrainingHistory } from '../mycoatch/historyInsights.js';
import { planAdaptiveDecisions } from '../mycoatch/adaptiveDecisions.js';
import { calibrationHandoffForMesocycle } from '../mycoatch/calibrationReview.js';
import { formatCoachReview } from '../mycoatch/mesocycleComparison.js';
import { canonicalExerciseKey } from '../mycoatch/exerciseIdentity.js';

const config = {
    userAge: 36, daysPerWeek: 4, maxSessionMinutes: 75,
    durationWeeks: 4, focus: 'hybrid', athleteProfile: {
        experience: 'beginner', calibration: 'guided',
        priorityMuscle: null, excludedExercises: [], referenceLoads: {}
    }
};
const historyFrom = (...mesocycles) => ({
    history: { years: { 2026: { mesocycles } } }
});

function newlyImportedCalibration() {
    const source = MyCoatch.generateNextFromHistory(historyFrom(), config);
    const copy = structuredClone(source);
    for (const week of copy.weeks) {
        for (const day of week.days) {
            for (const ex of day.exercises) {
                // La vera importazione CSV mantiene note/rep/RPE prescritti,
                // ma non conferma alcuna serie. Nessuna kg promessa.
                ex.loggedSets = ex.sets.map(set => ({
                    setNumber: set.setNumber,
                    weight: '', reps: '', rpe: '', isLocked: false
                }));
            }
        }
    }
    return copy;
}

function confirmFirstWeek(meso, { withoutRpe = false } = {}) {
    for (const day of meso.weeks[0].days) {
        for (const ex of day.exercises) {
            for (const set of ex.loggedSets) {
                set.weight = '40';
                set.reps = '8';
                set.rpe = withoutRpe ? '' : '7';
                set.isLocked = true;
            }
        }
    }
    return meso;
}

test('passaggio: mesociclo nuovo non iniziato resta esplicitamente non pronto', () => {
    const meso = newlyImportedCalibration();
    const snapshot = JSON.stringify(meso);
    const check = calibrationHandoffForMesocycle(meso);
    assert.equal(check.status, 'not_started');
    assert.equal(check.readyForReview, false);
    assert.equal(check.validSets, 0);
    assert.equal(check.completeDays, 0);
    assert.equal(check.anchorsRecorded, 0);
    assert.equal(check.missingAnchors.length, 4);
    assert.ok(!JSON.stringify(check).includes('weight'));
    assert.equal(JSON.stringify(meso), snapshot);
});

test('passaggio con una sola serie: messaggio forte di calibrazione incompleta', () => {
    const meso = newlyImportedCalibration();
    const logged = meso.weeks[0].days[0].exercises[0].loggedSets[0];
    Object.assign(logged, { weight: '40', reps: '8', rpe: '7', isLocked: true });
    const before = JSON.stringify(meso);
    const proposed = MyCoatch.generateNextFromHistory(historyFrom(meso), config);
    const check = proposed.coachReport.calibrationHandoff;
    assert.ok(check);
    assert.equal(check.status, 'in_progress');
    assert.equal(check.readyForReview, false);
    assert.equal(check.anchorsRecorded, 1);
    assert.ok(check.missingAnchors.includes('Squat'));
    assert.equal(check.validSets, 1);
    assert.equal(check.completeDays, 0);
    const review = formatCoachReview(
        proposed.coachReport.comparison, proposed.coachReport
    );
    assert.match(review, /calibrazione NON completata/);
    assert.match(review, /1\/4 movimenti cardine/);
    assert.match(review, /Riferimenti mancanti: Squat/);
    assert.match(review, /nessun allenamento esistente viene aggiornato/);
    assert.equal(JSON.stringify(meso), before);
    assert.match(MyCoatch.exportAsCSV().split('\n')[0], /^Settimana;Giorno;Blocco;/);
});

test('passaggio dopo quattro giornate effettive: revisione disponibile, non fine del mesociclo', () => {
    const meso = confirmFirstWeek(newlyImportedCalibration());
    const before = JSON.stringify(meso);
    const next = MyCoatch.generateNextFromHistory(historyFrom(meso), config);
    const check = next.coachReport.calibrationHandoff;
    assert.equal(check.readyForReview, true);
    assert.equal(check.completeDays, 4);
    assert.equal(check.anchorsRecorded, 4);
    assert.ok(check.validSets > 4);
    assert.equal(check.withoutRpe, 0);
    const review = formatCoachReview(next.coachReport.comparison, next.coachReport);
    assert.match(review, /Calibrazione della prima settimana registrata/);
    assert.match(review, /NON significa che le settimane restanti/);
    assert.ok(!review.includes('calibrazione NON completata'));
    assert.equal(JSON.stringify(meso), before);
});

test('passaggio con RPE mancante: mai inventare RPE né e1RM', () => {
    const meso = confirmFirstWeek(newlyImportedCalibration(), { withoutRpe: true });
    const proposed = MyCoatch.generateNextFromHistory(historyFrom(meso), config);
    const check = proposed.coachReport.calibrationHandoff;
    assert.equal(check.readyForReview, true);
    assert.equal(check.withoutRpe, check.validSets);
    assert.match(formatCoachReview(
        proposed.coachReport.comparison, proposed.coachReport
    ), /RPE non registrato/);
    const analysis = analyzeTrainingHistory(historyFrom(meso));
    assert.ok(Object.values(analysis.byExercise).every(ex =>
        ex.e1rmChangePct === null && ex.readyForLoad === false));
});

test('solo mesocicli con tag di calibrazione devono attivare la revisione', () => {
    const generic = { weeks: [{ weekNumber: 1, days: [{
        dayNumber: 1, exercises: [{
            name: 'Panca Piana con Bilanciere', notes: 'Programma indipendente',
            loggedSets: [{ weight: 80, reps: 8, rpe: 8, isLocked: true }]
        }]
    }] }] };
    assert.equal(calibrationHandoffForMesocycle(generic), null);
    assert.equal(calibrationHandoffForMesocycle(null), null);
    const generated = MyCoatch.generateNextFromHistory(historyFrom(generic), config);
    assert.equal(generated.coachReport.calibrationHandoff, null);
});

test('due esposizioni nella stessa settimana non autorizzano incremento automatico', () => {
    const bench = (kg, dayNumber) => ({
        dayNumber, exercises: [{
            name: 'Panca Piana con Bilanciere', set: '2 set',
            reps: '6-8', targetRpe: '@8', rpe: '@8',
            loggedSets: [
                { weight: String(kg), reps: '8', rpe: '7', isLocked: true },
                { weight: String(kg), reps: '8', rpe: '7', isLocked: true }
            ]
        }]
    });
    const oneWeek = {
        name: 'Calibrazione 1 settimana',
        weeks: [{ weekNumber: 1, days: [bench(70, 1), bench(72.5, 3)] }]
    };
    const report = analyzeTrainingHistory(historyFrom(oneWeek));
    const record = report.byExercise[canonicalExerciseKey('Panca Piana con Bilanciere')];
    assert.equal(record.exposuresCount, 2);
    assert.equal(record.readyForLoad, false);
    assert.equal(record.fatigueConcern, false);
    const decision = planAdaptiveDecisions(report).byExercise[canonicalExerciseKey('Panca Piana con Bilanciere')];
    assert.equal(decision.action, 'maintain');
    // Con due sedute dello stesso microciclo a kg diversi il riferimento
    // prudente resta la serie di lavoro piu' leggera, non il top set da 72,5.
    assert.equal(decision.plannedKg, 70);
    const twoWeeks = structuredClone(oneWeek);
    twoWeeks.weeks[0].days.pop();
    twoWeeks.weeks.push({ weekNumber: 2, days: [bench(72.5, 1)] });
    const confirmed = analyzeTrainingHistory(historyFrom(twoWeeks));
    assert.equal(confirmed.byExercise[canonicalExerciseKey('Panca Piana con Bilanciere')].readyForLoad, true);
    assert.equal(planAdaptiveDecisions(confirmed).byExercise[
        canonicalExerciseKey('Panca Piana con Bilanciere')].action, 'increase_load');
});

test('RPE alto ripetuto nello stesso microciclo non prova fatica ricorrente', () => {
    const make = dayNumber => ({
        dayNumber,
        exercises: [{
            name: 'Squat con Bilanciere', reps: '6-8',
            targetRpe: '@8',
            loggedSets: [{ weight: 80, reps: 6, rpe: 9.5, isLocked: true }]
        }]
    });
    const meso = { weeks: [{ weekNumber: 1, days: [make(1), make(3)] }] };
    const report = analyzeTrainingHistory(historyFrom(meso));
    const squat = report.byExercise[canonicalExerciseKey('Squat con Bilanciere')];
    assert.equal(squat.fatigueConcern, false);
    assert.equal(planAdaptiveDecisions(report).byExercise[
        canonicalExerciseKey('Squat con Bilanciere')].action, 'maintain');
});
