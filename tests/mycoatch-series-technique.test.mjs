import test from 'node:test';
import assert from 'node:assert/strict';
import {specialSeries,hasDropPrescription,needsDropScope} from '../mycoatch/seriesTechnique.js';
import {setPrescription} from '../mycoatch/setPrescription.js';
import {assessExerciseLive,validateCompletedSet} from '../mycoatch/liveCoach.js';
import {workingProposal,recoveryKey} from '../mycoatch/protocolLoad.js';
import {getSetPrefill} from '../js/setPrefill.js';
import {exerciseCoachModel} from '../mycoatch/coachCommunication.js';
import {previousExercisePerformance} from '../mycoatch/liveHistory.js';
const done=(extra={})=>({weight:20,reps:10,rpe:8,isLocked:true,...extra});
const lift=(extra={})=>({name:'Curl con Manubri',reps:'10-12',rpe:8,targetRpe:8,sets:[{},{},{}],loggedSets:[{},{},{}],...extra});
const lastDrop=(extra={})=>lift({isDropset:true,dropSetScope:'last',...extra});
test('last-set drop scopes agree across prescription and UI; normal rows retain e1RM',()=>{
 const ex=lastDrop({loggedSets:[done(),{},{}]});
 assert.deepEqual([0,1,2].map(i=>hasDropPrescription(ex,i)),[false,false,true]);
 assert.deepEqual([0,1,2].map(i=>setPrescription(ex,i).special),[false,false,true]);
 assert.notEqual(assessExerciseLive(ex).e1rm,null);
});
test('explicit per-row drops do not contaminate other rows; ambiguous scope remains conservative',()=>{
 const ex=lift({sets:[{},{},{intensityTechnique:'DROP_SET'}]});
 assert.deepEqual([0,1,2].map(i=>specialSeries(ex,i)),[false,false,true]);
 assert.equal(needsDropScope(lift({groupType:'dropset'})),true);
 assert.equal(specialSeries(lift({isDropset:true}),0),true);
});
test('actual structured drop never produces e1RM or an automatic load proposal',()=>{
 const ex=lastDrop({loggedSets:[{}, {},done({intensityTechnique:'DROP_SET',dropSegments:[{weight:15,reps:8,rpe:10}]})]});
 const a=assessExerciseLive(ex);assert.equal(a.e1rm,null);assert.equal(a.code,'special_technique');
 assert.equal(workingProposal(ex,2,{exposures:[lift({loggedSets:[done(),done(),done()]})]}),null);
});
test('base effort warning remains visible without interpreting final-drop RPE as base effort',()=>{
 const ex=lift({loggedSets:[done({rpe:10,intensityTechnique:'DROP_SET',dropSegments:[{weight:15,reps:8,rpe:10}]}),{},{}]});
 let a=assessExerciseLive(ex);assert.equal(a.code,'special_effort');assert.equal(a.suggestedWeight,null);assert.equal(a.e1rm,null);
 assert.match(exerciseCoachModel(ex,{liveAdvice:a}).updates[0].text,/serie base/);
 ex.loggedSets[0].rpe=8;a=assessExerciseLive(ex);assert.equal(a.code,'special_technique');
 assert.deepEqual(exerciseCoachModel(ex,{liveAdvice:a}).updates,[]);
});
test('missing base RPE is actionable and planned RPE10 does not become a reduction warning',()=>{
 const ex=lift({loggedSets:[done({rpe:'',dropSegments:[{weight:15,reps:8}]}),{},{}]});
 let a=assessExerciseLive(ex);assert.equal(a.code,'missing_rpe');assert.equal(exerciseCoachModel(ex,{liveAdvice:a}).updates.length,1);
 ex.targetRpe=10;ex.rpe=10;ex.loggedSets[0].rpe=10;
 a=assessExerciseLive(ex);assert.equal(a.code,'special_technique');assert.equal(a.suggestedWeight,null);
});
test('composite legacy reps do not pretend to measure base-only effort',()=>{
 const ex=lift({loggedSets:[done({reps:'10+8+6',rpe:10,intensityTechnique:'DROP_SET'}),{},{}]});
 const a=assessExerciseLive(ex);assert.equal(a.code,'special_technique');assert.equal(a.e1rm,null);assert.equal(a.suggestedWeight,null);
});
test('skipped drop with no segments is an ordinary performed base; real segments win over stale skipped flag',()=>{
 const ex=lastDrop({loggedSets:[{},{},done({dropSkipped:true,dropSegments:[]})]});
 assert.equal(specialSeries(ex,2),false);assert.notEqual(assessExerciseLive(ex).e1rm,null);
 ex.loggedSets[2].dropSegments=[{weight:15,reps:8}];assert.equal(specialSeries(ex,2),true);
});
test('rest-pause numeric and composite recordings never estimate strength or mention a superserie',()=>{
 for(const reps of [10,'10+4+3']){
  const ex=lift({groupType:'restpause',loggedSets:[done({reps,rpe:10}),{},{}]});
  assert.equal(validateCompletedSet(ex.loggedSets[0],ex,ex.loggedSets[0]).ok,true);
  const a=assessExerciseLive(ex);assert.equal(a.e1rm,null);assert.equal(a.suggestedWeight,null);assert.doesNotMatch(a.message,/superserie|triset/);
 }
});
test('drop and rest-pause source rows cannot supply ordinary-load estimates or prefills',()=>{
 for(const extra of [{groupType:'restpause'},{isDropset:true,dropSetScope:'all'}]){
  const old=lift({...extra,loggedSets:[done({weight:40}),done({weight:40}),done({weight:40})]});
  const ex=lift({kgMin:20,kgMax:20});
  assert.equal(workingProposal(ex,0,{exposures:[old]}).weight,20);
  assert.equal(getSetPrefill(ex,0,{previousExercise:old}).weight,'20');
 }
});
test('live historical comparison excludes rest-pause e1RM too',()=>{
 const old=lift({groupType:'restpause',loggedSets:[done(),{},{}]});const current={exercises:[]};
 const data={history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days:[{exercises:[old]},current]}]}]}}}};
 assert.equal(previousExercisePerformance(data,current,old).e1rm,null);
});
test('equivalent recovery units allow progression; actual changes explain adaptation without claiming no load increase',()=>{
 assert.equal(recoveryKey({recupero:'120s'}),recoveryKey({recupero:'2 min'}));
 assert.equal(recoveryKey({recupero:'2,5 minuti'}),'150');assert.notEqual(recoveryKey({}),recoveryKey({recupero:'0s'}));
 const old=lift({recupero:'120s',loggedSets:[done({reps:12}),done({reps:12}),done({reps:12})]});
 let p=workingProposal(lift({recupero:'2 min'}),0,{exposures:[old]});assert.equal(p.kind,'increase_load');assert.doesNotMatch(p.reason,/Recupero diverso/);
 p=workingProposal(lift({recupero:'90s',targetRpe:9}),0,{exposures:[old]});assert.equal(p.kind,'estimated_history');assert.match(p.reason,/target attuali/);
});
test('all historical exposures used in the estimate are visible, without duplicating the already shown one',()=>{
 const source=n=>({year:2026,mesoIndex:0,weekNumber:n,dayIndex:0,exerciseIndex:0});
 const p={kind:'estimated_history',weight:21,reps:10,reason:'Stima.',basedOn:[3,2,1].map(n=>({source:source(n),weight:20,reps:10}))};
 const ex=lift({coachSetProposals:[p,p,p]});const before=structuredClone(ex);
 const m=exerciseCoachModel(ex,{historySource:source(3)});assert.equal(m.references.length,2);assert.deepEqual(ex,before);
});

