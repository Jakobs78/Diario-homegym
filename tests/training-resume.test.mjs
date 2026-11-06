import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingResumeDestination,planResumeTarget,sessionStarted,activateTrainingPlan,pauseOvernightSession} from '../mycoatch/trainingResume.js';
const log=()=>({weight:50,reps:8,rpe:8,isLocked:true});
const day=(n,extra={})=>({dayNumber:n,dayName:['Upper A','Lower A','Upper B','Lower B'][n-1],exercises:[{name:'Panca Piana con Bilanciere',set:'2 set',setsCount:2,reps:'6-8',sets:[{},{}],loggedSets:[{},{}]}],...extra});
const plan=(id,days=[day(1),day(2),day(3),day(4)])=>({id,name:id,weeks:[{weekNumber:3,days}]});

test('resume prioritizes an already started incomplete session over earlier untouched days',()=>{
 const m=plan('current');m.weeks[0].days[3].isPaused=true;m.weeks[0].days[3].accumulatedSeconds=600;
 const before=JSON.stringify(m),target=planResumeTarget(m);
 assert.equal(target.label,'Riprendi Lower B – settimana 3');assert.equal(target.dayNumber,4);
 assert.equal(JSON.stringify(m),before);
});
test('prefilled values and stale completed flags cannot start or resolve a session',()=>{
 const m=plan('current');const d=m.weeks[0].days[0];d.completed=true;
 d.exercises[0].loggedSets=[{weight:50,reps:8,rpe:8},{}];
 assert.equal(sessionStarted(d),false);assert.equal(planResumeTarget(m).label,'Inizia Upper A – settimana 3');
 d.exercises[0].loggedSets[0].manualFields={weight:true};
 assert.equal(planResumeTarget(m).label,'Riprendi Upper A – settimana 3');
 d.exercises[0].loggedSets[0].weight='';
 assert.equal(planResumeTarget(m).label,'Inizia Upper A – settimana 3');
});
test('valid completed work advances; invalid checked work remains to resume',()=>{
 const m=plan('current'),first=m.weeks[0].days[0];
 first.exercises[0].loggedSets=[log(),log()];assert.equal(planResumeTarget(m).dayNumber,2);
 first.exercises[0].loggedSets[1].weight='';assert.equal(planResumeTarget(m).dayNumber,1);
});
test('explicit skips resolve remaining work without inventing performances',()=>{
 const m=plan('current'),ex=m.weeks[0].days[0].exercises[0];
 ex.loggedSets=[log(),{}];ex.sessionSkip={active:true};
 assert.equal(planResumeTarget(m).dayNumber,2);assert.equal(ex.loggedSets[1].isLocked,undefined);
});
test('active programme is independent of historical year/index and stable across array changes',()=>{
 const current=plan('current'),other=plan('other');other.weeks[0].days[0].isPaused=true;
 const data={activeTrainingPlan:{mesocycleId:'current'},history:{years:{2025:{mesocycles:[other]},2026:{mesocycles:[current]}}}};
 assert.equal(trainingResumeDestination(data).year,'2026');
 data.history.years[2026].mesocycles.unshift(plan('inserted'));
 assert.equal(trainingResumeDestination(data).mesoIndex,1);
});
test('legacy selection prefers real unfinished activity, then newest available programme; closed active stays closed',()=>{
 const old=plan('old'),recent=plan('recent');old.weeks[0].days[1].isPaused=true;
 const data={history:{years:{2025:{mesocycles:[old]},2026:{mesocycles:[recent]}}}};
 assert.equal(trainingResumeDestination(data).mesocycleId,'old');
 delete old.weeks[0].days[1].isPaused;assert.equal(trainingResumeDestination(data).mesocycleId,'recent');
 data.activeTrainingPlan={mesocycleId:'recent'};recent.locked=true;
 assert.equal(trainingResumeDestination(data),null);
});
test('explicit activation assigns a stable id; completed programmes have no next session',()=>{
 const m=plan(null),data={history:{years:{2026:{mesocycles:[m]}}}};
 activateTrainingPlan(data,2026,0);assert.ok(m.id);assert.equal(data.activeTrainingPlan.mesocycleId,m.id);
 for(const d of m.weeks[0].days)d.exercises[0].loggedSets=[log(),log()];
 assert.equal(trainingResumeDestination(data).target,null);
 m.locked=true;assert.throws(()=>activateTrainingPlan(data,2026,0));
});
test('overnight pause preserves measured duration, dates and all registered sets',()=>{
 const d=day(1,{sessionStart:new Date(2026,10,5,18).getTime(),accumulatedSeconds:420,date:'2026-11-05'});
 d.exercises[0].loggedSets=[log(),{}];const before=JSON.stringify(d.exercises);
 assert.equal(pauseOvernightSession(d,new Date(2026,10,6,18)),true);
 assert.equal(d.accumulatedSeconds,420);assert.equal(d.isPaused,true);assert.equal(d.sessionStart,null);
 assert.equal(d.date,'2026-11-05');assert.equal(JSON.stringify(d.exercises),before);
 assert.equal(pauseOvernightSession(d,new Date(2026,10,7,18)),false);
});
