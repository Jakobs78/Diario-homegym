import test from 'node:test';
import assert from 'node:assert/strict';

import { MyCoatch } from '../mycoatch/index.js';
import { analyzeUserHistory, calculateE1RM, cleanRpeValue,
    evaluateRealTimePerformance, generateNextSessionReminder } from '../mycoatch/autoregulation.js';

const performed = (kg=80,reps=8,rpe=7.5,extra={})=>({
    weight:String(kg),reps:String(reps),
    rpe:rpe===null?'':String(rpe),
    isLocked:true,completed:true,...extra
});
const exercise = (date,kg=80,reps=8,rpe=7.5,extra={})=>({
    date,reps:'6-8',set:'2 set',targetRpe:'@8',
    loggedSets:[performed(kg,reps,rpe),performed(kg,reps,rpe)],...extra
});

test('RPE assente non equivale a RPE 8, e1RM sconosciuto',()=>{
    assert.equal(cleanRpeValue(null),null);
    assert.equal(cleanRpeValue(''),null);
    assert.equal(cleanRpeValue('??'),null);
    assert.equal(cleanRpeValue('5.5'),null);
    assert.equal(cleanRpeValue('12'),null);
    assert.equal(cleanRpeValue('@8,5'),8.5);
    assert.equal(calculateE1RM(80,8),null);
    assert.equal(calculateE1RM(80,8,''),null);
    assert.equal(calculateE1RM(80,'8-10',8),null);
    assert.equal(calculateE1RM(80,13,8),null);
    assert.ok(calculateE1RM(80,8,8)>80);
    assert.equal(MyCoatch.getE1RM(80,8,null),null);
});

test('API legacy: una sola seduta completa NON suggerisce piu kg, neanche al top range',()=>{
    const data=[exercise('2026-10-12')];
    const snapshot=JSON.stringify(data);
    const result=MyCoatch.evaluateProgress(data);
    assert.equal(result.action,'MAINTAIN');
    assert.equal(result.nextTargetKg,null);
    assert.equal(result.suggestedKgIncrement,0);
    assert.equal(result.progression.distinctWeeks,1);
    assert.equal(result.currentKg,80);
    assert.equal(result.completedSets,2);
    assert.equal(generateNextSessionReminder(result),null);
    assert.equal(JSON.stringify(data),snapshot);
});

test('due sedute nello stesso calendario settimanale non diventano 2 settimane',()=>{
    const readings=[exercise('2026-10-12'),exercise('2026-10-14')];
    const result=analyzeUserHistory(readings);
    assert.equal(result.progression.distinctWeeks,1);
    assert.equal(result.action,'MAINTAIN');
    assert.equal(result.nextTargetKg,null);
});

test('due settimane comparabili, serie valide e RPE misurato consentono microincremento',()=>{
    const data=[exercise('2026-10-05'),exercise('2026-10-12')];
    const result=analyzeUserHistory(data);
    assert.equal(result.progression.distinctWeeks,2);
    assert.equal(result.progression.readyForLoad,true);
    assert.equal(result.action,'INCREMENT_LOAD');
    assert.equal(result.nextTargetKg,82.5);
    assert.equal(result.suggestedKgIncrement,2.5);
    const reminder=generateNextSessionReminder(result);
    assert.equal(reminder.type,'LOAD_STEP');
    assert.match(reminder.prompt,/Non viene applicato automaticamente/);
});

test('due settimane nello stesso range a reps inferiori -> +1 rep, stessi kg',()=>{
    const result=analyzeUserHistory([
        exercise('2026-10-05',80,7),exercise('2026-10-12',80,7)
    ]);
    assert.equal(result.action,'BUILD_REPS');
    assert.equal(result.suggestedReps,8);
    assert.equal(result.nextTargetKg,null);
    assert.equal(generateNextSessionReminder(result).type,'REP_STEP');
});

test('RPE mancante in una sola serie blocca aumento e non viene completato automaticamente',()=>{
    const second=exercise('2026-10-12');
    second.loggedSets[1].rpe='';
    const result=analyzeUserHistory([exercise('2026-10-05'),second]);
    assert.equal(result.action,'MAINTAIN');
    assert.equal(result.avgRpe,null);
    assert.equal(result.currentE1RM,null);
    assert.equal(result.nextTargetKg,null);
    assert.equal(generateNextSessionReminder(result),null);
});

test('checkbox falso, incompletezza o reps placeholder non diventano evidenza sufficiente',()=>{
    for (const altered of [
        exercise('2026-10-12',80,8,7.5,{
            loggedSets:[performed(),performed(80,8,7.5,{isLocked:false,completed:false})]
        }),
        exercise('2026-10-12',80,8,7.5,{
            loggedSets:[performed(),{weight:'',reps:'',rpe:'',isLocked:false}]
        }),
        exercise('2026-10-12',80,8,7.5,{
            loggedSets:[performed(),performed(80,'6-8',7.5)]
        })
    ]) {
        const result=analyzeUserHistory([exercise('2026-10-05'),altered]);
        assert.equal(result.action,'MAINTAIN');
        assert.equal(result.nextTargetKg,null);
    }
});

test('drop-set 10+8+6 e tecniche speciali non giustificano kg',()=>{
    const special=exercise('2026-10-12',80,8,7.5,{
        loggedSets:[performed(80,'10+8+6',7),performed(80,8,7.5,
            {intensityTechnique:'DROP_SET'})]
    });
    const result=analyzeUserHistory([exercise('2026-10-05'),special]);
    assert.equal(result.action,'MAINTAIN');
    assert.equal(result.progression.readyForLoad,false);
    assert.equal(result.currentE1RM,null);
});

test('date non dichiarate o invalide non vengono assegnate a settimane inventate',()=>{
    const undated=exercise(undefined);
    const malformed=exercise('2026-02-30');
    const result=analyzeUserHistory([undated,malformed]);
    assert.equal(result.progression.distinctWeeks,0);
    assert.equal(result.action,'MAINTAIN');
    assert.ok(result.caveats.includes('servono_due_settimane_distinte'));
});

test('API real-time legacy: una serie non confermata non produce valutazioni',()=>{
    assert.equal(evaluateRealTimePerformance({
        weight:80,reps:8,rpe:8,isLocked:false
    },'6-8',8),null);
    assert.equal(evaluateRealTimePerformance({
        weight:80,reps:'8-12',rpe:8,isLocked:true
    },'6-8',8),null);
    const missing=evaluateRealTimePerformance(performed(80,8,null),'6-8',8);
    assert.equal(missing.status,'INSUFFICIENT_EFFORT_DATA');
    assert.equal(missing.e1rm,null);
    assert.equal(missing.suggestedNextWeight,null);
    const noTarget=evaluateRealTimePerformance(performed(80,8,7),'6-8');
    assert.equal(noTarget.e1rm,null);
    assert.equal(noTarget.isTargetMet,null);
    const good=evaluateRealTimePerformance(performed(80,8,7),'6-8',8);
    assert.equal(good.status,'IN_RANGE');
    assert.equal(good.suggestedNextWeight,null);
    assert.ok(good.e1rm>80);
});

test('fatica soggettiva misurata alta a distanza di settimane => revisione, non diagnosi',()=>{
    const a=exercise('2026-10-05',80,8,9.5);
    const b=exercise('2026-10-12',80,8,9.5);
    const result=analyzeUserHistory([a,b]);
    assert.equal(result.action,'REVIEW_FATIGUE');
    assert.equal(result.nextTargetKg,null);
    assert.equal(generateNextSessionReminder(result),null);
});
