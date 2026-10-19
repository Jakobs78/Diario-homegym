import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDurationCalibration } from '../mycoatch/durationCalibration.js';
import { estimateDaySeconds, firstSetStartOffsetSeconds } from '../mycoatch/timeEstimator.js';
import { generateSmartMesocycle } from '../mycoatch/engine.js';

const base=[
    {name:'Squat con Bilanciere',reps:'5-6',recupero:'180s',
        loggedSets:Array.from({length:3},()=>({weight:'70',reps:'5',rpe:'8',isLocked:true}))},
    {name:'Stacco Rumeno (RDL)',reps:'8-10',recupero:'150s',
        loggedSets:Array.from({length:3},()=>({weight:'75',reps:'8',rpe:'8',isLocked:true}))},
    {name:'Alzate Laterali con Manubri',reps:'12-15',recupero:'90s',
        loggedSets:Array.from({length:2},()=>({weight:'5',reps:'12',rpe:'8',isLocked:true}))}
];
const session=(minutes,date='2026-10-18')=>({
    completed:true,date,totalDurationMinutes:minutes,exercises:structuredClone(base)
});
const history=days=>({history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days}]}]}}}});
const normalized=base.map((ex,i)=>({
    ...ex,setsCount:ex.loggedSets.length,restTime:ex.recupero,
    pattern:i===0?'squat':i===1?'hinge':'isolation',
    equipment:i===2?'dumbbell':'barbell'
}));
const activeMinutes=(estimateDaySeconds(normalized)-firstSetStartOffsetSeconds(normalized))/60;
const now=new Date('2026-10-19T13:00:00Z');

test('insufficient history, undated or incomplete sessions do not change time',()=>{
    assert.equal(deriveDurationCalibration(history([session(activeMinutes*1.2)]),{now}).factor,1);
    const incomplete=session(activeMinutes*1.2);incomplete.date='';incomplete.completed=false;
    assert.equal(deriveDurationCalibration(history([incomplete]),{now}).sampleCount,0);
});

test('three recent completed sessions give a capped, conservative correction',()=>{
    const sessions=[1.12,1.16,1.14].map(f=>session(activeMinutes*f));
    const result=deriveDurationCalibration(history(sessions),{now});
    assert.equal(result.sampleCount,3);
    assert.ok(result.factor>=1.1&&result.factor<=1.2,result.factor);
    assert.ok(estimateDaySeconds(normalized,{paceFactor:result.factor})>estimateDaySeconds(normalized));
    assert.equal(estimateDaySeconds(normalized,{paceFactor:0.8}),estimateDaySeconds(normalized));
});

test('old sessions and unrecognized exercise metadata do not calibrate',()=>{
    const sessions=[session(activeMinutes*1.7),session(activeMinutes*1.7),session(activeMinutes*1.7)];
    assert.equal(deriveDurationCalibration(history(sessions),{now}).factor,1.25);
    sessions[0].date='2025-01-01';
    assert.equal(deriveDurationCalibration(history(sessions),{now}).factor,1);
    const unknown=session(activeMinutes*1.2);
    unknown.exercises[1].name='Macchina sconosciuta';
    assert.equal(deriveDurationCalibration(history([unknown,unknown,unknown]),{now}).sampleCount,0);
});

test('time budget includes calibration and still protects exercises',()=>{
    const config={daysPerWeek:4,durationWeeks:4,maxSessionMinutes:60};
    const adjusted=generateSmartMesocycle({
        ...config,durationCalibration:{factor:1.12,sampleCount:3}
    });
    for(const day of adjusted.weeks[0].days){
        assert.ok(day.estimatedMinutes<=60);
        assert.equal(day.estimatedMinutes,
            Math.ceil(estimateDaySeconds(day.exercises,{paceFactor:1.12})/60));
    }
});
