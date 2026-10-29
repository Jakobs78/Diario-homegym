import {analyzeUserHistory} from '../mycoatch/autoregulation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {workingProposal} from '../mycoatch/protocolLoad.js';
import {exerciseCoachModel} from '../mycoatch/coachCommunication.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
import {validateCompletedSet,assessExerciseLive} from '../mycoatch/liveCoach.js';
import {getSetPrefill} from '../js/setPrefill.js';
import {trainingExposures} from '../mycoatch/trainingHistory.js';
import {equipmentCategory,resolveNearbyLoad} from '../mycoatch/loadProposal.js';
import {recommendNextExposure} from '../mycoatch/nextExposure.js';
import {analyzeTrainingHistory} from '../mycoatch/historyInsights.js';
const done=(kg,reps,rpe=8)=>({weight:String(kg),reps:String(reps),rpe:String(rpe),isLocked:true,completed:true});
const exercise=(kg=0,reps=[6,8])=>({name:'Hamstring Walkout a Corpo Libero',setsCount:2,reps:'6-10',rpe:8.5,restTime:'90s',loggedSets:reps.map(r=>done(kg,r))});
const upcoming=()=>({...exercise(),loggedSets:[{},{ }]});
const source=ex=>[{exercise:ex,source:{year:2026,mesoIndex:0,weekNumber:1,dayIndex:0,exerciseIndex:0}}];

test('zero is valid for catalog, explicit equipment and confirmed aliases; not for weighted lifts',()=>{
 for(const ex of [exercise(),{name:'Nome personale',catalogMapping:{confirmed:true,name:'Hamstring Walkout a Corpo Libero'}},{name:'Movimento personalizzato',equipment:'bodyweight'}])assert.equal(validateCompletedSet(done(0,8),ex).ok,true);
 assert.equal(validateCompletedSet(done(0,8),{name:'Panca Piana con Bilanciere'}).ok,false);
 assert.equal(validateCompletedSet(done('',8),exercise()).ok,false);
 assert.equal(equipmentCategory(exercise()),'bodyweight');assert.equal(resolveNearbyLoad(exercise(),0).reason,'bodyweight_no_inventory');
});
test('screenshot case: historical dummy 1kg gives 0kg and 7/8 reps without inventory or max estimates',()=>{
 const old=exercise(1),next=upcoming(),before=JSON.stringify(old),equipment={platePairs:{2.5:2},barbellWeight:20};
 next.coachSetProposals=[0,1].map(i=>workingProposal(next,i,{exposures:source(old),equipment}));
 assert.deepEqual(next.coachSetProposals.map(p=>[p.weight,p.reps]),[[0,7],[0,8]]);
 assert.ok(next.coachSetProposals.every(p=>p.stableE1rm===null&&p.range===null&&!/inventario|massimale|componibile/.test(p.reason)));
 const model=exerciseCoachModel(next);assert.equal(model.updates.length,1);assert.equal(model.updates[0].severity,'info');assert.match(model.updates[0].text,/7 reps a corpo libero \(0 kg\)/);
 assert.equal(JSON.stringify(old),before);
});
test('confirmed zero supplies historical exposures, prefills and live validation without inventing strength',()=>{
 const old=exercise(),next=upcoming();const data={history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days:[{exercises:[old]}]},{weekNumber:2,days:[{exercises:[next]}]}]}]}}}};
 const context={year:2026,mesoIndex:0,weekNumber:2,dayIndex:0};
 assert.equal(trainingExposures(data,context,next).length,1);reconcileTrainingPlan(data,context);
 assert.equal(getSetPrefill(next,0).weight,'0');assert.equal(getSetPrefill(next,0).reps,'7');
 assert.equal(assessExerciseLive(old).e1rm,null);
 const report=analyzeTrainingHistory(data);assert.ok(Object.values(report.byExercise).every(ex=>ex.exposures.every(p=>p.e1rm===null)));
 const legacy=upcoming();assert.equal(getSetPrefill(legacy,0,{previousExercise:old}).weight,'0');assert.equal(recommendNextExposure(old,legacy).weight,0);
});
test('bodyweight at top of range never automatically adds load; missing RPE and changed recovery veto rep increases',()=>{
 for(const r of [[10,10],[20,20]]){const old=exercise(0,r),next=upcoming();if(r[0]===20){old.reps=next.reps='15-20';}assert.equal(workingProposal(next,0,{exposures:source(old)}).weight,0);assert.notEqual(workingProposal(next,0,{exposures:source(old)}).kind,'increase_load');}
 const old=exercise();old.loggedSets[1].rpe='';assert.equal(workingProposal(upcoming(),0,{exposures:source(old)}).reps,6);
 old.loggedSets[1].rpe='8';const changed=upcoming();changed.restTime='180s';assert.equal(workingProposal(changed,0,{exposures:source(old)}).reps,6);
 assert.equal(workingProposal(upcoming(),0,{exposures:source(old),readiness:{allowIncrease:false}}).reps,6);
});
test('manual entries, confirmed history and explicit weighted prescriptions remain intact',()=>{
 const old=exercise(1),next=upcoming();next.coachSetProposals=[workingProposal(next,0,{exposures:source(old)})];next.loggedSets[0]={weight:'2',reps:'9',rpe:'8'};
 assert.equal(getSetPrefill(next,0).weight,'2');assert.equal(getSetPrefill(next,0).reps,'9');
 next.kgMin=5;assert.equal(workingProposal(next,0,{exposures:source(old)}).weight,5);
 const dip={...exercise(10),name:'Dip alle Parallele (sovraccarico)'};assert.equal(assessExerciseLive(dip).e1rm,null);assert.equal(workingProposal({...dip,loggedSets:[{},{}]},0,{exposures:source(dip)}).weight,10);
});
test('inventory warnings repeat once, preserving distinct numerical changes and ordinary info severity',()=>{
 const reason='Carico adattato. Carico teorico non componibile con l’inventario dichiarato.';
 const p=weight=>({weight,reps:6,kind:'estimated_history',reason,basedOn:[{weight:80,reps:6}]});
 const ex={...upcoming(),name:'Panca Piana con Bilanciere',coachSetProposals:[p(81),p(80)]};
 const m=exerciseCoachModel(ex);assert.equal(m.updates.filter(x=>/non componibile/.test(x.text)).length,1);assert.equal(m.updates.filter(x=>x.severity==='caution').length,1);
 assert.ok(m.updates.some(x=>/Ho adattato/.test(x.text)&&x.severity==='info'));
});

test('legacy progress API accepts zero and does not infer a max or load increase from added weight alone',()=>{
 for(const kg of [0,10]){
  const result=analyzeUserHistory([1,2].map(week=>({...exercise(kg,[10,10]),weekId:'2026/0/'+week})));
  assert.ok(result);assert.equal(result.currentE1RM,null);assert.notEqual(result.action,'INCREMENT_LOAD');assert.equal(result.progression.readyForLoad,false);
 }
});
