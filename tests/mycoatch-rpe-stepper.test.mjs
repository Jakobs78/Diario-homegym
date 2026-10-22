import test from 'node:test';
import assert from 'node:assert/strict';
import { stepRpe } from '../js/rpeStepper.js';
import { conciseExerciseInstruction } from '../mycoatch/exerciseInstructions.js';

test('RPE controls preserve half-point targets and stop at valid bounds', () => {
    assert.equal(stepRpe('7.5',1,'8'), '8');
    assert.equal(stepRpe('8',-1,'8'), '7.5');
    assert.equal(stepRpe('8,5',1,'8'), '9');
    assert.equal(stepRpe('10',1,'8'), '10');
    assert.equal(stepRpe('6',-1,'8'), '5.5');
    assert.equal(stepRpe('',1,'7.5'), '8');
    assert.equal(stepRpe('',-1,''), null);
    assert.equal(stepRpe('7',0,'8'), null);
});
test('Leg Curl cue is not a biceps curl instruction', () => {
    const note=conciseExerciseInstruction({name:'Leg Curl ai Cavi (cavigliera)',equipment:'cable',kgMin:'10',notes:''});
    assert.match(note,/Bacino stabile, fletti il ginocchio/);
    assert.doesNotMatch(note,/Gomiti stabili/);
});
