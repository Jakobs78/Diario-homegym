import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWarmupPlan} from '../mycoatch/warmupPlan.js';
import {rowEquipmentLimit,replacementCatalogExercise,DUMBBELL_ROW,CABLE_ROW} from '../mycoatch/equipmentSubstitution.js';
import {isExerciseAvailable,normalizeSelectionPreferences} from '../mycoatch/exerciseSelection.js';
import {EXERCISE_DATABASE} from '../mycoatch/exercisesDB.js';
import {MyCoatch} from '../mycoatch/index.js';
const equipment={ownedDumbbells:[{weight:20,quantity:2},{weight:30,quantity:1}]};
const ex={name:DUMBBELL_ROW,setsCount:2,reps:'8-12',rpe:'8',loggedSets:Array.from({length:2},()=>({weight:'30',reps:'12',rpe:'8',completed:true}))};
const meso={name:'Concluso',weeks:[{weekNumber:1,days:[{date:new Date().toISOString().slice(0,10),exercises:[ex]}]}]};
test('warmup loads are integers, respect stock and never equal or exceed working load',()=>{
 const p=buildWarmupPlan({name:'Panca Inclinata con Manubri'},equipment,{workWeight:30});
 assert.equal(p.length,2);assert.equal(p[0].isWarmup,true);
 assert.deepEqual(p.map(s=>s.targetKg),['20','']);
 assert.equal(p[0].verified,true);
 const unknown=buildWarmupPlan({name:'Squat con Bilanciere'},{},{workWeight:null});
 assert.equal(unknown.length,2);assert.ok(unknown.every(s=>s.targetKg===''));
 const practical=buildWarmupPlan({name:'Squat con Bilanciere'},{},{workWeight:101});
 assert.ok(practical.every(s=>Number.isInteger(Number(s.targetKg))&&Number(s.targetKg)<101));
});
test('second hinge gets one approach and isolation exercises get none',()=>{
 assert.equal(buildWarmupPlan({name:'Stacco Rumeno (RDL)'},{},{workWeight:80,previousExercises:[{name:'Stacco da Terra Convenzionale'}]}).length,1);
 assert.deepEqual(buildWarmupPlan({name:'Curl Martello con Manubri'},equipment,{workWeight:20}),[]);
});
test('equipment switch requires a complete block and latest working sets at inventory maximum within RPE',()=>{
 assert.equal(rowEquipmentLimit(meso,equipment)?.to,CABLE_ROW);
 const incomplete=structuredClone(meso);incomplete.weeks[0].days.push({exercises:[{...ex,loggedSets:[]}]});assert.equal(rowEquipmentLimit(incomplete,equipment),null);
 for(const [key,value] of [['weight','20'],['reps','11'],['rpe','9'],['rpe','']]){
  const failed=structuredClone(meso);failed.weeks[0].days[0].exercises[0].loggedSets[1][key]=value;assert.equal(rowEquipmentLimit(failed,equipment),null);
 }
 assert.equal(rowEquipmentLimit(meso,{availableLoads:{dumbbell:[30]}}),null);
 assert.equal(rowEquipmentLimit(meso,{ownedDumbbells:[{weight:35,quantity:1}]}),null);
});
test('new unilateral cable row needs a low pulley and declared single handle',()=>{
 const cable=EXERCISE_DATABASE.find(ex=>ex.name===CABLE_ROW);
 const prefs=normalizeSelectionPreferences({availableEquipment:['cable'],availableAccessories:['single_handle'],cableSetup:'low_only'});
 assert.ok(isExerciseAvailable(cable,prefs));assert.equal(isExerciseAvailable(cable,{...prefs,cableSetup:'high_only'}),false);
 assert.equal(isExerciseAvailable(cable,{...prefs,availableAccessories:[]}),false);
 const before=JSON.stringify(ex);const replacement=replacementCatalogExercise(ex,rowEquipmentLimit(meso,equipment));
 assert.equal(replacement.name,CABLE_ROW);assert.equal(replacement.unilateral,true);assert.equal(JSON.stringify(ex),before);
});
test('generation switches a capped row only in the proposal, with new cable load unset',()=>{
 const history={athlete:equipment,history:{years:{2026:{mesocycles:[meso]}}}};const before=JSON.stringify(history);
 const proposal=MyCoatch.generateNextFromHistory(history,{daysPerWeek:3,durationWeeks:4,maxSessionMinutes:100,focus:'hypertrophy',availableEquipment:['barbell','dumbbell','cable','lat_machine'],availableAccessories:['rack','flat_bench','single_handle','triangle_handle'],cableSetup:'single_high_low'});
 const switches=proposal.weeks.flatMap(w=>w.days.flatMap(d=>d.exercises)).filter(ex=>ex.equipmentSubstitution);
 assert.ok(switches.length>0);assert.ok(switches.every(ex=>ex.name===CABLE_ROW&&ex.kgMin===''));
 assert.equal(JSON.stringify(history),before);
});
