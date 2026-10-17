import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
import {dropScope,hasDropPrescription,needsDropScope,validateDropSegments} from '../js/trainingTechniques.js';
import {equipmentKind,automaticallyShowPlates,normalizeOwnedBarbells,barbellOptionValue,selectableBarbells,suggestedBarbell} from '../js/equipmentUI.js';
import {shouldStartRecoveryTimer,currentCircuitRound,recoveryExercise} from '../js/restPolicy.js';
import {repeatCompletedSessionPreservingHistory} from '../js/historySafety.js';
const done=()=>({weight:20,reps:12,rpe:8,isLocked:true});
const circuit=()=>({exercises:['A','B','C'].map((name,i)=>({name,groupType:'triset',groupBase:'1',isGroupLast:i===2,recupero:(i+1)*30+'s',loggedSets:[{},{}]}))});
test('recupero circuito richiede tutti i membri del giro, anche con conferme fuori ordine',()=>{
 const d=circuit(),[a,b,c]=d.exercises;c.loggedSets[0]=done();
 assert.equal(shouldStartRecoveryTimer(c,c.loggedSets[0],0,2,d),false);
 a.loggedSets[0]=done();assert.equal(shouldStartRecoveryTimer(a,a.loggedSets[0],0,2,d),false);
 b.loggedSets[0]=done();assert.equal(shouldStartRecoveryTimer(b,b.loggedSets[0],0,2,d),true);
 assert.equal(recoveryExercise(d,b).recupero,'90s');assert.equal(currentCircuitRound(d.exercises),1);
});
test('serie mancanti, riscaldamento e gruppi non contigui non inventano completamenti',()=>{
 const d=circuit();d.exercises[1].isWarmup=true;d.exercises[0].loggedSets[0]=done();d.exercises[2].loggedSets[0]=done();
 assert.equal(shouldStartRecoveryTimer(d.exercises[2],done(),0,2,d),true);
 assert.equal(d.exercises[1].loggedSets[0].isLocked,undefined);
});
test('dropset ultima serie: recupero per ogni serie completa, nessuna pausa per i singoli scarichi',()=>{
 const ex={isDropset:true,notes:'[DROP_SET] Solo dopo l’ultima serie',loggedSets:[{},{},{}]};
 assert.equal(dropScope(ex),'last');assert.equal(hasDropPrescription(ex,0),false);assert.equal(hasDropPrescription(ex,2),true);
 assert.equal(shouldStartRecoveryTimer(ex,done(),0,3),true);
 assert.equal(shouldStartRecoveryTimer(ex,{...done(),intensityTechnique:'DROP_SET'},2,3),true);
});
test('tag esplicito e testo ambiguo restano distinti',()=>{
 assert.equal(dropScope({isDropset:true,notes:'[DROP_SCOPE:LAST]'}),'last');
 assert.equal(needsDropScope({isDropset:true,notes:'Fare dropset'}),true);
 assert.equal(hasDropPrescription({notes:'Recupero dopo ultima serie',loggedSets:[{}]},0),false);
 assert.equal(hasDropPrescription({sets:[{}, {intensityTechnique:'DROP_SET'}],loggedSets:[{},{}]},1),true);
});
test('scarichi reali: pesi decrescenti, ripetizioni valide, nessun segmento inventato',()=>{
 assert.equal(validateDropSegments(20,[]).ok,false);
 assert.equal(validateDropSegments(20,[{weight:20,reps:8}]).ok,false);
 assert.equal(validateDropSegments(20,[{weight:15,reps:0}]).ok,false);
 const data=validateDropSegments(20,[{weight:'15',reps:'8'},{weight:'10',reps:'6',rpe:'9'}]);
 assert.equal(data.ok,true);assert.equal(data.segments[0].rpe,null);
 assert.deepEqual(validateDropSegments(20,[],true),{ok:true,segments:[],skipped:true});
});
test('attrezzo prima del peso: manubri pesanti non diventano bilancieri',()=>{
 assert.equal(equipmentKind({name:'Spinte con Manubri',equipment:'barbell'}),'other');
 assert.equal(automaticallyShowPlates({name:'Spinte con Manubri'},50),false);
 assert.equal(automaticallyShowPlates({name:'Leg Press'},100),false);
 assert.equal(automaticallyShowPlates({name:'Panca Piana con Bilanciere'},35),false);
 assert.equal(automaticallyShowPlates({name:'Panca Piana con Bilanciere'},36),true);
 assert.equal(equipmentKind({name:'Esercizio personalizzato'}),'unknown');
});
test('ripetere la seduta archivia gli scarichi e svuota i dati della nuova esecuzione',()=>{
 const day={exercises:[{name:'Curl',isDropset:true,dropSetScope:'last',loggedSets:[{...done(),dropSegments:[{weight:10,reps:8}],intensityTechnique:'DROP_SET'}]}]};
 const archive=repeatCompletedSessionPreservingHistory(day);
 assert.equal(archive.exercises[0].loggedSets[0].dropSegments[0].weight,10);
 assert.equal(day.exercises[0].loggedSets[0].dropSegments,undefined);
 assert.equal(day.exercises[0].dropSetScope,'last');
});

