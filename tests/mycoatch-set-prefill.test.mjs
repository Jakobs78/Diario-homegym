import test from 'node:test';
import assert from 'node:assert/strict';
import { getSetPrefill } from '../js/setPrefill.js';

function exercise(overrides = {}) {
    const blank = () => ({ weight: '', reps: '', rpe: '', isLocked: false });
    return {
        name: 'Panca Piana con Bilanciere',
        kgMin: '70', kgMax: '70', reps: '8-12', rpe: '8',
        targetRpe: '8', loggedSets: [blank(), blank(), blank()],
        sets: [{setNumber:1},{setNumber:2},{setNumber:3}], ...overrides
    };
}

test('numeric CSV prescriptions appear as editable suggestions with no mutation', () => {
    const ex = exercise();
    const before = structuredClone(ex);
    const values = getSetPrefill(ex, 0);
    assert.equal(values.weight, '70');
    assert.equal(values.reps, '8');
    assert.equal(values.rpe, '8');
    assert.equal(values.isSuggestedWeight, true);
    assert.equal(values.isSuggestedRpe, true);
    assert.deepEqual(ex, before);
});

test('reps ranges choose a numeric conservative starting suggestion', () => {
    const ex = exercise({ kgMin: '60,5', kgMax: '65', reps: '10–15', rpe:'@7.5' });
    const values = getSetPrefill(ex, 0);
    assert.equal(values.weight, '60.5');
    assert.equal(values.reps, '10');
    assert.equal(values.rpe, '7.5');
});

test('no load in a calibration CSV means no invented kg', () => {
    const ex = exercise({ kgMin: '', kgMax: '', reps: '6-10' });
    assert.equal(getSetPrefill(ex, 0).weight, '');
    assert.equal(getSetPrefill(ex, 1).reps, '6');
});

test('unparseable CSV values remain empty and cannot be confirmed by mistake', () => {
    const ex = exercise({ kgMin:'unknown', kgMax:'75-80', reps:'as needed', rpe:'@8-9', targetRpe: null });
    const p = getSetPrefill(ex,0);
    assert.equal(p.weight,'');
    assert.equal(p.reps,'');
    assert.equal(p.rpe,'');
});

test('first top set has its own weight and reps; later sets use standard target', () => {
    const ex=exercise({kgMin:'70',topset:'1x6 @ 80kg (RPE max 8.0)'});
    assert.equal(getSetPrefill(ex,0).weight,'80');
    assert.equal(getSetPrefill(ex,0).reps,'6');
    assert.equal(getSetPrefill(ex,1).weight,'70');
    assert.equal(getSetPrefill(ex,1).reps,'8');
});

test('per-set prescription overrides generalized exercise values', () => {
    const ex=exercise({sets:[{targetKg:'65',targetReps:'5-6'}, {}, {}]});
    assert.equal(getSetPrefill(ex,0).weight,'65');
    assert.equal(getSetPrefill(ex,0).reps,'5');
});

test('confirmation of previous set populates untouched later sets', () => {
    const ex=exercise();
    ex.loggedSets[0]={weight:72.5,reps:'10',rpe:'8',isLocked:true,completed:true};
    const next=getSetPrefill(ex,1);
    assert.equal(next.weight,'72.5');
    assert.equal(next.reps,'10');
    assert.equal(next.rpe,'8');
    assert.equal(next.isSuggestedRpe,true);
    assert.equal(ex.loggedSets[1].weight,'');
    assert.equal(ex.loggedSets[1].isLocked,false);
});

test('existing manual edits cannot be overwritten by suggestions', () => {
    const ex=exercise();
    ex.loggedSets[0]={weight:72.5,reps:'10',rpe:'8',isLocked:true};
    ex.loggedSets[1]={weight:65,reps:'9',rpe:'9',isLocked:false};
    const values=getSetPrefill(ex,1);
    assert.equal(values.weight,'65');
    assert.equal(values.reps,'9');
    assert.equal(values.rpe,'9');
    assert.equal(values.isSuggestedWeight,false);
    assert.equal(values.isSuggestedRpe,false);
});

test('no copying from unchecked drafted sets',()=>{
    const ex=exercise();
    ex.loggedSets[0].weight=90;
    ex.loggedSets[0].reps='12';
    const p=getSetPrefill(ex,1);
    assert.equal(p.weight,'70');
    assert.equal(p.reps,'8');
});

test('empty suggested RPE does not depend on unrelated kg and reps',()=>{
    const ex=exercise({rpe:'',targetRpe:'',kgMin:'60'});
    const p=getSetPrefill(ex,0);
    assert.equal(p.rpe,'');
    assert.equal(p.weight,'60');
    assert.equal(p.reps,'8');
});
