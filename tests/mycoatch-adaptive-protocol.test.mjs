import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
import {workingProposal,nextBlockDecision,selectEvidence} from '../mycoatch/protocolLoad.js';
import {trainingExposures} from '../mycoatch/trainingHistory.js';
import {setPrescription} from '../mycoatch/setPrescription.js';
import {getSetPrefill} from '../js/setPrefill.js';
import {assessExerciseLive} from '../mycoatch/liveCoach.js';
import {findPreviousExercise} from '../js/helpers.js';
const done=(kg=80,reps=12,rpe=8,extra={})=>({weight:String(kg),reps:String(reps),rpe:rpe===null?'':String(rpe),isLocked:true,completed:true,...extra});
const ex=(logs=[{},{},{}],extra={})=>({name:'Panca Piana con Bilanciere',reps:'8-12',targetRpe:'8',kgMin:'70',kgMax:'70',sets:[{},{},{}],loggedSets:logs,...extra});
const fixture=(source=ex([done(),done(),done()]),future=ex())=>({athlete:{},history:{years:{2026:{mesocycles:[{locked:false,weeks:[
 {weekNumber:1,days:[{dayNumber:1,completed:false,exercises:[source]}]},
 {weekNumber:2,days:[{dayNumber:1,exercises:[future]}]},
 {weekNumber:3,days:[{dayNumber:1,exercises:[ex()]}]}
]}]}}}});
const meso=data=>data.history.years[2026].mesocycles[0];
const lift=(data,w)=>meso(data).weeks[w-1].days[0].exercises[0];
const refresh=data=>reconcileTrainingPlan(data,{year:2026,mesoIndex:0,now:'2026-10-23T18:00:00Z'});
const prefill=(data,w,i=0)=>getSetPrefill(lift(data,w),i);

