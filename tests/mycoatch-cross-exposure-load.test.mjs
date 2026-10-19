import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
import {findPriorExerciseExposures} from '../js/helpers.js';
import {recommendCrossExposureLoad} from '../mycoatch/crossExposureLoad.js';
import {getSetPrefill} from '../js/setPrefill.js';
import {stepRpe} from '../js/rpeStepper.js';
import {validateCompletedSet} from '../mycoatch/liveCoach.js';

const name='Panca Piana con Bilanciere';
const performed=(reps=8,rpe=7,kg=60)=>({
 weight:String(kg),reps:String(reps),rpe:String(rpe),
 isLocked:true,completed:true
});
const source=()=>({
 name,equipment:'barbell',reps:'7-9',targetRpe:'7',kgMin:'60',kgMax:'60',
 loggedSets:[performed(),performed(),performed()],
 sets:[{},{},{}]
});
const future=(overrides={})=>({
 name,equipment:'barbell',reps:'5-7',targetRpe:'8',
 kgMin:'',kgMax:'',loggedSets:[{},{}],sets:[{},{}],...overrides
});
const plates=()=>({
 barbellAssignments:{[canonicalExerciseKey(name)]:{weight:10,diameter:29}},
 plateInventories:{'29':{'20':2,'10':2,'5':2,'2.5':2,'1.25':2}},
 barbell:2.5
});

test('a different weekday exposure derives a conservative physically loadable starting kg',()=>{
 const data={history:{years:{2026:{mesocycles:[{weeks:[{
  weekNumber:1,days:[
    {dayNumber:1,completed:true,exercises:[source()]},
    {dayNumber:2,completed:false,exercises:[future()]}
  ]}]}]}}}};
 const matches=findPriorExerciseExposures(data,0,1,2,future(),2026);
 assert.equal(matches.length,1);
 const advice=recommendCrossExposureLoad(future(),matches,plates());
 assert.equal(advice?.kg,65);
 assert.equal(advice?.confidence,'provisional');
 const prefill=getSetPrefill(future(),0,{crossExposureAdvice:advice});
 assert.equal(prefill.weight,'65');
 assert.equal(prefill.reps,'5');
 assert.equal(prefill.rpe,'8');
 assert.equal(prefill.source,'estimated_cross_exposure');
 assert.equal(future().loggedSets[0].isLocked,undefined);
});

test('a second prescription with fixed 50 kg stays 50: no cross-day estimate',()=>{
 const target=future({reps:'6',kgMin:'50',kgMax:'50',loggedSets:[{},{},{}],sets:[{},{},{}]});
 assert.equal(recommendCrossExposureLoad(target,[source()],plates()),null);
 assert.equal(getSetPrefill(target,0).weight,'50');
 assert.equal(getSetPrefill(target,0).reps,'6');
 assert.equal(getSetPrefill(target,0).rpe,'8');
});

test('one missed set, unknown RPE, unknown plates or special top set veto inferred kg',()=>{
 const missed=source();missed.loggedSets[2].reps='6';
 assert.equal(recommendCrossExposureLoad(future(),[missed],plates()),null);
 const rpe=source();rpe.loggedSets[1].rpe='';
 assert.equal(recommendCrossExposureLoad(future(),[rpe],plates()),null);
 const hard=source();hard.loggedSets[2].rpe='9';
 assert.equal(recommendCrossExposureLoad(future(),[hard],plates()),null);
 const unconfirmed=source();unconfirmed.loggedSets[1].isLocked=false;unconfirmed.loggedSets[1].completed=false;
 assert.equal(recommendCrossExposureLoad(future(),[unconfirmed],plates()),null);
 assert.equal(recommendCrossExposureLoad(future(),[source()],{}),null);
 assert.equal(recommendCrossExposureLoad(future({topset:'1x5 @ 60kg'}),[source()],plates()),null);
});

test('an uncompleted same-week day or future day cannot be read as real evidence',()=>{
 const data={history:{years:{2026:{mesocycles:[{weeks:[{
  weekNumber:1,days:[
    {dayNumber:1,completed:false,exercises:[source()]},
    {dayNumber:2,completed:true,exercises:[source()]},
    {dayNumber:3,completed:false,exercises:[future()]}
  ]}]}]}}}};
 assert.equal(findPriorExerciseExposures(data,0,1,2,future(),2026).length,0);
 assert.equal(findPriorExerciseExposures(data,0,1,3,future(),2026).length,1);
});

test('RPE 5.5 prescription is confirmable but cannot seed cross-day e1RM',()=>{
 const light={name,kgMin:'59',kgMax:'59',reps:'5',targetRpe:'5.5'};
 assert.equal(stepRpe('6',-1,'5.5'),'5.5');
 assert.equal(getSetPrefill({...light,loggedSets:[{}],sets:[{}]},0).rpe,'5.5');
 assert.equal(validateCompletedSet({weight:'59',reps:'5',rpe:'5.5'},light).ok,true);
 assert.equal(validateCompletedSet({weight:'59',reps:'5',rpe:'5.5'},{...light,targetRpe:'8'}).ok,false);
 assert.equal(recommendCrossExposureLoad({...future(),targetRpe:'5.5'},[source()],plates()),null);
});
