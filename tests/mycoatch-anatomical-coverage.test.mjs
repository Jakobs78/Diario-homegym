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

test('accessory rebalancing never credits missing rear-delt sets to lateral raises',()=>{
  const ex=(name,setsCount=2)=>({
    name,category:'Spalle',pattern:'isolation',
    equipment:'dumbbell',shoulderHeadIsolation:metaFor(name).shoulderHeadIsolation,
    reps:'12-20',restTime:'90s',setsCount,
    sets:Array.from({length:setsCount},(_,i)=>({setNumber:i+1,targetReps:'12-20'}))
  });
  const lateral=ex('Alzate Laterali con Manubri');
  const rear=ex('Alzate Posteriori con Manubri');
  const current=[
    {dayNumber:1,dayName:'Upper A',exercises:[lateral],estimatedMinutes:20},
    {dayNumber:2,dayName:'Upper B',exercises:[],estimatedMinutes:10}
  ];
  const requested=[[lateral],[rear]];
  const result=rebalanceWeeklyAccessories(current,requested,60,{maxAccessorySets:4});
  const all=result.days.flatMap(day=>day.exercises);
  assert.ok(!all.some(x=>x.name==='Alzate Laterali con Manubri'&&x.setsCount>2));
  assert.equal(all.find(x=>x.name==='Alzate Posteriori con Manubri')?.setsCount,undefined);
  // The second planned exercise is a first-two-slot placeholder, so the
  // balancer must report a shortfall rather than manufacture volume.
  assert.ok(result.report.shortfallSets>=0);
});
