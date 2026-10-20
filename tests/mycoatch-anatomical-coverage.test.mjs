import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_DATABASE } from '../mycoatch/exercisesDB.js';
import { selectExerciseForSlot, normalizeSelectionPreferences, isExerciseAvailable } from '../mycoatch/exerciseSelection.js';
import { generateSmartMesocycle, getTemplateForDays } from '../mycoatch/engine.js';
import { auditWeeklyCoverage } from '../mycoatch/weeklyCoverage.js';
import { rebalanceWeeklyAccessories } from '../mycoatch/weeklyVolumeBalancer.js';

const emptyHistory={sessionsAnalyzed:0,byExercise:{},exerciseNotes:{},
  decisions:{byExercise:{},byMuscle:{}}};
const template=getTemplateForDays(4,'upperlower');
const upperBRear=template[2].slots.find(x=>x.shoulderHeadIsolation==='posteriore');
const upperALateral=template[0].slots.find(x=>x.shoulderHeadIsolation==='laterale');
const metaFor=name=>EXERCISE_DATABASE.find(x=>x.name===name);

test('4-day templates explicitly balance lateral/rear shoulder roles',()=>{
  assert.ok(upperBRear);
  assert.ok(upperALateral);
  for(const tpl of [getTemplateForDays(4,'upperlower'),getTemplateForDays(4,'fullbody')]){
    const heads=tpl.flatMap(day=>day.slots.filter(s=>s.shoulderHeadIsolation)
      .map(s=>s.shoulderHeadIsolation));
    assert.ok(heads.includes('laterale'));
    assert.ok(heads.includes('posteriore'));
  }
});

test('history cannot replace a requested posterior deltoid slot with lateral raises',()=>{
  const available=normalizeSelectionPreferences();
  const rear=selectExerciseForSlot(upperBRear,{
    preferences:available,focus:'hybrid',
    previousName:'Alzate Laterali con Manubri'
  }).exercise;
  assert.equal(rear.shoulderHeadIsolation,'posteriore');
  const lateral=selectExerciseForSlot(upperALateral,{
    preferences:available,focus:'hybrid',
    previousName:'Alzate Posteriori con Manubri'
  }).exercise;
  assert.equal(lateral.shoulderHeadIsolation,'laterale');
});

test('unavailable or excluded posterior variants are not silently replaced',()=>{
  const prefs=normalizeSelectionPreferences({
    availableEquipment:['barbell','bodyweight','lat_machine'],
    excludedExercises:[]
  });
  const result=selectExerciseForSlot(upperBRear,{
    preferences:prefs,focus:'hybrid',
    previousName:'Alzate Laterali con Manubri'
  });
  assert.equal(result.exercise,null);
  assert.match(result.reason,/facoltativo/i);
  const excluded=normalizeSelectionPreferences({
    excludedExercises:[
      'Alzate Posteriori con Manubri','Face Pull ai Cavi',
      'Reverse Fly ai Cavi'
    ]
  });
  assert.equal(selectExerciseForSlot(upperBRear,{
    preferences:excluded,focus:'hybrid'
  }).exercise,null);
});

test('60-minute Upper/Lower keeps rear/lateral functional coverage at multiple focuses',()=>{
  for(const focus of ['hybrid','hypertrophy','strength']){
    const meso=generateSmartMesocycle({
      daysPerWeek:4,durationWeeks:4,maxSessionMinutes:60,
      userAge:35,focus,splitPreference:'upperlower',
      deloadWeek:false
    },emptyHistory);
    for(const week of meso.weeks){
      assert.ok(week.days.every(day=>day.estimatedMinutes<=60));
      const a=week.days[0].exercises.filter(ex=>ex.shoulderHeadIsolation);
      const b=week.days[2].exercises.filter(ex=>ex.shoulderHeadIsolation);
      assert.ok(a.every(ex=>ex.shoulderHeadIsolation==='laterale'),focus);
      assert.ok(b.every(ex=>ex.shoulderHeadIsolation==='posteriore'),focus);
      const rearCount=week.days.flatMap(d=>d.exercises).filter(ex=>
        metaFor(ex.name)?.shoulderHeadIsolation==='posteriore'
      ).reduce((sum,ex)=>sum+ex.setsCount,0);
      assert.equal(week.weeklyCoverage.functionalCoverage.rearDeltoids.scheduledSets,rearCount);
      // A time cut may eliminate an accessory; the audit cannot claim it
      // present if it was dropped to protect the compound lifts.
      if(!rearCount)assert.notEqual(
        week.weeklyCoverage.functionalCoverage.rearDeltoids.status,'present');
    }
  }
});

