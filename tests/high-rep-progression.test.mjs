import test from 'node:test';
import assert from 'node:assert/strict';
import {nextBlockDecision,workingProposal} from '../mycoatch/protocolLoad.js';
import {recommendNextSessionLoad} from '../mycoatch/loadProposal.js';
import {recommendNextSessionReps} from '../mycoatch/nextSessionReps.js';
import {recommendNextExposure} from '../mycoatch/nextExposure.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
import {getSetPrefill} from '../js/setPrefill.js';
import {exerciseCoachModel} from '../mycoatch/coachCommunication.js';
const set=(reps=20,rpe=8,weight=10)=>({weight,reps,rpe,isLocked:true,completed:true});
const ex=(logs=[set(),set(),set()],extra={})=>({name:'Alzate Laterali con Manubri',equipment:'dumbbell',reps:'15-20',targetRpe:8,recupero:'90s',kgMin:'10',kgMax:'10',sets:[{},{},{}],loggedSets:logs,...extra});

test('high reps build exactly one repetition in the whole block, never above target',()=>{
 const source=ex([set(18),set(17),set(16)]);
 const p=[0,1,2].map(i=>nextBlockDecision(source,i));
 assert.deepEqual(p.map(x=>x.weight),[10,10,10]);assert.deepEqual(p.map(x=>x.reps),[19,17,16]);
 const legacy=recommendNextSessionLoad(source);assert.deepEqual(legacy.nextReps,p.map(x=>x.reps));
 assert.deepEqual(recommendNextSessionReps(source,ex()).reps,p.map(x=>x.reps));
});
test('all top reps allow a small increase and reset to lower range without e1RM',()=>{
 const source=ex(),p=nextBlockDecision(source,0);
 assert.equal(p.kind,'increase_load');assert.equal(p.progressionBasis,'high_reps');assert.equal(p.weight,10.5);assert.equal(p.reps,15);assert.equal(p.verified,false);
 const proposal=workingProposal(ex([{},{},{}]),0,{exposures:[source]});
 assert.equal(proposal.weight,10.5);assert.equal(proposal.stableE1rm,null);assert.equal(proposal.range,null);assert.match(proposal.reason,/non uso il massimale/);
 const legacy=recommendNextSessionLoad(source);assert.equal(legacy.suggestedWeight,10.5);assert.equal(legacy.repGoal,15);
 const exposure=recommendNextExposure(source,ex([{},{},{}]));assert.equal(exposure.weight,10.5);assert.deepEqual(exposure.reps,[15,15,15]);
});
test('10-15 is also a high-rep range; low actual reps never enable e1RM extrapolation',()=>{
 const source=ex([set(10),set(10),set(10)],{reps:'10-15'});
 const p=workingProposal(ex([{},{},{}],{reps:'10-15'}),0,{exposures:[source]});
 assert.equal(p.weight,10);assert.equal(p.reps,11);assert.equal(p.stableE1rm,null);
});
test('known microsteps are honored; large jumps keep a theoretical small suggestion',()=>{
 const source=ex();
 const known=nextBlockDecision(source,0,{availableLoads:{dumbbell:[10,10.25]}});assert.equal(known.weight,10.25);assert.equal(known.verified,true);
 const large=workingProposal(ex([{},{},{}]),0,{exposures:[source],equipment:{dumbbell:2.5,availableLoads:{dumbbell:[10,12.5]}}});
 assert.ok(large.weight>10&&large.weight<=10.5);assert.equal(large.verified,false);assert.match(large.reason,/non componibile/);
 const legacy=recommendNextSessionLoad(source,{equipmentSettings:{dumbbell:2.5,availableLoads:{dumbbell:[10,12.5]}}});
 assert.ok(legacy.suggestedWeight>10&&legacy.suggestedWeight<=10.5);assert.equal(legacy.verified,false);
});
test('missing/high RPE, incomplete rows, readiness and special techniques prevent high-rep progression',()=>{
 for(const source of [ex([set(),set(),set(20,9)]),ex([set(),set(),set(20,'')]),ex([set(),set(),{}]),ex(undefined,{isDropset:true}),ex(undefined,{groupType:'restpause'}),ex(undefined,{isDeload:true}),ex(undefined,{isWarmup:true}),ex(undefined,{sessionSkip:{active:true}})]){
  assert.equal(nextBlockDecision(source,0),null);assert.equal(recommendNextSessionLoad(source),null);
 }
 for(const readiness of [{allowIncrease:false},{level:'stop'}]){
  assert.equal(nextBlockDecision(ex(),0,{},readiness),null);assert.equal(recommendNextSessionLoad(ex(),{readiness}),null);
 }
});
test('over-target reps do not force mixed high-rep load increases before all sets reach max',()=>{
 const source=ex([set(15),set(21),set(21)]);const p=[0,1,2].map(i=>nextBlockDecision(source,i));
 assert.deepEqual(p.map(x=>x.weight),[10,10,10]);assert.deepEqual(p.map(x=>x.reps),[16,20,20]);
 assert.equal(nextBlockDecision(ex([set(21),set(21),set(21)]),0).kind,'increase_load');
 assert.equal(nextBlockDecision(ex([set(30),set(30),set(30)]),0).kind,'maintain');
});
test('fixed high reps and different weights are preserved instead of inventing a new range or merging loads',()=>{
 const source=ex([set(20,8,10),set(20,8,9),set(20,8,8)]);
 assert.deepEqual([0,1,2].map(i=>nextBlockDecision(source,i).weight),[10,9,8]);
 assert.equal(nextBlockDecision(ex([set(15),set(15),set(15)],{reps:'15'}),0).kind,'maintain');
});
test('changed rest/RPE does not transfer the progression; manual fields and history remain intact',()=>{
 const source=ex(),before=structuredClone(source);
 for(const target of [ex([{},{},{}],{recupero:'120s'}),ex([{},{},{}],{targetRpe:9})]){
  const p=workingProposal(target,0,{exposures:[source]});assert.equal(p.weight,10);assert.equal(p.kind,'history');
  assert.equal(recommendNextSessionReps(source,target),null);
 }
 const future=ex([{weight:'9',reps:'18'},{},{}],{notes:'Nota scheda',userNotes:'Nota utente'});
 const data={athlete:{},history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[source]}]},{weekNumber:2,days:[{dayNumber:1,exercises:[future]}]}]}]}}}};
 reconcileTrainingPlan(data,{year:2026,mesoIndex:0});assert.equal(getSetPrefill(future,0).weight,'9');assert.equal(getSetPrefill(future,0).reps,'18');
 assert.equal(future.coachSetProposals[1].weight,10.5);const saved=JSON.stringify(data);
 assert.equal(reconcileTrainingPlan(data,{year:2026,mesoIndex:0}),false);assert.equal(JSON.stringify(data),saved);
 assert.deepEqual(source.loggedSets,before.loggedSets);assert.deepEqual(source.sets,before.sets);assert.equal(future.notes,'Nota scheda');assert.equal(future.userNotes,'Nota utente');
});
test('high-rep advice explains the increase and never claims it was derived from e1RM',()=>{
 const future=ex([{},{},{}]);future.coachSetProposals=[workingProposal(future,0,{exposures:[ex()]})];
 const text=exerciseCoachModel(future).updates.map(u=>u.text).join(' ');
 assert.match(text,/Ho aumentato il carico/);assert.doesNotMatch(text,/usando il massimale/);
});

test('primary and fallback agree when the nearest owned increase exceeds the small requested step',()=>{
 const source=ex([set(20,8,100),set(20,8,100),set(20,8,100)],{name:'Leg press',equipment:'machine'});
 const equipment={machine:1,availableLoads:{machine:[100,104]}};
 const primary=nextBlockDecision(source,0,equipment),fallback=recommendNextSessionLoad(source,{equipmentSettings:equipment});
 assert.equal(primary.weight,101);assert.equal(fallback.suggestedWeight,primary.weight);assert.equal(primary.verified,false);assert.equal(fallback.verified,false);
});
