import {validateCompletedSet} from '../mycoatch/liveCoach.js';
import {completedWorkingSetCount} from '../mycoatch/volumeAccounting.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSmartMesocycle} from '../mycoatch/engine.js';
import {estimateDaySeconds} from '../mycoatch/timeEstimator.js';
import {resolvePlannedLoad} from '../mycoatch/loadProposal.js';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
import {analyzeTrainingHistory} from '../mycoatch/historyInsights.js';
import {analyzeCompletedMesocycle} from '../mycoatch/historyAnalysis.js';
import {MyCoatch} from '../mycoatch/index.js';

const config={daysPerWeek:4,maxSessionMinutes:60,durationWeeks:4,userAge:49,
 availableAccessories:['rack','flat_bench','incline_bench']};
const build=overrides=>generateSmartMesocycle({...config,...overrides});

test('4 giorni/60 minuti/49 anni: flessione ginocchio, hip hinge e seconda spinta conservati',()=>{
 const plan=build();
 for(const week of plan.weeks){
  assert.ok(week.days.every(d=>d.estimatedSeconds<=3600));
  assert.ok(week.days[1].exercises.some(e=>e.category==='Femorali' && e.pattern==='isolation'));
  assert.ok(week.days[3].exercises.some(e=>e.pattern==='hinge'));
  assert.ok(week.days[2].exercises.some(e=>e.pattern==='horizontal_push'));
  assert.ok(week.days.flatMap(d=>d.exercises).filter(e=>e.pattern==='hip_thrust').length<=1);
 }
});
test('cavigliera disponibile: leg curl, altrimenti alternativa senza accessori inventati',()=>{
 const simple=build().weeks[0].days[1].exercises;
 assert.ok(simple.some(e=>e.name==='Hamstring Walkout a Corpo Libero'));
 assert.ok(!simple.some(e=>e.name.includes('cavigliera')));
 const equipped=build({availableAccessories:[...config.availableAccessories,'ankle_strap']});
 assert.ok(equipped.weeks[0].days[1].exercises.some(e=>e.name==='Leg Curl ai Cavi (cavigliera)'));
});
test('scarico: nessun nuovo esercizio, nessuna serie aumentata, array coerenti anche con poco tempo',()=>{
 for(const minutes of [30,45,60,90]){
  const plan=build({maxSessionMinutes:minutes});
  const reference=plan.weeks[2],deload=plan.weeks[3];
  for(const day of deload.days){
   const previous=reference.days[day.dayNumber-1];
   assert.deepEqual(day.exercises.map(e=>e.name),previous.exercises.map(e=>e.name));
   for(const ex of day.exercises){
    const old=previous.exercises.find(e=>e.name===ex.name);
    assert.ok(ex.setsCount<=old.setsCount);
    if(old.setsCount>1)assert.ok(ex.setsCount<old.setsCount);
    assert.equal(ex.sets.length,ex.setsCount);
    assert.equal(ex.rpe,'6.5');
    assert.ok(ex.sets.every(s=>!s.completed && !s.intensityTechnique));
   }
  }
 }
});
test('tempo include 5 minuti generali e doppia esecuzione unilaterale anche nei gruppi',()=>{
 const ex={name:'Alzate',pattern:'isolation',equipment:'dumbbell',setsCount:2,restTime:'90s'};
 assert.equal(estimateDaySeconds([ex]),300+90+70+100+90);
 assert.equal(estimateDaySeconds([{...ex,name:'Calf Raise Monopodalico'}])-estimateDaySeconds([ex]),120);
 const pair=[{...ex,groupType:'superset',groupBase:'1',isGroupLast:false},
 {...ex,name:'Pallof Press ai Cavi',groupType:'superset',groupBase:'1',isGroupLast:true}];
 assert.equal(estimateDaySeconds(pair)-estimateDaySeconds(pair.map(e=>({...e,name:'Bilaterale'}))),120);
});
test('note specifiche al movimento, RIR coerente e regola di progressione esportata',()=>{
 const plan=build();
 for(const day of plan.weeks[0].days)for(const ex of day.exercises){
  assert.ok(ex.notes.includes(`circa ${10-Number(ex.rpe)} ripetizioni in riserva`));
  assert.match(ex.notes,/PROGRESSIONE/);
  if(ex.pattern==='squat'){
   assert.match(ex.notes,/tronco stabile/);
   assert.doesNotMatch(ex.notes,/pompaggio|contrazione di picco/);
  }
 }
 MyCoatch.generateNextFromHistory({history:{years:{}}},config);
 const rows=MyCoatch.exportAsCSV().trim().split('\n').map(row=>row.split(';')); 
 assert.ok(rows.length>50);
 assert.ok(rows.every(r=>r.length===12));
 assert.match(MyCoatch.exportAsCSV(),/PROGRESSIONE/);
});
test('non confonde configurazione mancante con un peso non componibile',()=>{
 const ex={name:'Panca Piana con Bilanciere',equipment:'barbell'};
 const key=canonicalExerciseKey(ex.name);
 const settings={plateInventories:{'50':{'20':1},'29':{'1.25':1}}};
 assert.equal(resolvePlannedLoad(ex,62.5,settings).reason,'missing_assignment');
 settings.barbellAssignments={[key]:{weight:20,diameter:'50'}};
 assert.equal(resolvePlannedLoad(ex,62.5,settings).reason,'unavailable_load');
 assert.equal(resolvePlannedLoad(ex,60,settings).weight,60);
 assert.equal(settings.barbellAssignments[key].weight,20);
 const history={byExercise:{[key]:{lastWorkingKg:62.5}},exerciseNotes:{}};
 let plan=generateSmartMesocycle({...config,equipmentSettings:settings},history);
 assert.match(plan.weeks[0].days[0].exercises[0].notes,/non è componibile/);
 delete settings.barbellAssignments;
 plan=generateSmartMesocycle({...config,equipmentSettings:settings},history);
 assert.match(plan.weeks[0].days[0].exercises[0].notes,/ATTREZZATURA DA CONFIGURARE/);
 assert.match(build().weeks[0].days[0].exercises[0].notes,/CARICO DA CALIBRARE/);
});
test('alzate laterali: e1RM ignoto, eventuale stallo riconosciuto solo da reps confrontabili',()=>{
 const name='Alzate Laterali con Manubri', key=canonicalExerciseKey(name);
 const meso={weeks:[1,2,3].map(weekNumber=>({weekNumber,days:[{dayNumber:1,
  exercises:[{name,reps:'10-12',rpe:'8',setsCount:3,
   loggedSets:[1,2,3].map(()=>({weight:8,reps:10,rpe:8,isLocked:true}))}]}]}))};
 const legacy=analyzeCompletedMesocycle(meso);
 assert.notEqual(legacy.byExercise[key].status,'possible_stall');
 const analysis=analyzeTrainingHistory({history:{years:{2026:{mesocycles:[meso]}}}});
 assert.equal(analysis.byExercise[key].exposures.every(e=>e.e1rm===null),true);
 assert.equal(analysis.byExercise[key].status,'possible_stall');
 assert.equal(analysis.byExercise[key].trendMetric,'working_reps');
 assert.equal(analysis.byExercise[key].e1rmChangePct,null);
});
test('età da sola non riduce il programma; tempi irrealistici vengono segnalati',()=>{
 const signature=age=>build({userAge:age}).weeks.map(w=>w.days.map(d=>d.exercises.map(e=>[e.name,e.setsCount,e.rpe])));
 assert.deepEqual(signature(49),signature(30));
 assert.throws(()=>build({daysPerWeek:3,maxSessionMinutes:30}),/Non è possibile rispettare 30 minuti/);
});

