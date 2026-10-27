import test from 'node:test';
import assert from 'node:assert/strict';
import {importedIdentity,importIdentitySuggestions,commitImportedIdentities} from '../mycoatch/importIdentity.js';
import {inheritPersonalExerciseMapping,exerciseIdentity} from '../mycoatch/exerciseIdentity.js';
const plan=(...exercises)=>({weeks:[{days:[{exercises}]}]});
test('exact catalog aliases are recognized; generic ambiguous variants stay unknown',()=>{
 assert.equal(importedIdentity('Panca piana').catalog.name,'Panca Piana con Bilanciere');
 assert.equal(importedIdentity('Rematore').kind,'unknown');
 assert.equal(importedIdentity('Lat presa personale').kind,'unknown');
 const result=importIdentitySuggestions('Rematore');assert.ok(result.length>0&&result.length<=8);
 assert.equal(importedIdentity('Rematore').kind,'unknown');
 assert.ok(importIdentitySuggestions('mio esercizio','squat').some(ex=>ex.name==='Squat con Bilanciere'));
});
test('confirmed import remembers mapping and keeps original labels and old performance',()=>{
 const old={name:'La mia panca',loggedSets:[{weight:60,reps:6,isLocked:true}]};
 const data={history:{years:{2026:{mesocycles:[plan(old)]}}}};
 const ex={name:'La mia panca',importIdentityChoice:'Panca Piana con Bilanciere'};
 commitImportedIdentities(data,plan(ex));inheritPersonalExerciseMapping(data,ex);
 assert.equal(ex.name,'La mia panca');assert.equal(ex.originalName,'La mia panca');
 assert.equal(exerciseIdentity(ex),exerciseIdentity({name:'Panca Piana con Bilanciere'}));
 assert.equal(old.loggedSets[0].weight,60);assert.equal(ex.importIdentityChoice,undefined);
 assert.equal(importedIdentity(ex.name,data).kind,'saved');
});
test('custom choice is remembered and does not borrow a similar exercise identity',()=>{
 const data={},ex={name:'Rematore personale macchina',importIdentityChoice:'custom'};
 commitImportedIdentities(data,plan(ex));inheritPersonalExerciseMapping(data,ex);
 assert.equal(importedIdentity(ex.name,data).kind,'custom');
 assert.equal(ex.catalogMapping.confirmed,false);assert.equal(ex.catalogMapping.custom,true);
 assert.notEqual(exerciseIdentity(ex),exerciseIdentity({name:'Rematore con Bilanciere'}));
 const next=inheritPersonalExerciseMapping(data,{name:ex.name});assert.equal(next.catalogMapping.custom,true);
 assert.equal(exerciseIdentity(next),exerciseIdentity(ex));
});
test('conflicting repeated names reject before candidate registry changes',()=>{
 const data={athlete:{}},before=structuredClone(data);
 assert.throws(()=>commitImportedIdentities(data,plan({name:'Mio esercizio',importIdentityChoice:'custom'},{name:'Mio esercizio',importIdentityChoice:'Squat con Bilanciere'})),/Associazioni diverse/);
 assert.deepEqual(data,before);
});
test('plans without an import review do not add new aliases',()=>{
 const data={};commitImportedIdentities(data,plan({name:'Sconosciuto'}));assert.deepEqual(data,{});
});
