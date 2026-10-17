import test from 'node:test';
import assert from 'node:assert/strict';
import {
    summarizeMesocycleClosure, closeMesocycleInMemory,
    formatMesocycleClosureForChat
} from '../js/mesocycleClosure.js';

const performed=(kg=80,reps=8,rpe='8',checked=true)=>({
    weight:String(kg),reps:String(reps),rpe,
    isLocked:checked,completed:checked
});
const exercise=(values=[performed(),performed()])=>({
    name:'Panca Piana con Bilanciere',setsCount:2,set:'2 set',
    reps:'6-10',rpe:'@8',loggedSets:values
});
const makeWeek=(num,values,extras={})=>({
    weekNumber:num,days:[{dayNumber:1,dayName:'Push',completed:!!extras.dayCompleted,
        sessionCompletedAt: extras.noDate ? undefined :
            new Date(Date.UTC(2026,9,1+(num-1)*7)).toISOString(),
        exercises:[exercise(values)],...(extras.archives?{sessionArchives:extras.archives}:{})}]
});
const plan=(...weeks)=>({name:'Test privato',weeks});

test('riepilogo puro: solo serie confermate e giorni realmente coperti',()=>{
    const meso=plan(makeWeek(1,[performed(),performed()]),
        makeWeek(2,[performed(80,9),performed(80,9,false)]),
        makeWeek(3,[performed(80,10,false),performed(80,10,false)]));
    const before=JSON.stringify(meso);
    const review=summarizeMesocycleClosure(meso);
    assert.equal(review.status,'partial');
    assert.equal(review.plannedSessions,3);
    assert.equal(review.completedSessions,1);
    assert.equal(review.partialSessions,1);
    assert.equal(review.skippedSessions,1);
    assert.equal(review.plannedSets,6);
    assert.equal(review.completedSets,3);
    assert.equal(review.adherencePercent,33);
    assert.equal(review.setCompletionPercent,50);
    assert.deepEqual(review.incompleteDays.map(d=>d.status),['partial','not_started']);
    assert.equal(JSON.stringify(meso),before);
});

test('RPE mancante: serie valida per completamento, non si inventa RPE',()=>{
    const result=summarizeMesocycleClosure(plan(makeWeek(1,[
        performed(80,8,''),performed(80,8,'8')
    ])));
    assert.equal(result.status,'complete');
    assert.equal(result.completedSets,2);
    assert.equal(result.measuredRpeSets,1);
    assert.equal(result.averageRpe,8);
});

test('spuntare righe senza pesi o reps validi non chiude il programma',()=>{
    const bad=plan(makeWeek(1,[{weight:'',reps:8,rpe:8,isLocked:true},
        {weight:80,reps:'',rpe:8,completed:true}]));
    const report=summarizeMesocycleClosure(bad);
    assert.equal(report.status,'not_started');
    assert.equal(report.invalidConfirmedSets,2);
    assert.equal(report.completedSets,0);
});

test('giorni ripetuti archiviati restano tracciati, ma non gonfiano aderenza',()=>{
    const archived=[{exercises:[exercise([performed(),performed()])]}];
    const r=summarizeMesocycleClosure(plan(makeWeek(1,[
        performed(80,8,false),performed(80,8,false)
    ],{archives:archived})));
    assert.equal(r.archivedRepeats,1);
    assert.equal(r.completedSessions,0);
    assert.equal(r.plannedSessions,1);
});

test('esercizi a corpo libero con zero kg espliciti sono validi',()=>{
    const meso=plan({weekNumber:1,days:[{dayNumber:1,exercises:[{
        name:'Hamstring Walkout a Corpo Libero',setsCount:2,
        loggedSets:[performed(0,8,''),performed(0,9,'7')]
    }]}]});
    const report=summarizeMesocycleClosure(meso);
    assert.equal(report.completedSets,2);
    assert.equal(report.status,'complete');
});

