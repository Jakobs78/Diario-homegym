import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalExerciseKey } from '../mycoatch/exerciseIdentity.js';
import { analyzeTrainingHistory } from '../mycoatch/historyInsights.js';
import { planAdaptiveDecisions } from '../mycoatch/adaptiveDecisions.js';
import { MyCoatch } from '../mycoatch/index.js';

const name = 'Alzate Laterali con Manubri';
const key = canonicalExerciseKey(name);
const DAY = 86400000;

function fixture(blocks, { dates = false } = {}) {
    const diary = { history: { years: { 2026: { mesocycles: [] } } } };
    let weekIndex = 0;
    const totalWeeks = blocks.reduce((sum, block) => sum + block.length, 0);
    for (const [blockIndex, block] of blocks.entries()) {
        const meso = { name: 'Blocco ' + (blockIndex + 1), weeks: [] };
        for (const data of block) {
            const date = dates ? new Date(Date.now() -
                (totalWeeks - 1 - weekIndex) * 7 * DAY - 2 * DAY).toISOString() : null;
            const repetitions = data.reps ?? 20;
            const count = data.count ?? 3;
            const loggedSets = Array.from({ length: count }, () => ({
                weight: String(data.kg ?? 8), reps: String(repetitions),
                rpe: data.rpe === undefined ? '7.5' : data.rpe,
                isLocked: true,
                ...(date ? { completedAt: date } : {})
            }));
            meso.weeks.push({ weekNumber: block.length === 1 ? 1 :
                meso.weeks.length + 1, days: [{
                dayNumber: 1,
                ...(date ? { sessionCompletedAt: date } : {}),
                exercises: [{
                    name, setsCount: 3, set: '3 set', reps: '15-25',
                    targetRpe: '@8', rpe: '@8', loggedSets
                }]
            }] });
            weekIndex++;
        }
        diary.history.years[2026].mesocycles.push(meso);
    }
    return diary;
}
const analyze = data => {
    const report = analyzeTrainingHistory(data);
    return { report, exercise: report.byExercise[key],
        decision: planAdaptiveDecisions(report).byExercise[key] };
};

test('isolamento ad alte reps: tre settimane identiche rilevano stallo di reps, non e1RM', () => {
    const diary = fixture([[{reps:20},{reps:20},{reps:20}]]);
    const before = JSON.stringify(diary);
    const {report,exercise,decision} = analyze(diary);
    assert.ok(exercise.exposures.every(x => x.e1rm === null));
    assert.equal(exercise.status, 'possible_stall');
    assert.equal(exercise.trendMetric, 'working_reps');
    assert.equal(exercise.repsChange, 0);
    assert.deepEqual(report.stalledExercises, [name]);
    // At midrange with measurable RPE, double progression already prescribes reps.
    // A second +1 accessory series in the same response would be gratuitous.
    assert.equal(decision.action, 'build_reps');
    assert.equal(decision.stallStrategy.code, 'continue_double_progression');
    assert.equal(planAdaptiveDecisions(report).byMuscle[exercise.category]?.volumeDelta ?? 0, 0);
    assert.equal(JSON.stringify(diary), before);
});

test('aumento reps a kg costanti risulta progresso anche senza e1RM', () => {
    const {exercise} = analyze(fixture([[{reps:17},{reps:18},{reps:20}]]));
    assert.equal(exercise.status, 'progressing');
    assert.equal(exercise.repsChange, 3);
    assert.equal(exercise.trendMetric, 'working_reps');
});

test('RPE assente o serie non completate non dimostrano stallo', () => {
    for (const changes of [
        [{},{rpe:''},{}],
        [{},{count:2},{}],
        [{kg:8},{kg:9},{kg:8}],
        [{},{},]
    ]) {
        const {exercise} = analyze(fixture([changes]));
        assert.equal(exercise.status, 'insufficient_data');
        assert.equal(exercise.trendMetric, null);
    }
});

test('risposta osservata tra due blocchi confrontabili: segnale non causale', () => {
    const diary = fixture([
        [{reps:18},{reps:18}],
        [{reps:20},{reps:20}]
    ]);
    const before = JSON.stringify(diary);
    const {exercise} = analyze(diary);
    assert.equal(exercise.blockResponse?.status,'improved');
    assert.equal(exercise.blockResponse?.deltaReps,2);
    assert.equal(exercise.blockResponse?.previousBlock,'2026/0');
    assert.equal(exercise.blockResponse?.currentBlock,'2026/1');
    assert.match(exercise.blockResponse?.interpretation,/non prova la causa/);
    assert.equal(JSON.stringify(diary),before);
});

test('niente confronto blocchi con carichi diversi, settimane mancanti o RPE assenti', () => {
    for (const blocks of [
        [[{reps:18},{reps:18}],[{kg:9,reps:20},{kg:9,reps:20}]],
        [[{reps:18}],[{reps:20},{reps:20}]],
        [[{reps:18},{rpe:''}],[{reps:20},{reps:20}]]
    ]) {
        const {exercise} = analyze(fixture(blocks));
        assert.equal(exercise.blockResponse,null);
    }
});

test('stallo reale senza progressione disponibile: prova solo +1 serie e pianifica revisione', () => {
    const report = {
        byExercise: { [key]: {
            name, category: 'Spalle', equipment: 'dumbbell',
            status: 'possible_stall', trendMetric: 'working_reps',
            readyForLoad: false, readyForReps: false, fatigueConcern: false,
            lastKg: 8, lastWorkingKg: 8, avgRpe: 7,
            progressionEvidence: { distinctWeeks: 3, evidenceWeeks: ['w1','w2','w3'] }
        }},
        byMuscle: { Spalle: {
            weeksObserved: 3, avgWeeklySets: 4, avgWeeklyFractionalSets: 4,
            recentAdherence: 1, avgRpe: 7, fractionalRpeCoverage: 1,
            exerciseKeys: [key]
        }}
    };
    const before = JSON.stringify(report);
    const results = planAdaptiveDecisions(report);
    assert.equal(results.byMuscle.Spalle.volumeDelta,1);
    assert.equal(results.byExercise[key].stallStrategy.code,'trial_accessory_volume');
    assert.equal(results.byExercise[key].stallStrategy.reviewAfterWeeks,2);
    assert.equal(JSON.stringify(report),before);
});

test('anteprima integrata: segnali fra blocchi e strategia leggibili, mai scritti sul diario', () => {
    const diary = fixture([
        [{reps:20},{reps:20}],
        [{reps:20},{reps:20}]
    ], { dates:true });
    const original = JSON.stringify(diary);
    const cfg = {durationWeeks:4,daysPerWeek:4,maxSessionMinutes:60,focus:'hybrid'};
    const proposed = MyCoatch.generateNextFromHistory(diary,cfg);
    assert.ok(proposed.coachReport.blockResponses.some(r => r.exercise === name));
    const decision = proposed.coachReport.decisions.byExercise[key];
    assert.equal(decision.stallStrategy.code,'continue_double_progression');
    assert.equal(JSON.stringify(diary),original);
    const csv = MyCoatch.exportAsCSV();
    assert.equal(csv.split('\n')[0].split(';').length,12);
    MyCoatch.clearProposal();
});
