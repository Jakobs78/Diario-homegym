import test from 'node:test';
import assert from 'node:assert/strict';
import {isExerciseSkipped,setExerciseSkipped,sessionWorkCounts} from '../js/sessionSkip.js';
import {isWarmupExercise} from '../js/workoutSemantics.js';
import {buildLiveSessionSnapshot,assessExerciseLive} from '../mycoatch/liveCoach.js';
import {nextBlockDecision,workingProposal} from '../mycoatch/protocolLoad.js';
import {buildMesocyclePdfDetails} from '../js/mesocyclePdfModel.js';
import {buildSessionExerciseFeedback} from '../mycoatch/sessionFeedback.js';
import {isMesocycleCompleted,repeatCompletedSessionPreservingHistory} from '../js/historySafety.js';
import {hasPendingWorkingSets,circuitRoundComplete} from '../js/restPolicy.js';
import {trainingExposures} from '../mycoatch/trainingHistory.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
import {exerciseCoachModel} from '../mycoatch/coachCommunication.js';
import {summarizeMesocycleClosure} from '../js/mesocycleClosure.js';
const done=(reps=6,rpe=7)=>({weight:80,reps,rpe,isLocked:true,completed:true});
const ex=(logs=[{},{},{}],extra={})=>({name:'Panca Piana con Bilanciere',reps:'5-6',targetRpe:7.5,recupero:'120s',sets:[{},{},{}],loggedSets:logs,...extra});
const plan=(days)=>({history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days}]}]}}}});
test('skip requires a nonblank existing personal note; it is distinct from W and preserves completed work',()=>{
 const e=ex([done(),{},{}]),before=structuredClone(e);
 for(const note of ['', '   '])assert.throws(()=>setExerciseSkipped(e,true,note),/note personali/);
 assert.deepEqual(e,before);setExerciseSkipped(e,true,'Dolore durante il movimento');
 assert.equal(isExerciseSkipped(e),true);assert.equal(isWarmupExercise(e),false);assert.deepEqual(e.loggedSets,before.loggedSets);
 assert.throws(()=>setExerciseSkipped(ex([], {isWarmup:true}),true,'Nota'),/riscaldamento/);
 assert.throws(()=>setExerciseSkipped(ex([done(),done(),done()]),true,'Nota'),/Non ci sono/);
});
test('skip resolves pending work, never creates checked sets or conceals malformed confirmations',()=>{
 const a=ex([done(),{},{}]),b=ex([done(),done(),done()]);setExerciseSkipped(a,true,'Attrezzo indisponibile');const day={exercises:[a,b]};
 assert.deepEqual(sessionWorkCounts(day),{planned:6,confirmed:4,skipped:2,required:4,finished:true});
 const snap=buildLiveSessionSnapshot(day);assert.equal(snap.finished,true);assert.equal(snap.checkedSets,4);assert.equal(snap.skippedSets,2);assert.equal(hasPendingWorkingSets(day),false);
 assert.equal(assessExerciseLive(a),null);a.loggedSets[1]={isLocked:true};assert.equal(sessionWorkCounts(day).finished,false);
});
test('all exercises skipped can conclude a day without inventing a performed workout',()=>{
 const e=ex();setExerciseSkipped(e,true,'Sessione interrotta');const snap=buildLiveSessionSnapshot({exercises:[e]});
 assert.equal(snap.finished,true);assert.equal(snap.checkedSets,0);assert.equal(snap.validSets,0);assert.equal(snap.tonnageKg,0);
});
test('restoring reopens outstanding work and retains the note',()=>{
 const e=ex();setExerciseSkipped(e,true,'Tempo esaurito');setExerciseSkipped(e,false);
 assert.equal(isExerciseSkipped(e),false);assert.equal(sessionWorkCounts({exercises:[e]}).finished,false);assert.equal(e.userNotes,'Tempo esaurito');
});
test('skipping one circuit member permits remaining members, not phantom checks',()=>{
 const a=ex(),b=ex([done(),{},{}]);setExerciseSkipped(a,true,'Da saltare');assert.equal(circuitRoundComplete([a,b],0),true);assert.equal(circuitRoundComplete([a,b],1),false);assert.equal(a.loggedSets[0].isLocked,undefined);
});
test('PDF and session feedback retain reason and report the deliberate skip rather than a failure',()=>{
 const e=ex([done(),{},{}]);setExerciseSkipped(e,true,'Dolore spalla: esercizio interrotto');
 const meso={weeks:[{weekNumber:1,days:[{exercises:[e]}]}]};
 const rows=buildMesocyclePdfDetails(meso);assert.ok(rows.some(r=>r.kind==='note'&&r.label==='NOTE PERSONALI'&&r.text===e.userNotes));assert.ok(rows.some(r=>r.text?.includes('SALTATO')));
 const fb=buildSessionExerciseFeedback(meso.weeks[0].days[0])[0];assert.match(fb.messages.join(' '),/Dolore spalla/);assert.doesNotMatch(fb.messages.join(' '),/Serie non confermate/);assert.equal(fb.next,null);
 const review=summarizeMesocycleClosure(meso);assert.equal(review.skippedSets,2);assert.equal(review.completedSets,1);assert.equal(review.status,'complete');assert.equal(review.completedSessions,0);assert.equal(review.sessionsWithSkips,1);assert.equal(isMesocycleCompleted(meso),true);
});
test('repeat archives skipped state and notes but restores the exercise for the new attempt',()=>{
 const e=ex([done(),{},{}]);setExerciseSkipped(e,true,'Saltato solo oggi');const day={exercises:[e]};
 const archive=repeatCompletedSessionPreservingHistory(day);assert.equal(isExerciseSkipped(archive.exercises[0]),true);assert.equal(archive.exercises[0].userNotes,'Saltato solo oggi');assert.equal(isExerciseSkipped(e),false);assert.equal(e.loggedSets[0].isLocked,false);
});
test('skipped exercises cannot supply new load proposals or future progression evidence',()=>{
 const old=ex([done(),{},{}]);setExerciseSkipped(old,true,'Dolore');const next=ex();const days=[{exercises:[old]},{exercises:[next]}],data=plan(days);
 assert.equal(workingProposal(old,1),null);assert.equal(nextBlockDecision(old,1),null);
 assert.deepEqual(trainingExposures(data,{year:2026,mesoIndex:0,weekNumber:1,dayIndex:1},next),[]);
 reconcileTrainingPlan(data,{year:2026,mesoIndex:0});assert.equal(old.coachSetProposals[1],null);assert.equal(next.coachSetProposals[0].kind,'prescription');assert.deepEqual(exerciseCoachModel(old,{liveAdvice:{code:'high_effort',severity:'caution',nextSetIndex:1,message:'Non deve apparire'}}).updates,[]);
});
test('6-7-7 still progresses; 5-7-7 only progresses when every series supports the lower bound',()=>{
 let e=ex([done(6),done(7),done(7)]);assert.equal(nextBlockDecision(e,0,{barbell:1}).kind,'increase_load');
 e=ex([done(5),done(7),done(7)]);const p=nextBlockDecision(e,0,{barbell:1});assert.equal(p.weight,81);assert.equal(p.reps,5);assert.equal(p.progressionBasis,'mixed_reps');
 assert.ok(p.weight*(1+(p.reps+10-7.5)/30)<=80*(1+(5+10-7)/30)+.001,'new load is sustainable even for the weakest set');
 e.loggedSets[0].rpe=7.5;const hold=nextBlockDecision(e,0,{barbell:1});assert.equal(hold.weight,80);assert.equal(hold.kind,'build_reps');assert.equal(hold.reps,6);
});
test('mixed progression respects missing/high RPE, mixed weights, fixed reps, >12 range and fatigue',()=>{
 let e=ex([done(5),done(7),done(7)]);e.loggedSets[0].rpe='';assert.equal(nextBlockDecision(e,0),null);
 e=ex([done(5,8),done(7),done(7)]);assert.equal(nextBlockDecision(e,0),null);
 e=ex([done(5),done(7),done(7)]);e.loggedSets[1].weight=70;assert.equal(nextBlockDecision(e,0),null);
 e=ex([done(5),done(7),done(7)],{reps:'6'});assert.equal(nextBlockDecision(e,0),null);
 e=ex([done(15),done(21),done(21)],{reps:'15-20'});assert.equal(nextBlockDecision(e,0).kind,'build_reps');assert.equal(nextBlockDecision(e,0).weight,80);
 e=ex([done(5),done(7),done(7)]);assert.equal(nextBlockDecision(e,0,{}, {allowIncrease:false}),null);
});
test('rounded mixed increments cannot exceed the weakest-set estimate and communication never claims all sets reached the upper bound',()=>{
 const e=ex([done(5),done(7),done(7)]);e.loggedSets[0].rpe=7.4;
 assert.equal(nextBlockDecision(e,0,{barbell:1}).kind,'build_reps');
 const target=ex();const p=workingProposal(target,0,{exposures:[ex([done(5),done(7),done(7)])],equipment:{barbell:1}});
 assert.equal(p.progressionBasis,'mixed_reps');target.coachSetProposals=[p];const text=exerciseCoachModel(target).updates.map(u=>u.text).join(' ');
 assert.match(text,/meno favorevole/);assert.doesNotMatch(text,/Tutte le serie hanno raggiunto/);
});

test('skip exclusions do not leak to an identical exercise in the next session',()=>{
 const old=ex([done(),{},{}]);setExerciseSkipped(old,true,'Solo oggi');const next=ex();const data=plan([{exercises:[old]},{exercises:[next]}]);
 reconcileTrainingPlan(data,{year:2026,mesoIndex:0});assert.equal(isExerciseSkipped(next),false);assert.equal(next.sessionSkip,undefined);
});

test('an unknown inventory does not block a sustainable theoretical mixed progression through rounding',()=>{
 const e=ex([done(5),done(7),done(7)]);const p=nextBlockDecision(e,0,{});
 assert.equal(p.kind,'increase_load');assert.ok(p.weight>80);assert.ok(p.weight<=80*(1+(5+3)/30)/(1+(5+2.5)/30));assert.equal(p.verified,false);
});
