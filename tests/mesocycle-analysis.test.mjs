import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMesocycleAnalysis} from '../mycoatch/mesocycleAnalysis.js';
import {summarizeMesocycleClosure} from '../js/mesocycleClosure.js';
import {buildMesocycleReviewDossier,formatMesocycleReviewDossierMarkdown} from '../mycoatch/reviewDossier.js';
import {trainingExposures} from '../mycoatch/trainingHistory.js';
import {analyzeTrainingHistory} from '../mycoatch/historyInsights.js';
import {prepareRecentEvidence} from '../mycoatch/recentEvidence.js';
import {recentPainReports} from '../mycoatch/limitationsReview.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
import {resolveClosedMesocycle} from '../mycoatch/closureHandoff.js';
const row=(reps=8,rpe=8,weight=80)=>({weight,reps,rpe,isLocked:true,completed:true});
const ex=(reps=8)=>({name:'Panca Piana con Bilanciere',setsCount:2,reps:'6-10',rpe:8,restTime:'90s',loggedSets:[row(reps),row(reps)]});
const week=(n,reps=8)=>({weekNumber:n,days:[{dayNumber:1,sessionCompletedAt:`2026-10-${String(1+(n-1)*7).padStart(2,'0')}T12:00:00Z`,exercises:[ex(reps)]}]});
const plan=(...w)=>({name:'Analisi',weeks:w});
const exercise=(m,w)=>m.weeks[w].days[0].exercises[0];