test('scarichi strutturati non diventano serie normali per la calibrazione di forza', async()=>{
 const {validateCompletedSet}=await import('../mycoatch/liveCoach.js');
 const set={weight:20,reps:12,rpe:9,dropSegments:[{weight:15,reps:8}]};
 assert.equal(validateCompletedSet(set,{},set).technique,true);
 assert.equal(validateCompletedSet({...set,dropSegments:[]},{},{...set,dropSegments:[]}).technique,false);
});

test('bilancieri posseduti: deduplica per peso e diametro senza inventare attrezzatura',()=>{
 const bars=normalizeOwnedBarbells([{weight:9,diameter:'29'},{weight:'9',diameter:29},
     {weight:20,diameter:'50'},{weight:0,diameter:'50'},{weight:12,diameter:'35'},
     {weight:9.1,diameter:'29'}]);
 assert.deepEqual(bars,[{weight:9,diameter:'29'},{weight:20,diameter:'50'}]);
 assert.deepEqual(normalizeOwnedBarbells(undefined),[]);
 assert.equal(barbellOptionValue(bars[0]),'9|29');
});
test('bilanciere consigliato: associazione dell esercizio prima del predefinito',()=>{
 const ex={name:'Squat con Bilanciere'};
 const athlete={ownedBarbells:[{weight:9,diameter:'29'},{weight:20,diameter:'50'}],
   defaultBarbell:{weight:20,diameter:'50'},
   barbellAssignments:{[canonicalExerciseKey(ex.name)]:{weight:9,diameter:'29'}}};
 // Canonical exercise identity may normalize beyond simple lowercasing.
 assert.deepEqual(suggestedBarbell({...ex,name:'Nuovo esercizio'},athlete),{weight:20,diameter:'50'});
 const owned=selectableBarbells(ex,athlete);
 assert.deepEqual(owned,athlete.ownedBarbells);
 assert.deepEqual(suggestedBarbell(ex,{
     ...athlete,barbellAssignments:{}}),{weight:20,diameter:'50'});
});
test('associazioni legacy: visibili anche senza configurazione, senza riscrivere lo storico',()=>{
 const ex={name:'Esercizio bilanciere personalizzato'};
 // Saved binding is keyed by the existing canonical key, identical to the live card.
 assert.deepEqual(selectableBarbells(ex,{
     barbellAssignments:{[canonicalExerciseKey(ex.name)]:{weight:12,diameter:'29'}}
 }),[{weight:12,diameter:'29'}]);
 assert.deepEqual(selectableBarbells(ex,{}),[]);
 assert.equal(suggestedBarbell(ex,{}),null);
 assert.deepEqual(suggestedBarbell(ex,{ownedBarbells:[{weight:20,diameter:'50'}],
   defaultBarbell:{weight:9,diameter:'29'}}),{weight:20,diameter:'50'});
});
