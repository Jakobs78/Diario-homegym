import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseCoachModel,exerciseInstructionNotes,actionableLiveAdvice} from '../mycoatch/coachCommunication.js';
const locked=(weight=80,reps=8,rpe=8)=>({weight,reps,rpe,isLocked:true});
const origin={weight:80,reps:8,seriesEvidence:[{index:0,kg:80,reps:8,rpe:8}]};
const proposal=(overrides={})=>({kind:'history',weight:80,reps:8,reason:'Ripropongo il riferimento delle serie confermate. Disponibilità del peso da verificare.',basedOn:[origin],...overrides});
const exercise=(extra={})=>({name:'Panca Piana con Bilanciere',reps:'6-8',rpe:8,sets:[{},{}],loggedSets:[{},{}],notes:'Scapole stabili. | [SPLIT MYCOATCH] Upper A | [DURATA STIMATA] 60 minuti su 60 disponibili',...extra});

test('maintenance and empty exercises generate no filler; useful instructions survive',()=>{
 const ex=exercise({coachSetProposals:[proposal(),proposal()],coachAdaptiveNotes:['Nessun aggiornamento necessario.']});
 const m=exerciseCoachModel(ex,{prefills:[{weight:80},{weight:80}],liveAdvice:{code:'on_track',severity:'ok',nextSetIndex:1,message:'Serie confermata.',weight:80}});
 assert.deepEqual(m.instructions,['Scapole stabili.']);assert.deepEqual(m.updates,[]);assert.equal(m.evidence,null);
 assert.deepEqual(exerciseCoachModel(exercise({notes:''})).instructions,[]);
});

test('equal updates merge series; distinct prescriptions remain independent',()=>{
 const a=proposal({kind:'increase_load',weight:82.5,reps:6,reason:'Tutte le serie hanno raggiunto il limite alto.'});
 const ex=exercise({coachSetProposals:[a,structuredClone(a)]});
 const m=exerciseCoachModel(ex);assert.equal(m.updates.length,1);assert.deepEqual(m.updates[0].series,[1,2]);assert.match(m.updates[0].text,/82.5 kg/);
 ex.coachSetProposals[1]={...a,weight:75,reps:10};
 assert.equal(exerciseCoachModel(ex).updates.length,2);
});

test('completed and warm-up series cannot leave stale next-set updates',()=>{
 const a=proposal({kind:'increase_load',weight:82.5,reps:6,reason:'Aumento.'});
 assert.equal(exerciseCoachModel(exercise({coachSetProposals:[a,a],loggedSets:[locked(),{isWarmup:true}]})).updates.length,0);
});

test('high-rep repeat, similar performance and unchanged estimated kg stay silent',()=>{
 const p=proposal({kind:'maintain',monitoring:'Prestazioni recenti simili: continua a registrare reps e RPE.'});
 assert.equal(exerciseCoachModel(exercise({reps:'15-20',coachSetProposals:[p,p]})).updates.length,0);
 const e=proposal({kind:'estimated_history',reason:'Carico adattato usando il massimale stimato.'});
 assert.equal(exerciseCoachModel(exercise({coachSetProposals:[e,e]})).updates.length,0);
 e.weight=75;assert.match(exerciseCoachModel(exercise({coachSetProposals:[e,e]})).updates[0].text,/massimale stimato/);
});

test('real warnings remain, including pain, unavailable loads and recovery changes',()=>{
 for(const overrides of [{kind:'pain_caution',weight:null,reason:'Dolore segnalato: rivaluta il movimento.'},
  {kind:'reduce_today',weight:75,reason:'Serie più difficile del target.'},
  {reason:'Recuperi diversi: nessun aumento trasferito automaticamente.'},
  {reason:'Carico teorico non componibile con l’inventario dichiarato.'}]){
  const m=exerciseCoachModel(exercise({coachSetProposals:[proposal(overrides),null]}));
  assert.equal(m.updates[0].severity,'caution');
 }
 const declining=proposal({monitoring:'Prestazioni recenti in calo: verifica recupero.'});
 assert.match(exerciseCoachModel(exercise({coachSetProposals:[declining,null]})).updates[0].text,/in calo/);
});

test('obsolete calibration notes disappear when a real load is prefilled; originals stay intact',()=>{
 const ex=exercise({notes:'Carico: calibra kg in base a reps e RPE. | Nota personale del coach: fermo di due secondi.'});
 const before=structuredClone(ex);
 assert.equal(exerciseInstructionNotes(ex,{hasLoad:false}).length,2);
 assert.deepEqual(exerciseInstructionNotes(ex,{hasLoad:true}),['Nota personale del coach: fermo di due secondi.']);
 exerciseCoachModel(ex,{prefills:[{weight:70},{weight:70}]});assert.deepEqual(ex,before);
});

test('live cautions and missing data persist; ordinary performance stays silent',()=>{
 for(const code of ['on_track','strong_set','planned_failure','special_technique'])assert.equal(actionableLiveAdvice({code,severity:'ok',nextSetIndex:1}),false);
 assert.equal(actionableLiveAdvice({code:'missing_rpe',severity:'info',nextSetIndex:1}),true);
 assert.equal(actionableLiveAdvice({code:'high_effort',severity:'caution',nextSetIndex:1}),true);
 assert.equal(actionableLiveAdvice({code:'pain_caution',nextSetIndex:-1},{finished:true}),true);
 assert.equal(actionableLiveAdvice({code:'above_rpe',severity:'caution',nextSetIndex:-1},{finished:true}),false);
});

test('protocol reason and live reason render once, keeping the separate warning',()=>{
 const reason='Riduco la proposta successiva.';
 const p=proposal({kind:'reduce_today',weight:75,reason});
 const m=exerciseCoachModel(exercise({loggedSets:[locked(80,6,9.5),{}],coachSetProposals:[null,p]}),{
  liveAdvice:{code:'high_effort',severity:'caution',nextSetIndex:1,message:'RPE molto alto. '+reason}});
 assert.equal(m.updates.filter(x=>x.text.includes(reason)).length,1);
 assert.ok(m.updates.some(x=>x.text==='RPE molto alto.'));
});

test('read-only plans hide active suggestions without mutating saved prescriptions or notes',()=>{
 const ex=exercise({coachSetProposals:[proposal({kind:'increase_load',weight:82.5}),null]});const before=structuredClone(ex);
 assert.deepEqual(exerciseCoachModel(ex,{readOnly:true}).updates,[]);assert.deepEqual(ex,before);
});