test('historical Upper B lateral raise cannot usurp posterior slot',()=>{
  const previous={weeks:[{weekNumber:4,days:[
    {dayNumber:3,exercises:[
      {name:'Military Press con Bilanciere'},
      {name:'Rematore con Bilanciere'},
      {name:'Panca Piana con Bilanciere'},
      {name:'Pushdown ai Cavi'},
      {name:'Lat Machine Presa Larga'},
      {name:'Alzate Laterali con Manubri'}
    ]}
  ]}]};
  const meso=generateSmartMesocycle({
    daysPerWeek:4,durationWeeks:4,maxSessionMinutes:75,
    userAge:35,focus:'hybrid',splitPreference:'upperlower',
    deloadWeek:false
  },emptyHistory,previous);
  const posterior=meso.weeks[0].days[2].exercises.filter(x=>x.shoulderHeadIsolation);
  assert.ok(posterior.every(ex=>ex.shoulderHeadIsolation==='posteriore'));
  assert.ok(posterior.length,'with 75 minutes posterior isolation should fit');
});

test('report distinguishes posterior absence when unavailable, without inventing repetitions or kg',()=>{
  const plan=generateSmartMesocycle({
    daysPerWeek:4,durationWeeks:4,maxSessionMinutes:60,
    userAge:35,focus:'hybrid',splitPreference:'upperlower',
    excludedExercises:[
      'Alzate Posteriori con Manubri','Face Pull ai Cavi',
      'Reverse Fly ai Cavi'
    ]
  },emptyHistory);
  for(const week of plan.weeks){
    assert.equal(week.weeklyCoverage.functionalCoverage.rearDeltoids.scheduledSets,0);
    assert.equal(week.weeklyCoverage.functionalCoverage.rearDeltoids.status,'not_programmed');
    assert.ok(week.days.every(d=>d.estimatedMinutes<=60));
  }
});

test('transferred posterior sets remain posterior and do not inflate lateral raises',()=>{
  const ex=(name,setsCount,restTime='90s')=>{
    const meta=metaFor(name);
    assert.ok(meta,name);
    return {
      name,category:meta.category,pattern:meta.pattern,
      equipment:meta.equipment,shoulderHeadIsolation:meta.shoulderHeadIsolation,
      restTime,reps:'8-12',setsCount,
      sets:Array.from({length:setsCount},(_,i)=>({setNumber:i+1,targetReps:'8-12'}))
    };
  };
  const bench=ex('Panca Piana con Bilanciere',3,'180s');
  const lat=ex('Lat Machine Presa Larga',3,'150s');
  const military=ex('Military Press con Bilanciere',3,'180s');
  const row=ex('Rematore con Bilanciere',3,'150s');
  const lateral=ex('Alzate Laterali con Manubri',2);
  const rear=ex('Alzate Posteriori con Manubri',2);
  // Upper B lost a planned posterior accessory to a short time budget.
  // Another Upper day has sufficient time but already contains laterals.
  const current=[
    {dayNumber:1,dayName:'Upper A',exercises:[bench,lat,lateral],estimatedMinutes:35},
    {dayNumber:2,dayName:'Upper B',exercises:[military,row],estimatedMinutes:28}
  ];
  const result=rebalanceWeeklyAccessories(current,
    [[bench,lat,lateral],[military,row,rear]],75,{maxAccessorySets:4});
  const recipient=result.days[0].exercises;
  assert.equal(recipient.find(x=>x.name==='Alzate Laterali con Manubri')?.setsCount,2);
  assert.equal(recipient.find(x=>x.name==='Alzate Posteriori con Manubri')?.setsCount,2);
  assert.ok(result.days.every(day=>day.estimatedMinutes<=75));
  const coverage=auditWeeklyCoverage(result.days);
  assert.equal(coverage.shoulderHeadCoverage.directIsolationSets.laterale,2);
  assert.equal(coverage.shoulderHeadCoverage.directIsolationSets.posteriore,2);
});
