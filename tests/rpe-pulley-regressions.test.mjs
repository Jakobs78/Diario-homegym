import test from 'node:test';
import assert from 'node:assert/strict';
import {workingProposal,nextBlockDecision} from '../mycoatch/protocolLoad.js';
import {exerciseCoachModel} from '../mycoatch/coachCommunication.js';
import {EXERCISE_DATABASE} from '../mycoatch/exercisesDB.js';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
import {normalizeSelectionPreferences,isExerciseAvailable} from '../mycoatch/exerciseSelection.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
import {getSetPrefill} from '../js/setPrefill.js';
import {trainingExposures} from '../mycoatch/trainingHistory.js';
import {assessExerciseLive} from '../mycoatch/liveCoach.js';
const done=(reps=10,rpe=9)=>({weight:50,reps,rpe,isLocked:true,completed:true});
const lift=(logs=[{},{},{}],extra={})=>({name:'Panca Piana con Bilanciere',reps:'8-10',targetRpe:8,rest:'120s',sets:[{},{},{}],loggedSets:logs,...extra});

test('upper-range sets at or below target RPE increase load, with reason before emphasized action',()=>{
 for(const rpe of [7,8]){
  const source=lift([done(10,rpe),done(10,rpe),done(10,rpe)]),ex=lift();
  assert.ok(nextBlockDecision(source,0).weight>50);
  ex.coachSetProposals=[0,1,2].map(i=>workingProposal(ex,i,{exposures:[source]}));
  const entry=exerciseCoachModel(ex).updates[0];
  assert.match(entry.lead,/^Visto che.*tutte le serie precedenti.*RPE previsto, $/);
  assert.match(entry.action,/^Ho aumentato il carico alle serie 1, 2, 3: /);
  assert.equal(entry.text,entry.lead+entry.action+entry.detail);
  assert.doesNotMatch(entry.text,/Raggiunto il limite alto/);
 }
});
test('same-day and mixed-evidence increases never claim every previous set met the limit',()=>{
 const ex=lift([done(10,7),{},{}]);
 ex.coachSetProposals=[null,workingProposal(ex,1),workingProposal(ex,2)];
 let entry=exerciseCoachModel(ex).updates[0];
 assert.match(entry.lead,/serie appena conclusa/);assert.doesNotMatch(entry.text,/tutte le serie precedenti/);
 const source=lift([done(11,8),done(11,8),done(9,8)]),next=lift();
 next.coachSetProposals=[0,1,2].map(i=>workingProposal(next,i,{exposures:[source]}));
 entry=exerciseCoachModel(next).updates[0];
 assert.match(entry.lead,/Più serie hanno superato/);assert.doesNotMatch(entry.text,/tutte le serie precedenti/);
});
test('10 reps at RPE 9 first proposes 9 at the exact same kg, now and next exposure',()=>{
 const source=lift([done(),done(),done()]),before=JSON.stringify(source);
 assert.equal(nextBlockDecision(source,0),null);
 for(const [current,index,options,kind] of [[lift(),0,{exposures:[source]},'reduce_reps_history'],[lift([done(),{},{}]),1,{},'reduce_reps_today']]){
  const p=workingProposal(current,index,{...options,equipment:{availableLoads:{barbell:[45,55]}}});
  assert.equal(p.weight,50);assert.equal(p.reps,9);assert.equal(p.kind,kind);
  current.coachSetProposals=[0,1,2].map(i=>i===index?p:null);
  const entry=exerciseCoachModel(current).updates[0];
  assert.match(entry.text,/Mantieni il carico.*50 kg × 9 reps/);
  assert.doesNotMatch(entry.text,/Ho ridotto il carico|Ho aumentato il carico/);
  assert.match(entry.text,/Verifica lo sforzo effettivo/);
 }
 assert.equal(JSON.stringify(source),before);
});
test('fewer reps are tried progressively, while hard work at/below the lower bound can lower kg',()=>{
 for(const [reps,target] of [[10,9],[9,8]]){
  const p=workingProposal(lift([done(reps),{},{}]),1);assert.equal(p.weight,50);assert.equal(p.reps,target);
 }
 for(const reps of [8,7]){
  const p=workingProposal(lift([done(reps),{},{}]),1);assert.ok(p.weight<50);assert.equal(p.reps,8);assert.equal(p.kind,'reduce_today');
 }
 for(const rpe of [null,8,8.5]){
  const p=workingProposal(lift([done(10,rpe),{},{}]),1);assert.equal(p.weight,50);assert.equal(p.reps,10);
 }
 assert.equal(workingProposal(lift([{...done(),isLocked:false,completed:false},{},{}]),1).kind,'prescription');
 const special=lift([done(),{},{}],{isDropset:true});assert.equal(workingProposal(special,1),null);
});
test('resume/recalculation preserves manual reps and confirmed results while updating untouched proposals',()=>{
 const old=lift([done(),done(),done()]),current=lift([{reps:10},{},{}]);
 const data={athlete:{},history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[old]}]},{weekNumber:2,days:[{dayNumber:1,isPaused:true,accumulatedSeconds:1000,exercises:[current]}]}]}]}}}};
 const original=JSON.stringify(old.loggedSets);
 reconcileTrainingPlan(data,{year:2026,mesoIndex:0});
 assert.equal(getSetPrefill(current,0).reps,'10');assert.equal(getSetPrefill(current,1).reps,'9');
 const saved=JSON.stringify(data);assert.equal(reconcileTrainingPlan(data,{year:2026,mesoIndex:0}),false);assert.equal(JSON.stringify(data),saved);
 current.loggedSets[0]=done(9,8);reconcileTrainingPlan(data,{year:2026,mesoIndex:0});
 assert.equal(getSetPrefill(current,1).reps,'9');assert.equal(JSON.stringify(old.loggedSets),original);
});
test('live warning uses the protocol target without a second kg proposal or repeated explanation',()=>{
 for(const reps of [10,8]){
  const ex=lift([done(reps,9.5),{},{}]);
  ex.coachSetProposals=[null,workingProposal(ex,1),workingProposal(ex,2)];
  const advice=assessExerciseLive(ex);
  assert.equal(advice.suggestedWeight,ex.coachSetProposals[1].weight);
  assert.doesNotMatch(advice.message,/Se la tecnica lo richiede|47.5 kg/);
  const model=exerciseCoachModel(ex,{liveAdvice:advice});
  const warning=model.updates.find(u=>!u.change);
  assert.equal(warning.text,'RPE molto alto: completa il recupero e valuta se mantenere la qualità della prossima serie.');
  if(reps===10)assert.ok(model.updates.every(u=>!u.change||u.change.weight===50));
 }
});
test('both pulley variants require low cable and their own attachment, with distinct history identities',()=>{
 const triangle=EXERCISE_DATABASE.find(e=>e.name==='Pulley Basso con Triangolo');
 const u=EXERCISE_DATABASE.find(e=>e.name==='Pulley Basso con Barra a U');
 assert.notEqual(triangle.id,u.id);assert.notEqual(canonicalExerciseKey(triangle.name),canonicalExerciseKey('pulley barra a u'));
 assert.equal(canonicalExerciseKey(u.name),canonicalExerciseKey('pulley barra a u'));
 assert.deepEqual(u.muscleProfile,triangle.muscleProfile);
 for(const e of [triangle,u])for(const cableSetup of ['none','high_only','low_only','single_high_low','dual_adjustable']){
  const preferences=normalizeSelectionPreferences({availableEquipment:['cable'],availableAccessories:['triangle_handle','u_bar'],cableSetup});
  assert.equal(isExerciseAvailable(e,preferences),!['none','high_only'].includes(cableSetup),e.name+': '+cableSetup);
  assert.equal(isExerciseAvailable(e,{...preferences,availableAccessories:[]}),false);
 }
 const old=lift([done(),done(),done()],{name:triangle.name}),next=lift([],{name:u.name});
 const data={history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days:[{exercises:[old]}]}]}]}}}};
 assert.deepEqual(trainingExposures(data,{year:2026,mesoIndex:0,weekNumber:7,dayIndex:0},next),[]);
 assert.equal(workingProposal(next,0,{exposures:[],equipment:{}}).weight,null);
});
