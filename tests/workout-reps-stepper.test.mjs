import test from 'node:test';
import assert from 'node:assert/strict';
import {stepReps} from '../js/repsStepper.js';

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
