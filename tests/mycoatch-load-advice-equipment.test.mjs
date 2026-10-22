import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendNextSessionLoad, getAvailableLoadStep } from '../mycoatch/loadProposal.js';
import { evaluateExerciseProgression } from '../mycoatch/progressionPolicy.js';
import { planAdaptiveDecisions } from '../mycoatch/adaptiveDecisions.js';
import { analyzeCompletedMesocycle } from '../mycoatch/historyAnalysis.js';
import { getPlateBreakdown } from '../js/helpers.js';

const set=(reps,rpe,weight=70,extra={})=>({
    weight:String(weight),reps:String(reps),rpe:String(rpe),
    isLocked:true,completed:true,...extra
});
const ex=(sets=[set(8,6),set(8,6),set(8,6)],extra={})=>({
    name:'Panca Bilanciere',equipment:'barbell',reps:'8-12',targetRpe:'@7',
    loggedSets:sets,...extra
});

test('easy sets below top reps do not yet qualify for a load step',()=>{
    const lift=ex();
    const saved=JSON.stringify(lift);
    const answer=recommendNextSessionLoad(lift,{equipmentSettings:{barbell:2.5}});
    assert.equal(answer.suggestedWeight,null);
    assert.deepEqual(answer.nextReps,[9,8,8]);
    assert.equal(JSON.stringify(lift),saved,'No workout mutation before or after ✓');
});

test('all reps at/just above top and on-target RPE propose increase, one exceptional set does not',()=>{
    assert.equal(recommendNextSessionLoad(ex([set(12,7),set(13,7)]))?.suggestedWeight,72.5);
    assert.equal(recommendNextSessionLoad(ex([set(8,7),set(13,7)])),null);
    assert.equal(recommendNextSessionLoad(ex([set(13,7),set(15,7)])),null,
        'do not recommend from an extreme outlier outside the comparable rep range');
});

test('unfinished, absent RPE, harder RPE or mixed-load sets never authorize weight gain',()=>{
    const unfinished=ex([set(8,6),{...set(8,6),isLocked:false,completed:false}]);
    assert.equal(recommendNextSessionLoad(unfinished),null);
    assert.equal(recommendNextSessionLoad(ex([set(8,''),set(8,6)])),null);
    assert.equal(recommendNextSessionLoad(ex([set(8,6),set(8,7)])).suggestedWeight,null);
    assert.equal(recommendNextSessionLoad(ex([set(8,6,70),set(8,6,67.5)])),null);
    assert.equal(recommendNextSessionLoad(ex([set(8,6),set(8,6)],{isDropset:true})),null);
    assert.equal(recommendNextSessionLoad(ex([set(8,6),set(8,6)],{isWarmup:true})),null);
    assert.equal(recommendNextSessionLoad(ex(),{readiness:{allowIncrease:false}}),null);
});

test('working sets only: an earlier warmup set does not block a valid progression',()=>{
    const lift=ex([set(10,6,20,{isWarmup:true}),set(12,7),set(12,7)]);
    assert.equal(recommendNextSessionLoad(lift)?.suggestedWeight,72.5);
    const alone=ex([set(8,6)]);
    assert.equal(recommendNextSessionLoad(alone),null);
});

test('real equipment increments are honored; a large smallest step is withheld',()=>{
    assert.equal(recommendNextSessionLoad(ex([set(12,7),set(12,7)]),{equipmentSettings:{barbell:1.25}})?.suggestedWeight,71.25);
    const impossible=recommendNextSessionLoad(ex([set(12,7),set(12,7)]),{equipmentSettings:{barbell:5}});
    assert.equal(impossible.eligible,true);
    assert.equal(impossible.suggestedWeight,75);
    assert.equal(impossible.repGoal,8);
    const db=ex([set(12,7,12.5),set(12,7,12.5)],{
        name:'Curl manubri',equipment:'dumbbell',reps:'10-12'
    });
    assert.equal(recommendNextSessionLoad(db,{equipmentSettings:{dumbbell:1}})?.suggestedWeight,13.5);
    assert.equal(getAvailableLoadStep(db,{dumbbell:0.5},12.5).step,0.5);
});

test('two distinct fully checked weeks with low RPE can justify MyCoatch mesocycle load step',()=>{
    const week=(id)=>({
        weekId:id,isDeload:false,repRange:{min:8,max:12},
        completedSets:3,plannedSets:3,allStraightSets:true,
        uniformWeight:true,workingKg:70,topKg:70,
        allRpeWithinTarget:true,allRepsAtTop:false,allRepsInRange:true,
        allLowRpeWithValidReps:true,minWorkingReps:8,rpeOvershoot:false,
        allRepsBelowMin:false
    });
    const p=evaluateExerciseProgression([week('2026/1/1'),week('2026/1/2')]);
    assert.equal(p.readyForLoad,true);
    assert.equal(p.progressionTrigger,'low_rpe');
    const report={byExercise:{bench:{
        name:'Panca Bilanciere',equipment:'barbell',status:'stable',
        lastKg:70,lastWorkingKg:70,readyForLoad:p.readyForLoad,
        progressionEvidence:p,avgRpe:6
    }},byMuscle:{}};
    const action=planAdaptiveDecisions(report,{loadingSteps:{barbell:1.25}}).byExercise.bench;
    assert.equal(action.action,'increase_load');
    assert.equal(action.plannedKg,71.25);
    assert.match(action.reason,/RPE almeno 1 punto sotto/);
});

test('a single easy week cannot change the next mesocycle prescription',()=>{
    const weekly={
        weekId:'2026/1/1',repRange:{min:8,max:12},completedSets:3,
        plannedSets:3,allStraightSets:true,uniformWeight:true,workingKg:70,
        topKg:70,allRpeWithinTarget:true,allRepsAtTop:false,
        allRepsInRange:true,allLowRpeWithValidReps:true
    };
    assert.equal(evaluateExerciseProgression([weekly]).readyForLoad,false);
});

test('warmup sets/exercises never enter legacy MyCoatch mesocycle e1RM analysis',()=>{
    const warm=ex([set(8,9,200)],{name:'Panca',isWarmup:true,isExcluded:true});
    const normal=ex([set(8,8,70)],{name:'Panca'});
    const week={weekNumber:1,days:[{exercises:[warm,normal]}]};
    const data=analyzeCompletedMesocycle({weeks:[week]});
    assert.equal(data.byExercise.panca.validSets,1);
    normal.loggedSets[0].isWarmup=true;
    const empty=analyzeCompletedMesocycle({weeks:[week]});
    assert.equal(Object.keys(empty.byExercise).length,0);
});

test('plate inventory: exact bounded combinations, nearest available, and no invented plates',()=>{
    const inv={'20':0,'15':0,'10':0,'5':2,'2.5':1,'2':0,'1.25':0,'1':0,'0.5':0};
    const exact=getPlateBreakdown(45,20,inv);
    assert.equal(exact.exact,true);
    assert.deepEqual(exact.plates.reduce((s,x)=>s+x,0),12.5);
    const notExact=getPlateBreakdown(47.5,20,inv);
    assert.equal(notExact.exact,false);
    assert.ok(notExact.plates.length <= 3);
    const noStock=getPlateBreakdown(70,20,{});
    assert.equal(noStock.plates.length,0);
    assert.equal(noStock.exact,false);
});
