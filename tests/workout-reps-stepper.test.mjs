import test from 'node:test';
import assert from 'node:assert/strict';
import {stepReps} from '../js/repsStepper.js';
import {getSetRepsTarget} from '../js/setPrefill.js';

test('repetition stepper adjusts only by whole reps and respects confirmation bounds',()=>{
  assert.equal(stepReps('8',1,'6-10'),'9');
  assert.equal(stepReps('8',-1,'6-10'),'7');
  assert.equal(stepReps('1',-1,'6-10'),'1');
  assert.equal(stepReps('99',1,'6-10'),'99');
  assert.equal(stepReps('11',1,'6-10'),'12'); // RPE-like controls may go beyond prescribed range.
  assert.equal(stepReps('12',-1,'6-10'),'11');
});

test('blank reps use the lower bound of a valid planned range ONLY after a tap',()=>{
  assert.equal(stepReps('',1,'6-10'),'7');
  assert.equal(stepReps('',-1,'6-10'),'5');
  assert.equal(stepReps('',1,'10'),'11');
  assert.equal(stepReps('',-1,'1'),'1');
  assert.equal(stepReps('',1,'10–12'),'11');
  assert.equal(stepReps('',1,'10 a 12'),'11');
  assert.equal(stepReps('',1,''),null);
  assert.equal(stepReps('',-1,null),null);
});

test('invalid and complex repetition formats cannot silently become confirmed ordinary reps',()=>{
  for(const value of ['8+6','8-12','abc','5.5','0','100','-8','3 reps']) {
    assert.equal(stepReps(value,1,'6-10'),null,value);
    assert.equal(stepReps(value,-1,'6-10'),null,value);
  }
  assert.equal(stepReps('7',0,'6-10'),null);
  assert.equal(stepReps('7',2,'6-10'),null);
  assert.equal(stepReps('',1,'12-8'),null);
  assert.equal(stepReps('',1,'100-120'),null);
});


test('REPS reminder keeps the exact original range for every series and fixed prescriptions',()=>{
  const same={reps:'8-12',sets:[{},{},{}],loggedSets:[{reps:'11'},{reps:'7'}]};
  assert.deepEqual(same.sets.map((_,i)=>getSetRepsTarget(same,i)),['8-12','8-12','8-12']);
  assert.equal(getSetRepsTarget({reps:'5',sets:[{}]},0),'5');
  assert.equal(getSetRepsTarget({minReps:10,maxReps:15,sets:[{}]},0),'10–15');
  assert.equal(getSetRepsTarget({reps:'',sets:[{}]},0),'');
});

test('REPS reminder respects per-set targets even when drafts and actual reps differ',()=>{
  const perSet={reps:'8-12',sets:[
    {targetReps:'5-6'},{targetReps:'8–10'},{targetReps:'10 a 12'},{minReps:12,maxReps:15}
  ],loggedSets:[{reps:'7',isLocked:true},{reps:'9'},{reps:'12'},{reps:'14'}]};
  assert.deepEqual(perSet.sets.map((_,i)=>getSetRepsTarget(perSet,i)),
    ['5-6','8–10','10 a 12','12–15']);
  assert.equal(perSet.loggedSets[0].reps,'7');
  assert.equal(perSet.sets[0].targetReps,'5-6');
});

test('first top set uses explicit Topset reps in CSV, never wrongly repeats back-off range',()=>{
  const top={reps:'8-12',topset:'1x5 @ 90kg (RPE max 7)',sets:[
    {targetReps:'8-12'},{targetReps:'8-12'},{targetReps:'8-12'}
  ]};
  assert.deepEqual([0,1,2].map(i=>getSetRepsTarget(top,i)),['5','8-12','8-12']);
  const distinct={...top,sets:[{targetReps:'6-7'},{targetReps:'8-10'}]};
  assert.deepEqual([0,1].map(i=>getSetRepsTarget(distinct,i)),['6-7','8-10']);
  assert.equal(getSetRepsTarget({reps:'8-12',sets:[{reps:'16',actualReps:'16'}]},0),'8-12');
});
