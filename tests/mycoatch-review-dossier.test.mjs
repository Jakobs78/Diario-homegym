import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMesocycleReviewDossier, formatMesocycleReviewDossierMarkdown, serializeMesocycleReviewDossierJson } from '../mycoatch/reviewDossier.js';

const performed=(kg,reps,rpe,confirmed=true)=>({weight:String(kg),reps:String(reps),rpe,isLocked:confirmed,completed:confirmed});
const fixture=()=>({name:'Esempio', coachProfileSnapshot:{profileVersion:2,profile:{experience:'intermediate'},settings:{daysPerWeek:4,maxSessionMinutes:60,splitPreference:'fullbody',focus:'hybrid'}},
  weeks:[{weekNumber:1,days:[{dayNumber:1,dayName:'Full Body A',
    sessionArchives:[{exercises:[{name:'Panca Piana con Bilanciere',setsCount:2,loggedSets:[performed(100,8,'9'),performed(100,8,'9')]}]}],
    exercises:[{name:'Panca Piana con Bilanciere',setsCount:3,reps:'8-12',rpe:'@7',kgMin:'70',kgMax:'70',
      notes:'Annotazione libera A',userNotes:'Annotazione libera B',
      loggedSets:[performed(70,10,'8'),performed(70,10,''),performed(70,11,'9',false)]},
    {name:'Calf Raise in Piedi con Manubri',setsCount:2,reps:'12-20',rpe:'@8',loggedSets:[performed(12,15,'8'),performed('',12,'8')]}]}]}]});

test('dossier: snapshot immutabile, risultati confermati e RPE target separato',()=>{
 const plan=fixture(),before=JSON.stringify(plan);
 const d=buildMesocycleReviewDossier(plan,{at:new Date('2026-10-20T04:00:00Z')});
 assert.equal(JSON.stringify(plan),before);
 assert.equal(d.mesocycle.profileVersion,2);
 assert.equal(d.mesocycle.settings.splitPreference,'fullbody');
 const ex=d.sessions[0].exercises[0];
 assert.equal(ex.prescription.sets,3);
 assert.equal(ex.prescription.rpeTarget,'@7');
 assert.deepEqual(ex.observedSets.map(x=>x.rpeActual),[8,null]);
 assert.equal(ex.unconfirmedOrMissingSets,1);
 assert.equal(d.summary.archivedRepeats,1);
 assert.equal(d.summary.completedSets,3);
});

test('esportazioni: JSON valido, note libere e profilo grezzo esclusi',()=>{
 const d=buildMesocycleReviewDossier(fixture());
 const json=serializeMesocycleReviewDossierJson(d),md=formatMesocycleReviewDossierMarkdown(d);
 assert.deepEqual(JSON.parse(json),d);
 for(const excluded of ['Annotazione libera A','Annotazione libera B','experience'])
   assert.equal((json+' '+md).includes(excluded),false);
 assert.match(md,/RPE target @7/);
 assert.match(md,/RPE effettivo n.d./);
 assert.match(md,/Nessun caricamento automatico/);
});

test('nessun risultato inventato se non esistono serie confermate',()=>{
 const plan=fixture();for(const ex of plan.weeks[0].days[0].exercises)ex.loggedSets=[];
 const d=buildMesocycleReviewDossier(plan);
 assert.equal(d.summary.completedSets,0);
 assert.ok(d.sessions[0].exercises.every(ex=>ex.observedSets.length===0));
 assert.match(formatMesocycleReviewDossierMarkdown(d),/Nessuna serie allenante valida confermata/);
});

test('dossier richiede struttura e data valide',()=>{
 assert.throws(()=>buildMesocycleReviewDossier(null),/non valido/);
 assert.throws(()=>buildMesocycleReviewDossier(fixture(),{at:'not-a-date'}),/Data/);
});