import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveMesocyclePolicy} from '../mycoatch/periodizationPolicy.js';
const qualified=(category,extra={})=>({category,progressionEvidence:{distinctWeeks:2,recentWeeksQualified:true,readyForReps:true},...extra});
test('nessuno scarico obbligatorio se mancano dati, si calibra e si monitora',()=>{
 const p=deriveMesocyclePolicy({durationWeeks:4},{byExercise:{}},{});
 assert.equal(p.deloadWeek,null);
 assert.match(p.deloadRationale,/limitati/);
 assert.equal(p.weeks[3].isDeload,false);
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
 assert.equal(p.deloadWeek,null);
});

test('scarico finale solo su scelta esplicita; recupero diffuso prevale sulla scelta',()=>{
 const base={durationWeeks:4};
 assert.equal(deriveMesocyclePolicy(base,{byExercise:{}},{}).deloadWeek,null);
 assert.equal(deriveMesocyclePolicy({...base,deloadWeek:true},{byExercise:{}},{}).deloadWeek,4);
 assert.equal(deriveMesocyclePolicy({...base,deloadWeek:3},{byExercise:{}},{}).deloadWeek,3);
 const repeated={byExercise:{
   bench:qualified('Petto',{fatigueConcern:true}),
   squat:qualified('Quadricipiti',{fatigueConcern:true})
 }};
 assert.equal(deriveMesocyclePolicy({...base,deloadWeek:false},repeated,{}).deloadWeek,1);
});
