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
    const ex = exercise({ kgMin: '60,5', kgMax: '65', reps: '10–15', rpe:'@7.5', targetRpe:'@7.5' });
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

test('a heavy top set cannot be silently copied into a prescribed lighter back-off', () => {
    const ex=exercise({ kgMin:'70', topset:'1x6 @ 80kg (RPE 8)' });
    ex.loggedSets[0] = {weight:80,reps:'6',rpe:'8',isLocked:true};
    assert.equal(getSetPrefill(ex,1).weight,'70');
    assert.equal(getSetPrefill(ex,1).reps,'8');
    ex.loggedSets[1] = {weight:70,reps:'9',rpe:'8',isLocked:true};
    assert.equal(getSetPrefill(ex,2).weight,'70');
    assert.equal(getSetPrefill(ex,2).reps,'9');
});

test('week 2 suggests last confirmed values from same set position, not old defaults', () => {
    const previous = exercise({kgMin:'70'});
    previous.loggedSets[0] = {weight:72.5, reps:'9', rpe:'9', isLocked:true};
    previous.loggedSets[1] = {weight:70, reps:'10', rpe:'8', completed:true};
    const current = exercise({kgMin:'70'});
    const original = structuredClone(current);
    const top = getSetPrefill(current,0,{previousExercise:previous});
    const backoff = getSetPrefill(current,1,{previousExercise:previous});
    assert.deepEqual([top.weight,top.reps,top.source],['72.5','9','confirmed_previous_week']);
    assert.deepEqual([backoff.weight,backoff.reps],['70','10']);
    assert.equal(top.rpe,'8', 'new week RPE target is not previous week measured RPE');
    assert.deepEqual(current,original);
});

test('deliberate new-week CSV load progression takes priority over prior kg', () => {
    const previous=exercise({kgMin:'70',kgMax:'70'});
    previous.loggedSets[0]={weight:72.5,reps:'9',rpe:'8',isLocked:true};
    const current=exercise({kgMin:'75',kgMax:'75'});
    const target=getSetPrefill(current,0,{previousExercise:previous});
    assert.equal(target.weight,'75');
    assert.equal(target.reps,'9'); // still a comparable rep range
    assert.equal(target.source,'csv_target');
});

test('no previous confirmed checkbox means no cross-week carry-forward', () => {
    const previous=exercise();
    previous.loggedSets[0]={weight:90,reps:'12',rpe:'10',isLocked:false,completed:false};
    assert.equal(getSetPrefill(exercise(),0,{previousExercise:previous}).weight,'70');
});

test('previous week top set is not copied into a back-off', () => {
    const previous=exercise({topset:'1x6 @ 90kg (RPE 8)'});
    previous.loggedSets[0]={weight:90,reps:'6',rpe:'8',isLocked:true};
    previous.loggedSets[1]={weight:67.5,reps:'10',rpe:'8',isLocked:true};
    const current=exercise({topset:'1x6 @ 90kg (RPE 8)'});
    const first=getSetPrefill(current,0,{previousExercise:previous});
    const next=getSetPrefill(current,1,{previousExercise:previous});
    assert.equal(first.weight,'90');
    assert.equal(next.weight,'67.5');
    assert.equal(next.reps,'10');
});

test('changed rep range resets rep suggestions to new plan', () => {
    const previous=exercise({reps:'8-12'});
    previous.loggedSets[0]={weight:70,reps:'12',rpe:'8',isLocked:true};
    const current=exercise({reps:'5-7'});
    const first=getSetPrefill(current,0,{previousExercise:previous});
    assert.equal(first.weight,'70');
    assert.equal(first.reps,'5');
    assert.equal(first.source,'csv_target');
});

test('edited draft values win over both CSV and confirmed prior week', () => {
    const previous=exercise();
    previous.loggedSets[0]={weight:80,reps:'10',rpe:'8',isLocked:true};
    const current=exercise();
    current.loggedSets[0]={weight:65,reps:'7',rpe:'9',isLocked:false};
    assert.deepEqual(
        [getSetPrefill(current,0,{previousExercise:previous}).weight,
         getSetPrefill(current,0,{previousExercise:previous}).reps,
         getSetPrefill(current,0,{previousExercise:previous}).rpe],
        ['65','7','9']);
});

test('previous no-RPE result cannot supply an observed RPE to new week', () => {
    const previous=exercise();
    previous.loggedSets[0]={weight:72.5,reps:'10',rpe:'',isLocked:true};
    const current=exercise();
    const target=getSetPrefill(current,0,{previousExercise:previous});
    assert.equal(target.rpe,'8');
    assert.equal(target.isSuggestedRpe,true);
    assert.equal(current.loggedSets[0].rpe,'');
});
