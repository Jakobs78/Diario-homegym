import test from 'node:test';
import assert from 'node:assert/strict';
import {EXERCISE_DATABASE as db} from '../mycoatch/exercisesDB.js';
import {canonicalExerciseName,canonicalExerciseKey,exerciseIdentity,applyPersonalExerciseMapping} from '../mycoatch/exerciseIdentity.js';
import {catalogExercise} from '../mycoatch/catalogLookup.js';
import {importedIdentity} from '../mycoatch/importIdentity.js';
import {contributionsForExercise,summarizeMuscleVolume,TRACKED_MUSCLES} from '../mycoatch/volumeAccounting.js';
import {muscleWorkReport,muscleWorkSessions} from '../mycoatch/muscleWorkReport.js';
const log=(rpe='8')=>({weight:'20',reps:'10',rpe,isLocked:true});
test('every catalog entry has a unique identity and audited non-overlapping muscle roles',()=>{
 assert.equal(db.length,71);
 for(const e of db){
  assert.equal(catalogExercise(e).id,e.id);assert.equal(importedIdentity(e.name).kind,'known');
  assert.equal(catalogExercise(e.name.replace(/ con /g,' ')).id,e.id);
  const p=e.muscleProfile;assert.ok(p.primary.length);assert.ok(Object.isFrozen(p));
  for(const m of [...p.primary,...p.secondary])assert.ok(TRACKED_MUSCLES.includes(m),e.name+': '+m);
  assert.ok(!p.primary.some(m=>p.secondary.includes(m)));
  const c=contributionsForExercise(e,3);assert.equal(c.physicalSets,3);
  for(const n of Object.values(c.direct))assert.equal(n,3);
  for(const n of Object.values(c.indirect))assert.equal(n,1.5);
 }
});
test('safe aliases share history while different equipment and variants remain distinct',()=>{
 for(const [a,b] of [['curl con manubri su panca inclinata','Curl Manubri su Panca Inclinata'],['hammer curl','Curl Martello con Manubri'],['pulley basso triangolo','Pulley Basso con Triangolo'],['preacher curl dumbbell','Curl Scott con Manubrio su Panca Inclinata'],['french press ez inclinata','French Press con Bilanciere EZ su Panca Inclinata']])assert.equal(canonicalExerciseName(a),b);
 for(const [a,b] of [['rdl','rdl manubri'],['pulley basso','pulley triangolo'],['curl scott manubrio panca inclinata','Curl Manubri su Panca Inclinata'],['french press ez','french press ez inclinata'],['Panca Piana con Manubri','panca piana bilanciere']])assert.notEqual(canonicalExerciseKey(a),canonicalExerciseKey(b));
 assert.equal(importedIdentity('curl inventato').kind,'unknown');
 const ex={name:'hammer curl',catalogMapping:{custom:true}};assert.equal(catalogExercise(ex),null);assert.match(exerciseIdentity(ex),/^custom:/);
 assert.equal(contributionsForExercise(ex,3),null);
});
test('personal confirmed association wins over the displayed name without rewriting logs',()=>{
 const ex={name:'Tirata personale',sets:[{},{}],loggedSets:[log(),log()]};
 const journal={history:{years:{2026:{mesocycles:[{weeks:[{days:[{exercises:[ex]}]}]}]}}}};
 const before=JSON.stringify(ex.loggedSets);applyPersonalExerciseMapping(journal,ex.name,db.find(e=>e.name==='Pulley Basso con Triangolo'));
 assert.equal(catalogExercise(ex).name,'Pulley Basso con Triangolo');assert.equal(JSON.stringify(ex.loggedSets),before);
 assert.equal(summarizeMuscleVolume([ex],{mode:'confirmed'}).byMuscle.Back_Thickness.directSets,2);
});
test('isometric stabilization never becomes direct back/core sets; isolation never credits triceps',()=>{
 const report=summarizeMuscleVolume([{name:'Stacco Rumeno (RDL)',setsCount:3},{name:'Military Press con Bilanciere',setsCount:2}]);
 assert.equal(report.byMuscle.Back_Thickness.fractionalSets,0);assert.equal(report.byMuscle.Core.fractionalSets,0);
 assert.equal(report.byMuscle.Glutei.indirectSetCredits,1.5);
 for(const name of ['Croci con Manubri su Panca Piana','Pec Deck','Alzate Laterali con Manubri','Reverse Pec Deck'])assert.equal(contributionsForExercise(name,3).indirect.Tricipiti,undefined);
 assert.deepEqual(contributionsForExercise('Hip Thrust con Bilanciere',3).indirect,{});
 const deadlift=contributionsForExercise('Stacco da Terra Convenzionale',3);assert.equal(deadlift.direct.Glutei,3);assert.equal(deadlift.direct.Femorali,undefined);
});
test('muscle report preserves physical counts, unknown work, confirmation, warmup and observed RPE',()=>{
 const p=muscleWorkReport([{exercises:[{name:'pulley triangolo',sets:[{},{},{}],loggedSets:[log('8'),{...log(),isLocked:false},{...log(),isWarmup:true}]},{name:'non classificato',sets:[{}],loggedSets:[log('9')]}]}]);
 assert.equal(p.planned.totalPhysicalSets,3);assert.equal(p.performed.totalPhysicalSets,2);
 assert.equal(p.performed.unclassifiedSets,1);assert.equal(p.performed.byMuscle.Back_Thickness.directSets,1);
 assert.equal(p.performed.byMuscle.Bicipiti.indirectSetCredits,0.5);assert.equal(p.exercises[0].averageRpe,8);
 assert.equal(p.exercises[1].classified,false);
});

test('archived repetitions retain their own date and real muscular work',()=>{
 const sessions=muscleWorkSessions([{weekNumber:1,date:null,exercises:[],sessionArchives:[{sessionDate:'2026-01-02',exercises:[{name:'hammer curl',sets:[{}],loggedSets:[log()]}]}]}]);
 assert.equal(sessions.length,2);assert.equal(sessions[1].date,'2026-01-02');
 assert.equal(muscleWorkReport(sessions).performed.byMuscle.Bicipiti.directSets,1);
});
test('long programmes aggregate equivalent labels once and average only observed RPE values',()=>{
 const r=muscleWorkReport([{exercises:[{name:'hammer curl',sets:[{}],loggedSets:[log('8')]},{name:'Curl Martello con Manubri',sets:[{},{}],loggedSets:[log('9'),log('10')]}]}]);
 assert.equal(r.exercises.length,1);assert.equal(r.exercises[0].planned,3);assert.equal(r.exercises[0].performed,3);assert.equal(r.exercises[0].averageRpe,9);
});
