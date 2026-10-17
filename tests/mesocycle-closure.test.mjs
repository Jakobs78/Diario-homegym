import test from 'node:test';
import assert from 'node:assert/strict';
import {
    summarizeMesocycleClosure, closeMesocycleInMemory,
    formatMesocycleClosureForChat
} from '../js/mesocycleClosure.js';
import { shouldHighlightMesocycleClosure, acknowledgeMesocycleClosurePrompt }
    from '../js/mesocycleReminder.js';

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

test('ultimo check valido accende il richiamo; click lo ferma senza chiudere il ciclo',()=>{
    const meso=plan(makeWeek(1,[performed(),performed(80,8,8,false)]));
    const original=JSON.stringify(meso);
    assert.equal(shouldHighlightMesocycleClosure(meso),false);
    assert.equal(acknowledgeMesocycleClosurePrompt(meso),false);
    meso.weeks[0].days[0].exercises[0].loggedSets[1].isLocked=true;
    meso.weeks[0].days[0].exercises[0].loggedSets[1].completed=true;
    assert.equal(shouldHighlightMesocycleClosure(meso),true);
    assert.equal(acknowledgeMesocycleClosurePrompt(meso),true);
    assert.equal(shouldHighlightMesocycleClosure(meso),false);
    assert.equal(meso.locked,undefined);
    assert.equal(meso.coachClosure,undefined);
    assert.equal(meso.weeks[0].days[0].exercises[0].loggedSets[0].weight,
        JSON.parse(original).weeks[0].days[0].exercises[0].loggedSets[0].weight);
});

test('togliere e riconfermare una spunta riattiva la notifica',()=>{
    const meso=plan(makeWeek(1,[performed(),performed()]));
    assert.equal(shouldHighlightMesocycleClosure(meso),true);
    assert.equal(acknowledgeMesocycleClosurePrompt(meso),true);
    assert.equal(shouldHighlightMesocycleClosure(meso),false);
    const set=meso.weeks[0].days[0].exercises[0].loggedSets[1];
    set.isLocked=false;set.completed=false;
    assert.equal(shouldHighlightMesocycleClosure(meso),false);
    set.isLocked=true;set.completed=true;
    assert.equal(shouldHighlightMesocycleClosure(meso),true);
});

test('chiusura o semplice blocco manuale non fanno lampeggiare vecchi cicli',()=>{
    const meso=plan(makeWeek(1,[performed(),performed()]));
    assert.equal(shouldHighlightMesocycleClosure(meso),true);
    meso.locked=true;
    assert.equal(shouldHighlightMesocycleClosure(meso),false);
    meso.locked=false;
    assert.equal(shouldHighlightMesocycleClosure(meso),true);
    closeMesocycleInMemory(meso,summarizeMesocycleClosure(meso));
    assert.equal(shouldHighlightMesocycleClosure(meso),false);
    meso.locked=false; // State inconsistently hydrated: metadata wins.
    assert.equal(shouldHighlightMesocycleClosure(meso),false);
});

test('un nuovo mesociclo vuoto non richiede chiusura, vecchio chiuso resta indipendente',()=>{
    const previous=plan(makeWeek(1,[performed(),performed()]));
    closeMesocycleInMemory(previous,summarizeMesocycleClosure(previous));
    const next=plan(makeWeek(1,[performed(60,8,8,false),performed(60,8,8,false)]));
    assert.equal(previous.locked,true);
    assert.equal(next.locked,undefined);
    assert.equal(shouldHighlightMesocycleClosure(previous),false);
    assert.equal(shouldHighlightMesocycleClosure(next),false);
});

test('report finale: serie confermate per settimana e kg/reps/RPE anche dalla seduta parziale',()=>{
    const m=plan(makeWeek(1,[performed(80,8,8),performed(82.5,9,'',false)]),
        makeWeek(2,[performed(82.5,9,9),performed(82.5,10,'')]));
    const before=JSON.stringify(m);
    const report=summarizeMesocycleClosure(m);
    assert.equal(report.weeklyResults[0].completedSets,1);
    assert.equal(report.weeklyResults[0].rpeMeasured,1);
    assert.equal(report.weeklyResults[1].completedSets,2);
    assert.equal(report.weeklyResults[1].rpeMeasured,1);
    assert.equal(report.exerciseResults.length,2);
    assert.equal(report.exerciseResults[0].validSets,1);
    assert.equal(report.exerciseResults[0].minKg,80);
    assert.equal(report.exerciseResults[1].maxReps,10);
    const exported=formatMesocycleClosureForChat(report);
    assert.match(exported,/COPERTURA E RPE PER SETTIMANA PROGRAMMATA/);
    assert.match(exported,/CARICHI E RIPETIZIONI EFFETTIVI/);
    assert.match(exported,/82.5–82.5 kg, 9–10 reps/);
    assert.equal(JSON.stringify(m),before);
});

test('righe registrate oltre il numero testuale non vengono perse dal conteggio legacy',()=>{
    const m=plan(makeWeek(1,[performed(80,8,8),performed(80,9,9),performed(80,10,10)]));
    const report=summarizeMesocycleClosure(m);
    assert.equal(report.completedSets,3);
    assert.equal(report.measuredRpeSets,3);
    assert.equal(report.averageRpe,9);
    assert.equal(report.exerciseResults[0].validSets,3);
});
