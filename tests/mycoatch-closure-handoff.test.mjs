import test from 'node:test';
import assert from 'node:assert/strict';
import { locateClosedMesocycle, resolveClosedMesocycle } from '../mycoatch/closureHandoff.js';
import { MyCoatch } from '../mycoatch/index.js';

const config = { durationWeeks: 4, daysPerWeek: 4, maxSessionMinutes: 60,
    userAge: 49, focus: 'hybrid' };
const datedSet = completed => ({
    weight: '80', reps: '8', rpe: '8', isLocked: completed,
    completedAt: new Date().toISOString()
});
const workout = completed => ({
    name: 'Panca Piana con Bilanciere', set: '1 set',
    reps: '6-10', rpe: '@8', targetRpe: '@8',
    loggedSets: [datedSet(completed)]
});
const meso = (name, completed) => ({
    name, weeks: [{ weekNumber: 1, days: [{
        dayNumber: 1, exercises: [workout(completed)]
    }] }]
});
const makeHistory = () => {
    const closed = meso('Blocco realmente concluso', true);
    closed.locked = true;
    closed.coachClosure = { status: 'closed', closedAt: '2026-10-17T16:00:00.000Z' };
    const imported = meso('Scheda importata non iniziata', false);
    const data = { history: { years: { 2026: { mesocycles: [closed, imported] } } } };
    return { data, closed, imported };
};

test('report selezionato: continuità sul concluso, carichi solo da evidenze recenti e nessuna mutazione', () => {
    const { data, closed, imported } = makeHistory();
    const before = JSON.stringify(data);
    const locator = locateClosedMesocycle(data, closed);
    assert.deepEqual(locator, {year:'2026', index:0, closedAt:closed.coachClosure.closedAt});
    assert.equal(locateClosedMesocycle(data, imported), null);
    const result = MyCoatch.generateNextFromHistory(data, { ...config, closureSource: locator });
    assert.equal(result.coachReport.comparison.previousName, closed.name);
    assert.equal(result.coachReport.closureHandoff.name, closed.name);
    assert.equal(result.coachReport.closureHandoff.review.completedSets, 1);
    assert.equal(result.coachReport.closureHandoff.review.plannedSets, 1);
    assert.equal(result.coachReport.macrocycle.lastBlock.setsConfirmed, 1);
    assert.deepEqual(data, JSON.parse(before));
});

test('origine annullata o sostituita: impedisce handoff silenzioso', () => {
    const { data, closed } = makeHistory();
    const locator = locateClosedMesocycle(data, closed);
    const stale = { ...locator, closedAt: '2026-10-16T16:00:00Z' };
    assert.throws(() => resolveClosedMesocycle(data, stale), /non risulta più concluso/);
    closed.locked = false;
    assert.throws(() => MyCoatch.generateNextFromHistory(data,
        { ...config, closureSource: locator }), /non risulta più concluso/);
});

test('chiusura anticipata: si riportano solo set validi, mai sedute non iniziate', () => {
    const { data, closed } = makeHistory();
    closed.weeks[0].days[0].exercises[0].loggedSets[0].isLocked = false;
    const source = resolveClosedMesocycle(data, locateClosedMesocycle(data, closed));
    assert.equal(source.review.completedSets, 0);
    assert.equal(source.review.skippedSessions, 1);
    assert.equal(source.review.averageRpe, null);
});

test('generazione normale senza report esplicito mantiene comportamento precedente', () => {
    const { data } = makeHistory();
    const proposal = MyCoatch.generateNextFromHistory(data, config);
    assert.equal(proposal.coachReport.closureHandoff, null);
    assert.equal(proposal.coachReport.comparison.previousName,
        'Scheda importata non iniziata');
});