test('structured-drop base below minimum remains actionable without inventing a reduction',()=>{
 const ex=lift({loggedSets:[done({reps:7,dropSegments:[{weight:15,reps:8}]}),{},{}]});
 const a=assessExerciseLive(ex);assert.equal(a.code,'special_reps');assert.equal(a.suggestedWeight,null);
 assert.match(exerciseCoachModel(ex,{liveAdvice:a}).updates[0].text,/sotto il minimo/);
});
test('session feedback compares structured base but does not compare composite effort against base target',async()=>{
 const {buildSessionExerciseFeedback}=await import('../mycoatch/sessionFeedback.js');
 let ex=lift({loggedSets:[done({reps:7,dropSegments:[{weight:15,reps:8}]}),{},{}]});
 assert.match(buildSessionExerciseFeedback({exercises:[ex]})[0].messages.join(' '),/Reps sotto/);
 ex=lift({loggedSets:[done({reps:'10+8+6',rpe:10,intensityTechnique:'DROP_SET'}),{},{}]});
 const msg=buildSessionExerciseFeedback({exercises:[ex]})[0].messages.join(' ');
 assert.doesNotMatch(msg,/Sforzo superiore/);assert.match(msg,/non confrontato/);
});

test('changing technique scope ignores stale ordinary proposals before reconciliation',()=>{
 const p={kind:'increase_load',weight:25,reps:10,reason:'Aumento.',basedOn:[{weight:20,reps:10}]};
 const ex=lastDrop({dropSetScope:'all',kgMin:20,kgMax:20,loggedSets:[done({rpe:10,dropSegments:[{weight:15,reps:8}]}),{},{}],coachSetProposals:[null,p,p]});
 const a=assessExerciseLive(ex);assert.equal(a.suggestedWeight,null);
 assert.equal(getSetPrefill(ex,1).weight,'20');
 assert.doesNotMatch(exerciseCoachModel(ex,{liveAdvice:a}).updates.map(u=>u.text).join(' '),/Ho aumentato/);
});
