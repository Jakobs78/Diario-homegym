import test from 'node:test';
import assert from 'node:assert/strict';
import { prescribeExerciseReps, prescribeExerciseRpe } from '../mycoatch/prescriptionPolicy.js';
import { suggestDropset, safeTechniqueEvidence } from '../mycoatch/intensityTechniquePolicy.js';
import { generateSmartMesocycle } from '../mycoatch/engine.js';
import { canonicalExerciseKey } from '../mycoatch/exerciseIdentity.js';
import { coachState } from '../mycoatch/state.js';
import { MyCoatch } from '../mycoatch/index.js';

const lateral = {
  name: 'Alzate Laterali con Manubri', pattern: 'isolation',
  defaultReps: '12-15', estimatedFatigue: 3, setsCount: 3,
  reps: '15-25', kgMin: '7'
};
const bench = {
  name: 'Panca Piana con Bilanciere', pattern: 'horizontal_push',
  defaultReps: '6-8', estimatedFatigue: 8, setsCount: 3
};
const effort = weekId => ({
  weekId, repRange:{min:15,max:25}, plannedSets:3,completedSets:3,
  isDeload:false, allRpeMeasured:true, allRpeWithinTarget:true,
  allStraightSets:true, avgRpe:7.5
});
const verified = { fatigueConcern:false, lastWorkingKg:7, lastReps:{min:15,max:25},
  exposures:[effort('2026/0/1'), effort('2026/0/2')] };

test('high-rep deltoids keep 15-25 rather than generic 10-15', () => {
  assert.equal(prescribeExerciseReps(lateral, {focus:'hypertrophy',index:4,experience:'advanced'}),'15-25');
  assert.equal(prescribeExerciseReps({...lateral,name:'Alzate Laterali ai Cavi'},
    {focus:'hybrid',index:3}),'15-25');
  assert.equal(prescribeExerciseReps({...lateral,name:'Face Pull ai Cavi'},
    {focus:'hypertrophy',index:3}),'15-25');
  assert.equal(prescribeExerciseReps(lateral, {focus:'hypertrophy',index:3,experience:'beginner'}),'12-20');
  assert.equal(prescribeExerciseReps(bench,{focus:'strength',index:0}),'3-5');
});

test('one-set rep progression does not raise the range for every set', () => {
  assert.equal(prescribeExerciseReps(bench,{
    focus:'hybrid',loadDecision:{action:'build_reps',plannedRepGoal:7}
  }),'6-8');
  assert.equal(prescribeExerciseReps(bench,{
    focus:'hybrid',isDeload:true,loadDecision:{action:'build_reps',plannedRepGoal:7}
  }),'6-8');
  assert.equal(prescribeExerciseReps(lateral,{
    focus:'hypertrophy',loadDecision:{action:'build_reps',plannedRepGoal:30}
  }),'15-25');
  assert.equal(prescribeExerciseReps(bench,{
    focus:'hybrid',loadDecision:{action:'maintain',plannedRepGoal:8}
  }),'6-8');
});

test('RPE respects exercise, fatigue, beginner ceiling and deload', () => {
  const base={weekTargetRpe:8,experience:'advanced'};
  assert.equal(prescribeExerciseRpe(lateral,base),8.5);
  assert.equal(prescribeExerciseRpe({...bench,pattern:'hinge'},base),7.5);
  assert.equal(prescribeExerciseRpe(lateral,{...base,fatigueConcern:true}),7);
  assert.equal(prescribeExerciseRpe(lateral,{...base,isDeload:true}),6.5);
  assert.equal(prescribeExerciseRpe(lateral,{...base,experience:'beginner'}),8);
});

test('dropset requires two distinct actual RPE-complete weeks and permits no stacking', () => {
  assert.equal(safeTechniqueEvidence(verified),true);
  const options={weekNumber:2,experience:'advanced',focus:'hypertrophy',
    timeBudgetMinutes:70,availableSeconds:75,history:verified};
  const recommendation=suggestDropset(lateral,options);
  assert.equal(recommendation?.technique,'DROP_SET');
  assert.equal(recommendation?.extraSeconds,40);
  for(const overrides of [
    {weekNumber:1},{isDeload:true},{experience:'beginner'},
    {focus:'strength'},{availableSeconds:25},
    {history:{...verified,fatigueConcern:true}},
    {history:{exposures:[effort('2026/0/1'),{...effort('2026/0/2'),allRpeMeasured:false}]}},
    {history:{exposures:[effort('2026/0/1'),effort('2026/0/1')]}}
  ]) assert.equal(suggestDropset(lateral,{...options,...overrides}),null,
    JSON.stringify(overrides));
  assert.equal(suggestDropset({...lateral,groupType:'superset'},options),null);
  assert.equal(suggestDropset(bench,options),null);
});

