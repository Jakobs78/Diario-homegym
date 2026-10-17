import test from 'node:test';
import assert from 'node:assert/strict';
import {sameJournal, cloudRecoveryDecision} from '../js/cloudSafety.js';

const diary = () => ({athlete:{email:null},history:{years:{
    '2026':{mesocycles:[{name:'Blocco A',locked:true,
        weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[{
            name:'Panca',loggedSets:[{weight:80,reps:8,rpe:8,isLocked:true}]
        }]}]}]}]}
}},updatedAt:'2026-10-17T09:00:00.000Z'});

test('l’ordine delle chiavi JSONB non crea falsi conflitti sullo stesso diario',()=>{
    const original=diary();
    const reordered=JSON.parse(JSON.stringify(original));
    const reversed=Object.fromEntries(Object.entries(reordered).reverse());
    assert.equal(sameJournal(original,reversed),true);
    assert.equal(cloudRecoveryDecision(original,reversed),'identical');
});

test('dispositivi divergenti: vietata la scelta basata solo su updatedAt',()=>{
    const local=diary(), remote=diary();
    remote.history.years['2026'].mesocycles[0].weeks[0].days[0]
        .exercises[0].loggedSets[0].reps=10;
    remote.updatedAt='2026-10-16T23:59:00.000Z';
    assert.equal(cloudRecoveryDecision(local,remote),'conflict');
    assert.equal(cloudRecoveryDecision(local,remote,{pending:true}),'pending');
});

test('nuovo dispositivo senza dati ripristina cloud anche se localStorage è vuoto',()=>{
    const blank={athlete:{email:null},history:{years:{}},updatedAt:null};
    assert.equal(cloudRecoveryDecision(blank,diary()),'restore_cloud');
    assert.equal(cloudRecoveryDecision(blank,null),'empty');
});

test('una perdita della coda non autorizza a ricreare silenziosamente il cloud',()=>{
    assert.equal(cloudRecoveryDecision(diary(),null),'missing_cloud');
    const profile={athlete:{barbellWeight:20},history:{years:{}},updatedAt:
        '2026-10-17T10:00:00Z'};
    assert.equal(cloudRecoveryDecision(profile,diary()),'conflict');
});

test('non perdere set confermati anche quando differisce una sola serie',()=>{
    const local=diary(),cloud=diary();
    cloud.history.years['2026'].mesocycles[0].weeks[0].days[0]
        .exercises[0].loggedSets[0].isLocked=false;
    assert.equal(cloudRecoveryDecision(local,cloud),'conflict');
});
