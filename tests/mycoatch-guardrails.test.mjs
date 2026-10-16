import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMesocyclePolicy } from '../mycoatch/periodizationPolicy.js';
import { evaluateCoachingGuardrails, authorizeTopset,
  SCIENCE_SNAPSHOT } from '../mycoatch/coachGuardrails.js';
import { generateSmartMesocycle } from '../mycoatch/engine.js';
import { assessRecoveryScope } from '../mycoatch/recoveryScope.js';
import { groupAccessories } from '../mycoatch/groupOptimizer.js';
import { compareMesocyclePlans, formatCoachReview } from '../mycoatch/mesocycleComparison.js';

const exerciseHistory=(weekCount=2,overrides={})=>({
  name:'Alzate Laterali con Manubri',category:'Spalle',fatigueConcern:true,
  progressionEvidence:{distinctWeeks:weekCount},
  lastWorkingKg:7,lastReps:{min:15,max:25},
  exposures:[
    {weekId:'26/1',isDeload:false,completedSets:3,plannedSets:3,
      allRpeMeasured:true,allRpeWithinTarget:true,allStraightSets:true,avgRpe:7.5},
    {weekId:'26/2',isDeload:false,completedSets:3,plannedSets:3,
      allRpeMeasured:true,allRpeWithinTarget:true,allStraightSets:true,avgRpe:7.5}
  ],...overrides
});
const riskHistory={
  sessionsAnalyzed:4,inspectedMesocycles:1,
  byExercise:{deltoidi:exerciseHistory(),
    pettorali:exerciseHistory(2,{name:'Panca Piana con Bilanciere',category:'Petto',lastWorkingKg:60})},
  byMuscle:{},decisions:{byExercise:{},byMuscle:{}}
};
const buildConfig=(changes={})=>({
  durationWeeks:4,daysPerWeek:4,maxSessionMinutes:90,
  focus:'hypertrophy',useTopset:true,deloadWeek:false,
  athleteProfile:{experience:'advanced',calibration:'regular',
    priorityMuscle:'Spalle',excludedExercises:[],referenceLoads:{}},
  ...changes
});

test('documented fatigue overrides the athlete request to skip recovery',()=>{
  const config=buildConfig();
  const guard=evaluateCoachingGuardrails(config,riskHistory,{experience:'advanced'});
  const phase=deriveMesocyclePolicy(config,riskHistory,{experience:'advanced'});
  assert.equal(phase.recoveryFirst,true);
  assert.equal(phase.deloadWeek,1);
  assert.equal(phase.weeks[0].isDeload,true);
  assert.equal(guard.recoveryRequired,true);
  assert.equal(guard.effectiveFocusMuscle,null);
  assert.equal(guard.allowNewAdvancedTechniques,false);
  assert.ok(guard.reasons.some(x=>x.code==='DELOAD_VETO'));
  assert.ok(guard.reasons.some(x=>x.code==='FOCUS_VETO'));
  assert.ok(guard.reasons.some(x=>x.code==='TOPSET_VETO'));
  for(const requested of [false,2,3,4]){
    assert.equal(deriveMesocyclePolicy(
      {...config,deloadWeek:requested},riskHistory,{experience:'advanced'}
    ).deloadWeek,1,'fatigue wins over recovery scheduling '+requested);
  }
});

test('fatigue veto is not invented from just a single week of uncertain data',()=>{
  const short={byExercise:{side:exerciseHistory(1)},byMuscle:{}};
  assert.equal(evaluateCoachingGuardrails(buildConfig(),short,{}).recoveryRequired,false);
  assert.equal(deriveMesocyclePolicy(buildConfig(),short,{}).deloadWeek,null);
});

