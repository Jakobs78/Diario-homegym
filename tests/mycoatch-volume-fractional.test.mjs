import test from 'node:test';
import assert from 'node:assert/strict';
import {
    contributionsForExercise, completedWorkingSetCount,
    summarizeMuscleVolume, summarizeWeeklyMuscleVolume,
    INDIRECT_SET_CREDIT
} from '../mycoatch/volumeAccounting.js';
import { auditWeeklyCoverage } from '../mycoatch/weeklyCoverage.js';
import { analyzeTrainingHistory } from '../mycoatch/historyInsights.js';
import { planAdaptiveDecisions } from '../mycoatch/adaptiveDecisions.js';
import { MyCoatch } from '../mycoatch/index.js';

const ex = (name, setsCount) => ({name, setsCount});
const observed = (kg, reps, rpe='7') =>
    ({weight:String(kg), reps:String(reps), rpe, isLocked:true});
const workout = (name, sets=3, kg=30, reps='10', rpe='7') => ({
    name, set:sets+' set', reps:'8-10', rpe:'@8',
    loggedSets:Array.from({length:sets},()=>observed(kg,reps,rpe))
});
const week = (workouts, weekNumber=1) => ({
    weekNumber, days:[{dayNumber:1,exercises:workouts}]
});
const historical = weeks => ({history:{years:{'2026':{
    mesocycles:[{name:'storico',weeks}]}}}});

test('three sets of bench: chest 3, triceps 1.5, shoulders 1.5', ()=>{
    const v = summarizeMuscleVolume([ex('Panca Piana con Bilanciere',3)]);
    assert.equal(INDIRECT_SET_CREDIT,0.5);
    assert.equal(v.physicalSets,3);
    assert.deepEqual(v.byMuscle.Petto,
        {directSets:3,indirectSetCredits:0,fractionalSets:3});
    assert.deepEqual(v.byMuscle.Tricipiti,
        {directSets:0,indirectSetCredits:1.5,fractionalSets:1.5});
    assert.deepEqual(v.byMuscle.Spalle,
        {directSets:0,indirectSetCredits:1.5,fractionalSets:1.5});
});

test('indirect work is not counted for isolation curls or pec flies', ()=>{
    const v=summarizeMuscleVolume([
        ex('Curl ai Cavi Bassi',4),ex('Croci ai Cavi in Allungamento',2)]);
    assert.equal(v.byMuscle.Bicipiti.directSets,4);
    assert.equal(v.byMuscle.Back_Lats.fractionalSets,0);
    assert.equal(v.byMuscle.Petto.directSets,2);
    assert.equal(v.byMuscle.Tricipiti.fractionalSets,0);
});

test('vertical and horizontal pulls both credit significant arm assistance', ()=>{
    const v=summarizeMuscleVolume([
        ex('Lat Machine con Triangolo',4),
        ex('Rematore con Bilanciere',3)
    ]);
    assert.equal(v.byMuscle.Back_Lats.directSets,4);
    assert.equal(v.byMuscle.Back_Lats.indirectSetCredits,1.5);
    assert.equal(v.byMuscle.Back_Thickness.directSets,3);
    assert.equal(v.byMuscle.Back_Thickness.indirectSetCredits,2);
    assert.equal(v.byMuscle.Bicipiti.indirectSetCredits,3.5);
});

test('compound squats do not count the glutes as another full physical set', ()=>{
    const v=summarizeMuscleVolume([ex('Squat con Bilanciere',4)]);
    assert.equal(v.physicalSets,4);
    assert.equal(v.byMuscle.Quadricipiti.fractionalSets,4);
    assert.equal(v.byMuscle.Glutei.fractionalSets,2);
});

test('unknown and invalid exercises cannot acquire invented muscle credits', ()=>{
    const v=summarizeMuscleVolume([
        ex('Bench imaginaria',4),
        {name:'Military Press con Bilanciere',setsCount:'unknown'},
        ex('Curl ai Cavi Bassi',3)
    ]);
    assert.equal(v.physicalSets,3);
    assert.deepEqual(v.unknownExercises,['Bench imaginaria']);
    assert.deepEqual(v.invalidSetCounts,['Military Press con Bilanciere']);
});

test('unconfirmed, warm-up or malformed working sets never count as completed', ()=>{
    const log={name:'Panca Piana con Bilanciere',loggedSets:[
        observed(55,8),{weight:'55',reps:'8',rpe:'7',isLocked:false},
        {...observed(20,8),isWarmup:true},
        {...observed(55,8),weight:''},
        {...observed(55,8),reps:''},
        {...observed(55,'10+8+6')}
    ]};
    assert.equal(completedWorkingSetCount(log),2);
    const v=summarizeMuscleVolume([log],{mode:'confirmed'});
    assert.equal(v.physicalSets,2);
    assert.equal(v.byMuscle.Petto.fractionalSets,2);
});

