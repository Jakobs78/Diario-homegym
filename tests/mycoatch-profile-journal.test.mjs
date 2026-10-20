import test from 'node:test';
import assert from 'node:assert/strict';
import {stageProfileRevision,commitProfileRevision,latestSavedProfile,profileSnapshot,assessMesocycleProfileContinuity} from '../mycoatch/profileJournal.js';

const profile=(experience='intermediate')=>({
    experience,calibration:'guided',priorityMuscle:null,
    excludedExercises:[],referenceLoads:{}
});
const diary=()=>({athlete:{barbellWeight:20,loadingSteps:{barbell:2.5}},history:{years:{}}});

test('profilo versione 1 viene aggiunto senza cancellare attrezzatura o diario',()=>{
    const d=diary(),p=stageProfileRevision(d,profile(),new Date('2026-10-19T12:00:00Z'));
    assert.equal(p.version,1);assert.equal(p.changed,true);
    commitProfileRevision(d,p);
    assert.equal(d.athlete.barbellWeight,20);
    assert.deepEqual(d.history.years,{});
    assert.equal(d.athlete.mycoatchProfileJournal.versions.length,1);
    assert.equal(d.athlete.mycoatchProfileJournal.versions[0].savedAt,'2026-10-19T12:00:00.000Z');
});

test('salvataggio invariato non crea revisioni duplicate',()=>{
    const d=diary();commitProfileRevision(d,stageProfileRevision(d,profile()));
    const duplicate=stageProfileRevision(d,profile());
    assert.equal(duplicate.changed,false);
    assert.equal(duplicate.version,1);
    assert.equal(d.athlete.mycoatchProfileJournal.versions.length,1);
});

test('modifica successiva è versione 2, snapshot precedente non muta',()=>{
    const d=diary();const a=stageProfileRevision(d,profile());
    commitProfileRevision(d,a);
    const snapshot=profileSnapshot(a,{splitPreference:'fullbody',daysPerWeek:4,
        maxSessionMinutes:60,focus:'hybrid'});
    const b=stageProfileRevision(d,profile('advanced'));
    commitProfileRevision(d,b);
    assert.equal(b.version,2);
    assert.equal(latestSavedProfile(d).experience,'advanced');
    assert.equal(snapshot.profile.experience,'intermediate');
    assert.equal(snapshot.profileVersion,1);
    assert.equal(snapshot.settings.splitPreference,'fullbody');
    assert.equal(d.athlete.mycoatchProfileJournal.versions[0].profile.experience,'intermediate');
    snapshot.profile.experience='beginner';
    assert.equal(d.athlete.mycoatchProfileJournal.versions[0].profile.experience,'intermediate');
});

test('profilo di due diari rimane distinto e non si eredita per stato globale',()=>{
    const a=diary(),b=diary();
    commitProfileRevision(a,stageProfileRevision(a,profile('advanced')));
    assert.equal(latestSavedProfile(b),null);
    assert.equal(latestSavedProfile(a).experience,'advanced');
});

test('valori invalidi e cronologia non valida non riscrivono la storia',()=>{
    const d=diary();
    assert.throws(()=>stageProfileRevision(d,profile('unknown')),/esperienza/i);
    assert.equal(d.athlete.mycoatchProfileJournal,undefined);
    d.athlete.mycoatchProfileJournal={versions:[{version:0,profile:{}}]};
    assert.throws(()=>stageProfileRevision(d,profile()),/Cronologia/);
});


test('un profilo aggiornato non riscrive lo snapshot di un mesociclo avviato',()=>{
    const d=diary();
    const v1=stageProfileRevision(d,profile());
    commitProfileRevision(d,v1);
    const meso={
        name:'Mesociclo corrente',
        weeks:[{weekNumber:1,days:[{exercises:[{name:'Panca Piana con Bilanciere',
            setsCount:1,loggedSets:[{weight:'60',reps:'7',isLocked:true}]}]}]}],
        coachProfileSnapshot:profileSnapshot(v1,{daysPerWeek:4,maxSessionMinutes:60})
    };
    const originalMeso=JSON.stringify(meso);
    const v2=stageProfileRevision(d,profile('advanced'));
    commitProfileRevision(d,v2);
    const status=assessMesocycleProfileContinuity(meso,d);
    assert.equal(status.status,'updated_since_plan');
    assert.equal(status.profileVersion,1);
    assert.equal(status.currentVersion,2);
    assert.match(status.message,/nuova proposta/);
    assert.equal(JSON.stringify(meso),originalMeso);
    assert.equal(meso.coachProfileSnapshot.profile.experience,'intermediate');
    assert.equal(meso.weeks[0].days[0].exercises[0].loggedSets[0].weight,'60');
});

test('versione diversa ma stesso contenuto non crea un falso conflitto',()=>{
    const d=diary();
    const first=stageProfileRevision(d,profile());
    commitProfileRevision(d,first);
    const meso={coachProfileSnapshot:profileSnapshot(first)};
    commitProfileRevision(d,stageProfileRevision(d,profile('advanced')));
    commitProfileRevision(d,stageProfileRevision(d,profile()));
    const info=assessMesocycleProfileContinuity(meso,d);
    assert.equal(info.status,'same_profile');
    assert.equal(info.profileVersion,1);
    assert.equal(info.currentVersion,3);
});

test('versioni concorrenti non sovrascrivono la storia più recente',()=>{
    const d=diary();
    commitProfileRevision(d,stageProfileRevision(d,profile()));
    const edit1=stageProfileRevision(d,profile('advanced'));
    const edit2=stageProfileRevision(d,{...profile(),priorityMuscle:'Petto'});
    commitProfileRevision(d,edit1);
    const before=JSON.stringify(d);
    assert.throws(()=>commitProfileRevision(d,edit2),/aggiornato altrove/);
    assert.equal(JSON.stringify(d),before);
    assert.equal(latestSavedProfile(d).experience,'advanced');
    assert.equal(d.athlete.mycoatchProfileJournal.versions.length,2);
});

test('mesocicli precedenti privi di snapshot restano leggibili senza conclusioni arbitrarie',()=>{
    const d=diary();
    commitProfileRevision(d,stageProfileRevision(d,profile()));
    const old=assessMesocycleProfileContinuity({weeks:[]},d);
    assert.equal(old.status,'legacy_no_snapshot');
    assert.equal(old.profileVersion,null);
    const copied=assessMesocycleProfileContinuity(
        {coachProfileSnapshot:profileSnapshot(stageProfileRevision(d,profile()))},
        diary());
    assert.equal(copied.status,'unverifiable');
});
