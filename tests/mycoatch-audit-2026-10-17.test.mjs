import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeTopset } from '../mycoatch/coachGuardrails.js';
import { recommendNextSessionLoad } from '../mycoatch/loadProposal.js';
import { analyzeTrainingHistory } from '../mycoatch/historyInsights.js';
import { planAdaptiveDecisions } from '../mycoatch/adaptiveDecisions.js';
import { safeTechniqueEvidence } from '../mycoatch/intensityTechniquePolicy.js';

const exposure = (weekId, extra = {}) => ({weekId, completedSets:3, plannedSets:3,
  allRpeMeasured:true, allRpeWithinTarget:true, allStraightSets:true, avgRpe:7,
  ...extra});
const set = () => ({weight:'70', reps:'8', rpe:'6', isLocked:true});
const exercise = (extra = {}) => ({name:'Panca Piana con Bilanciere',
  equipment:'barbell', reps:'8-12', targetRpe:'7', set:'3 set',
  loggedSets:[set(),set(),set()], ...extra});

test('top set checks every session in each of the last two weeks', () => {
  for (const bad of [{allRpeMeasured:false}, {allRpeWithinTarget:false},
    {completedSets:1}, {avgRpe:9.5}, {avgRpe:undefined}]) {
    const history = {exposures:[exposure('1'),exposure('2',bad),exposure('2')]};
    assert.equal(authorizeTopset(history), false, JSON.stringify(bad));
  }
  assert.equal(authorizeTopset({exposures:[exposure('1'),exposure('2'),exposure('2')]}),true);
});

test('dropsets also require every session to qualify, not just the last in each week', () => {
  const valid=id=>exposure(id,{repRange:{min:10,max:15}});
  assert.equal(safeTechniqueEvidence({exposures:[valid('1'),valid('2')]}),true);
  assert.equal(safeTechniqueEvidence({exposures:[valid('1'),
    {...valid('2'),allRpeMeasured:false},valid('2')]}),false);
});

test('next-session load cannot increase when prescribed rows are missing', () => {
  for (const prescribed of [{set:'4 set'}, {setsCount:4}, {sets:[{},{},{},{}]}]) {
    assert.equal(recommendNextSessionLoad(exercise(prescribed)),null);
  }
  assert.equal(recommendNextSessionLoad(exercise()),null,'first complete the repetition range');
  assert.equal(recommendNextSessionLoad(exercise({loggedSets:[set(),set(),set()].map(s=>({...s,reps:'12'}))}))?.suggestedWeight,72.5);
});

test('low RPE does not bypass anomalous reps or an invalid target range', () => {
  assert.equal(recommendNextSessionLoad(exercise({loggedSets:[set(),set(),set()].map(s=>({...s,reps:'30'}))})),null);
  assert.equal(recommendNextSessionLoad(exercise({reps:'12-8'})),null);
});

test('unperformed prescribed exercises count against adherence before adding volume', () => {
  const diary = {years:{2026:{mesocycles:[{weeks:[1,2,3].map(weekNumber=>({
    weekNumber,isDeloadWeek:false,days:[{dayNumber:1,exercises:[
      exercise(),exercise({name:'Panca Inclinata con Manubri',loggedSets:[]})
    ]}]
  }))}]}}};
  const snapshot = JSON.stringify(diary);
  const report = analyzeTrainingHistory(diary);
  assert.equal(report.byMuscle.Petto.recentAdherence,0.5);
  // Keep a real plateau with moderate effort, instead of the low-RPE load trigger.
  for (const e of Object.values(report.byExercise)) {
    e.progressionEvidence.progressionTrigger = null;
  }
  assert.equal(planAdaptiveDecisions(report).byMuscle.Petto.volumeDelta,0);
  assert.equal(JSON.stringify(diary),snapshot);
});

test('a skipped muscle in an observed week remains in the recent adherence denominator', () => {
  const weeks=[1,2,3].map(weekNumber=>({weekNumber,isDeloadWeek:false,
    days:[{dayNumber:1,exercises:[exercise(weekNumber===2?{loggedSets:[]}:{}),
      exercise({name:'Squat con Bilanciere'})]}]}));
  const report=analyzeTrainingHistory({years:{2026:{mesocycles:[{weeks}]}}});
  assert.equal(report.byMuscle.Petto.avgWeeklySets,2);
  assert.equal(report.byMuscle.Petto.recentAdherence,0.67);
  assert.equal(report.byMuscle.Petto.weeksObserved,2);
});
