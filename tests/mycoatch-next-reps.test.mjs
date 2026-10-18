import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendNextSessionReps} from '../mycoatch/nextSessionReps.js';
import {getSetPrefill} from '../js/setPrefill.js';
const set=(rep,rpe=8)=>({weight:'55',reps:String(rep),rpe:String(rpe),isLocked:true});
const ex=(loggedSets)=>({name:'Panca Piana con Bilanciere',reps:'6-8',targetRpe:'8',kgMin:'55',kgMax:'55',sets:[{},{},{}],loggedSets});
test('one additional rep per entire next workout only after all valid working sets',()=>{
 const prior=ex([set(8),set(7),set(7)]),future=ex([{},{},{}]);
 const p=recommendNextSessionReps(prior,future);
 assert.deepEqual(p.reps,[8,8,7]);
 assert.equal(getSetPrefill(future,1,{previousExercise:prior}).reps,'8');
 assert.equal(getSetPrefill(future,2,{previousExercise:prior}).reps,'7');
 assert.equal(future.loggedSets[1].reps,undefined,'prefill only');
});
test('one failed set, absent RPE, mixed loads or special technique vetoes rep advancement',()=>{
 const next=ex([{},{},{}]);
 assert.equal(recommendNextSessionReps(ex([set(8),set(7),set(5)]),next),null);
 assert.equal(recommendNextSessionReps(ex([set(8),set(7,''),set(7)]),next),null);
 const mixed=ex([set(8),set(7),set(7)]);mixed.loggedSets[1].weight='50';
 assert.equal(recommendNextSessionReps(mixed,next),null);
 const drop=ex([set(8),set(7),set(7)]);drop.loggedSets[1].intensityTechnique='DROP_SET';
 assert.equal(recommendNextSessionReps(drop,next),null);
});
test('top range does not add impossible extra reps',()=>{
 const result=recommendNextSessionReps(ex([set(8),set(8),set(8)]),ex([{},{},{}]));
 assert.equal(result.kind,'upper_range_complete');
 assert.deepEqual(result.reps,[8,8,8]);
});
