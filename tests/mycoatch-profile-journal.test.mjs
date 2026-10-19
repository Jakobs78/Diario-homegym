import test from 'node:test';
import assert from 'node:assert/strict';
import {stageProfileRevision,commitProfileRevision,latestSavedProfile,profileSnapshot} from '../mycoatch/profileJournal.js';

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
