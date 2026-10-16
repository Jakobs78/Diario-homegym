import test from 'node:test';
import assert from 'node:assert/strict';
import { getSetPrefill } from '../js/setPrefill.js';

const done=(weight,reps,rpe='',extra={})=>({
    weight:String(weight),reps:String(reps),rpe:String(rpe),isLocked:true,completed:true,...extra
});
const empty=()=>({weight:'',reps:'',rpe:'',isLocked:false,completed:false});
const lift=(extra={})=>({
    name:'Panca bilanciere',kgMin:'70',kgMax:'70',reps:'8-12',
    targetRpe:'@8',loggedSets:[empty(),empty(),empty()],...extra
});

test('first use: every uncompleted set follows the current plan, without writing into the journal',()=>{
    const ex=lift();
    const before=JSON.stringify(ex);
    for(let idx=0;idx<ex.loggedSets.length;idx++){
        const r=getSetPrefill(ex,idx);
        assert.deepEqual([r.weight,r.reps,r.rpe,r.source],['70','8','8','csv_target']);
    }
    assert.equal(JSON.stringify(ex),before);
});

test('same plan: matching previous confirmed sets provide practical kg/reps, current target determines RPE',()=>{
    const previous=lift({loggedSets:[done(72.5,9,9.5),done(72.5,8,9)]});
    const ex=lift();
    assert.deepEqual(
        [getSetPrefill(ex,0,{previousExercise:previous}).weight,
         getSetPrefill(ex,0,{previousExercise:previous}).reps,
         getSetPrefill(ex,0,{previousExercise:previous}).rpe,
         getSetPrefill(ex,0,{previousExercise:previous}).source],
        ['72.5','9','8','confirmed_previous_week']
    );
    assert.deepEqual(
        [getSetPrefill(ex,1,{previousExercise:previous}).weight,
         getSetPrefill(ex,1,{previousExercise:previous}).reps],
        ['72.5','8']
    );
    assert.deepEqual(
        [getSetPrefill(ex,2,{previousExercise:previous}).weight,
         getSetPrefill(ex,2,{previousExercise:previous}).reps],
        ['70','8']
    );
    assert.deepEqual(ex.loggedSets,[empty(),empty(),empty()]);
});

test('progression, RPE deload and rep target changes follow new programming, not old personal records',()=>{
    const previous=lift({loggedSets:[done(72.5,10,9)]});
    const increased=lift({kgMin:'75',kgMax:'75'});
    const lighterRpe=lift({targetRpe:'@7'});
    const differentReps=lift({reps:'6-8'});
    for(const [ex,w,reps,rpe] of [
        [increased,'75','8','8'],
        [lighterRpe,'70','8','7'],
        [differentReps,'70','6','8']
    ]){
        const p=getSetPrefill(ex,0,{previousExercise:previous});
        assert.deepEqual([p.weight,p.reps,p.rpe,p.source],[w,reps,rpe,'csv_target']);
    }
    const recovery=lift({coachWeeklyLoadReview:true,targetRpe:'@7.5'});
    assert.deepEqual(
        [getSetPrefill(recovery,0,{previousExercise:previous}).weight,
         getSetPrefill(recovery,0,{previousExercise:previous}).rpe],
        ['','7.5']
    );
});

test('within session, completed homogeneous set can prefill following set but never a different prescription',()=>{
    const ex=lift({loggedSets:[done(72.5,9,9.5),empty(),empty()]});
    const next=getSetPrefill(ex,1);
    assert.deepEqual([next.weight,next.reps,next.rpe,next.source],['72.5','9','8','confirmed_previous_set']);
    const stepped=lift({
        sets:[{targetKg:80,targetReps:6,targetRpe:8},{targetKg:70,targetReps:8,targetRpe:8}],
        loggedSets:[done(80,6,9),empty()]
    });
    const nextStep=getSetPrefill(stepped,1);
    assert.deepEqual([nextStep.weight,nextStep.reps,nextStep.rpe,nextStep.source],
        ['70','8','8','csv_target']);
});

test('top set is not copied into back-off: exercise programme wins',()=>{
    const ex=lift({
        topset:'1x5 @90kg',kgMin:'70',kgMax:'70',
        loggedSets:[done(90,5,9),empty(),empty()]
    });
    const backoff=getSetPrefill(ex,1);
    assert.deepEqual([backoff.weight,backoff.reps,backoff.rpe],['70','8','8']);
    assert.equal(backoff.source,'csv_target');
});

test('intensity technique is reused only in matching special-technique rows',()=>{
    const old=lift({isDropset:true,loggedSets:[done(12, '10+8+6',8,{intensityTechnique:'DROP_SET'})]});
    const special=lift({isDropset:true,loggedSets:[{...empty(),intensityTechnique:'DROP_SET'}]});
    const normal=lift();
    assert.equal(getSetPrefill(special,0,{previousExercise:old}).reps,'10+8+6');
    assert.equal(getSetPrefill(normal,0,{previousExercise:old}).reps,'8');
});

test('athlete drafts override every suggestion, even a planned deload',()=>{
    const ex=lift({targetRpe:'@7',loggedSets:[{...empty(),weight:'67.5',reps:'11',rpe:'8'}]});
    const p=getSetPrefill(ex,0);
    assert.deepEqual([p.weight,p.reps,p.rpe],['67.5','11','8']);
    assert.equal(p.isSuggestedWeight,false);
    assert.equal(p.isSuggestedReps,false);
    assert.equal(p.isSuggestedRpe,false);
});

test('unconfirmed previous entries never prefill other sessions and empty coaching loads remain empty',()=>{
    const old=lift({loggedSets:[{weight:'95',reps:'10',rpe:'9',isLocked:false,completed:false}]});
    const current=lift({kgMin:'',kgMax:''});
    assert.deepEqual(
        [getSetPrefill(current,0,{previousExercise:old}).weight,
         getSetPrefill(current,0,{previousExercise:old}).reps,
         getSetPrefill(current,0,{previousExercise:old}).rpe],
        ['','8','8']
    );
});
