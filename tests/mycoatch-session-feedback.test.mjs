import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSessionExerciseFeedback} from '../mycoatch/sessionFeedback.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
const set=(reps=11,rpe=8,weight=15)=>({reps,rpe,weight,isLocked:true,completed:true});
const exercise=(extra={})=>({name:'Curl Manubri su Panca Inclinata',set:'3 set',reps:'10-12',rpe:8.5,targetRpe:8.5,recupero:'90s',sets:[{},{},{}],loggedSets:[set(),set(11,8,12.5),set(11,8,12.5)],...extra});
const report=ex=>buildSessionExerciseFeedback({exercises:[ex]})[0];

test('per-series feedback respects fixed top set and different back-off prescriptions',()=>{
 const ex=exercise({reps:'6-8',rpe:8,targetRpe:8,sets:[{targetReps:3,targetRpe:8,role:'top'},{targetReps:'6-8',targetRpe:7,role:'backoff'},{targetReps:'6-8',targetRpe:7,role:'backoff'}],loggedSets:[set(3,8,80),set(8,8,70),set(6,7,70)]});
 const m=report(ex);assert.equal(m.rows[0].target.reps.min,3);assert.equal(m.rows[1].target.rpe.max,7);
 assert.match(m.messages.join(' '),/Sforzo superiore al previsto nelle serie 2/);
 assert.match(m.messages.join(' '),/Reps entro l’obiettivo in 3\/3/);
 assert.equal(m.next,null);
});

test('opposite RPE deviations cannot cancel in a mean; programmed RPE 10 is respected',()=>{
 const m=report(exercise({rpe:8,targetRpe:8,loggedSets:[set(10,7),set(10,9),set(10,8)]}));
 assert.match(m.messages.join(' '),/superiore al previsto nelle serie 2/);
 assert.match(m.messages.join(' '),/inferiore al previsto nelle serie 1/);
 const failure=report(exercise({rpe:10,targetRpe:10,loggedSets:[set(10,10),set(10,10),set(10,10)]}));
 assert.doesNotMatch(failure.messages.join(' '),/superiore|riduc|calo/);assert.match(failure.messages.join(' '),/RPE entro l’obiettivo in 3\/3/);
});

test('missing RPE, invalid and unconfirmed sets are explicit and never invented',()=>{
 const ex=exercise({loggedSets:[set(9,''),{...set(),weight:''},{weight:15,reps:12,rpe:8}]});const m=report(ex);
 assert.match(m.messages.join(' '),/non confermate: 3/);assert.match(m.messages.join(' '),/Dati da verificare nelle serie 2/);
 assert.match(m.messages.join(' '),/RPE mancante o non valido nelle serie 1/);assert.match(m.messages.join(' '),/Reps sotto obiettivo nelle serie 1/);
 assert.equal(m.rows[2].actualReps,'—');assert.equal(m.rows[2].rpe,null);
});

test('warm-ups are excluded and row indices stay original; unknown targets are disclosed',()=>{
 const ex=exercise({sets:[{isWarmup:true},{},{}],loggedSets:[set(),set(),set()]});
 assert.deepEqual(report(ex).rows.map(r=>r.index),[1,2]);
 assert.deepEqual(buildSessionExerciseFeedback({exercises:[{...ex,isWarmup:true}]}),[]);
 const m=report(exercise({reps:'',rpe:'',targetRpe:''}));
 assert.match(m.messages.join(' '),/Obiettivo reps non disponibile/);assert.match(m.messages.join(' '),/Obiettivo RPE non disponibile/);
});

test('reps and RPE ranges are compared as ranges; special techniques keep their actual notation',()=>{
 const m=report(exercise({targetRpe:'7-9',loggedSets:[set(12,7),set(12,8),set(12,9)]}));
 assert.match(m.messages.join(' '),/Tutte le 3 serie al limite superiore/);assert.match(m.messages.join(' '),/RPE entro l’obiettivo/);
 assert.equal(m.next,null);
 const special=report(exercise({isDropset:true,loggedSets:[set('10+5',9),set('9+4',9),set('8+3',9)]}));
 assert.equal(special.rows[0].actualReps,'10+5');assert.match(special.messages.join(' '),/Tecnica speciale/);
 assert.doesNotMatch(special.messages.join(' '),/Reps sotto|Reps oltre/);
});

function actualPlan(){
 const source=exercise(),next=exercise({loggedSets:[{},{},{}]});
 const day={dayNumber:1,completed:true,exercises:[source]};
 const meso={weeks:[{weekNumber:1,days:[day,{dayNumber:2,exercises:[next]}]}]};
 const data={athlete:{},history:{years:{2026:{mesocycles:[meso]}}}};
 reconcileTrainingPlan(data,{year:2026,mesoIndex:0});return {source,next,day,meso,data};
}

test('next exposure reports only actual protocol proposals with matching source evidence',()=>{
 const {day,data}=actualPlan();const before=JSON.stringify(data);
 const m=buildSessionExerciseFeedback(day,data)[0];
 assert.equal(m.next.dayNumber,2);assert.deepEqual(m.next.changes.map(c=>[c.index,c.weight,c.reps,c.repsDelta]),[[0,15,12,1]]);
 assert.equal(JSON.stringify(data),before);
});

test('future manual entries are preserved; stale, unrelated and archived evidence is not claimed',()=>{
 const {source,next,day,data}=actualPlan();next.loggedSets[0].reps=10;
 assert.equal(buildSessionExerciseFeedback(day,data)[0].next.changes[0].manual,true);assert.equal(next.loggedSets[0].reps,10);
 source.loggedSets[0].reps=10;assert.equal(buildSessionExerciseFeedback(day,data)[0].next,null);
 source.loggedSets[0].reps=11;next.coachSetProposals[0].basedOn[0].source.archiveIndex=0;
 assert.equal(buildSessionExerciseFeedback(day,data)[0].next,null);
});

test('report never invents progression when no generated update exists or mesocycle is locked',()=>{
 const {day,data,meso,next}=actualPlan();meso.locked=true;assert.equal(buildSessionExerciseFeedback(day,data)[0].next,null);
 meso.locked=false;next.coachSetProposals=null;assert.equal(buildSessionExerciseFeedback(day,data)[0].next,null);
});