test('weekly ledger mirrors only exercises preserved after time balancing', ()=>{
    const plan=[
        {dayNumber:1,dayName:'Upper A',exercises:[
            ex('Panca Piana con Bilanciere',3),
            ex('Lat Machine con Triangolo',3)]},
        {dayNumber:2,dayName:'Upper B',exercises:[
            ex('Military Press con Bilanciere',2)]}
    ];
    const input=structuredClone(plan);
    const coverage=auditWeeklyCoverage(plan);
    const volume=summarizeWeeklyMuscleVolume(plan);
    assert.equal(coverage.fractionalVolumeByMuscle.Tricipiti.fractionalSets,
        volume.byMuscle.Tricipiti.fractionalSets);
    assert.equal(coverage.directSetsByMuscle.Petto,3);
    assert.equal(coverage.indirectExerciseExposuresByMuscle.Tricipiti,2);
    assert.equal(coverage.fractionallyCountedPhysicalSets,8);
    assert.deepEqual(plan,input);
});

test('historical fractional sets use only confirmed work across three distinct weeks', ()=>{
    const training=historical(Array.from({length:3},(_,i)=>week([
        workout('Panca Piana con Bilanciere',3,60),
        workout('Curl ai Cavi Bassi',2,15)
    ],i+1)));
    const r=analyzeTrainingHistory(training);
    assert.equal(r.byMuscle.Petto.avgWeeklyDirectSets,3);
    assert.equal(r.byMuscle.Bicipiti.avgWeeklyDirectSets,2);
    assert.equal(r.byMuscle.Tricipiti.avgWeeklyIndirectCredits,1.5);
    assert.equal(r.byMuscle.Tricipiti.avgWeeklyFractionalSets,1.5);
    assert.equal(r.byMuscle.Tricipiti.avgWeeklySets,0);
    assert.equal(r.byMuscle.Bicipiti.fractionalRpeCoverage,1);
});

test('an untrained week is a real zero in the mean, not a hidden missing data gap', ()=>{
    const r=analyzeTrainingHistory(historical([
        week([workout('Panca Piana con Bilanciere',3)],1),
        week([workout('Curl ai Cavi Bassi',2)],2),
        week([workout('Panca Piana con Bilanciere',3)],3)
    ]));
    assert.deepEqual(r.byMuscle.Tricipiti.recentFractionalByWeek,[1.5,0,1.5]);
    assert.equal(r.byMuscle.Tricipiti.avgWeeklyFractionalSets,1);
});

test('fatigued or low-data muscle signals cannot be invented from indirect series', ()=>{
    const training=historical(Array.from({length:3},(_,i)=>week([
        workout('Panca Piana con Bilanciere',3,60,'10','')
    ],i+1)));
    const r=analyzeTrainingHistory(training);
    assert.equal(r.byMuscle.Tricipiti.avgWeeklySets,0);
    assert.equal(r.byMuscle.Tricipiti.fractionalRpeCoverage,0);
    assert.equal(planAdaptiveDecisions(r).byMuscle.Tricipiti.volumeDelta,0);
});

test('a possible biceps stall with a large indirect share does NOT add sets', ()=>{
    const training=historical(Array.from({length:3},(_,i)=>week([
        workout('Curl ai Cavi Bassi',3,15),
        workout('Lat Machine con Triangolo',6,60),
        workout('Rematore con Bilanciere',6,50)
    ],i+1)));
    const r=analyzeTrainingHistory(training);
    assert.equal(r.byMuscle.Bicipiti.avgWeeklySets,3);
    assert.equal(r.byMuscle.Bicipiti.avgWeeklyFractionalSets,9);
    const decision=planAdaptiveDecisions(r).byMuscle.Bicipiti;
    assert.equal(decision.volumeDelta,0);
    assert.equal(decision.weeklyFractionalSetsObserved,9);
    assert.match(decision.reason,/lavoro secondario/i);
});

test('a low-volume plateau with reliable RPE can still trial just one set', ()=>{
    const training=historical(Array.from({length:3},(_,i)=>week([
        workout('Curl ai Cavi Bassi',3,15),
        workout('Lat Machine con Triangolo',2,60)
    ],i+1)));
    const r=analyzeTrainingHistory(training);
    const decision=planAdaptiveDecisions(r).byMuscle.Bicipiti;
    assert.equal(r.byMuscle.Bicipiti.avgWeeklyFractionalSets,4);
    assert.equal(decision.volumeDelta,1);
});

test('proposed 4-week microcycles include direct and indirect credit reports', ()=>{
    const training={history:{years:{'2026':{mesocycles:[]}}}};
    const before=structuredClone(training);
    const proposal=MyCoatch.generateNextFromHistory(training,{
        durationWeeks:4,daysPerWeek:4,maxSessionMinutes:120,
        focus:'hypertrophy'
    });
    assert.equal(proposal.coachReport.weeklyFractionalMuscleVolume.length,4);
    for(const item of proposal.coachReport.weeklyFractionalMuscleVolume){
        assert.ok(item.byMuscle.Bicipiti.fractionalSets >=
            item.byMuscle.Bicipiti.directSets);
    }
    assert.deepEqual(training,before);
    const csv=MyCoatch.exportAsCSV();
    assert.equal(csv.split('\n')[0].split(';').length,12);
    MyCoatch.clearProposal();
});