test('analysis compares confirmed aliases and rejects recovery, target, station and effort changes',()=>{
 const m=plan(week(1),week(2,10));
 const before=JSON.stringify(m);let a=buildMesocycleAnalysis(m);
 assert.equal(a.exercises[0].status,'improving');assert.equal(JSON.stringify(m),before);
 exercise(m,0).name='Nome A';exercise(m,1).name='Nome B';
 for(const w of m.weeks)w.days[0].exercises[0].catalogMapping={confirmed:true,name:'Panca Piana con Bilanciere'};
 assert.equal(buildMesocycleAnalysis(m).exercises.length,1);
 assert.equal(buildMesocycleAnalysis(m).exercises[0].status,'improving');
 for(const mutate of [e=>e.restTime='300s',e=>e.rpe=9,e=>e.reps='8-12',e=>e.loggedSets[0].equipmentSnapshot={station:'nuova'},e=>e.loggedSets.forEach(r=>r.rpe=9)]){
  const copy=structuredClone(m);mutate(exercise(copy,1));
  assert.equal(buildMesocycleAnalysis(copy).exercises[0].status,'insufficient_data');
 }
 exercise(m,1).restTime='1:30';assert.equal(buildMesocycleAnalysis(m).exercises[0].status,'improving');
});
test('one lower exposure is not a repeated decline; three equivalent dated exposures can show it',()=>{
 const m=plan(week(1,10),week(2,9));
 assert.equal(buildMesocycleAnalysis(m).exercises[0].status,'decline_observed');
 m.weeks.push(week(3,8));const a=buildMesocycleAnalysis(m);
 assert.equal(a.exercises[0].status,'declining');
 assert.equal(a.suggestions[0].action,'review_data');
 assert.doesNotMatch(a.suggestions[0].text,/causa.*fatica/);
});
test('partial, skipped, special, undated, same calendar week and deload exposures do not prove progress',()=>{
 for(const mutate of [e=>e.loggedSets[1].completed=e.loggedSets[1].isLocked=false,e=>e.sessionSkip={active:true},e=>e.loggedSets[1].intensityTechnique='REST_PAUSE',e=>e.loggedSets[0].rpe='']){
  const m=plan(week(1),week(2,10));mutate(exercise(m,1));assert.equal(buildMesocycleAnalysis(m).exercises[0].status,'insufficient_data');
 }
 const m=plan(week(1),week(2,10));m.weeks[1].isDeloadWeek=true;assert.equal(buildMesocycleAnalysis(m).exercises[0].status,'insufficient_data');
 delete m.weeks[1].isDeloadWeek;m.weeks[1].days[0].sessionCompletedAt='2026-10-02T12:00:00Z';assert.equal(buildMesocycleAnalysis(m).exercises[0].status,'insufficient_data');
 delete m.weeks[1].days[0].sessionCompletedAt;assert.equal(buildMesocycleAnalysis(m).exercises[0].status,'insufficient_data');
});
test('mixed top/backoff roles are compared by matching rows, without e1RM on high reps',()=>{
 const m=plan(week(1),week(2));
 for(const w of m.weeks){const e=w.days[0].exercises[0];e.sets=[{targetReps:'3',targetRpe:8,role:'top'},{targetReps:'6-8',targetRpe:7,role:'backoff'}];e.loggedSets=[row(3,8,100),row(7,7,80)];}
 exercise(m,1).loggedSets=[row(3,8,102.5),row(8,7,80)];
 assert.equal(buildMesocycleAnalysis(m).exercises[0].status,'improving');
 exercise(m,1).sets[1].role='top';assert.equal(buildMesocycleAnalysis(m).exercises[0].status,'insufficient_data');
});
test('weekly volume excludes warmups, separates indirect credits and does not infer loss from partial or deload weeks',()=>{
 const m=plan(week(1),week(2),week(3));
 m.weeks[0].days[0].exercises.push({...ex(),isWarmup:true});
 exercise(m,1).loggedSets[1]=row(8);exercise(m,1).loggedSets[1].completed=false;exercise(m,1).loggedSets[1].isLocked=false;
 m.weeks[2].isDeloadWeek=true;
 const a=buildMesocycleAnalysis(m),chest=a.muscles.find(r=>r.muscle==='Petto');
 assert.equal(a.completeRegularWeeks,1);assert.equal(chest.directChange,null);assert.equal(chest.averagePerformedDirect,2);
 assert.equal(a.volumeWeeks[1].missingSets,1);assert.equal(a.volumeWeeks[0].plannedSets,2);
 assert.equal(a.volumeWeeks[0].performed.Petto.directSets,2);assert.equal(a.volumeWeeks[0].performed.Tricipiti.indirectSetCredits,1);
 assert.equal(a.volumeWeeks[0].performed.Tricipiti.directSets,0);
});
test('all skipped session stays complete-with-skips across summary, dossier and muscle volume, without exporting reason',()=>{
 const m=plan(week(1));const e=exercise(m,0);e.loggedSets.forEach(s=>{s.completed=false;s.isLocked=false;});e.sessionSkip={active:true};e.userNotes='PRIVATE_REASON';
 const d=buildMesocycleReviewDossier(m),s=summarizeMesocycleClosure(m),a=d.summary.analysis;
 assert.equal(s.sessionsWithSkips,1);assert.equal(s.completedSets,0);assert.equal(s.skippedSets,2);
 assert.equal(d.sessions[0].exercises[0].unconfirmedOrMissingSets,0);assert.equal(d.sessions[0].exercises[0].skippedSets,2);
 assert.equal(a.volumeWeeks[0].skipped.Petto.directSets,2);assert.equal(a.volumeWeeks[0].missingSets,0);
 assert.match(formatMesocycleReviewDossierMarkdown(d),/concluse con esclusioni: 1/);
 assert.doesNotMatch(JSON.stringify(d),/PRIVATE_REASON/);
});
test('dossier preserves per-row prescriptions, roles, warmup indices and structured drops',()=>{
 const m=plan(week(1));const e=exercise(m,0);
 e.sets=[{isWarmup:true},{targetReps:'3',targetRpe:8,kgMin:100,kgMax:105,role:'top'},{targetReps:'6-8',targetRpe:7,kgMin:80,kgMax:85,role:'backoff',intensityTechnique:'DROP_SET'}];
 e.loggedSets=[{...row(5),isWarmup:true},row(3,8,100),{...row(7,7,80),intensityTechnique:'DROP_SET',dropSegments:[{weight:60,reps:8,rpe:9}]}];
 const d=buildMesocycleReviewDossier(m),e2=d.sessions[0].exercises[0],md=formatMesocycleReviewDossierMarkdown(d);
 assert.deepEqual(e2.prescribedSets.map(r=>r.setNumber),[2,3]);
 assert.deepEqual(e2.prescribedSets[0].repetitions,{min:3,max:3});assert.equal(e2.prescribedSets[1].role,'backoff');
 assert.equal(e2.observedSets[1].dropSegments[0].weightKg,'60');assert.match(md,/Scarico 1 della serie 3: 60 kg/);
});
test('volume suggestions require actual recovery check-ins and never automatically add sets',()=>{
 const m=plan(week(1),week(2),week(3));
 assert.equal(buildMesocycleAnalysis(m).suggestions[0].action,'review_data');
 for(const w of m.weeks)w.days[0].coachCheckin={sleep:'ok',energy:'ok',soreness:'ok',pain:'none',checkedAt:w.days[0].sessionCompletedAt};
 assert.equal(buildMesocycleAnalysis(m).suggestions[0].action,'consider_targeted_increase');
 m.weeks[0].days[0].coachCheckin.pain='present';assert.equal(buildMesocycleAnalysis(m).suggestions[0].action,'review_data');
});
test('excluded blocks do not supply history, generator evidence, pain prompts or persisted future load proposals',()=>{
 const old=plan(week(1,10));old.excludedFromCoaching=true;
 old.weeks[0].days[0].coachCheckin={pain:'present',checkedAt:'2026-10-01T12:00:00Z'};
 const next=plan(week(1));next.weeks[0].days[0].exercises[0].loggedSets=[{weight:'',reps:'',rpe:''},{weight:'',reps:'',rpe:''}];
 const data={athlete:{},history:{years:{2026:{mesocycles:[old,next]}}}};
 const context={year:2026,mesoIndex:1,weekNumber:1,dayIndex:0};
 assert.equal(trainingExposures(data,context,exercise(next,0)).length,0);
 assert.equal(analyzeTrainingHistory(data).inspectedMesocycles,1);
 assert.equal(recentPainReports(data,{now:Date.parse('2026-10-10T12:00:00Z')}).length,0);
 const filtered=prepareRecentEvidence(data,{now:new Date('2026-10-10T12:00:00Z')});
 assert.equal(filtered.audit.recentSets,0);
 const source=structuredClone(data);source.history.years[2026].mesocycles[0].excludedFromCoaching=false;
 reconcileTrainingPlan(source,context);assert.ok(source.history.years[2026].mesocycles[1].weeks[0].days[0].exercises[0].coachSetProposals[0].basedOn.length);
 source.history.years[2026].mesocycles[0].excludedFromCoaching=true;reconcileTrainingPlan(source,context);
 assert.equal(source.history.years[2026].mesocycles[1].weeks[0].days[0].exercises[0].coachSetProposals[0].basedOn.length,0);
 old.locked=true;old.coachClosure={status:'closed',closedAt:'2026-10-10T12:00:00Z'};
 assert.throws(()=>resolveClosedMesocycle(data,{year:'2026',index:0,closedAt:old.coachClosure.closedAt}),/escluso/);
});

test('invalid confirmations are reported separately from skipped and truly missing rows',()=>{
 const m=plan(week(1));const e=exercise(m,0);e.setsCount=3;
 e.loggedSets=[row(8),{...row(8),weight:''},{weight:'',reps:'',rpe:'',completed:false}];
 e.sessionSkip={active:true};const d=buildMesocycleReviewDossier(m),r=d.summary.analysis.volumeWeeks[0];
 assert.deepEqual([r.performedSets,r.skippedSets,r.missingSets,r.invalidSets],[1,1,0,1]);
 assert.equal(d.sessions[0].exercises[0].unconfirmedOrMissingSets,0);
 assert.equal(d.summary.missingSets,0);assert.equal(d.summary.invalidConfirmedSets,1);
});
