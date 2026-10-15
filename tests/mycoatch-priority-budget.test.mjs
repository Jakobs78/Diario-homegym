import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeSession } from '../mycoatch/groupOptimizer.js';
import { estimateDaySeconds } from '../mycoatch/timeEstimator.js';
import { generateSmartMesocycle } from '../mycoatch/engine.js';

function exercise(name, {
  sets=2, rest=90, category='Spalle', pattern='isolation',
  anchorKey=null, isOptional=false, equipment='dumbbell'
}={}) {
  return {
    name, category, pattern, equipment, anchorKey, isOptional,
    setsCount:sets, restTime:rest+'s', reps:'8-12', notes:'',
    sets:Array.from({length:sets},(_,i)=>({
      setNumber:i+1,targetReps:'8-12',targetKg:'',actualReps:'',
      actualKg:'',completed:false,isWarmup:false,intensityTechnique:null
    }))
  };
}

const bench=()=>exercise('Panca', {sets:3,rest:180,pattern:'horizontal_push',category:'Petto',anchorKey:'bench',equipment:'barbell'});
const lats=()=>exercise('Lat', {sets:3,rest:150,pattern:'vertical_pull',category:'Back_Lats',equipment:'lat_machine'});
const squat=()=>({...exercise('Squat', {sets:3,rest:180,pattern:'squat',category:'Quadricipiti',equipment:'barbell'}),priorityProtected:true});

test('third-slot squat is protected while later accessories are removed',()=>{
  const anchored=[bench(),lats(),squat()];
  const minutes=Math.ceil(estimateDaySeconds(anchored)/60);
  assert.ok(minutes>=25 && minutes<=180);
  const withAccessories=[
    ...anchored,
    exercise('Alzate laterali',{category:'Spalle',isOptional:true}),
    exercise('Curl',{category:'Bicipiti'})
  ];
  const optimized=optimizeSession(withAccessories,minutes);
  assert.deepEqual(optimized.exercises.map(ex=>ex.name),anchored.map(ex=>ex.name));
  assert.ok(optimized.estimatedMinutes<=minutes);
  assert.ok(optimized.removedAccessoryExercises>=2);
  assert.equal(optimized.exercises[2].priorityProtected,true);
});

test('session too short fails clearly rather than silently deleting squat',()=>{
  const anchored=[bench(),lats(),squat()];
  const minutes=Math.ceil(estimateDaySeconds(anchored)/60)-1;
  assert.throws(
    ()=>optimizeSession([...anchored,exercise('Curl',{category:'Bicipiti'})],minutes),
    /fondamentali prioritari/i
  );
});

test('optional isolation is cut before later mandatory muscle work',()=>{
  const first=exercise('Panca',{sets:2,rest:120,pattern:'horizontal_push',category:'Petto',anchorKey:'bench',equipment:'barbell'});
  const second=exercise('Lat',{sets:2,rest:120,pattern:'vertical_pull',category:'Back_Lats',equipment:'lat_machine'});
  const optional=exercise('Polpacci facoltativi',{category:'Polpacci',isOptional:true,sets:3});
  const mandatory=exercise('Alzate laterali necessarie',{category:'Spalle',sets:2});
  const minutes=Math.ceil(estimateDaySeconds([first,second,mandatory])/60);
  const optimized=optimizeSession([first,second,optional,mandatory],minutes);
  assert.ok(optimized.exercises.some(x=>x.name===mandatory.name));
  assert.ok(!optimized.exercises.some(x=>x.name===optional.name));
  assert.ok(optimized.estimatedMinutes<=minutes);
});

test('real 3-day template protects third-slot squat across four weeks',()=>{
  const meso=generateSmartMesocycle({
    durationWeeks:4,daysPerWeek:3,maxSessionMinutes:75,
    focus:'hypertrophy'
  },{byExercise:{},byMuscle:{},inspectedMesocycles:0});
  for(const week of meso.weeks){
    for(const day of week.days){
      assert.ok(day.estimatedMinutes<=75);
      const originals=day.dayNumber===1 ? ['bench'] :
        day.dayNumber===2 ? ['hinge','military'] : ['squat'];
      const anchors=day.exercises.filter(ex=>ex.anchorKey).map(ex=>ex.anchorKey);
      assert.deepEqual(anchors,originals);
      if (day.dayNumber===1) {
        const protectedSquat=day.exercises.find(ex=>ex.pattern==='squat');
        assert.ok(protectedSquat,'Squat nel terzo slot della Full Body A');
        assert.equal(protectedSquat.priorityProtected,true);
      }
    }
  }
});
