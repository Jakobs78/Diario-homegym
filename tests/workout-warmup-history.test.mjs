import test from 'node:test';
import assert from 'node:assert/strict';
import { isWarmupExercise, isWarmupSet, isEffectiveTrainingSet } from '../js/workoutSemantics.js';
import { isMesocycleCompleted, repeatCompletedSessionPreservingHistory } from '../js/historySafety.js';
import { findPreviousExercise } from '../js/helpers.js';
import { getSetPrefill } from '../js/setPrefill.js';

const done=(weight,reps,rpe=8)=>({
    weight:String(weight),reps:String(reps),rpe:String(rpe),isLocked:true,completed:true
});
const empty=()=>({weight:'',reps:'',rpe:'',isLocked:false,completed:false});
const ex=(name,logs=[done(70,8)])=>({
    name,reps:'8-12',kgMin:'70',kgMax:'70',rpe:'@8',targetRpe:'@8',
    loggedSets:logs,sets:[{targetKg:'70',targetReps:'8',targetRpe:'8',weight:''}]
});
const day=(exercises,archives=[])=>({dayNumber:1,exercises,sessionArchives:archives});
const week=(weekNumber,exercises,archives=[])=>({weekNumber,days:[day(exercises,archives)]});

test('legacy excluded means warm-up: checked reps preserved without contributing to effective volume',()=>{
    const warm=ex('Mobilità', [done(25,15)]);
    warm.isExcluded=true;
    assert.equal(isWarmupExercise(warm),true);
    assert.equal(isEffectiveTrainingSet(warm,warm.loggedSets[0]),false);
    assert.equal(isWarmupExercise({...warm,isWarmup:true,isExcluded:false}),true);
    assert.equal(isWarmupSet({warmup:true}),true);
    const work=ex('Panca');
    const data={weeks:[week(1,[warm,work])]};
    assert.equal(isMesocycleCompleted(data),true);
    const changed=structuredClone(data);
    changed.weeks[0].days[0].exercises[1].loggedSets[0].isLocked=false;
    changed.weeks[0].days[0].exercises[1].loggedSets[0].completed=false;
    assert.equal(isMesocycleCompleted(changed),false);
});

test('repeating a completed session retains warm-ups in archive and never alters its prescription sets',()=>{
    const warm=ex('Mobilità',[empty()]);
    warm.isExcluded=true;warm.isWarmup=true;
    const working=ex('Panca',[done(80,8)]);
    const prescription=structuredClone(working.sets);
    const session=day([warm,working]);
    session.completed=true;session.date='2026-10-16';
    const archive=repeatCompletedSessionPreservingHistory(session);
    assert.equal(session.sessionArchives.length,1);
    assert.equal(archive.exercises[0].loggedSets[0].isLocked,false);
    assert.equal(archive.exercises[1].loggedSets[0].weight,'80');
    assert.deepEqual(working.sets,prescription);
    assert.equal(working.loggedSets[0].weight,'');
    assert.equal(working.loggedSets[0].isLocked,false);
});

test('last confirmed set follows the previous mesocycle and previous year, not future sessions',()=>{
    const old=ex('Panca',[done(72.5,9)]);
    const data={history:{years:{
        '2025':{mesocycles:[{weeks:[week(4,[old])]}]},
        '2026':{mesocycles:[
            {weeks:[week(1,[ex('Panca',[done(77.5,8)])])]},
            {weeks:[week(1,[ex('Panca',[empty()])]),week(2,[ex('Panca',[empty()])])]}
        ]},
        '2027':{mesocycles:[{weeks:[week(1,[ex('Panca',[done(95,10)])])]}]}
    }}};
    assert.equal(findPreviousExercise(data,1,1,0,ex('Panca'),false,2026).loggedSets[0].weight,'77.5');
    assert.equal(findPreviousExercise(data,1,1,0,ex('Panca'),true,2026),null);
    data.history.years['2026'].mesocycles[0].weeks[0].days[0].exercises[0].isExcluded=true;
    assert.equal(findPreviousExercise(data,1,1,0,ex('Panca'),false,2026).loggedSets[0].weight,'72.5');
    assert.equal(findPreviousExercise(data,0,1,0,ex('Panca'),false,2025),null);
});

test('same-week repetition chooses the last archived confirmed session, never a draft',()=>{
    const archiveOld=day([ex('Panca',[done(75,8)])]);
    const archiveDraft=day([ex('Panca',[empty()])]);
    const live=ex('Panca',[empty()]);
    const data={history:{years:{'2026':{mesocycles:[{
        weeks:[week(1,[live],[archiveOld,archiveDraft])]
    }]}}}};
    assert.equal(findPreviousExercise(data,0,1,0,live,false,2026).loggedSets[0].weight,'75');
});

test('new mesocycle may show history but prefill only when current programme is compatible',()=>{
    const previous=ex('Panca',[done(85,9,9)]);
    const current=ex('Panca',[empty()]);
    current.kgMin='70';current.kgMax='70';
    assert.deepEqual(
        [getSetPrefill(current,0,{previousExercise:previous}).weight,
         getSetPrefill(current,0,{previousExercise:previous}).rpe],
        ['70','8']
    );
});
