import test from 'node:test';
import assert from 'node:assert/strict';
import {PLATE_SIZES,compatiblePlates} from '../mycoatch/barbellInventory.js';
import {getPlateBreakdown} from '../js/helpers.js';
import {resolvePlannedLoad,recommendNextSessionLoad} from '../mycoatch/loadProposal.js';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
const ex={name:'Panca Piana con Bilanciere',equipment:'barbell',reps:'8-12',targetRpe:8,
 loggedSets:[0,1,2].map(()=>({weight:70,reps:12,rpe:7,isLocked:true}))};
const key=canonicalExerciseKey(ex.name);
const equipment={plateInventories:{'50':{'20':1,'5':1},'29':{'25':1,'1.25':1}},
 barbellAssignments:{[key]:{weight:20,diameter:'50'}}};
test('entrambi i diametri supportano tutti i dieci tagli, compreso 25 kg',()=>{
 assert.deepEqual(PLATE_SIZES,[25,20,15,10,5,2.5,2,1.25,1,0.5]);
 assert.equal(getPlateBreakdown(70,20,{'25':1}).exact,true);
 assert.deepEqual(getPlateBreakdown(70,20,{'25':1}).plates,[25]);
});
test('nessun prestito di microdischi fra 29 e 50 mm',()=>{
 assert.equal(resolvePlannedLoad(ex,70,equipment).weight,70);
 assert.equal(resolvePlannedLoad(ex,72.5,equipment).weight,null);
 assert.equal(recommendNextSessionLoad(ex,{equipmentSettings:equipment}).suggestedWeight,null);
 const other=structuredClone(equipment);other.barbellAssignments[key].diameter='29';
 assert.equal(resolvePlannedLoad(ex,72.5,other).weight,72.5);
 assert.equal(recommendNextSessionLoad(ex,{equipmentSettings:other}).suggestedWeight,72.5);
 assert.equal(equipment.barbellAssignments[key].weight,20);
});
test('inventario legacy e diametro mancante non diventano disponibilità verificata',()=>{
 const legacy={platePairs:{'25':2}};const saved=JSON.stringify(legacy);
 assert.equal(compatiblePlates(ex,legacy),null);
 assert.equal(resolvePlannedLoad(ex,70,legacy).weight,null);
 assert.equal(resolvePlannedLoad(ex,70,{plateInventories:equipment.plateInventories}).weight,null);
 assert.equal(JSON.stringify(legacy),saved);
});

test('modulo inventario: ogni diametro ha tutti i tagli, senza quantità precompilate',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 for(const diameter of ['50','29']){
  const inputs=[...html.matchAll(new RegExp('<input[^>]+data-diameter="'+diameter+'"[^>]+>','g'))].map(m=>m[0]);
  assert.equal(inputs.length,10);
  for(const weight of PLATE_SIZES)assert.ok(inputs.some(input=>input.includes('data-plate="'+weight+'"')&&input.includes('value=""')));
 }
});
