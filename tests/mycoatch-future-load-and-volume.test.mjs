import test from 'node:test';
import assert from 'node:assert/strict';
import {compareConfirmedSetVolume} from '../js/setVolumeComparison.js';
import {
    previewFutureLoadReview,applyFutureLoadReview,undoFutureLoadReview,
    getAppliedFutureLoadReview,canUndoFutureLoadReview
} from '../mycoatch/futureLoadReview.js';
import {getSetPrefill} from '../js/setPrefill.js';
const performed=(kg=80,reps=10,rpe=7,other={})=>({
    weight:String(kg),reps:String(reps),rpe:String(rpe),isLocked:true,completed:true,...other
});
const draft=()=>({weight:'',reps:'',rpe:'',isLocked:false,completed:false});
const exercise=(done=false,other={})=>({
    name:'Panca Piana con Bilanciere',reps:'8-10',targetRpe:'@7',kgMin:'80',kgMax:'80',
    loggedSets:Array.from({length:3},()=>done?performed():draft()),
    sets:Array.from({length:3},(_,i)=>({setNumber:i+1,weight:'',reps:'',rpe:''})),...other
});
const mesocycle=()=>{
    const session=(name,ex,done=false)=>({dayNumber:1,dayName:name,completed:done,exercises:[ex]});
    const week=(number,done=false)=>({weekNumber:number,days:[session('Upper A',exercise(done),done)]});
    return {locked:false,weeks:[week(1,true),week(2),week(3)]};
};
const settings={equipmentSettings:{barbell:2.5}};
test('volume difference is percent and absolute, including neutral and descending',()=>{
    const old=exercise(true,{loggedSets:[performed(70,8),performed(70,8)]});
    const now=exercise(true,{loggedSets:[performed(70,10),performed(60,8)]});
    const rise=compareConfirmedSetVolume(now,old,0),fall=compareConfirmedSetVolume(now,old,1);
    assert.equal(rise.percent,25);
    assert.equal(rise.absolute,'+140 kg·rep');
    assert.equal(rise.display,'▲ +25%');
    assert.equal(fall.percent,-14.29);
    assert.equal(fall.status,'negative');
    now.loggedSets[0]=performed(70,8);
    const flat=compareConfirmedSetVolume(now,old,0);
    assert.equal(flat.display,'= 0%');
    assert.equal(flat.absolute,'0 kg·rep');
});
test('volume comparison never uses unconfirmed sets, warmups or mismatched set roles',()=>{
    const old=exercise(true,{loggedSets:[performed(70,8),performed(70,8)]});
    const now=exercise(true,{loggedSets:[performed(70,10),performed(60,8)]});
    now.loggedSets[0].completed=false;now.loggedSets[0].isLocked=false;
    assert.equal(compareConfirmedSetVolume(now,old,0),null);
    now.loggedSets[0]=performed(70,10,6,{isWarmup:true});
    assert.equal(compareConfirmedSetVolume(now,old,0),null);
    now.loggedSets[0]=performed(70,10);
    assert.equal(compareConfirmedSetVolume({...now,topset:'1x6@85kg'},old,0),null);
    assert.equal(compareConfirmedSetVolume({...now,isDropset:true},old,0),null);
    assert.equal(compareConfirmedSetVolume(now,{...old,reps:'6-8'},0),null);
    assert.equal(compareConfirmedSetVolume(now,{...old,loggedSets:[performed(70,8)]},0),null);
});
test('future progression preview lists only untouched matching sessions and applies explicit approval',()=>{
    const m=mesocycle(),before=structuredClone(m);
    const preview=previewFutureLoadReview(m,1,0,0,settings);
    assert.equal(preview.source.from,80);
    assert.equal(preview.source.to,82.5);
    assert.equal(preview.changes.length,1);
    assert.deepEqual(m,before,'preview never changes the diary');
    const record=applyFutureLoadReview(m,preview,settings);
    assert.equal(record.changes.length,1);
    assert.equal(m.weeks[1].days[0].exercises[0].kgMin,'82.5');
    assert.equal(m.weeks[2].days[0].exercises[0].kgMax,'80','only the next exposure can change');
    assert.deepEqual(m.weeks[0],before.weeks[0],'source performance and prescription untouched');
    assert.equal(getSetPrefill(m.weeks[1].days[0].exercises[0],0,{
        previousExercise:m.weeks[0].days[0].exercises[0]
    }).weight,'82.5');
    assert.equal(getAppliedFutureLoadReview(m,1,0,0).id,'1:0:0');
    assert.equal(canUndoFutureLoadReview(m,record),true);
    assert.deepEqual(undoFutureLoadReview(m,record),{restored:1});
    assert.equal(m.weeks[1].days[0].exercises[0].kgMin,'80');
    assert.equal(m.weeks[2].days[0].exercises[0].kgMax,'80');
    assert.equal(record.undoneAt===undefined,false,'the persisted record tracks undo');
});
test('started future sessions, individually drafted values, deload and advanced top/backoff prescriptions are untouched',()=>{
    const m=mesocycle();
    m.weeks[1].days[0].sessionStart=1730000000;
    m.weeks[2].isDeloadWeek=true;
    assert.equal(previewFutureLoadReview(m,1,0,0,settings),null);
    m.weeks[1].days[0].sessionStart=null;
    m.weeks[2].isDeloadWeek=false;
    m.weeks[1].days[0].exercises[0].sets[0].targetKg=80;
    assert.equal(previewFutureLoadReview(m,1,0,0,settings).changes.length,1);
    m.weeks[2].days[0].exercises[0].loggedSets[0].weight='80';
    assert.equal(previewFutureLoadReview(m,1,0,0,settings),null);
});
test('different future targets are not overwritten or flattened',()=>{
    const m=mesocycle();
    m.weeks[1].days[0].exercises[0].kgMin='85';
    m.weeks[1].days[0].exercises[0].kgMax='85';
    const p=previewFutureLoadReview(m,1,0,0,settings);
    assert.equal(p.changes.length,1);
    assert.equal(p.changes[0].weekNumber,3);
});
test('approval is rejected if source or target changed since preview; no partial writes',()=>{
    const m=mesocycle(),p=previewFutureLoadReview(m,1,0,0,settings);
    m.weeks[1].days[0].exercises[0].loggedSets[0].rpe='7';
    assert.throws(()=>applyFutureLoadReview(m,p,settings),/cambiate/);
    assert.equal(m.weeks[1].days[0].exercises[0].kgMin,'80');
    m.weeks[1].days[0].exercises[0].loggedSets[0].rpe='';
    m.weeks[0].days[0].exercises[0].loggedSets[0].rpe='8';
    assert.throws(()=>applyFutureLoadReview(m,p,settings),/cambiate/);
    assert.equal(m.coachFutureLoadReviews,undefined);
});
test('lock prevents approval and undo; begun updated workout prevents undo of that batch',()=>{
    const m=mesocycle(),p=previewFutureLoadReview(m,1,0,0,settings);
    m.locked=true;
    assert.throws(()=>applyFutureLoadReview(m,p,settings),/bloccato/);
    m.locked=false;
    const record=applyFutureLoadReview(m,p,settings);
    m.locked=true;
    assert.equal(canUndoFutureLoadReview(m,record),false);
    m.locked=false;
    m.weeks[1].days[0].exercises[0].loggedSets[0].weight='82.5';
    assert.equal(canUndoFutureLoadReview(m,record),false);
    assert.throws(()=>undoFutureLoadReview(m,record),/Non posso/);
});
test('warmups, unfinished sources and unavailable plate increments never rewrite any workout',()=>{
    const m=mesocycle();
    m.weeks[0].days[0].completed=false;
    assert.equal(previewFutureLoadReview(m,1,0,0,settings),null);
    m.weeks[0].days[0].completed=true;
    m.weeks[0].days[0].exercises[0].isWarmup=true;
    assert.equal(previewFutureLoadReview(m,1,0,0,settings),null);
    m.weeks[0].days[0].exercises[0].isWarmup=false;
    const noPlates={equipmentSettings:{barbell:2.5,barbellWeight:20,platePairs:{}}};
    assert.equal(previewFutureLoadReview(m,1,0,0,noPlates),null);
});