test('switching from 12-15 to 15-25 requires new kg calibration, no dropset', () => {
  const lateralKey=canonicalExerciseKey(lateral.name);
  const history={byExercise:{
    [lateralKey]:{...verified,lastReps:{min:12,max:15},lastWorkingKg:10}
  },byMuscle:{},decisions:{byExercise:{},byMuscle:{}},sessionsAnalyzed:2};
  const meso=generateSmartMesocycle({
    durationWeeks:4,daysPerWeek:3,focus:'hypertrophy',maxSessionMinutes:90,
    athleteProfile:{experience:'advanced',calibration:'regular',
      excludedExercises:[],referenceLoads:{}}
  },history);
  for(const week of meso.weeks){
    for(const ex of week.days.flatMap(day=>day.exercises).filter(ex=>ex.name===lateral.name)){
      assert.equal(ex.reps,'15-25');
      assert.equal(ex.kgMin,'');
      assert.match(ex.notes,/CALIBRAZIONE NUOVO RANGE/);
      assert.ok(ex.sets.every(set=>set.intensityTechnique===null),
        'tecniche avanzate vietate prima della calibrazione del nuovo range');
    }
  }
});

test('real engine exports advanced targets and selective dropset in CSV, never actual logs', () => {
  const benchKey=canonicalExerciseKey(bench.name);
  const lateralKey=canonicalExerciseKey(lateral.name);
  const history={
    byExercise:{
      [benchKey]:{name:bench.name,lastWorkingKg:80,lastKg:80,
        progressionEvidence:{distinctWeeks:2},fatigueConcern:false},
      [lateralKey]:verified
    },
    byMuscle:{},
    decisions:{
      byExercise:{[benchKey]:{action:'build_reps',plannedKg:80,plannedRepGoal:7}},
      byMuscle:{}
    },
    sessionsAnalyzed:2
  };
  const meso=generateSmartMesocycle({
    durationWeeks:4,daysPerWeek:3,focus:'hypertrophy',
    maxSessionMinutes:90,athleteProfile:{
      experience:'advanced',calibration:'regular',priorityMuscle:'Spalle',
      excludedExercises:[],referenceLoads:{}
    }
  },history);
  const firstBench=meso.weeks[0].days.flatMap(d=>d.exercises)
    .find(e=>e.name===bench.name);
  assert.ok(firstBench,'panca presente nella proposta');
  assert.equal(firstBench.reps,'6-8');
  assert.equal(Number(firstBench.kgMin),80);
  const firstLateral=meso.weeks[0].days.flatMap(d=>d.exercises)
    .find(e=>e.name===lateral.name);
  assert.ok(firstLateral,'alzate laterali nel piano');
  assert.equal(firstLateral.reps,'15-25');
  assert.ok(Number(firstLateral.rpe)>=8);
  const drops=meso.weeks.flatMap(w=>w.days.flatMap(d=>
    d.exercises.filter(e=>e.sets.some(s=>s.intensityTechnique==='DROP_SET'))
      .map(e=>({week:w.weekNumber,day:d,exercise:e}))));
  assert.equal(drops.length,1,'uno e un solo dropset dopo evidenze comparabili');
  for(const d of drops){
    assert.equal(d.week,2);
    assert.ok(d.day.estimatedMinutes<=90);
    assert.equal(d.exercise.sets.at(-1).intensityTechnique,'DROP_SET');
    assert.ok(d.exercise.sets.every(s=>s.completed===false && s.actualKg===''));
  }
  const heads=meso.weeks[0].weeklyCoverage.shoulderHeadCoverage;
  assert.ok(heads.directIsolationSets.laterale>0);
  assert.ok(heads.verticalPressSets>=0);
  coachState.setActiveMesocycle(meso);
  try {
    const csv=MyCoatch.exportAsCSV();
    assert.match(csv,/;Panca Piana con Bilanciere;\d+;6-8;80;80;/);
    assert.match(csv,/;Alzate Laterali con Manubri;\d+;15-25;/);
    if(drops.length) assert.match(csv,/\[DROP_SET\]/);
  } finally {
    coachState.clear();
  }
});
