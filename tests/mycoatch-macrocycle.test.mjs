import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLatestBlock, planMacrocycle } from '../mycoatch/macrocyclePlanner.js';
import { MyCoatch } from '../mycoatch/index.js';
import { formatCoachReview } from '../mycoatch/mesocycleComparison.js';

function set(confirmed, rpe = '7.5') {
    return { isLocked: confirmed, weight: '60', reps: confirmed ? '8' : '',
        rpe: confirmed ? rpe : '' };
}

function plannedBlock({ weeks = 4, confirmedWeeks = 4, rpe = '7.5',
    incomplete = false, archives = false } = {}) {
    return {name: 'Blocco precedente', weeks: Array.from({length:weeks}, (_, i) => ({
        weekNumber: i + 1, days: [{dayNumber:1, exercises: [{
            name:'Panca Piana con Bilanciere', set:'2 set',
            reps:'6-8', rpe:'@8',
            loggedSets: [set(i < confirmedWeeks, rpe), set(i < confirmedWeeks && !(incomplete && i === weeks - 1), rpe)]
        }], ...(archives && i === weeks - 1
            ? { sessionArchives:[{exercises:[{name:'Panca Piana con Bilanciere',
                loggedSets:[set(true),set(true)]}]}] } : {})}]
    }))};
}
function report(meso, extra = {}) {
    return {lastMesocycle: meso,
        sessionsAnalyzed: meso ? 1 : 0,
        byExercise: {}, ...extra};
}
const cfg = {durationWeeks:4, daysPerWeek:3, focus:'hypertrophy', maxSessionMinutes:120};

test('no logs = only a provisional calibration roadmap', () => {
    const result = planMacrocycle(report(null), cfg);
    assert.equal(result.durationWeeks,12);
    assert.equal(result.readiness,'insufficient_history');
    assert.equal(result.blocks[0].role,'calibration');
    assert.deepEqual(result.blocks.map(x=>[x.weekFrom,x.weekTo]),
        [[1,4],[5,8],[9,12]]);
    assert.equal(result.blocks[1].conditional,true);
    assert.equal(result.blocks[2].conditional,true);
    assert.equal(JSON.stringify(result).includes('"plannedKg"'),false);
});

test('an unstarted future week must NOT be counted as completed', () => {
    const r = planMacrocycle(report(plannedBlock({confirmedWeeks:2})), cfg);
    assert.equal(r.readiness,'incomplete_previous_block');
    assert.equal(r.lastBlock.weeksCompleted,2);
    assert.equal(r.lastBlock.weeksPlanned,4);
    assert.equal(r.lastBlock.adherence,0.5);
});

test('one missing set prevents falsely declaring the block complete', () => {
    const r = planMacrocycle(report(plannedBlock({incomplete:true})), cfg);
    assert.equal(r.readiness,'incomplete_previous_block');
    assert.equal(r.lastBlock.weeksCompleted,3);
    assert.equal(r.lastBlock.setsConfirmed,7);
});

test('archived duplicate sessions do not complete an unfinished scheduled day', () => {
    const last = plannedBlock({confirmedWeeks:3, archives:true});
    const r = planMacrocycle(report(last),cfg);
    assert.equal(r.lastBlock.weeksCompleted,3);
    assert.equal(r.lastBlock.setsConfirmed,6);
});

test('a genuinely fully completed block can proceed to a review', () => {
    const r = planMacrocycle(report(plannedBlock()), cfg);
    assert.equal(r.readiness,'ready_for_next_review');
    assert.equal(r.lastBlock.adherence,1);
    assert.equal(r.lastBlock.rpeCoverage,1);
    assert.equal(r.blocks[0].role,'development');
});

test('missing actual RPE blocks confident progression despite completed sets', () => {
    const r = planMacrocycle(report(plannedBlock({rpe:''})), cfg);
    assert.equal(r.lastBlock.completed,true);
    assert.equal(r.lastBlock.rpeCoverage,0);
    assert.equal(r.readiness,'insufficient_validation');
});

test('repeated distinct-week fatigue has priority over apparent completion', () => {
    const r = planMacrocycle(report(plannedBlock(), {byExercise:{bench:{
        name:'Panca', fatigueConcern:true, progressionEvidence:{distinctWeeks:2}
    }}}),cfg);
    assert.equal(r.readiness,'recovery_review');
    assert.deepEqual(r.recoverySignals,['Panca']);
    assert.equal(r.blocks[0].role,'recovery_review');
});

