import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePlannedLoad,recommendNextSessionLoad} from '../mycoatch/loadProposal.js';
import {evaluateExerciseProgression} from '../mycoatch/progressionPolicy.js';
import {planAdaptiveDecisions} from '../mycoatch/adaptiveDecisions.js';
import {generateSmartMesocycle} from '../mycoatch/engine.js';
import {MyCoatch} from '../mycoatch/index.js';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
const name='Panca Piana con Bilanciere';
const lift={name,equipment:'barbell'};
const stock={barbell:2.5,barbellWeight:20,plateInventories:{'50':{'20':1,'5':1},'29':{'1.25':1}},barbellAssignments:{[canonicalExerciseKey(name)]:{weight:20,diameter:'50'}}};
const week=(id,extra={})=>({weekId:id,targetRpe:8,repRange:{min:6,max:8},completedSets:3,plannedSets:3,
 allStraightSets:true,uniformWeight:true,workingKg:70,topKg:70,
 rpeOvershoot:true,allRepsBelowMin:true,...extra});

test('inventario dichiarato vincola i carichi, anche quando è vuoto',()=>{
 assert.deepEqual(resolvePlannedLoad(lift,70,stock),{weight:70,verified:true});
 assert.equal(resolvePlannedLoad(lift,72.5,stock).weight,null);
 assert.equal(resolvePlannedLoad(lift,10,stock).weight,null);
 assert.equal(resolvePlannedLoad(lift,20,{...stock,plateInventories:{'50':{}}}).weight,20);
 assert.equal(resolvePlannedLoad(lift,25,{...stock,plateInventories:{'50':{}}}).weight,null);
 assert.equal(resolvePlannedLoad({equipment:'dumbbell'},12.5,stock).verified,false);
 assert.equal(resolvePlannedLoad(lift,70,{}).verified,false);
});
test('progressione storica valida non inventa i dischi per il prossimo incremento',()=>{
 const report={byExercise:{bench:{...lift,lastKg:70,readyForLoad:true,status:'stable'}},byMuscle:{}};
 const result=planAdaptiveDecisions(report,{loadingSteps:stock}).byExercise.bench;
 assert.equal(result.action,'maintain');assert.equal(result.plannedKg,70);
 assert.match(result.reason,/dischi disponibili/);
});
test('due settimane difficili richiedono carichi, target e serie confrontabili',()=>{
 assert.equal(evaluateExerciseProgression([week('1'),week('2')]).fatigueConcern,true);
 for(const change of [{workingKg:90},{targetRpe:7},{repRange:{min:12,max:15}},
   {completedSets:1},{allStraightSets:false},{uniformWeight:false}]){
  const p=evaluateExerciseProgression([week('1'),week('2',change)]);
  assert.equal(p.fatigueConcern,false,JSON.stringify(change));
  assert.equal(p.repeatedBelowMin,false,JSON.stringify(change));
 }
});
test('gli scarichi strutturati escludono la proposta di aumento da serie normali',()=>{
 const set={weight:70,reps:8,rpe:6,isLocked:true,dropSegments:[{weight:50,reps:6}]};
 assert.equal(recommendNextSessionLoad({...lift,reps:'6-8',rpe:7,loggedSets:[set,set]}),null);
});
test('scheda generata: carico impossibile vuoto e spiegato, nessuna mutazione dello storico',()=>{
 const key=canonicalExerciseKey(name);
 const analysis={byExercise:{[key]:{lastWorkingKg:72.5,lastKg:72.5}},byMuscle:{},decisions:{byExercise:{},byMuscle:{}}};
 const before=JSON.stringify(analysis);
 const meso=generateSmartMesocycle({durationWeeks:4,daysPerWeek:3,maxSessionMinutes:75,
 focus:'hybrid',userAge:35,equipmentSettings:stock},analysis,null);
 const benches=meso.weeks.flatMap(w=>w.days.flatMap(d=>d.exercises)).filter(e=>e.name===name);
 assert.ok(benches.length);
 for(const e of benches){
  assert.equal(e.kgMin,'');assert.ok(e.sets.every(s=>s.targetKg===''));
  assert.match(e.notes,/non è componibile/);assert.doesNotMatch(e.notes,/WARM-UP AUTO/);
 }
 assert.equal(JSON.stringify(analysis),before);
});
test('generazione senza nuovi obiettivi usa l’inventario dell’atleta corrente',()=>{
 const history={history:{years:{2026:{mesocycles:[{weeks:[0,1].map(i=>({
  weekNumber:i+1,isDeloadWeek:false,days:[{dayNumber:1,exercises:[{
   ...lift,reps:'6-8',targetRpe:8,set:'3 set',loggedSets:[0,1,2].map(()=>({
    weight:70,reps:7,rpe:8,isLocked:true,
    completedAt:new Date(Date.now()-(1-i)*7*86400000).toISOString()
   }))
  }]}]
 }))}]}}}};
 const config={durationWeeks:4,daysPerWeek:3,maxSessionMinutes:75,focus:'hybrid',userAge:35};
 const first=MyCoatch.generateNextFromHistory({...history,athlete:{platePairs:{}}},config);
 const second=MyCoatch.generateNextFromHistory({...history,athlete:{...stock,plateInventories:{...stock.plateInventories,'50':{'20':1,'5':1,'2.5':1,'1.25':1}}}});
 const benches=m=>m.weeks[0].days.flatMap(d=>d.exercises).filter(e=>e.name===name);
 assert.ok(benches(first).length);assert.ok(benches(second).length);
 assert.ok(benches(first).every(e=>e.kgMin===''));
 assert.ok(benches(second).every(e=>Number(e.kgMin)>=60 && Number(e.kgMin)<=75));
});
