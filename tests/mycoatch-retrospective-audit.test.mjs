import test from 'node:test';
import assert from 'node:assert/strict';
import { replayCoachingDecisions } from '../mycoatch/retrospectiveAudit.js';
import { planAdaptiveDecisions } from '../mycoatch/adaptiveDecisions.js';
import { canonicalExerciseKey } from '../mycoatch/exerciseIdentity.js';

const bench='Panca Piana con Bilanciere';
const key=canonicalExerciseKey(bench);
const actual=(kg,rpe='7')=>({weight:String(kg),reps:'8',rpe,
    isLocked:true,completed:true});
const week=(n,date,kg=80,rpe='7')=>({
    weekNumber:n,days:[{dayNumber:1,dayName:'Upper A',sessionCompletedAt:date,
        exercises:[{name:bench,set:'2 set',reps:'6-8',targetRpe:'@8',
            loggedSets:[actual(kg,rpe),actual(kg,rpe)]}]}]
});
const diary=(weeks)=>({athlete:{privateEmail:'never-export'},
    history:{years:{2026:{mesocycles:[{name:'Blocco storico',weeks}]}}}});
const checkpoints=['2026-10-07T12:00:00Z','2026-10-15T12:00:00Z'];

test('il replay non legge la settimana futura prima del cutoff',()=>{
    const first=week(1,'2026-10-06T19:00:00Z');
    const second=week(2,'2026-10-14T19:00:00Z');
    const later=week(3,'2026-10-21T19:00:00Z',150,'8');
    const full=diary([first,second,later]);
    const original=JSON.stringify(full);
    const result=replayCoachingDecisions(full,{checkpoints});
    const withoutFuture=replayCoachingDecisions(diary([first,second]),{checkpoints});
    assert.equal(JSON.stringify(full),original,'non muta il diario originale');
    assert.equal(result.kind,'mycoatch-retrospective-replay');
    assert.equal(result.snapshots.length,2);
    assert.deepEqual(result.snapshots.map(s=>s.byExercise),
        withoutFuture.snapshots.map(s=>s.byExercise));
    assert.deepEqual(result.snapshots.map(s=>s.byMuscle),
        withoutFuture.snapshots.map(s=>s.byMuscle));
    assert.equal(result.snapshots[0].byExercise[key].action,'maintain');
    assert.equal(result.snapshots[1].byExercise[key].action,'increase_load');
    assert.equal(result.snapshots[1].byExercise[key].proposedKg,82.5);
    assert.equal(result.snapshots[0].evidence.sessionsAnalyzed,1);
    assert.equal(result.snapshots[1].evidence.sessionsAnalyzed,2);
    assert.ok(result.snapshots[1].evidence.excludedFutureSets>=2);
});

test('ripetizioni completate senza RPE misurato non diventano una progressione',()=>{
    const result=replayCoachingDecisions(diary([
        week(1,'2026-10-06T19:00:00Z',80,''),
        week(2,'2026-10-14T19:00:00Z',80,'')
    ]),{checkpoints});
    assert.notEqual(result.snapshots[1].byExercise[key].action,'increase_load');
    assert.equal(result.snapshots[1].byExercise[key].confidence,'low');
});

test('due giorni con la stessa settimana reale non contano come due settimane di progresso',()=>{
    const result=replayCoachingDecisions(diary([
        week(1,'2026-10-13T19:00:00Z'),
        week(2,'2026-10-14T19:00:00Z')
    ]),{checkpoints:['2026-10-15T12:00:00Z']});
    assert.notEqual(result.snapshots[0].byExercise[key].action,'increase_load');
});

test('interruzione lunga disabilita suggerimenti da prestazioni vecchie',()=>{
    const result=replayCoachingDecisions(diary([
        week(1,'2026-09-02T19:00:00Z'),
        week(2,'2026-09-09T19:00:00Z')
    ]),{checkpoints:['2026-10-20T12:00:00Z']});
    assert.equal(result.snapshots[0].evidence.reentry,true);
    assert.deepEqual(result.snapshots[0].byExercise,{});
});

test('serie in futuro e non confermate non diventano prestazioni eseguite',()=>{
    const future=week(2,'2026-10-14T19:00:00Z',100);
    future.days[0].exercises[0].loggedSets[0].isLocked=false;
    future.days[0].exercises[0].loggedSets[0].completed=false;
    const out=replayCoachingDecisions(diary([
        week(1,'2026-10-06T19:00:00Z'),future
    ]),{checkpoints});
    assert.notEqual(out.snapshots[1].byExercise[key].action,'increase_load');
});

test('con fatica confermata, non si propongono riduzioni che l’inventario non permette',()=>{
    const signal={byExercise:{[key]:{
        name:bench,category:'Petto',equipment:'barbell',
        lastKg:100,lastWorkingKg:100,fatigueConcern:true,
        progressionEvidence:{distinctWeeks:3,evidenceWeeks:['a','b','c']},
        status:'stable',avgRpe:9.5
    }},byMuscle:{}};
    const stock={barbell:2.5,plateInventories:{'50':{}},
        barbellAssignments:{[key]:{weight:20,diameter:'50'}}};
    const unavailable=planAdaptiveDecisions(signal,{loadingSteps:stock}).byExercise[key];
    assert.equal(unavailable.action,'review_recovery');
    assert.equal(unavailable.plannedKg,100);
    assert.match(unavailable.reason,/non risulta componibile/);
    const normal=planAdaptiveDecisions(signal,{loadingSteps:{barbell:2.5}}).byExercise[key];
    assert.equal(normal.action,'reduce_load');
    assert.equal(normal.plannedKg,97.5);
});

test('non suggerire incrementi o tagli irreali per piccoli carichi',()=>{
    const result=planAdaptiveDecisions({byExercise:{'small':{
        name:'Panca Piana con Bilanciere',lastKg:10,lastWorkingKg:10,
        equipment:'barbell',fatigueConcern:true,
        progressionEvidence:{distinctWeeks:2},status:'stable',avgRpe:9.5
    }},byMuscle:{}},{loadingSteps:{barbell:2.5}});
    assert.equal(result.byExercise.small.action,'review_recovery');
    assert.equal(result.byExercise.small.plannedKg,10);
});

test('cutoff non valido o disordinato: errore prima di produrre risultati',()=>{
    const h=diary([week(1,'2026-10-06T19:00:00Z')]);
    assert.throws(()=>replayCoachingDecisions(h,{checkpoints:[]}),/1 a 52/);
    assert.throws(()=>replayCoachingDecisions(h,{checkpoints:['2026-10-20']}),/ISO 8601/);
    assert.throws(()=>replayCoachingDecisions(h,{checkpoints:[
        '2026-10-15T12:00:00Z','2026-10-07T12:00:00Z'
    ]}),/crescenti/);
});