test('full generator rejects excess volume, dropsets and top sets despite user preferences',()=>{
  const config=buildConfig();
  const generated=generateSmartMesocycle(config,riskHistory);
  assert.equal(generated.periodization.deloadWeek,1);
  assert.equal(generated.coachGuardrails.effectiveFocusMuscle,null);
  assert.equal(generated.weeks[0].isDeloadWeek,true);
  for(const week of generated.weeks){
    for(const day of week.days){
      assert.ok(day.estimatedMinutes<=90);
      for(const exercise of day.exercises){
        assert.ok(Number(exercise.rpe)<=7,
          'rest of tentative block stays conservative until fresh logs');
        assert.equal(exercise.topset,'');
        assert.ok(exercise.sets.every(x=>x.intensityTechnique===null),
          'no unverified advanced method during fatigue');
        assert.ok(exercise.sets.every(x=>x.completed===false && x.actualKg===''));
      }
    }
  }
  const compact=generateSmartMesocycle(
    buildConfig({maxSessionMinutes:60}),riskHistory);
  for(const week of compact.weeks){
    assert.equal(week.volumeBalance.isDeloadWeek,week.isDeloadWeek,
      'non confondere veto accessori con settimana di scarico');
    assert.deepEqual(week.volumeBalance.moves,[],
      'niente volume accessorio riallocato nella fase di recupero');
    for(const day of week.days){
      assert.ok(day.estimatedMinutes<=60);
      assert.ok(day.exercises.every(ex=>!ex.groupType),
        'vietate superserie e triset con fatica ripetuta');
    }
  }
  const review=formatCoachReview(
    compareMesocyclePlans(null,generated,riskHistory),{
      inspectedMesocycles:1,sessionsAnalyzed:4
    });
  assert.match(review,/RICHIESTA NON ACCOLTA/);
  assert.match(review,/SPECIALIZZAZIONE RINVIATA/);
  assert.match(review,/TOP SET NON AUTORIZZATO/);
  assert.match(review,/2026-10-16/);
  assert.deepEqual(riskHistory.byExercise.deltoidi.exposures[0].completedSets,3);
});

test('top sets require two distinct completed weeks with measured acceptable RPE',()=>{
  const fine=exerciseHistory(2,{fatigueConcern:false});
  assert.equal(authorizeTopset(fine,{experience:'advanced'}),true);
  assert.equal(authorizeTopset(fine,{recoveryRequired:true}),false);
  assert.equal(authorizeTopset(fine,{isDeload:true}),false);
  assert.equal(authorizeTopset(fine,{experience:'beginner'}),false);
  assert.equal(authorizeTopset({...fine,exposures:fine.exposures.slice(0,1)}),false);
  assert.equal(authorizeTopset({...fine,exposures:[
    fine.exposures[0],{...fine.exposures[1],allRpeMeasured:false}
  ]}),false);
  assert.equal(authorizeTopset({...fine,exposures:[
    fine.exposures[0],{...fine.exposures[1],avgRpe:9.5}
  ]}),false);
  assert.equal(authorizeTopset({...fine,exposures:[
    fine.exposures[0],{...fine.exposures[1],weekId:'26/1'}
  ]}),false);
});

test('healthy confirmed athletes can still specialize: veto is not permanent',()=>{
  const healthy={sessionsAnalyzed:4,byExercise:{},byMuscle:{},
    decisions:{byExercise:{},byMuscle:{}}};
  const config=buildConfig({useTopset:false,deloadWeek:false});
  const guard=evaluateCoachingGuardrails(config,healthy,{experience:'advanced'});
  assert.equal(guard.recoveryRequired,false);
  assert.equal(guard.effectiveFocusMuscle,'Spalle');
  const plan=generateSmartMesocycle(config,healthy);
  assert.equal(plan.periodization.deloadWeek,null);
  assert.equal(plan.coachGuardrails.effectiveFocusMuscle,'Spalle');
  assert.ok(plan.weeks[0].days[0].exercises.some(ex=>
    /Alzate Laterali/.test(ex.name)));
});

test('scientific evidence is reviewed with date and not misrepresented as live auto-updates',()=>{
  assert.equal(SCIENCE_SNAPSHOT.reviewedOn,'2026-10-16');
  assert.equal(SCIENCE_SNAPSHOT.automaticLiteratureUpdates,false);
  const dois=SCIENCE_SNAPSHOT.sources.map(item=>item.doi);
  assert.ok(dois.includes('10.1007/s40279-025-02344-w'));
  assert.ok(dois.includes('10.1007/s40279-025-02176-8'));
  assert.ok(dois.includes('10.1186/s40798-023-00620-5'));
  assert.ok(dois.includes('10.1007/s40279-022-01784-y'));
});

