import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFullBackup, readFullBackup, restoreFullBackupFile } from '../js/fullBackup.js';

const diary=()=>({athlete:{email:null},updatedAt:'2026-09-01T10:00:00Z',history:{years:{
  '2025':{mesocycles:[{name:'Meso 2025',locked:true,weeks:[{weekNumber:1,days:[{
    dayName:'Upper A',coachCheckin:{pain:'none'},sessionArchives:[{sessionDate:'2025-02-01'}],
    exercises:[{name:'Panca piana',notes:'Nota atleta',loggedSets:[{
      weight:70,reps:'8',rpe:'8',isLocked:true,completedAt:'2025-02-01T13:00:00Z'
    }]}]
  }]}]}]},
  '2026':{mesocycles:[]}
}}});
test('versioned full backup preserves all years, real logs and archive metadata',()=>{
  const original=diary();
  const archive=buildFullBackup(original,new Date('2026-10-16T10:00:00Z'));
  assert.equal(archive.exportedAt,'2026-10-16T10:00:00.000Z');
  const restored=readFullBackup(JSON.stringify(archive));
  assert.deepEqual(restored,original);
  assert.notStrictEqual(restored,original);
  restored.history.years['2025'].mesocycles[0].locked=false;
  assert.equal(original.history.years['2025'].mesocycles[0].locked,true);
});
test('malformed or wrong-version backup is rejected before any state mutation',()=>{
  assert.throws(()=>readFullBackup('{bad'),/JSON/);
  assert.throws(()=>readFullBackup(JSON.stringify({format:'other',version:1,data:diary()})),/Formato/);
  const data=diary();
  delete data.history.years['2025'].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets;
  assert.throws(()=>readFullBackup(JSON.stringify({
    format:'homegym-diary-full-backup',version:1,data
  })),/Esercizio/);
});

test('failed restore does not announce success or reset the active session',async t=>{
  const prior={document:globalThis.document,confirm:globalThis.confirm,alert:globalThis.alert};
  let downloaded=0,rendered=0,announced=0;
  globalThis.document={body:{appendChild(){}},createElement:()=>({
    click(){downloaded++;},remove(){}
  })};
  globalThis.confirm=()=>true;
  globalThis.alert=()=>announced++;
  t.after(()=>{for(const [key,value] of Object.entries(prior)){
    if(value===undefined)delete globalThis[key]; else globalThis[key]=value;
  }});
  const state={workoutData:diary(),activeMesocycleIndex:2,activeWeek:3,activeDay:2};
  const before=JSON.stringify(state);
  await assert.rejects(restoreFullBackupFile({size:100,text:async()=>JSON.stringify(buildFullBackup(diary()))},{
    state,saveAndSync:async()=>false,renderWorkoutList:()=>rendered++
  }),/Ripristino non completato/);
  assert.equal(downloaded,1);
  assert.equal(rendered,0);
  assert.equal(announced,0);
  assert.equal(JSON.stringify(state),before);
});

