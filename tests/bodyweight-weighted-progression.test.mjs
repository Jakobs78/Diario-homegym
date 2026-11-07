import test from 'node:test';
import assert from 'node:assert/strict';
import {workingProposal} from '../mycoatch/protocolLoad.js';
import {recommendNextExposure} from '../mycoatch/nextExposure.js';
import {exerciseCoachModel} from '../mycoatch/coachCommunication.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
import {getSetPrefill} from '../js/setPrefill.js';
import {exerciseLoadSummary} from '../js/exerciseLoadSummary.js';
import {assessExerciseLive} from '../mycoatch/liveCoach.js';
const done=(kg=5,reps=10,rpe=8,extra={})=>({weight:kg,reps,rpe,isLocked:true,completed:true,...extra});
const lift=(logs=[{},{},{}],extra={})=>({name:'Trazioni alla Sbarra (Pull-up)',setsCount:3,sets:[{},{},{}],loggedSets:logs,reps:'8-10',targetRpe:8,kgMin:0,kgMax:0,rest:'120s',...extra});
const source=(kg=5,reps=10,rpe=8)=>lift([done(kg,reps,rpe),done(kg,reps,rpe),done(kg,reps,rpe)]);

test('completed unweighted sets invite first ballast without inventing its kg or changing recorded sets',()=>{
 const old=source(0),ex=lift(),before=JSON.stringify(old);
 ex.coachSetProposals=[0,1,2].map(i=>workingProposal(ex,i,{exposures:[old]}));
 assert.ok(ex.coachSetProposals.every(p=>p.kind==='bodyweight_add_load'&&p.weight===0));
 const model=exerciseCoachModel(ex);assert.equal(model.updates.length,1);
 assert.match(model.updates[0].text,/scegli il primo peso.*kg aggiunti/);assert.equal(JSON.stringify(old),before);
});
test('actual ballast overrides an old zero prescription and progresses by the configured external increment',()=>{
 for(const name of ['Trazioni alla Sbarra (Pull-up)','Dip alle Parallele (sovraccarico)','Push-up a Terra','Calf Raise Monopodalico']){
  const old=source(),ex=lift();old.name=ex.name=name;
  const p=workingProposal(ex,0,{exposures:[old],equipment:{loadingSteps:{bodyweight:2.5}}});
  assert.deepEqual([p.weight,p.reps,p.kind],[7.5,8,'increase_load']);assert.equal(p.stableE1rm,null);assert.equal(p.range,null);
  ex.coachSetProposals=[p,p,p];const entry=exerciseCoachModel(ex).updates[0];
  assert.match(entry.action,/Ho aumentato la zavorra.*7,5 kg di zavorra/);assert.doesNotMatch(entry.text,/salto di peso è consistente/);
  assert.equal(exerciseLoadSummary(ex,[p,p,p]).text,'Zavorra proposta: 7,5 kg');
  const legacy=recommendNextExposure(old,lift([{}, {},{}],{name}),{loadingSteps:{bodyweight:2.5}});
  assert.equal(legacy.weight,p.weight);assert.deepEqual(legacy.reps,[8,8,8]);
 }
});
test('weight stays calibrated until every ordinary set meets both reps and RPE conditions',()=>{
 for(const last of [done(5,9),done(5,10,9),done(5,10,''),done(5,10,8,{isLocked:false,completed:false}),done(7,10)]){
  const old=lift([done(),done(),last]);const p=workingProposal(lift(),0,{exposures:[old]});
  assert.equal(p.weight,5);assert.notEqual(p.kind,'increase_load');
 }
 for(const options of [{readiness:{allowIncrease:false}},{allowProgression:false}])assert.equal(workingProposal(lift(),0,{exposures:[source()],...options}).weight,5);
 for(const extra of [{isDeload:true},{rest:'30s'}])assert.equal(workingProposal(lift(undefined,extra),0,{exposures:[source()]}).weight,5);
 const painful=source();painful.loggedSets[0].coachReview={reason:'pain'};
 assert.notEqual(workingProposal(lift(),0,{exposures:[painful]}).kind,'increase_load');
});
test('reps can progress first and the actually chosen same-day weight is retained',()=>{
 const old=source(5,9),p=workingProposal(lift(),0,{exposures:[old]});assert.equal(p.weight,5);assert.equal(p.reps,10);assert.equal(p.kind,'build_reps');
 const current=lift([done(6,8),{},{}]);assert.equal(workingProposal(current,1,{exposures:[source()]}).weight,6);
 current.loggedSets[0]=done(0,8);assert.equal(workingProposal(current,1,{exposures:[source()]}).weight,0);
 assert.equal(assessExerciseLive(source()).e1rm,null);
});
test('unknown and non-loadable bodyweight movements do not receive automatic ballast',()=>{
 for(const extra of [{name:'Hamstring Walkout a Corpo Libero'},{name:'Reverse Crunch su Panca'},{name:'Movimento personale',equipment:'bodyweight'}]){
  const old=lift([done(0),done(0),done(0)],extra),ex=lift(undefined,extra),p=workingProposal(ex,0,{exposures:[old]});
  assert.equal(p.weight,0);assert.notEqual(p.kind,'increase_load');assert.notEqual(p.kind,'bodyweight_add_load');
 }
});
test('resuming does not compound the increase; manual ballast and completed historical results remain unchanged',()=>{
 const old=source(),current=lift(),data={athlete:{loadingSteps:{bodyweight:1}},history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[old]}]},{weekNumber:2,days:[{dayNumber:1,isPaused:true,accumulatedSeconds:100,exercises:[current]}]}]}]}}}};
 const context={year:2026,mesoIndex:0},before=JSON.stringify(old.loggedSets);
 reconcileTrainingPlan(data,context);assert.equal(getSetPrefill(current,0).weight,'6');
 const saved=JSON.stringify(data);assert.equal(reconcileTrainingPlan(data,context),false);assert.equal(JSON.stringify(data),saved);
 current.loggedSets[0]={weight:7,reps:8,rpe:8};reconcileTrainingPlan(data,context);assert.equal(getSetPrefill(current,0).weight,'7');
 current.loggedSets[0]=done(7,8);reconcileTrainingPlan(data,context);assert.equal(getSetPrefill(current,1).weight,'7');assert.equal(JSON.stringify(old.loggedSets),before);
});
