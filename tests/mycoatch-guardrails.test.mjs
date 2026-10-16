import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMesocyclePolicy } from '../mycoatch/periodizationPolicy.js';
import { evaluateCoachingGuardrails, authorizeTopset,
  SCIENCE_SNAPSHOT } from '../mycoatch/coachGuardrails.js';
import { generateSmartMesocycle } from '../mycoatch/engine.js';
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
  byExercise:{deltoidi:exerciseHistory()},
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
