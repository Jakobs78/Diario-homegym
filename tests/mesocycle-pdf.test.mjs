import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMesocyclePdfOutline,buildMesocyclePdfDetails} from '../js/mesocyclePdfModel.js';
test('complete mesocycle outline carries weeks, days, target metrics and coach notes',()=>{
 const rows=buildMesocyclePdfOutline({weeks:[
  {weekNumber:1,days:[{dayName:'Upper A',exercises:[
    {name:'Panca',setsCount:3,reps:'6-8',rpe:'7.5',restTime:'180s',
     kgMin:60,kgMax:65,notes:'Pause 1 sec'},
    {name:'Alzate',sets:[{},{},{}],reps:'12-15',rpe:'8',restTime:'60s'}
  ]}]},
  {weekNumber:2,isDeloadWeek:true,days:[{dayName:'Upper B',exercises:[]}]}
 ]});
 assert.deepEqual(rows.filter(r=>r.kind==='day').map(r=>r.title),['Upper A','Upper B']);
 assert.match(rows[2].text,/3 serie × 6-8 reps/);
 assert.match(rows[2].text,/RPE target 7.5/);
 assert.match(rows[2].text,/180s/);
 assert.equal(rows[2].notes,'Pause 1 sec');
 assert.match(rows.at(-2).title,/scarico/);
});

test('mesocycle diary includes actual sets, both note types, confirmation and archived repetitions',()=>{
 const meso={name:'Mesociclo 1',weeks:[{weekNumber:2,days:[{
   dayName:'Giorno 4',date:'2026-10-17',
   sessionArchives:[{sessionDate:'2026-10-10',exercises:[{
     name:'Squat',notes:'Tecnica dal coach - archivio',userNotes:'Migliorata stabilità',
     loggedSets:[{weight:'80',reps:'5',rpe:'7.5',isLocked:true}]
   }]}],
   exercises:[{
     name:'Squat',block:1,reps:'5',targetRpe:'8',kgMin:'92.5',kgMax:'97.5',
     notes:'Note allenatore intere. Usa le fasce minime quando serve.',
     userNotes:'Nota personale: ottima profondità.',
     sets:[{targetKg:'95',reps:'5',rpe:'8'},{}],
     loggedSets:[
       {weight:'95',reps:'5',rpe:'8.5',isLocked:true},
       {weight:'',reps:'',rpe:'',isLocked:false}
     ]
   },{
     name:'French Press',notes:'Lavora controllato',loggedSets:[{
       weight:'24',reps:'10',rpe:'10',completed:true,
       intensityTechnique:'DROP_SET',
       dropSegments:[{weight:'18',reps:'6',rpe:'10'}]
     }]
   }]
 }]}]};
 const before=JSON.stringify(meso);
 const lines=buildMesocyclePdfDetails(meso);
 assert.equal(JSON.stringify(meso),before,'PDF must never mutate the journal');
 assert.deepEqual(lines.filter(x=>x.kind==='session').map(x=>x.title),
     ['Ripetizione archiviata 1','Seduta attuale']);
 assert.equal(lines.filter(x=>x.kind==='week').length,1);
 assert.equal(lines.filter(x=>x.kind==='day').length,1);
 const ex=lines.find(x=>x.kind==='exercise' && x.title==='1. Squat' && /RPE target 8/.test(x.prescription));
 assert.match(ex.prescription,/RPE target 8/);
 assert.match(ex.prescription,/92.5–97.5 kg/);
 assert.ok(lines.some(x=>x.kind==='note' && x.label==='NOTE ALLENATORE' &&
     x.text.includes('Usa le fasce minime')));
 assert.ok(lines.some(x=>x.kind==='note' && x.label==='NOTE PERSONALI' &&
     x.text==='Nota personale: ottima profondità.'));
 const sets=lines.filter(x=>x.kind==='set');
 assert.deepEqual(sets.map(x=>[x.weight,x.reps,x.rpe,x.confirmed]),[
   ['80','5','7.5',true],['95','5','8.5',true],['—','—','—',false],
   ['24','10','10',true]
 ]);
 assert.ok(lines.some(x=>x.kind==='drop' && x.text.includes('18 kg')));
});
test('mesocycle diary distinguishes missing logs from planned sets, preserves long notes',()=>{
 const longText='Allenatore: non anticipare il cambio del peso. '.repeat(100);
 const rows=buildMesocyclePdfDetails({weeks:[{days:[{exercises:[{
   name:'Rematore',notes:longText,userNotes:'\nAttenzione al gomito\n',
   sets:[{targetKg:60,reps:8}],loggedSets:[]
 }]}]}]});
 assert.equal(rows.filter(x=>x.kind==='set').length,0);
 assert.equal(rows.find(x=>x.kind==='notice').text,'Nessuna serie registrata.');
 assert.equal(rows.find(x=>x.kind==='note').text,longText);
 assert.ok(rows.some(x=>x.kind==='note' && x.label==='NOTE PERSONALI'));
});
