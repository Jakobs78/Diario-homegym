import test from 'node:test';import assert from 'node:assert/strict';
import {exerciseLoadSummary} from '../js/exerciseLoadSummary.js';
import {exerciseTargetMarkup} from '../js/exerciseTargetUI.js';
const ex=extra=>({name:'Curl ai Cavi Bassi',sets:[{},{}],loggedSets:[{},{}],...extra});
const pre=(weight,source='confirmed_previous_week')=>({weight,source});
test('blank load calibrates only until the actual set prefills provide a proposal',()=>{
 const e=ex();assert.equal(exerciseLoadSummary(e).text,'Carico da impostare');
 assert.equal(exerciseLoadSummary(e,[pre('21'),pre('21')]).text,'Carico proposto: 21 kg');
 assert.equal(exerciseLoadSummary(e,[pre('21'),pre('20')]).text,'Carichi indicati nelle serie');
 assert.equal(exerciseLoadSummary(e,[pre('21'),pre('')]).text,'Carichi indicati nelle serie');
 assert.equal(e.kgMin,undefined);assert.deepEqual(e.loggedSets,[{},{}]);
});
test('CSV loads are distinct from proposed loads and original fields survive',()=>{
 const e=ex({kgMin:'20',kgMax:'20',set:'2 set',reps:'8-12'}),before=structuredClone(e);
 assert.equal(exerciseLoadSummary(e,[pre('20','csv_target'),pre('20','csv_target')]).text,'Carico della scheda: 20 kg');
 const html=exerciseTargetMarkup(e,[pre('21'),pre('21')]);assert.match(html,/Carico proposto: 21 kg/);assert.match(html,/Carico della scheda: 20 kg/);assert.deepEqual(e,before);
 assert.doesNotMatch(exerciseTargetMarkup(e,[pre('20','csv_target'),pre('20','csv_target')]),/exercise-original-load/);
});
test('manual, confirmed and warmup rows are distinguished',()=>{
 const e=ex({loggedSets:[{weight:'21',isLocked:true},{weight:'22'}]});
 assert.equal(exerciseLoadSummary(e,[pre('21'),pre('22')]).text,'Carico impostato: 22 kg');
 e.loggedSets[1].isLocked=true;assert.equal(exerciseLoadSummary(e).text,'Carichi registrati nelle serie');
 e.loggedSets[0].isWarmup=true;assert.equal(exerciseLoadSummary(e).text,'Carico registrato: 22 kg');
});
test('bodyweight zero is meaningful; read-only history cannot display future proposals',()=>{
 const e=ex({name:'Push-up a Terra'});assert.equal(exerciseLoadSummary(e,[pre('0'),pre('0')]).text,'Senza sovraccarico');
 assert.equal(exerciseLoadSummary(ex(),[pre('21'),pre('21')],{readOnly:true}).text,'Carico non registrato');
 const body=ex({name:'Hamstring Walkout a Corpo Libero'});assert.equal(exerciseLoadSummary(body,[pre('0'),pre('0')]).text,'Corpo libero');
});
test('weight labels and original prescriptions cannot inject HTML',()=>{
 const e=ex({kgMin:'<img src=x onerror=alert(1)>',topset:'<script>alert(1)</script>'});
 const html=exerciseTargetMarkup(e,[pre('21'),pre('21')]);assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);
});

test('suppressed proposals never reappear as an active CSV load',()=>{
 const e=ex({kgMin:'20',kgMax:'20'}),shown=exerciseLoadSummary(e,[pre(''),pre('')]);
 assert.equal(shown.text,'Carico da impostare');assert.equal(shown.original,'20 kg');
 const html=exerciseTargetMarkup(e,[pre(''),pre('')]);assert.match(html,/Carico da impostare/);assert.match(html,/Carico della scheda: 20 kg/);
});
