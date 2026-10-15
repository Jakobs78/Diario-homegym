import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMesocyclePolicy } from '../mycoatch/periodizationPolicy.js';
import { evaluateExerciseProgression } from '../mycoatch/progressionPolicy.js';
import { generateSmartMesocycle } from '../mycoatch/engine.js';
import { coachState } from '../mycoatch/state.js';
import { MyCoatch } from '../mycoatch/index.js';

const history = { byExercise: {}, byMuscle: {}, inspectedMesocycles: 0 };
const cfg = { durationWeeks: 4, maxSessionMinutes: 180, daysPerWeek: 3, focus: 'hypertrophy' };

function exposure(weekId, kg = 50, changes = {}) {
  return {
    weekId, plannedSets: 3, completedSets: 3, isDeload: false,
    repRange: {min: 8, max: 10}, uniformWeight: true,
    allStraightSets: true, allRpeWithinTarget: true,
    workingKg: kg, topKg: kg, allRepsAtTop: true,
    allRepsInRange: true, minWorkingReps: 10,
    rpeOvershoot: false, allRepsBelowMin: false,
    ...changes
  };
}

test('4-week block: effort remains capped, final deload flagged', () => {
  const p = deriveMesocyclePolicy(cfg, history, {});
  assert.equal(p.deloadWeek, 4);
  assert.deepEqual(p.weeks.map(w => w.phase), ['accumulation','accumulation','accumulation','recovery']);
  assert.ok(p.weeks.every(w => w.targetRpe <= 8.5));
  assert.equal(p.weeks[3].targetRpe, 6.5);
});

test('measured repeated fatigue moves recovery to week one', () => {
  const p = deriveMesocyclePolicy(cfg, {
    byExercise: { bench: { name: 'Panca', fatigueConcern: true,
      progressionEvidence: {distinctWeeks: 2} } }
  });
  assert.equal(p.recoveryFirst, true);
  assert.equal(p.deloadWeek, 1);
  assert.equal(p.weeks[0].phase, 'recovery');
  assert.notEqual(p.weeks[3].phase, 'recovery');
});

test('fatigue not supported by distinct weeks does not force early deload', () => {
  const p = deriveMesocyclePolicy(cfg, {byExercise: {
    bench: {fatigueConcern: true, progressionEvidence: {distinctWeeks: 1}}
  }});
  assert.equal(p.deloadWeek, 4);
  assert.equal(p.recoveryFirst, false);
});

test('explicit deload opt-out and beginner effort ceiling', () => {
  const p = deriveMesocyclePolicy({ ...cfg, deloadWeek: false, focus: 'strength' },
    history, {experience:'beginner'});
  assert.equal(p.deloadWeek, null);
  assert.ok(p.weeks.every(w => !w.isDeload && w.targetRpe <= 8));
});

test('calibration is not automatically classified as recovery', () => {
  const p = deriveMesocyclePolicy(cfg, history,
    {experience:'beginner', calibrationWeek:true, rpeTargets:['6.5','7','7.5','6.5']});
  assert.equal(p.weeks[0].phase, 'calibration');
  assert.equal(p.weeks[0].isDeload, false);
  assert.equal(p.weeks[0].targetRpe, 6.5);
});

test('unsupported deload placement fails clearly', () => {
  assert.throws(() => deriveMesocyclePolicy({...cfg, deloadWeek: 9}), /scarico/i);
});

test('two complete distinct weeks at the same kg allow a load step', () => {
  const p = evaluateExerciseProgression([exposure('w1'), exposure('w2')]);
  assert.equal(p.readyForLoad, true);
  assert.equal(p.distinctWeeks, 2);
});

test('a manual increase requires fresh confirmation before another step', () => {
  const p = evaluateExerciseProgression([exposure('w1', 50), exposure('w2', 55)]);
  assert.equal(p.readyForLoad, false);
  assert.ok(p.caveats.includes('carichi_non_confrontabili'));
});

test('two sessions in one week and missing RPE never trigger auto-load', () => {
  assert.equal(evaluateExerciseProgression([exposure('w1'), exposure('w1')]).readyForLoad, false);
  assert.equal(evaluateExerciseProgression([
    exposure('w1'), exposure('w2',50,{allRpeWithinTarget:false})
  ]).readyForLoad, false);
});

test('repeated measured effort overshoot is a review signal', () => {
  const p = evaluateExerciseProgression([
    exposure('w1',50,{allRpeWithinTarget:false,rpeOvershoot:true}),
    exposure('w2',50,{allRpeWithinTarget:false,rpeOvershoot:true})
  ]);
  assert.equal(p.fatigueConcern, true);
  assert.equal(p.readyForLoad, false);
});

test('engine generates weeks with a consistent RPE and no speculative top load', () => {
  const meso = generateSmartMesocycle({...cfg,useTopset:true}, history);
  assert.equal(meso.weeks.length, 4);
  assert.equal(meso.weeks[3].isDeloadWeek, true);
  for (const week of meso.weeks) {
    for (const day of week.days) {
      assert.ok(day.estimatedMinutes <= cfg.maxSessionMinutes);
      for (const ex of day.exercises) {
        assert.equal(Number(ex.rpe), week.targetRpe);
        if (ex.topset && ex.kgMin !== '') {
          assert.ok(ex.topset.includes(ex.kgMin + 'kg'));
          assert.equal(Number(ex.sets[0].targetKg), Number(ex.kgMin));
        }
      }
    }
  }
});

test('CSV export fails on missing prescribed RPE instead of inventing @8', () => {
  const invalid = { weeks: [{weekNumber:1, days:[{dayNumber:1, exercises:[{
    name:'Panca Piana con Bilanciere', setsCount:3, reps:'6-8', restTime:'180s',
    kgMin:'', kgMax:'', rpe:'', notes:''
  }]}]}]};
  coachState.setActiveMesocycle(invalid);
  assert.throws(() => MyCoatch.exportAsCSV(), /incompleta/i);
  coachState.clear();
});