test('one hard week cannot trigger an early macrocycle recovery review', () => {
    const r = planMacrocycle(report(plannedBlock(), {byExercise:{bench:{
        name:'Panca', fatigueConcern:true, progressionEvidence:{distinctWeeks:1}
    }}}),cfg);
    assert.equal(r.readiness,'ready_for_next_review');
});

test('unknown planned set count is never treated as confirmed completion', () => {
    const meso = { weeks:[{days:[{exercises:[{
        name:'Panca Piana con Bilanciere',
        loggedSets:[set(true),set(true)]
    }]}]}]};
    const r = auditLatestBlock(meso);
    assert.equal(r.completed,false);
    assert.equal(r.unknownPrescriptions,1);
    assert.equal(r.adherence,null);
});

test('explicit training goal and priority persist without changing loads', () => {
    const r = planMacrocycle(report(plannedBlock()), {
        ...cfg, focus:'strength', athleteProfile:{priorityMuscle:'Petto'}
    });
    assert.equal(r.goal,'strength');
    assert.ok(r.blocks.every(x=>x.objective==='forza' && x.priorityMuscle==='Petto'));
    assert.ok(r.blocks.every(x=>x.noPredictedLoads));
});

test('macrocycle never mutates inputs', () => {
    const incoming = report(plannedBlock({confirmedWeeks:2}));
    const settings = {...cfg};
    const before = structuredClone(incoming);
    const oldSettings = structuredClone(settings);
    planMacrocycle(incoming,settings);
    assert.deepEqual(incoming,before);
    assert.deepEqual(settings,oldSettings);
});

test('invalid duration is rejected rather than silently normalized', () => {
    for (const durationWeeks of [0,13,3.5,'four']) {
        assert.throws(()=>planMacrocycle(report(null),{...cfg,durationWeeks}),
            /durata/i);
    }
});

test('public preview method reads history without generating any workout', () => {
    const input = {history:{years:{'2026':{mesocycles:[]}}}};
    const old = structuredClone(input);
    const r = MyCoatch.previewMacrocycle(input,cfg);
    assert.equal(r.readiness,'insufficient_history');
    assert.deepEqual(input,old);
});

test('generation links roadmap to proposed mesocycle and review without modifying history', () => {
    const input = {history:{years:{'2026':{mesocycles:[]}}}};
    const old = structuredClone(input);
    const proposal = MyCoatch.generateNextFromHistory(input,cfg);
    assert.equal(proposal.macrocycle.durationWeeks,12);
    assert.equal(proposal.coachReport.macrocycle,proposal.macrocycle);
    assert.equal(proposal.weeks.length,4);
    const review = formatCoachReview(proposal.coachReport.comparison,proposal.coachReport);
    assert.match(review,/PIANO DI LUNGO PERIODO \(MACROCICLO\)/);
    assert.match(review,/SOLO IPOTESI/);
    assert.deepEqual(input,old);
    const csv = MyCoatch.exportAsCSV();
    assert.match(csv,/Settimana;Giorno;Blocco;/);
    assert.equal(csv.split('\n')[0].split(';').length,12);
    MyCoatch.clearProposal();
});

test('an explicitly planned empty week cannot be silently omitted', () => {
    const latest = plannedBlock({weeks:1});
    latest.weeks.push({weekNumber:2, days:[]});
    const audit = auditLatestBlock(latest);
    assert.equal(audit.weeksPlanned,2);
    assert.equal(audit.weeksCompleted,1);
    assert.equal(audit.completed,false);
});

test('verified historical mesocycles move the stage without inventing results', () => {
    const first = plannedBlock();
    const second = plannedBlock();
    const input = {history:{years:{'2026':{mesocycles:[first,second]}}}};
    const next = planMacrocycle(report(second),cfg,input);
    assert.equal(next.completedHistoricalBlocks,2);
    assert.equal(next.cyclePosition,3);
    assert.equal(next.blocks[0].role,'maintenance');
    assert.equal(next.blocks[1].role,'development');
    assert.equal(next.blocks[2].role,'reassessment');
});

test('an incomplete later block prevents skipping another stage', () => {
    const done = plannedBlock();
    const partial = plannedBlock({confirmedWeeks:1});
    const input = {history:{years:{'2026':{mesocycles:[done,partial]}}}};
    const p = planMacrocycle(report(partial),cfg,input);
    assert.equal(p.completedHistoricalBlocks,1);
    assert.equal(p.readiness,'incomplete_previous_block');
    assert.equal(p.blocks[0].role,'continuity_review');
    assert.equal(p.blocks[1].role,'reassessment');
    assert.ok(p.blocks.every(x=>x.noPredictedLoads));
});
