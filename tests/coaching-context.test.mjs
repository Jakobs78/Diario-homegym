import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryContext,recoveryKey} from '../mycoatch/recoveryContext.js';
import {nextBlockDecision,workingProposal,selectEvidence} from '../mycoatch/protocolLoad.js';
import {recommendNextSessionLoad} from '../mycoatch/loadProposal.js';
import {exerciseCoachModel} from '../mycoatch/coachCommunication.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
const done=(reps=15,weight=4,rpe=8.5)=>({weight,reps,rpe,isLocked:true,completed:true});
const ex=(rest='150s',extra={})=>({name:'Leg Curl',equipment:'machine',reps:'10-15',targetRpe:8.5,recupero:rest,sets:[{},{}],loggedSets:[done(),done()],...extra});
test('recovery normalization and practical similarity do not invent a universal thirty-second tolerance',()=>{
 assert.equal(recoveryKey({rest:'2:30 min'}),'150');assert.equal(recoveryKey({rest:'3 minuti'}),'180');
 for(const [a,b] of [['150s','180s'],['180s','150s'],['150s','240s']])assert.equal(recoveryContext(ex(a),ex(b)).allowProgression,true);
 for(const [a,b] of [['60s','30s'],['180s','90s'],['180s',''],['180s','0s']])assert.equal(recoveryContext(ex(a),ex(b)).allowProgression,false);
 assert.equal(recoveryContext(ex(),ex('150s',{groupType:'triset'})).allowProgression,false);
});
test('four kg becomes a provisional five kg, respecting an explicitly declared microstep or inventory',()=>{
 const source=ex(),future=ex('180s',{loggedSets:[{},{}]});
 const p=workingProposal(future,0,{exposures:[source]});
 assert.equal(p.weight,5);assert.equal(p.reps,10);assert.equal(p.verified,false);
 assert.match(p.reason,/salto di carico/);assert.equal(recommendNextSessionLoad(source).suggestedWeight,5);
 const micro=nextBlockDecision(source,0,{machine:0.25});assert.equal(micro.weight,4.25);
 const owned=nextBlockDecision(source,0,{availableLoads:{machine:[4,5]}});assert.equal(owned.weight,5);assert.equal(owned.verified,true);
 const small=nextBlockDecision(ex('150s',{loggedSets:[done(15,40),done(15,40)]}),0,{machine:1});assert.equal(small.reps,14);
});
test('near upper bound targets all remaining sets; higher RPE or incomplete evidence cannot authorize progression',()=>{
 const source=ex('150s',{reps:'8-10',loggedSets:[done(10,40,8),done(9,40,8),done(9,40,8)],sets:[{},{},{}],targetRpe:8});
 assert.deepEqual([0,1,2].map(i=>nextBlockDecision(source,i).reps),[10,10,10]);
 source.loggedSets[2].rpe=9;assert.equal(nextBlockDecision(source,0),null);
 source.loggedSets[2]={};assert.equal(nextBlockDecision(source,0),null);
});
test('evidence prefers similar recovery and matches heavy top sets separately from back-offs',()=>{
 const target=ex('180s',{reps:'4-6',targetRpe:8,sets:[{role:'top',targetReps:'4-6',targetRpe:8}],loggedSets:[{}]});
 const unrelated=ex('60s',{reps:'12-15',loggedSets:[done(15,30)],sets:[{}]});
 const heavy=ex('150s',{reps:'4-6',targetRpe:8,sets:[{role:'top',targetReps:'4-6',targetRpe:8}],loggedSets:[done(6,80,8)]});
 assert.equal(selectEvidence(target,0,[unrelated,heavy])[0].exercise,heavy);
 const current=ex('180s',{loggedSets:[{},{}]});
 const different=ex('60s');assert.equal(selectEvidence(current,0,[{exercise:different,date:'2026-10-20'},{exercise:ex('150s'),date:'2026-10-20'}])[0].exercise.recupero,'150s');
});
test('richer UI is read-only and repeated recalculation across mesocycles adds no events or bytes',()=>{
 const mesos=Array.from({length:8},()=>({weeks:[{weekNumber:1,days:[{completed:true,exercises:[ex()]}]},{weekNumber:2,days:[{exercises:[ex('180s',{loggedSets:[{},{}]})]}]}]}));
 const data={athlete:{},history:{years:{2026:{mesocycles:mesos}}}};
 for(let i=0;i<mesos.length;i++)reconcileTrainingPlan(data,{year:2026,mesoIndex:i,now:'2026-11-02T12:00:00Z'});
 const serialized=JSON.stringify(data),events=mesos.map(m=>m.coachAdjustments.length);
 for(let n=0;n<10;n++)for(let i=0;i<mesos.length;i++){
  const next=mesos[i].weeks[1].days[0].exercises[0];
  const text=exerciseCoachModel(next).updates.map(u=>u.text).join(' ');
  assert.match(text,/RPE 8,5/);assert.match(text,/riduci il carico/);
  assert.equal(reconcileTrainingPlan(data,{year:2026,mesoIndex:i}),false);
 }
 assert.equal(JSON.stringify(data),serialized);assert.deepEqual(mesos.map(m=>m.coachAdjustments.length),events);
});

test('a more recent difficult session cannot be displaced by older easier work with matching rest',()=>{
 const latest=ex('',{reps:'6-8',targetRpe:8,loggedSets:[done(6,80,9.5),done(6,80,9.5)]});
 const old=ex('180s',{reps:'6-8',targetRpe:8,loggedSets:[done(8,70,8),done(8,70,8)]});
 const target=ex('180s',{reps:'6-8',targetRpe:8,loggedSets:[{},{}]});
 const p=workingProposal(target,0,{exposures:[{exercise:latest,date:'2026-10-20'},{exercise:old,date:'2025-10-20'}]});
 assert.equal(p.weight,80);assert.equal(p.kind,'history');
});
