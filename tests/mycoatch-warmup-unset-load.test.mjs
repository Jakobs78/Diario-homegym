import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSmartMesocycle} from '../mycoatch/engine.js';
import {conciseExerciseInstruction} from '../mycoatch/exerciseInstructions.js';

test('ogni giornata Upper/Lower include riscaldamento sul primo fondamentale anche senza carico noto', () => {
    const meso=generateSmartMesocycle({
        daysPerWeek:4,durationWeeks:4,focus:'hybrid',userAge:36,
        maxSessionMinutes:90,splitPreference:'upperlower'
    },{sessionsAnalyzed:0,byExercise:{},exerciseNotes:{},
       decisions:{byExercise:{},byMuscle:{}}});
    const days=meso.weeks[0].days;
    assert.equal(days.length,4);
    const firstLifts=days.map(day=>day.exercises[0]);
    assert.ok(firstLifts.some(ex=>!ex.kgMin),
        'the fixture must include at least one uncalibrated first compound');
    for(const exercise of firstLifts){
        assert.match(exercise.notes,/\[WARM-UP(?: AUTO)?\]/,exercise.name);
        assert.match(conciseExerciseInstruction(exercise),
            /\[WARM-UP(?: AUTO)?\]/,exercise.name);
        if(!exercise.kgMin){
            assert.match(exercise.notes,/avvicinamento/i,
                exercise.name + ': no generic warm-up for unknown loads');
            assert.doesNotMatch(conciseExerciseInstruction(exercise),
                /\[WARM-UP AUTO\]/,exercise.name + ': do not invent kilograms');
        }
    }
});