test('chiusura totale: salvare solo metadati, mantenere tutti i workout intatti',()=>{
    const meso=plan(makeWeek(1,[performed(),performed()]));
    const old=JSON.stringify(meso.weeks);
    const review=summarizeMesocycleClosure(meso);
    const closure=closeMesocycleInMemory(meso,review,{at:'2026-10-17T16:00:00Z'});
    assert.equal(closure.status,'closed');
    assert.equal(closure.incompleteAcknowledged,false);
    assert.equal(meso.locked,true);
    assert.equal(JSON.stringify(meso.weeks),old);
    assert.equal(closure.closedAt,'2026-10-17T16:00:00.000Z');
    assert.throws(()=>closeMesocycleInMemory(meso,review),/già concluso/);
});

test('chiusura anticipata richiede consenso dedicato e non cancella serie',()=>{
    const meso=plan(makeWeek(1,[performed(),performed(80,8,8,false)]));
    const before=JSON.stringify(meso);
    const review=summarizeMesocycleClosure(meso);
    assert.throws(()=>closeMesocycleInMemory(meso,review),/incompleto/);
    assert.equal(JSON.stringify(meso),before);
    closeMesocycleInMemory(meso,review,{acknowledgeIncomplete:true});
    assert.equal(meso.coachClosure.incompleteAcknowledged,true);
    assert.deepEqual(meso.weeks,JSON.parse(before).weeks);
});

test('anteprima obsoleta o senza piano non può bloccare alcun mesociclo',()=>{
    const meso=plan(makeWeek(1,[performed(),performed()]));
    const stale=summarizeMesocycleClosure(meso);
    meso.weeks[0].days[0].exercises[0].loggedSets[0].reps='9';
    assert.throws(()=>closeMesocycleInMemory(meso,stale),/cambiate/);
    assert.equal(meso.locked,undefined);
    assert.throws(()=>closeMesocycleInMemory(plan({weekNumber:1,days:[]}),
        summarizeMesocycleClosure(plan({weekNumber:1,days:[]}))),/Nessun programma/);
});

test('confronto prestazioni solo fra settimane a carico uguale',()=>{
    const meso=plan(makeWeek(1,[performed(80,8),performed(80,8)]),
        makeWeek(2,[performed(80,9),performed(80,9)]),
        makeWeek(3,[performed(82.5,8),performed(82.5,8)]));
    let r=summarizeMesocycleClosure(meso);
    assert.equal(r.exerciseChanges[0].metric,'different_loads');
    assert.equal(r.exerciseChanges[0].deltaReps,null);
    meso.weeks.pop();
    r=summarizeMesocycleClosure(meso);
    assert.equal(r.exerciseChanges[0].metric,'repetitions_at_same_load');
    assert.equal(r.exerciseChanges[0].deltaReps,1);
});

test('senza data o con più esposizioni nella stessa settimana non inferisce trend longitudinale',()=>{
    const undated=plan(makeWeek(1,[performed(),performed()],{noDate:true}),
        makeWeek(2,[performed(80,10),performed(80,10)],{noDate:true}));
    assert.equal(summarizeMesocycleClosure(undated).exerciseChanges.length,0);
    undated.weeks[0].days[0].sessionCompletedAt='2026-10-01T12:00:00Z';
    undated.weeks[1].days[0].sessionCompletedAt='2026-10-02T12:00:00Z';
    assert.equal(summarizeMesocycleClosure(undated).exerciseChanges.length,0);
});

test('report per ChatGPT non include email, note private né ID atleta',()=>{
    const meso=plan(makeWeek(1,[performed(),performed()]));
    meso.email='private@example.org';meso.athleteId='private-athlete-id';
    meso.weeks[0].days[0].exercises[0].userNotes='PRIVATE NOTE';
    const report=formatMesocycleClosureForChat(summarizeMesocycleClosure(meso));
    assert.match(report,/REPORT FINALE MESOCICLO/);
    assert.match(report,/Sedute completate: 1\/1/);
    assert.doesNotMatch(report,/private@example|private-athlete|PRIVATE NOTE/);
});