test('corpo libero: zero kg espliciti contano come serie, ma mai come forza stimata',()=>{
 const exercise={name:'Hamstring Walkout a Corpo Libero',reps:'6-10',rpe:'8',setsCount:2,
  loggedSets:[1,2].map(()=>({weight:'0',reps:'8',rpe:'8',isLocked:true}))};
 assert.equal(validateCompletedSet(exercise.loggedSets[0],exercise).ok,true);
 assert.equal(validateCompletedSet(exercise.loggedSets[0],{name:'Panca Piana con Bilanciere'}).ok,false);
 assert.equal(completedWorkingSetCount(exercise),2);
 assert.equal(completedWorkingSetCount({...exercise,name:'Panca Piana con Bilanciere'}),0);
 assert.equal(completedWorkingSetCount({...exercise,loggedSets:[{weight:'',reps:'8',isLocked:true}]}),0);
 const meso={weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[exercise]}]}]};
 const analysis=analyzeTrainingHistory({history:{years:{2026:{mesocycles:[meso]}}}});
 const item=analysis.byExercise[canonicalExerciseKey(exercise.name)];
 assert.equal(item.completedSets,2);
 assert.ok(item.exposures.every(e=>e.e1rm===null));
 assert.equal(analyzeCompletedMesocycle(meso).byExercise[canonicalExerciseKey(exercise.name)].validSets,2);
});
