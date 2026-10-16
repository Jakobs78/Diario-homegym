import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCheckin, validateSessionCheckin,
  assessSessionReadiness } from '../mycoatch/sessionReadiness.js';
import { assessExerciseLive, assessSessionAdjustment,
  buildLiveSessionSnapshot } from '../mycoatch/liveCoach.js';
import { repeatCompletedSessionPreservingHistory } from '../js/historySafety.js';

const time=new Date('2026-10-16T10:00:00.000Z');
const template={sleep:'ok',energy:'ok',soreness:'ok',pain:'none'};
const checked=(values=template)=>createSessionCheckin(values,time);
const readiness=(values=template)=>assessSessionReadiness(checked(values),{
  now:time.getTime()+1000
});
const performed=(weight=80,reps=8,rpe=7)=>({
  weight:String(weight),reps:String(reps),rpe:String(rpe),
  isLocked:true,completed:true
});
const empty=()=>({weight:'',reps:'',rpe:'',isLocked:false,completed:false});
const bench=(sets)=>({name:'Panca Piana con Bilanciere',
  pattern:'horizontal_push',category:'Petto',reps:'6-8',
  targetRpe:'@8',recupero:'180s',loggedSets:sets});

test('check-in accepts only four specified categories, saves a timestamp and no diagnosis',()=>{
  assert.equal(validateSessionCheckin(null).ok,false);
  assert.equal(validateSessionCheckin({...template,energy:'amazing'}).ok,false);
  const entry=checked();
  assert.deepEqual(Object.keys(entry).sort(),
    ['checkedAt','energy','pain','sleep','soreness'].sort());
  assert.equal(entry.checkedAt,time.toISOString());
  assert.equal(readiness().level,'normal');
  assert.equal(readiness().allowIncrease,true);
});

test('no or stale check-in does not pretend to measure readiness',()=>{
  assert.equal(assessSessionReadiness(undefined,{now:time.getTime()}).level,'unknown');
  assert.equal(assessSessionReadiness(checked(),{
    now:time.getTime()+24*3600*1000
  }).level,'unknown');
  assert.equal(assessSessionReadiness({...checked(),pain:'invalid'},{
    now:time.getTime()+1000
  }).level,'unknown');
});

test('poor sleep or low energy independently vetoes load increases',()=>{
  const poor=readiness({...template,sleep:'poor'});
  assert.equal(poor.level,'watch');
  assert.equal(poor.allowIncrease,false);
  const caution=readiness({...template,sleep:'poor',energy:'low'});
  assert.equal(caution.level,'caution');
  assert.equal(caution.avoidTechniques,true);
  assert.match(caution.message,/evita incrementi/i);
});

test('pain triggers an explicit stop recommendation, not extra effort',()=>{
  const pain=readiness({...template,pain:'present'});
  assert.equal(pain.level,'stop');
  assert.equal(pain.allowIncrease,false);
  assert.match(pain.message,/interrompi il movimento/i);
  const base=bench([performed(80,8,7),performed(80,8,7),empty()]);
  const result=assessExerciseLive(base,0,{readiness:pain});
  assert.equal(result.code,'pain_caution');
  assert.equal(result.suggestedWeight,null);
  assert.equal(result.severity,'caution');
});

test('two excellent sets do not authorize an increment with poor readiness',()=>{
  const ex=bench([performed(80,8,7),performed(80,8,7),empty()]);
  const before=JSON.stringify(ex);
  assert.equal(assessExerciseLive(ex).code,'optional_increment');
  const cautious=assessExerciseLive(ex,0,{
    readiness:readiness({...template,energy:'low'})
  });
  assert.equal(cautious.code,'readiness_hold');
  assert.equal(cautious.suggestedWeight,null);
  assert.equal(JSON.stringify(ex),before);
});

test('two confirmed difficult sets trigger session-level review, never mutate data',()=>{
  const ex=bench([performed(80,6,9.5),performed(80,7,9),empty()]);
  const optional={name:'Alzate laterali',pattern:'isolation',
    category:'Spalle',loggedSets:[empty(),empty()]};
  const day={exercises:[ex,optional],coachCheckin:checked()};
  const before=JSON.stringify(day);
  const adjust=assessSessionAdjustment(day,readiness());
  assert.equal(adjust.action,'reduce');
  assert.equal(adjust.hardSets,2);
  assert.deepEqual(adjust.accessoryCandidates,['Alzate laterali']);
  assert.match(adjust.message,/Nessuna serie viene modificata/i);
  const snap=buildLiveSessionSnapshot(day,{now:time.getTime()+1000});
  assert.equal(snap.sessionAdjustment.action,'reduce');
  assert.equal(snap.readiness.level,'normal');
  assert.equal(JSON.stringify(day),before);
});

test('missing RPE, unchecked values and warmups cannot manufacture high effort',()=>{
  const ex=bench([performed(80,6,''),{
    ...performed(80,7,10),isWarmup:true
  },{...performed(80,7,10),isLocked:false,completed:false}]);
  assert.equal(assessSessionAdjustment({exercises:[ex]},readiness()),null);
  assert.equal(buildLiveSessionSnapshot({
    exercises:[ex],coachCheckin:checked()
  },{now:time.getTime()+1000}).sessionAdjustment,null);
});

test('check-in remains with archived workout but resets for repeated session',()=>{
  const day={date:'2026-10-16',coachCheckin:checked(),exercises:[
    bench([performed(80,8,8),performed(80,8,8)])
  ]};
  const old=JSON.stringify(day.coachCheckin);
  const archived=repeatCompletedSessionPreservingHistory(day,{
    capturedAt:time.toISOString()
  });
  assert.equal(JSON.stringify(archived.coachCheckin),old);
  assert.equal(day.coachCheckin,undefined);
  assert.equal(day.sessionArchives.length,1);
  assert.ok(day.exercises[0].loggedSets.every(s=>!s.isLocked &&
    s.weight==='' && s.rpe===''));
});