test('exercise-level completion updates the next exposure, original plan stays intact',()=>{
 const data=fixture(),original=structuredClone(lift(data,2));
 assert.equal(refresh(data),true);
 assert.equal(prefill(data,2).weight,'82');assert.equal(prefill(data,2).reps,'8');
 assert.equal(prefill(data,3).weight,'80','one performance updates only its next exposure');
 assert.deepEqual(lift(data,2).sets,original.sets);assert.equal(lift(data,2).kgMin,'70');
 assert.deepEqual(lift(data,1).loggedSets,[done(),done(),done()]);
 assert.equal(lift(data,2).coachSetProposals[0].basedOn[0].seriesEvidence.length,3);
 assert.ok(lift(data,2).coachAdaptiveNotes.length);
});
test('repeated renders, serialization and a second device do not compound load increases',()=>{
 const data=fixture();refresh(data);const saved=JSON.stringify(data);
 assert.equal(refresh(data),false);assert.equal(JSON.stringify(data),saved);
 const other=JSON.parse(saved);assert.equal(refresh(other),false);assert.equal(prefill(other,2).weight,'82');
});
test('editing or unchecking source recalculates untouched proposals and notes',()=>{
 const data=fixture();refresh(data);lift(data,1).loggedSets[2].reps='10';refresh(data);
 assert.equal(prefill(data,2).weight,'80');assert.equal(prefill(data,2).reps,'12');
 assert.equal(lift(data,2).coachSetProposals[2].reps,11);
 assert.ok(!lift(data,2).coachAdaptiveNotes.some(n=>n.includes('Aumento il carico')));
 lift(data,1).loggedSets[2].isLocked=false;lift(data,1).loggedSets[2].completed=false;refresh(data);
 assert.equal(lift(data,2).coachSetProposals[0].kind,'history');
});
test('manual edits and original and personal notes survive future recalculation',()=>{
 const future=ex([{weight:'77',reps:'9'}, {},{}],{notes:'Nota originale',userNotes:'Nota personale'});
 const data=fixture(undefined,future);refresh(data);
 assert.equal(prefill(data,2).weight,'77');assert.equal(prefill(data,2).reps,'9');
 lift(data,1).loggedSets[0].weight='90';refresh(data);
 assert.equal(prefill(data,2).weight,'77');assert.equal(future.notes,'Nota originale');assert.equal(future.userNotes,'Nota personale');
});
test('locked and closed mesocycles are byte-for-byte unchanged',()=>{
 for(const state of [{locked:true},{coachClosure:{status:'closed'}}]){
  const data=fixture();Object.assign(meso(data),state);const before=JSON.stringify(data);
  assert.equal(refresh(data),false);assert.equal(JSON.stringify(data),before);
 }
});
test('RPE shift keeps history and fixed strength displays a weight interval',()=>{
 const data=fixture(ex([done(36,6,7.5),done(36,6,7.5),done(36,6,7.5)],{reps:'6',targetRpe:'7.5',kgMin:'',kgMax:''}),ex([{},{},{}],{reps:'6',targetRpe:'8',kgMin:'',kgMax:''}));
 refresh(data);const p=prefill(data,2);assert.ok(Number(p.weight)>=36);assert.equal(p.reps,'6');assert.ok(p.range.min<Number(p.weight)&&p.range.max>Number(p.weight));
});
test('different RPE cannot fall back to an obsolete CSV load',()=>{
 const data=fixture(ex([done(79,6,6.5),done(79,6,6.5),done(79,6,7)],{reps:'5-6',targetRpe:'7'}),ex([{},{},{}],{reps:'5-6',targetRpe:'7.5'}));
 refresh(data);assert.ok(Number(prefill(data,2).weight)>70);
});
test('high reps reuse each set load across RPE changes without increases',()=>{
 const source=ex([done(10,20),done(9,18),done(8,16)],{reps:'15-20',kgMin:'',kgMax:''});
 const data=fixture(source,ex([{},{},{}],{reps:'15-20',targetRpe:'8.5',kgMin:'',kgMax:''}));refresh(data);
 assert.deepEqual([0,1,2].map(i=>prefill(data,2,i).weight),['10','9','8']);
 assert.equal(nextBlockDecision(ex([done(10,20),done(10,20),done(10,20)],{reps:'15-20'}),0).kind,'maintain');
});
test('10-15 is treated as above twelve even when actual reps are ten',()=>{
 const p=workingProposal(ex([{},{},{}],{reps:'10-15',targetRpe:'9'}),0,{exposures:[ex([done(10,10,8),done(10,10,8),done(10,10,8)],{reps:'10-15'})]});
 assert.equal(p.weight,10);assert.equal(p.kind,'maintain');
});
test('above-range reps are valid progress evidence instead of creating blank kg',()=>{
 const data=fixture(ex([done(80,13),done(80,13),done(80,13)]));refresh(data);
 assert.ok(Number(prefill(data,2).weight)>80);assert.equal(prefill(data,2).reps,'8');
});
test('a failed series or missing RPE prevents increase, but not history prefill',()=>{
 for(const failed of [done(80,8,9),done(80,12,null)]){
  const data=fixture(ex([done(),done(),failed]));refresh(data);
  assert.equal(prefill(data,2).weight,'80');assert.notEqual(lift(data,2).coachSetProposals[0].kind,'increase_load');
 }
});
test('unknown equipment proposes theoretical kg without claiming ownership',()=>{
 const data=fixture();refresh(data);const p=lift(data,2).coachSetProposals[0];
 assert.ok(p.weight>80);assert.equal(p.verified,false);assert.match(p.reason,/da verificare/);
});
test('explicitly unavailable loads do not erase theoretical recommendations',()=>{
 const data=fixture();data.athlete.availableLoads={barbell:[80]};refresh(data);
 const p=lift(data,2).coachSetProposals[0];assert.ok(p.weight>80);assert.equal(p.verified,false);assert.match(p.reason,/non componibile/);
});
test('same movement is found across days, mesocycles and years, excluding future data',()=>{
 const data=fixture();data.history.years[2025]={mesocycles:[{weeks:[{weekNumber:1,days:[{exercises:[ex([done(60),done(60),done(60)])]}]}]}]};
 meso(data).weeks[0].days.push({exercises:[ex()]});
 const source=lift(data,1);meso(data).weeks[0].days[0].exercises=[];
 assert.equal(findPreviousExercise(data,0,1,1,ex(),false,2026).loggedSets[0].weight,'60');
 meso(data).weeks[0].days[0].exercises=[source];
 assert.equal(trainingExposures(data,{year:2026,mesoIndex:0,weekNumber:1,dayIndex:1},ex())[0].exercise,source);
});
test('warmups, drafts and different exercise variants never supply evidence',()=>{
 for(const source of [ex([done(),done(),done()],{isWarmup:true}),ex([{weight:'100',reps:'12',rpe:'8'}, {},{}]),ex([done(),done(),done()],{name:'Panca Inclinata con Bilanciere'})]){
  const data=fixture(source,ex([{},{},{}],{kgMin:'',kgMax:''}));refresh(data);assert.equal(prefill(data,2).weight,'');
 }
});
test('top set and backoffs use their own targets and a confirmed top calibrates empty backoffs',()=>{
 const mixed=ex([done(100,3,8),{},{}],{reps:'6-8',kgMin:'',kgMax:'',sets:[{targetReps:'3',targetRpe:'8'},{targetReps:'6-8',targetRpe:'8'},{targetReps:'6-8',targetRpe:'8'}]});
 const p=workingProposal(mixed,1);assert.ok(p.weight>0&&p.weight<100);assert.equal(p.reps,6);
 assert.notEqual(assessExerciseLive(mixed).code,'below_reps');
});
test('progression is per homogeneous block, not shared with the top set',()=>{
 const mixed=ex([done(100,3),done(85,8),done(85,8)],{reps:'6-8',sets:[{targetReps:'3',targetRpe:'8'},{targetReps:'6-8',targetRpe:'8'},{targetReps:'6-8',targetRpe:'8'}]});
 assert.equal(nextBlockDecision(mixed,0),null);assert.ok(nextBlockDecision(mixed,1).weight>85);assert.equal(nextBlockDecision(mixed,1).reps,6);
});
test('0.5 RPE isolated deviation does not oscillate kg, large overshoot reduces only today',()=>{
 const mixed=ex([done(80,10,8.5),{},{}]);assert.equal(workingProposal(mixed,1).weight,80);
 mixed.loggedSets[0]=done(80,6,9.5);const p=workingProposal(mixed,1);assert.ok(p.weight<80);assert.equal(p.kind,'reduce_today');
});
test('RPE 10 prescription is allowed and warmups are excluded',()=>{
 const mixed=ex([done(80,10,10),{},{}],{targetRpe:'10'});assert.equal(workingProposal(mixed,1).weight,80);
 mixed.loggedSets[0].isWarmup=true;assert.equal(workingProposal(mixed,1).kind,'prescription');
});
test('up to three comparable exposures are used, not the highest estimated maximum',()=>{
 const future=ex();const history=[80,81,79,130].map(kg=>ex([done(kg,10,8),done(kg,10,8),done(kg,10,8)]));
 assert.equal(selectEvidence(future,0,history).length,3);
 const p=workingProposal(future,0,{exposures:history});assert.equal(p.stableE1rm,112);assert.equal(p.basedOn.length,3);
});
test('current-session fatigue cannot lower the stable reference from consistent prior exposures',()=>{
 const history=[80,81,79].map(kg=>ex([done(kg,10,8),done(kg,10,8),done(kg,10,8)]));
 const current=ex(),before=workingProposal(current,1,{exposures:history});
 current.loggedSets[0]=done(75,7,9.5);const after=workingProposal(current,1,{exposures:history});
 assert.equal(after.stableE1rm,before.stableE1rm);assert.ok(after.weight<before.weight);
});
test('independent kg and reps ranges and RPE ranges survive in mixed prescriptions',()=>{
 const mixed=ex([], {sets:[{targetReps:'3',targetRpe:'7-8',kgMin:'100',kgMax:'105'},{targetReps:'6-8',targetRpe:8,kgMin:80,kgMax:85}]});
 const p=setPrescription(mixed,0);assert.deepEqual(p.kg,{min:100,max:105});assert.deepEqual(p.reps,{min:3,max:3});assert.deepEqual(p.rpe,{min:7,max:8});
});
test('known different cable station does not inherit a misleading e1RM',()=>{
 const source=ex([done(),done(),done()],{name:'Lat Machine',equipment:'machine'});
 source.loggedSets.forEach(s=>s.equipmentSnapshot={station:'A'});
 const p=workingProposal(ex([{},{},{}],{name:'Lat Machine',equipment:'machine',kgMin:'',kgMax:''}),0,{exposures:[source],equipment:{stationConfigurations:{machine:'B'}}});
 assert.equal(p.weight,null);assert.equal(p.basedOn.length,0);
});
test('one completed destination starts the day and protects it from transferred increases',()=>{
 const future=ex([done(77,8),{},{}]);const data=fixture(undefined,future);refresh(data);
 assert.equal(future.loggedSets[0].weight,'77');assert.equal(prefill(data,2,1).weight,'77');
});
test('superset history remains useful and exercise order and recovery are untouched',()=>{
 const source=ex([done(10,20),done(10,18),done(10,16)],{groupType:'superset',reps:'15-20'});
 const future=ex([{},{},{}],{groupType:'superset',reps:'15-20',rest:'90s',notes:'superset'});
 const data=fixture(source,future);refresh(data);assert.equal(prefill(data,2).weight,'10');assert.equal(future.rest,'90s');assert.equal(future.groupType,'superset');
});

