import test from 'node:test';import assert from 'node:assert/strict';
import {userDefaults,saveUserDefaults,needsUserSetup} from '../mycoatch/userDefaults.js';
import {resolvePlannedLoad,resolveSuggestedLoad,recommendNextSessionLoad} from '../mycoatch/loadProposal.js';
import {recommendNextExposure} from '../mycoatch/nextExposure.js';
import {exerciseTargetMarkup} from '../js/exerciseTargetUI.js';
const exercise=()=>({name:'Curl ai Cavi Bassi',equipment:'cable',set:'2 set',reps:'10-12',rpe:8,sets:[{},{}],loggedSets:[1,2].map(()=>({weight:20,reps:12,rpe:8,isLocked:true}))});
test('user-specific defaults persist without changing workouts or leaking to another profile',()=>{
 const a={history:{years:{2026:{mesocycles:[{name:'In corso'}]}}}},b={};const before=JSON.stringify(a.history);
 assert.equal(needsUserSetup(a),true);saveUserDefaults(a,{userAge:49,availableEquipment:['dumbbell'],availableAccessories:['incline_bench'],availableMachines:[]},{confirmed:true});
 assert.equal(needsUserSetup(a),false);assert.equal(userDefaults(a).userAge,49);assert.equal(userDefaults(b).userAge,undefined);assert.equal(JSON.stringify(a.history),before);
 saveUserDefaults(a,{userAge:50});assert.equal(userDefaults(a).userAge,50);
 assert.throws(()=>saveUserDefaults(a,{userAge:0}),/età/);assert.equal(userDefaults(a).userAge,50);
});
test('legacy saved profile settings are already valid defaults',()=>{
 const a={athlete:{mycoatchProfileJournal:{versions:[{settings:{userAge:49,availableEquipment:['barbell'],maxSessionMinutes:60}}]}}};
 assert.equal(needsUserSetup(a),false);assert.equal(userDefaults(a).maxSessionMinutes,60);
});
test('a missing inventory weight is visible as a proposal, never an owned weight',()=>{
 const settings={machine:1,availableLoads:{machine:[20,24]}};const ex=exercise();
 const proposal=recommendNextSessionLoad(ex,{equipmentSettings:settings});assert.ok(proposal.suggestedWeight>20&&proposal.suggestedWeight<24);assert.equal(proposal.verified,false);assert.equal(proposal.availability,'unavailable');
 const current={...ex,loggedSets:[{},{}]};const next=recommendNextExposure(ex,current,settings);assert.ok(next.weight>20);assert.notEqual(next.suppressLoad,true);
 const html=exerciseTargetMarkup(current,[{weight:next.weight},{weight:next.weight}],{equipmentSettings:settings});assert.match(html,/Carico proposto/);assert.match(html,/non presente nell’attrezzatura/);
 assert.deepEqual(current.loggedSets,[{},{}]);
});
test('confirmed historical load remains usable if the inventory changes',()=>{
 const previous=exercise();previous.loggedSets.forEach(s=>s.reps=10);
 const upcoming={...previous,loggedSets:[{},{}]};const advice=recommendNextExposure(previous,upcoming,{availableLoads:{machine:[]}});
 assert.equal(advice.weight,20);assert.notEqual(advice.suppressLoad,true);assert.match(advice.reason,/attrezzatura salvata/);
 assert.equal(resolvePlannedLoad(previous,20,{availableLoads:{machine:[]}}).weight,20);
 assert.equal(resolveSuggestedLoad(previous,21,{availableLoads:{machine:[]}},{min:20.01,max:21}).verified,false);
});

test('an exact decimal machine load is never rounded and falsely marked available',()=>{
 const ex={name:'Curl ai Cavi Bassi',equipment:'cable'},inventory={availableLoads:{machine:[20.1]}};
 const load=resolvePlannedLoad(ex,20.1,inventory);assert.equal(load.weight,20.1);assert.equal(load.verified,true);
});