test('one affected region gets local recovery without an imposed global deload',()=>{
  const history={sessionsAnalyzed:4,inspectedMesocycles:1,
    byExercise:{deltoidi:exerciseHistory()},byMuscle:{},
    decisions:{byExercise:{},byMuscle:{}}};
  const config=buildConfig({useTopset:false,deloadWeek:false,
    athleteProfile:{...buildConfig().athleteProfile,priorityMuscle:'Petto'}});
  const snapshot=JSON.stringify(history);
  assert.equal(assessRecoveryScope(history).scope,'local');
  const guard=evaluateCoachingGuardrails(config,history,{experience:'advanced'});
  assert.equal(guard.recoveryRequired,false);
  assert.equal(guard.effectiveFocusMuscle,'Petto');
  assert.ok(guard.reasons.some(x=>x.code==='LOCAL_RECOVERY'));
  assert.ok(!guard.reasons.some(x=>x.code==='DELOAD_VETO'));
  assert.equal(deriveMesocyclePolicy(config,history,{}).deloadWeek,null);
  const plan=generateSmartMesocycle(config,history);
  assert.ok(plan.weeks.every(w=>!w.isDeloadWeek));
  const all=plan.weeks.flatMap(w=>w.days.flatMap(day=>day.exercises));
  assert.ok(all.some(ex=>ex.category==='Petto' && Number(ex.rpe)>7),
    'healthy chest is not globally capped');
  assert.ok(all.some(ex=>ex.category==='Spalle'));
  assert.ok(all.filter(ex=>ex.category==='Spalle').every(ex=>Number(ex.rpe)<=7));
  assert.ok(plan.weeks.every(w=>w.volumeBalance.moves.every(m=>m.muscle!=='Spalle')));
  assert.ok(all.filter(ex=>ex.category==='Spalle').every(ex=>!ex.groupType));
  assert.equal(JSON.stringify(history),snapshot);
});

test('back subcategories share one region; separate regions warrant a global precaution',()=>{
  const back={byExercise:{
    a:exerciseHistory(2,{name:'Lat Machine con Triangolo',category:'Back_Lats'}),
    b:exerciseHistory(2,{name:'Rematore con Bilanciere',category:'Back_Thickness'})
  }};
  assert.equal(assessRecoveryScope(back).scope,'local');
  assert.equal(deriveMesocyclePolicy(buildConfig({deloadWeek:false}),back,{}).deloadWeek,null);
  const widespread={byExercise:{
    ...back.byExercise,
    c:exerciseHistory(2,{name:'Squat con Bilanciere',category:'Quadricipiti'})
  }};
  assert.equal(assessRecoveryScope(widespread).scope,'diffuse');
  assert.equal(deriveMesocyclePolicy(buildConfig({deloadWeek:false}),widespread,{}).deloadWeek,1);
});

test('unknown fatigue category conservatively retains global recovery',()=>{
  const unknown={byExercise:{one:exerciseHistory(2,{category:null})}};
  assert.equal(assessRecoveryScope(unknown).scope,'uncertain');
  assert.equal(evaluateCoachingGuardrails(buildConfig(),unknown,{}).recoveryRequired,true);
  assert.equal(deriveMesocyclePolicy(buildConfig(),unknown,{}).deloadWeek,1);
  assert.equal(assessRecoveryScope({byExercise:{one:exerciseHistory(1)}}).scope,'none');
});

test('grouping excludes affected region but still permits unrelated accessories',()=>{
  const exercise=(name,category)=>({
    name,category,pattern:'isolation',setsCount:2,notes:'',restTime:'90s',
    sets:[{},{}]
  });
  const mixed=[exercise('Panca','Petto'),exercise('Lat','Back_Lats'),
    exercise('Alzate','Spalle'),exercise('Curl','Bicipiti'),exercise('Calf','Polpacci')];
  const allowed=groupAccessories(mixed,2,{excludedMuscles:['Spalle']});
  assert.ok(allowed.some(ex=>ex.groupType==='superset' && ex.category==='Bicipiti'));
  assert.ok(allowed.every(ex=>ex.category!=='Spalle' || !ex.groupType));
  const blocked=groupAccessories(mixed.slice(0,4),2,{excludedMuscles:['Spalle']});
  assert.ok(blocked.every(ex=>!ex.groupType));
});

test('local fatigue blocks specialization only for involved region',()=>{
  const history={byExercise:{one:exerciseHistory()}};
  const affected=evaluateCoachingGuardrails(buildConfig(),history,{experience:'advanced'});
  assert.equal(affected.effectiveFocusMuscle,null);
  assert.ok(affected.reasons.some(x=>x.code==='FOCUS_VETO'));
  const unrelated=evaluateCoachingGuardrails(buildConfig({
    athleteProfile:{...buildConfig().athleteProfile,priorityMuscle:'Quadricipiti'}
  }),history,{experience:'advanced'});
  assert.equal(unrelated.effectiveFocusMuscle,'Quadricipiti');
});
