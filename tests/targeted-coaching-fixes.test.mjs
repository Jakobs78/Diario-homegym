import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
import {getSetPrefill} from '../js/setPrefill.js';
import {exerciseCoachModel} from '../mycoatch/coachCommunication.js';

const performed=(reps,rpe=8.5)=>({weight:21,reps,rpe,isLocked:true,completed:true,performedAt:'2026-10-29T17:00:00Z'});
function fixture(reps=[12,11,11],rpes=[8.5,8.5,8.5]){
 const push=logs=>({name:'Pushdown ai Cavi con Corda',set:'3 set',reps:'10-12',rpe:8.5,targetRpe:8.5,rest:'90s',sets:[{},{},{}],loggedSets:logs});
 return {athlete:{loadingSteps:{machine:1},availableLoads:{machine:[21,22]}},history:{years:{2026:{mesocycles:[{weeks:[
  {weekNumber:2,days:[{dayNumber:3,date:'2026-10-29',exercises:[push(reps.map((r,i)=>performed(r,rpes[i])))]}]},
  {weekNumber:3,days:[{dayNumber:3,isPaused:true,accumulatedSeconds:1200,date:'2026-11-04',exercises:[
   {name:'Panca Piana con Bilanciere',set:'2 set',reps:'6-8',rpe:8,sets:[{},{}],loggedSets:[{weight:50,reps:8,rpe:8,isLocked:true},{}]},push([{},{},{}])]}]}
 ]}]}}}};
}
const current=data=>data.history.years[2026].mesocycles[0].weeks[1].days[0].exercises[1];

test('screenshot case: a started day still proposes 12 for pushdown series 2/3 and explains range completion',()=>{
 const data=fixture(),ex=current(data),before=JSON.stringify(ex.loggedSets);
 reconcileTrainingPlan(data,{year:2026,mesoIndex:0});
 const prefills=[0,1,2].map(i=>getSetPrefill(ex,i));
 assert.deepEqual(prefills.map(s=>Number(s.reps)),[12,12,12]);
 assert.deepEqual(prefills.map(s=>Number(s.weight)),[21,21,21]);
 const text=exerciseCoachModel(ex,{prefills}).updates.map(u=>u.text).join(' ');
 assert.match(text,/serie 2, 3/);assert.match(text,/Manca poco/);assert.match(text,/Cerca di chiudere tutte le serie/);assert.match(text,/8,5/);
 assert.equal(JSON.stringify(ex.loggedSets),before);
 ex.loggedSets[0]=performed(12);
 reconcileTrainingPlan(data,{year:2026,mesoIndex:0});
 assert.equal(getSetPrefill(ex,1).reps,'12');
 assert.match(exerciseCoachModel(ex,{prefills:[0,1,2].map(i=>getSetPrefill(ex,i))}).updates.map(u=>u.text).join(' '),/Cerca di chiudere tutte le serie/);
 ex.loggedSets[0].rpe=9.5;
 reconcileTrainingPlan(data,{year:2026,mesoIndex:0});
 assert.equal(ex.coachSetProposals[1].kind,'reduce_today','a difficult series must override the previous completion goal');
});
test('all three series at 12 within RPE propose the next available 22 kg, including after another exercise started',()=>{
 const data=fixture([12,12,12]),ex=current(data),before=JSON.stringify(ex.loggedSets);
 reconcileTrainingPlan(data,{year:2026,mesoIndex:0});
 assert.ok(ex.coachSetProposals.every(p=>p.kind==='increase_load'&&p.weight===22&&p.reps===10));
 const text=exerciseCoachModel(ex).updates.map(u=>u.text).join(' ');
 assert.match(text,/aumentato il carico/);assert.match(text,/22 kg/);
 assert.equal(JSON.stringify(ex.loggedSets),before);
});
test('missing RPE or RPE above target cannot authorize the load increase',()=>{
 for(const rpes of [[8.5,'',8.5],[8.5,9,8.5]]){
  const data=fixture([12,12,12],rpes),ex=current(data);
  reconcileTrainingPlan(data,{year:2026,mesoIndex:0});
  assert.ok(ex.coachSetProposals.every(p=>p.kind!=='increase_load'&&p.weight<=21));
 }
});
test('a manual pending entry is not overwritten by the corrected rep proposal',()=>{
 const data=fixture(),ex=current(data);ex.loggedSets[1]={weight:21,reps:11,rpe:8.5,manualFields:{reps:true}};
 reconcileTrainingPlan(data,{year:2026,mesoIndex:0});
 assert.equal(ex.coachSetProposals[1].reps,12);assert.equal(getSetPrefill(ex,1).reps,'11');
 assert.match(exerciseCoachModel(ex,{prefills:[0,1,2].map(i=>getSetPrefill(ex,i))}).updates.map(u=>u.text).join(' '),/Suggerisco/);
});
