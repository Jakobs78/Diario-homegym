import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveMesocyclePolicy} from '../mycoatch/periodizationPolicy.js';
const qualified=(category,extra={})=>({category,progressionEvidence:{distinctWeeks:2,recentWeeksQualified:true,readyForReps:true},...extra});
test('adaptive deload retains safe default if evidence is missing',()=>{
 const p=deriveMesocyclePolicy({durationWeeks:4},{byExercise:{}},{});
 assert.equal(p.deloadWeek,4);
 assert.match(p.deloadRationale,/insufficienti/);
});
test('no obligatory fourth-week deload with multiple reliable, progressing regions',()=>{
 const history={byExercise:{bench:qualified('Petto'),row:qualified('Back_Thickness'),squat:qualified('Quadricipiti')}};
 const p=deriveMesocyclePolicy({durationWeeks:4},history,{});
 assert.equal(p.deloadWeek,null);
 assert.equal(p.weeks[3].isDeload,false);
 assert.equal(p.evidence.bodyRegions,3);
});
test('user-requested deload overrides good progress, except verified diffuse fatigue',()=>{
 const byExercise={bench:qualified('Petto'),row:qualified('Back_Thickness'),squat:qualified('Quadricipiti')};
 assert.equal(deriveMesocyclePolicy({durationWeeks:4,deloadWeek:4},{byExercise},{}).deloadWeek,4);
 assert.equal(deriveMesocyclePolicy({durationWeeks:4,deloadWeek:false},{byExercise},{}).deloadWeek,null);
 const fatigue={byExercise:{bench:qualified('Petto',{fatigueConcern:true}),squat:qualified('Quadricipiti',{fatigueConcern:true})}};
 const safety=deriveMesocyclePolicy({durationWeeks:4,deloadWeek:false},fatigue,{});
 assert.equal(safety.deloadWeek,1);
});
test('local fatigue alone does not impose global first-week deload',()=>{
 const history={byExercise:{bench:qualified('Petto',{fatigueConcern:true})}};
 const p=deriveMesocyclePolicy({durationWeeks:4},history,{});
 assert.equal(p.recoveryScope,'local');
 assert.equal(p.deloadWeek,4);
});


test('Full Body a 4 giorni: nessuno scarico fisso in assenza di segnali',()=>{
 const p=deriveMesocyclePolicy({durationWeeks:4,splitPreference:'fullbody'},
    {byExercise:{}},{});
 assert.equal(p.deloadWeek,null);
 assert.equal(p.weeks[3].isDeload,false);
 assert.match(p.deloadRationale,/niente scarico automatico/);
});
test('Full Body: mantenimento dello scarico esplicito e recupero prioritario',()=>{
 const base={durationWeeks:4,splitPreference:'fullbody'};
 assert.equal(deriveMesocyclePolicy({...base,deloadWeek:true},{byExercise:{}},{}).deloadWeek,4);
 assert.equal(deriveMesocyclePolicy({...base,deloadWeek:3},{byExercise:{}},{}).deloadWeek,3);
 const fatigue={byExercise:{
    bench:qualified('Petto',{fatigueConcern:true}),
    squat:qualified('Quadricipiti',{fatigueConcern:true})
 }};
 assert.equal(deriveMesocyclePolicy({...base,deloadWeek:false},fatigue,{}).deloadWeek,1);
});
test('Full Body guidato: l ultima settimana di consolidamento non riusa RPE da scarico',()=>{
 const guided={calibrationWeek:true,experience:'beginner',rpeTargets:[6.5,7,7.5,6]};
 const result=deriveMesocyclePolicy({durationWeeks:4,splitPreference:'fullbody'},
    {byExercise:{}},guided);
 assert.equal(result.weeks[3].phase,'consolidation');
 assert.equal(result.weeks[3].isDeload,false);
 assert.equal(result.weeks[3].targetRpe,7.5);
});
