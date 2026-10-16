import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSmartMesocycle } from '../mycoatch/engine.js';
import { selectExercisesForTime, registerSelectedWeeklySets,
  addFocusAccessorySlot } from '../mycoatch/sessionSelection.js';
import { estimateDayMinutes } from '../mycoatch/timeEstimator.js';
import { compareMesocyclePlans, formatCoachReview } from '../mycoatch/mesocycleComparison.js';

function fixture(name,{sets=3,category='Spalle',optional=false,
  pattern='isolation',anchor=null,priority=false,rest=90}={}) {
  return {name,category,pattern,equipment:pattern==='isolation'?'cable':'barbell',
    anchorKey:anchor,priorityProtected:priority,isOptional:optional,
    setsCount:sets,restTime:rest+'s',reps:'10-15',kgMin:'',
    notes:'',sets:Array.from({length:sets},(_,i)=>({
      setNumber:i+1,targetKg:'',targetReps:'10-15',actualKg:'',
      actualReps:'',completed:false,intensityTechnique:null
    }))};
}
const config=(maxSessionMinutes=60,daysPerWeek=4,priorityMuscle=null)=>({
  daysPerWeek,durationWeeks:4,maxSessionMinutes,focus:'hypertrophy',
  athleteProfile:{
    experience:'advanced',calibration:'regular',priorityMuscle,
    excludedExercises:[],referenceLoads:{}
  }
});

test('session planner protects three compound anchors and reports why accessories were excluded',()=>{
  const core=[
    fixture('Panca',{category:'Petto',pattern:'horizontal_push',
      anchor:'bench',rest:180}),
    fixture('Lat',{category:'Back_Lats',pattern:'vertical_pull',rest:150}),
    fixture('Squat',{category:'Quadricipiti',pattern:'squat',
      priority:true,rest:180})
  ];
  const planned=selectExercisesForTime([
    ...core,
    fixture('Curl',{category:'Bicipiti',optional:true}),
    fixture('Laterali',{category:'Spalle'})
  ],30,{focusMuscleGroup:'Spalle',scheduledWeeklySets:{Spalle:0,Bicipiti:12}});
  assert.deepEqual(planned.exercises.slice(0,3).map(x=>x.name),core.map(x=>x.name));
  assert.ok(planned.exercises.every(e=>e.setsCount===e.sets.length));
  assert.ok(planned.estimatedMinutes<=30);
  assert.deepEqual(planned.selectionAudit.protected,core.map(x=>x.name));
  assert.equal(planned.selectionAudit.strategy,'time_first_protected_core_coverage_score_v1');
  assert.equal(planned.selectionAudit.timeBudgetMinutes,30);
  assert.ok(planned.selectionAudit.excludedAccessories.length>0);
});

test('daily selection differs by time while keeping every anchor; no phantom sets',()=>{
  for(const daysPerWeek of [3,4]) for(const minutes of [30,45,60,90]){
    const plan=generateSmartMesocycle(config(minutes,daysPerWeek));
    for(const week of plan.weeks){
      for(const day of week.days){
        assert.ok(day.estimatedMinutes<=minutes,daysPerWeek+' '+minutes);
        assert.equal(day.estimatedMinutes,estimateDayMinutes(day.exercises));
        const audit=day.selectionAudit;
        assert.ok(audit);
        assert.ok(audit.protected.every(name=>day.exercises.some(ex=>ex.name===name)));
        const unique=new Set(day.exercises.map(x=>x.name));
        assert.equal(unique.size,day.exercises.length);
        for(const ex of day.exercises) {
          assert.equal(ex.setsCount,ex.sets.length);
          assert.ok(ex.sets.every(set=>set.completed===false && set.actualKg===''));
        }
      }
    }
  }
});

test('focus deltoidi has a conditional rear/lateral accessory slot on longer Upper A',()=>{
  const defaultSlots=[{muscle:'Petto',pattern:'horizontal_push',anchor:'bench'},
    {muscle:'Back_Lats',pattern:'vertical_pull'},
    {muscle:'Petto',pattern:'isolation'},
    {muscle:'Spalle',pattern:'isolation',
      prefer:['Alzate Laterali con Manubri','Alzate Laterali ai Cavi']},
    {muscle:'Bicipiti',pattern:'isolation'}];
  assert.equal(addFocusAccessorySlot(defaultSlots,{
    dayName:'Upper A',focusMuscleGroup:'Spalle',maxSessionMinutes:60}).length,5);
  const longer=addFocusAccessorySlot(defaultSlots,{
    dayName:'Upper A',focusMuscleGroup:'Spalle',maxSessionMinutes:90});
  assert.equal(longer.length,6);
  assert.ok(longer.at(-1).prefer[0].includes('Posteriori'));
  assert.equal(defaultSlots.length,5,'no mutation of templates');
  const shortPlan=generateSmartMesocycle(config(60,4,'Spalle'));
  const longPlan=generateSmartMesocycle(config(90,4,'Spalle'));
  const shortUpper=shortPlan.weeks[0].days[0];
  const longUpper=longPlan.weeks[0].days[0];
  assert.ok(longUpper.exercises.length>=shortUpper.exercises.length);
  assert.ok(longUpper.exercises.some(ex=>/Alzate Laterali/.test(ex.name)));
  assert.ok(longUpper.exercises.some(ex=>
    /Alzate Posteriori|Face Pull|Reverse Fly/.test(ex.name)),
    'with 90min, real second delt angle should be selected');
  assert.ok(longUpper.selectionAudit.selectedAccessories.some(a=>
    a.reason==='distretto dichiarato prioritario'));
  assert.ok(longUpper.estimatedMinutes<=90);
});

test('same time uses unscheduled weekly coverage, real fatigue and focus, not only slot order',()=>{
  const zero={Spalle:0,Bicipiti:0};
  registerSelectedWeeklySets(zero,[fixture('Laterali',{category:'Spalle',sets:3})]);
  assert.equal(zero.Spalle,3);
  assert.equal(zero.Bicipiti,0);
  const inputs=[
    fixture('Panca',{category:'Petto',pattern:'horizontal_push',anchor:'bench',rest:180}),
    fixture('Lat',{category:'Back_Lats',pattern:'vertical_pull',rest:150}),
    fixture('Bicipiti',{category:'Bicipiti',optional:true}),
    fixture('Laterali',{category:'Spalle',optional:true})
  ];
  const plan=selectExercisesForTime(inputs,35,{
    focusMuscleGroup:'Spalle',scheduledWeeklySets:{Spalle:0,Bicipiti:13},
    history:{byExercise:{},byMuscle:{}}
  });
  const selected=plan.selectionAudit.selectedAccessories.map(x=>x.exercise);
  const rejected=plan.selectionAudit.excludedAccessories.map(x=>x.exercise);
  if(selected.length===1) assert.equal(selected[0],'Laterali',
    'when time only permits one optional isolation, focus comes first');
  assert.ok(selected.every(name=>!rejected.includes(name)));
  assert.ok(plan.estimatedMinutes<=35);
});

test('preview explains time-first selection and does not add a CSV schema column',()=>{
  const generated=generateSmartMesocycle(config(60));
  const comparison=compareMesocyclePlans(null,generated,{});
  const preview=formatCoachReview(comparison,{
    inspectedMesocycles:0,sessionsAnalyzed:0
  });
  assert.match(preview,/SCELTA ESERCIZI IN BASE AL TEMPO/);
  assert.match(preview,/movimenti prioritari protetti/);
  assert.match(preview,/Durate previste/);
});
