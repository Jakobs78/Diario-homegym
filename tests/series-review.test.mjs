import test from 'node:test';
import assert from 'node:assert/strict';
import {setReview,excludedFromCoaching} from '../mycoatch/setReview.js';
import {needsSeriesClarification} from '../mycoatch/seriesClarification.js';
import {observed} from '../mycoatch/setPrescription.js';
import {workingProposal,nextBlockDecision} from '../mycoatch/protocolLoad.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
import {buildSessionExerciseFeedback} from '../mycoatch/sessionFeedback.js';
import {analyzeCompletedMesocycle} from '../mycoatch/historyAnalysis.js';
const done=(weight,reps,rpe=7.5)=>({weight,reps,rpe,isLocked:true,completed:true});
const ex=(logs,rest='150s')=>({name:'Squat Con Bilanciere',sets:[{},{},{}],set:'3 set',reps:'5-6',rpe:7.5,targetRpe:7.5,kgMin:70,kgMax:70,rest,loggedSets:logs});
const fixture=()=>{const source=ex([done(82,7),done(82,7),done(82,7)]),a=ex([{},{},{}],'180s'),b=ex([{},{},{}]);const day={completed:true,dayNumber:4,exercises:[source]};const meso={weeks:[{weekNumber:2,days:[day]},{weekNumber:3,days:[{dayNumber:2,exercises:[a]},{dayNumber:4,exercises:[b]}]}]};return {source,a,b,day,data:{athlete:{loadingSteps:{barbell:2.5}},history:{years:{2026:{mesocycles:[meso]}}}}};};
test('an incompatible earlier squat does not consume the next eligible Lower B increase; summary finds it',()=>{
 const {a,b,day,data}=fixture();reconcileTrainingPlan(data,{year:2026,mesoIndex:0});
 assert.equal(a.coachSetProposals[0].weight,82);assert.ok(b.coachSetProposals.every(p=>p.weight>82&&p.reps===5));
 const report=buildSessionExerciseFeedback(day,data)[0];assert.equal(report.next.dayNumber,4);assert.equal(report.next.weekNumber,3);
 const once=JSON.stringify(data);reconcileTrainingPlan(data,{year:2026,mesoIndex:0});assert.equal(JSON.stringify(data),once);
});
test('all high-rep series at the upper bound still progress without e1RM',()=>{
 const s={...ex([done(10,20,8),done(10,20,8),done(10,20,8)]),name:'Alzate Laterali con Manubri',reps:'15-20',rpe:8,targetRpe:8};
 assert.equal(nextBlockDecision(s,0).kind,'increase_load');
});
test('pain and distraction keep performed results but are not observed coaching evidence',()=>{
 for(const reason of ['pain','distraction','technique']){const s=ex([done(80,8),done(80,4)]);setReview(s.loggedSets[1],reason);assert.equal(observed(s,1),null);assert.equal(s.loggedSets[1].reps,4);assert.equal(s.loggedSets[1].completed,true);assert.equal(excludedFromCoaching(s.loggedSets[1]),true);}
});
test('a valid calibration row supplies the same reference to homogeneous future series, not the largest tonnage',()=>{
 const s={...ex([done(80,13,7),done(95,11,7)]),sets:[{},{}],set:'2 set',reps:'8-10',rpe:7,targetRpe:7};setReview(s.loggedSets[1],'calibration');
 const upcoming={...s,loggedSets:[{},{}],targetRpe:7.5,rpe:7.5};const before=JSON.stringify(s);
 const p=[0,1].map(i=>workingProposal(upcoming,i,{exposures:[s]}));assert.equal(p[0].weight,p[1].weight);assert.equal(p[0].kind,'calibration_reference');assert.equal(JSON.stringify(s),before);
});
test('pain on a discarded series does not create an automatic increase from the remaining single set',()=>{
 const s={...ex([done(80,8,6),done(80,4,8)]),sets:[{},{}],set:'2 set',reps:'6-8'};setReview(s.loggedSets[1],'pain');
 const upcoming={...s,loggedSets:[{},{}]};for(const i of [0,1]){const p=workingProposal(upcoming,i,{exposures:[s]});assert.ok(p.weight<=80);assert.notEqual(p.kind,'increase_load');}
 assert.equal(nextBlockDecision(s,0),null);
});
test('an excluded low series does not become a false decline in a later massimal estimate',()=>{
 const s=ex([done(80,8),done(40,2),done(80,8)]);setReview(s.loggedSets[1],'distraction');
 const analysis=analyzeCompletedMesocycle({weeks:[{weekNumber:1,days:[{exercises:[s]}]}]});assert.equal(analysis.byExercise['squat con bilanciere'].validSets,2);
});
test('questions wait for exercise completion and distinguish prescribed top/backoff from accidental differences',()=>{
 const s={...ex([done(80,8),{weight:80,reps:4}]),sets:[{},{}],set:'2 set',reps:'6-8'};assert.equal(needsSeriesClarification(s),false);
 s.loggedSets[1]=done(80,4);assert.equal(needsSeriesClarification(s),true);setReview(s.loggedSets[1],'distraction');assert.equal(needsSeriesClarification(s),false);
 const mixed={...ex([done(100,3),done(80,8)]),sets:[{targetReps:3,role:'top'},{targetReps:'6-8',role:'backoff'}]};assert.equal(needsSeriesClarification(mixed),false);
});
test('a new session clears flags only from new rows, keeping the prior archive and backup lossless',async()=>{
 const {repeatCompletedSessionPreservingHistory}=await import('../js/historySafety.js');
 const {buildFullBackup,readFullBackup}=await import('../js/fullBackup.js');
 const exercise={...ex([done(80,8),done(80,4)]),sets:[{},{}],set:'2 set'};setReview(exercise.loggedSets[1],'pain','Improvviso');
 const day={completed:true,exercises:[exercise]};repeatCompletedSessionPreservingHistory(day);
 assert.equal(exercise.loggedSets[1].coachReview,undefined);assert.equal(day.sessionArchives[0].exercises[0].loggedSets[1].coachReview.reason,'pain');
 const data={history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days:[day]}]}]}}}};
 const restored=readFullBackup(JSON.stringify(buildFullBackup(data)));assert.equal(restored.history.years[2026].mesocycles[0].weeks[0].days[0].sessionArchives[0].exercises[0].loggedSets[1].coachReview.note,'Improvviso');
});
test('an explicitly intentional weight variation is preserved without another calibration question or independent increases',()=>{
 const source={...ex([done(80,10,7.5),done(95,8,7.5)]),sets:[{},{}],set:'2 set',reps:'8-10'};setReview(source.loggedSets[1],'intentional');
 const next={...source,loggedSets:[{},{}]};const proposals=[0,1].map(i=>workingProposal(next,i,{exposures:[source]}));
 assert.deepEqual(proposals.map(p=>p.weight),[80,95]);assert.ok(proposals.every(p=>p.kind!=='increase_load'));assert.equal(needsSeriesClarification(source),false);
});