test('empty per-series kg inherits a valid original exercise range',()=>{
 const p=setPrescription(ex([], {sets:[{targetKg:''}],kgMin:70,kgMax:75}),0);
 assert.deepEqual(p.kg,{min:70,max:75});
});
test('small RPE increase does not prevent all-set range progression and rep reset',()=>{
 const data=fixture(undefined,ex([{},{},{}],{targetRpe:'8.5'}));refresh(data);
 assert.ok(Number(prefill(data,2).weight)>80);assert.equal(prefill(data,2).reps,'8');
});
test('configured large increments do not bypass the progression cap',()=>{
 const p=workingProposal(ex(),0,{exposures:[ex([done(),done(),done()])],equipment:{barbell:10}});
 assert.ok(p.weight<=84);assert.ok(p.weight>80);
});

test('legacy top-set RPE is distinct from inherited back-off RPE',()=>{
 const mixed=ex([], {topset:'1x3 @100kg (RPE max 8.0)',targetRpe:'6.5',sets:[{targetReps:'6-8',targetRpe:'6.5'},{targetReps:'6-8',targetRpe:'6.5'}]});
 assert.equal(setPrescription(mixed,0).rpe.max,8);assert.equal(setPrescription(mixed,1).rpe.max,6.5);
});
test('theoretical unavailable load includes a verified lighter alternative when one exists',()=>{
 const p=workingProposal(ex(),0,{exposures:[ex([done(),done(),done()])],equipment:{availableLoads:{barbell:[80]}}});
 assert.ok(p.weight>80);assert.equal(p.alternativeWeight,80);assert.match(p.reason,/disponibile: 80 kg/);
});

test('opening a fully completed mesocycle adds no proposals or audit metadata',()=>{
 const data=fixture();for(const w of meso(data).weeks)w.days[0].exercises[0].loggedSets=[done(),done(),done()];
 const before=JSON.stringify(data);assert.equal(refresh(data),false);assert.equal(JSON.stringify(data),before);
});

test('an explicit per-series RPE overrides a different legacy top-set hint',()=>{
 const mixed=ex([], {topset:'1x3 @100kg (RPE 8)',targetRpe:'6.5',sets:[{targetReps:'3',targetRpe:'9'}]});
 assert.equal(setPrescription(mixed,0).rpe.max,9);
});

test('starting a session retains its transferred proposal and consumes the source only once',()=>{
 const data=fixture();refresh(data);meso(data).weeks[1].days[0].sessionStart=Date.now();refresh(data);
 assert.equal(prefill(data,2).weight,'82');assert.equal(prefill(data,3).weight,'80');
 lift(data,1).loggedSets[2].completed=false;lift(data,1).loggedSets[2].isLocked=false;refresh(data);
 assert.equal(prefill(data,2).weight,'80','corrected origin still invalidates an untouched proposal');
});
