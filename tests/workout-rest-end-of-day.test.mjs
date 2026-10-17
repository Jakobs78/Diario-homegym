import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPendingWorkingSets, shouldStartRecoveryTimer } from '../js/restPolicy.js';

const set=(confirmed=false,more={})=>({
    weight:'70',reps:'8',rpe:'8',isLocked:confirmed,completed:confirmed,...more
});
const exercise=(logs,more={})=>({name:'Panca',loggedSets:logs,...more});

test('the final confirmed working set never requests rest even if other warmups are unchecked',()=>{
    const day={exercises:[
        exercise([set(true),set(true),set(true)]),
        exercise([set(false)],{isWarmup:true,isExcluded:true})
    ]};
    assert.equal(hasPendingWorkingSets(day),false);
    assert.equal(shouldStartRecoveryTimer(day.exercises[0],day.exercises[0].loggedSets[2],2,3),true,
        'exercise-only policy still allows rest; day completion must override');
});
test('while another working set is unconfirmed, rest may be useful',()=>{
    const day={exercises:[exercise([set(true),set(false)])]};
    assert.equal(hasPendingWorkingSets(day),true);
    day.exercises[0].loggedSets[1].isLocked=true;
    assert.equal(hasPendingWorkingSets(day),false);
});
test('a W-marked set is ignored in end-of-workout check without losing its data',()=>{
    const warm=set(false,{isWarmup:true,weight:'20',reps:'15'});
    const day={exercises:[exercise([warm,set(true)])]};
    assert.equal(hasPendingWorkingSets(day),false);
    assert.equal(warm.weight,'20');
});
test('a single unconfirmed effective set anywhere in the day means more work remains',()=>{
    const day={exercises:[
        exercise([set(true)]),
        exercise([set(false)],{name:'Rematore'}),
        exercise([set(false)],{isExcluded:true})
    ]};
    assert.equal(hasPendingWorkingSets(day),true);
});
test('group rest only after the last grouped exercise',()=>{
    const first=exercise([set(true)],{groupType:'superset',isGroupLast:false});
    const last=exercise([set(true)],{groupType:'superset',isGroupLast:true});
    assert.equal(shouldStartRecoveryTimer(first,first.loggedSets[0],0,1),false);
    assert.equal(shouldStartRecoveryTimer(last,last.loggedSets[0],0,1),true);
});
