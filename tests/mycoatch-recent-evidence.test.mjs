import test from 'node:test';
import assert from 'node:assert/strict';
import {historyWindow} from '../js/historyWindow.js';
import {prepareRecentEvidence,performanceTimestamp} from '../mycoatch/recentEvidence.js';
import {analyzeTrainingHistory} from '../mycoatch/historyInsights.js';
import {planAdaptiveDecisions} from '../mycoatch/adaptiveDecisions.js';
const now=new Date('2026-10-17T12:00:00Z');
const history=dates=>({history:{years:{2026:{mesocycles:[{name:'Test',weeks:dates.map((date,i)=>({weekNumber:i+1,days:[{dayNumber:1,sessionCompletedAt:date,exercises:[{name:'Panca Piana con Bilanciere',set:'1 set',reps:'6-8',targetRpe:'@8',loggedSets:[{weight:'80',reps:'8',rpe:'7',isLocked:true,completed:true}]}]}]}))}]}}}});
const flags=data=>Object.values(data.years).flatMap(y=>y.mesocycles.flatMap(m=>m.weeks.flatMap(w=>w.days.flatMap(d=>d.exercises.flatMap(e=>e.loggedSets.map(s=>s.isLocked))))));
test('quattro anni solari, senza eliminare archivio o mutare la sorgente',()=>{
 const data={history:{years:Object.fromEntries([2021,2022,2023,2024,2025,2026,2027].map(y=>[y,{mesocycles:[]}]))}};
 const before=JSON.stringify(data);const w=historyWindow(data,now);
 assert.deepEqual(Object.keys(w.active),['2023','2024','2025','2026']);
 assert.deepEqual(Object.keys(w.archived),['2021','2022','2027']);assert.equal(JSON.stringify(data),before);
});
test('serie senza data, future o obsolete non diventano evidenza attuale',()=>{
 const data=history([undefined,'2026-10-18','2026-08-01','2026-10-10']);const before=JSON.stringify(data);
 const {history:recent,audit}=prepareRecentEvidence(data,{now});
 assert.deepEqual(flags(recent),[false,false,false,true]);
 assert.equal(audit.undatedSets,1);assert.equal(audit.futureSets,1);assert.equal(audit.excludedOldSets,1);
 assert.equal(JSON.stringify(data),before);
});
test('dopo oltre 28 giorni senza allenamenti si ricalibra anche entro la finestra di 42 giorni',()=>{
 const {history:recent,audit}=prepareRecentEvidence(history(['2026-09-15']),{now});
 assert.equal(audit.reentry,true);assert.deepEqual(flags(recent),[false]);
});
test('date impossibili e timestamp importazione non diventano prestazioni',()=>{
 assert.equal(performanceTimestamp({completedAt:'2026-02-30'},{}),null);
 assert.equal(performanceTimestamp({capturedAt:now.toISOString()},{}),null);
 assert.ok(performanceTimestamp({completedAt:'2024-02-29'},{}));
});
test('due settimane nominali nello stesso periodo reale non autorizzano progressioni',()=>{
 const {history:recent}=prepareRecentEvidence(history(['2026-10-13','2026-10-14']),{now});
 const report=analyzeTrainingHistory(recent,{calendarWeeks:true});
 const decisions=Object.values(planAdaptiveDecisions(report).byExercise);
 assert.notEqual(decisions[0].action,'increase_load');
});
test('due settimane reali recenti possono autorizzare progressioni',()=>{
 const {history:recent}=prepareRecentEvidence(history(['2026-10-06','2026-10-14']),{now});
 const report=analyzeTrainingHistory(recent,{calendarWeeks:true});
 assert.equal(Object.values(planAdaptiveDecisions(report).byExercise)[0].action,'increase_load');
});
