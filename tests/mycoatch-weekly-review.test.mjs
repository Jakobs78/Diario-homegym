import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewUpcomingWeek, applyUpcomingWeekReview,
    undoUpcomingWeekReview } from '../mycoatch/weeklyReview.js';
import { getSetPrefill } from '../js/setPrefill.js';

const performed=(weight,reps,rpe)=>({
    weight:String(weight),reps:String(reps),rpe:rpe===null?'':String(rpe),
    isLocked:true,completed:true
});
const empty=()=>({weight:'',reps:'',rpe:'',isLocked:false,completed:false});
const entry=(day,date,flag={})=>({
    dayNumber:day,dayName:'Giorno '+day,completed:true,
    date,
    coachCheckin:{
        checkedAt:date+'T10:00:00.000Z',
        sleep:'ok',energy:'ok',soreness:'ok',pain:'none',
        ...flag
    },
    exercises:[
        {name:'Panca Piana con Bilanciere',targetRpe:'@8',rpe:'@8',
            reps:'6-8',loggedSets:[
                performed(80,6,9.5),performed(80,7,9.5),
                performed(80,6,9.5)
            ]}
    ]
});
const targetExercise=(name,rpe='@8')=>({
    name,kgMin:'80',kgMax:'80',targetRpe:rpe,rpe,
    reps:'6-8',set:'3 set',
    sets:[0,1,2].map(()=>({targetRpe:rpe,weight:'',reps:'',rpe:''})),
    loggedSets:[empty(),empty(),empty()]
});
const fixture=()=>({
    weeks:[
        {weekNumber:1,days:[entry(1,'2026-10-12'),entry(2,'2026-10-14')]},
        {weekNumber:2,days:[
            {dayNumber:1,exercises:[
                targetExercise('Panca Piana con Bilanciere'),
                targetExercise('Alzate Laterali con Manubri','@7.5')
            ]},
            {dayNumber:2,exercises:[targetExercise('Rematore con Bilanciere')]}
        ]},
        {weekNumber:3,days:[{dayNumber:1,exercises:[targetExercise('Stacco')]}]}
    ]
});

test('two different completed days with measured excessive RPE propose lower next-week targets',()=>{
    const meso=fixture(),before=JSON.stringify(meso);
    const review=reviewUpcomingWeek(meso,2);
    assert.equal(review.status,'ready');
    assert.equal(review.confirmedDays,2);
    assert.equal(review.affectedDays,2);
    assert.equal(review.measuredSets,6);
    assert.equal(review.changes.length,3);
    assert.ok(review.changes.every(c=>c.from!==c.to));
    assert.equal(JSON.stringify(meso),before,'preview must be pure');
    assert.equal(reviewUpcomingWeek(meso,1).status,'none');
});

test('explicit confirmation applies target changes ONLY to untouched next week, never real logged sets or other weeks',()=>{
    const meso=fixture(),oldWeek=JSON.stringify(meso.weeks[0]);
    const thirdWeek=JSON.stringify(meso.weeks[2]);
    const proposal=reviewUpcomingWeek(meso,2);
    const applied=applyUpcomingWeekReview(meso,2,proposal);
    assert.equal(applied.status,'applied');
    assert.equal(applied.changes,3);
    assert.equal(meso.weeks[1].days[0].exercises[0].targetRpe,'@7.5');
    assert.equal(meso.weeks[1].days[0].exercises[0].rpe,'@7.5');
    assert.equal(meso.weeks[1].days[0].exercises[1].targetRpe,'@7');
    assert.equal(meso.weeks[1].days[0].exercises[0].kgMin,'80',
        'audit of original planned kg retained');
    assert.equal(meso.weeks[1].days[0].exercises[0].sets[0].targetRpe,'@7.5');
    assert.equal(meso.weeks[1].days[0].exercises[0].loggedSets[0].rpe,'');
    assert.equal(meso.weeks[1].days[0].exercises[0].coachWeeklyLoadReview,true);
    assert.equal(JSON.stringify(meso.weeks[0]),oldWeek);
    assert.equal(JSON.stringify(meso.weeks[2]),thirdWeek);
    assert.equal(reviewUpcomingWeek(meso,2).status,'applied');
    assert.throws(()=>applyUpcomingWeekReview(meso,2,proposal),/non più valida/i);
});

test('prefill after voluntary review requires real new load, does not inherit last week RPE',()=>{
    const meso=fixture();
    const future=meso.weeks[1].days[0].exercises[0];
    const previous=meso.weeks[0].days[0].exercises[0];
    assert.equal(getSetPrefill(future,0,{previousExercise:previous}).weight,'80');
    applyUpcomingWeekReview(meso,2,reviewUpcomingWeek(meso,2));
    const fresh=getSetPrefill(future,0,{previousExercise:previous});
    assert.equal(fresh.weight,'','no target or previous week weight!');
    assert.equal(fresh.rpe,'7.5','RPE of new prescription remains a target');
    assert.equal(fresh.reps,'6');
    assert.equal(future.loggedSets[0].isLocked,false);
    // Only the athlete can enter the new weight; does not auto-save performance.
});

test('undo restores EXACT previous prescribed fields and allows a fresh review',()=>{
    const meso=fixture();
    const source=JSON.stringify(meso.weeks[1]);
    applyUpcomingWeekReview(meso,2,reviewUpcomingWeek(meso,2));
    assert.equal(undoUpcomingWeekReview(meso,2).status,'undone');
    assert.equal(JSON.stringify(meso.weeks[1]),source);
    assert.equal(reviewUpcomingWeek(meso,2).status,'ready');
});

test('one poor day, missing RPE or absent completed flag is not enough',()=>{
    const onlyOne=fixture();
    onlyOne.weeks[0].days[1].exercises[0].loggedSets=[
        performed(80,8,8),performed(80,8,8),performed(80,8,8)
    ];
    assert.equal(reviewUpcomingWeek(onlyOne,2).status,'steady');
    const missing=fixture();
    missing.weeks[0].days.forEach(d=>d.exercises[0].loggedSets.forEach(s=>s.rpe=''));
    assert.equal(reviewUpcomingWeek(missing,2).status,'insufficient');
    const incomplete=fixture();
    incomplete.weeks[0].days[1].completed=false;
    assert.equal(reviewUpcomingWeek(incomplete,2).status,'incomplete');
    const unchecked=fixture();
    unchecked.weeks[0].days[1].exercises[0].loggedSets[1].isLocked=false;
    unchecked.weeks[0].days[1].exercises[0].loggedSets[1].completed=false;
    assert.equal(reviewUpcomingWeek(unchecked,2).status,'incomplete');
    assert.equal(reviewUpcomingWeek(fixture(),5).status,'none');
});

test('pain reported with same-day checkin blocks template changes and is not diagnosed away',()=>{
    const meso=fixture();
    meso.weeks[0].days[0].coachCheckin.pain='present';
    const review=reviewUpcomingWeek(meso,2);
    assert.equal(review.status,'pain');
    assert.match(review.message,/dolore/i);
    assert.throws(()=>applyUpcomingWeekReview(meso,2,review),/non più valida/i);
    assert.equal(meso.weeks[1].days[0].exercises[0].rpe,'@8');
});

test('stale pain checkin not counted as evidence of that session',()=>{
    const meso=fixture();
    meso.weeks[0].days[0].coachCheckin={
        ...meso.weeks[0].days[0].coachCheckin,
        pain:'present',checkedAt:'2026-01-01T12:00:00.000Z'
    };
    assert.equal(reviewUpcomingWeek(meso,2).status,'ready');
});

test('started or locked target, already-deload RPE and stale preview never get overwritten',()=>{
    const started=fixture();
    started.weeks[1].days[0].exercises[0].loggedSets[0]=performed(80,6,8);
    assert.equal(reviewUpcomingWeek(started,2).status,'started');
    assert.throws(()=>applyUpcomingWeekReview(started,2,reviewUpcomingWeek(fixture(),2)),
        /non più valida/i);
    const locked=fixture();
    locked.locked=true;
    assert.equal(reviewUpcomingWeek(locked,2).status,'locked');
    const deload=fixture();
    deload.weeks[1].days.flatMap(d=>d.exercises).forEach(ex=>{
        ex.targetRpe='@6.5';ex.rpe='@6.5';
    });
    assert.equal(reviewUpcomingWeek(deload,2).status,'steady');
    const stale=fixture();
    const original=reviewUpcomingWeek(stale,2);
    stale.weeks[1].days[0].exercises[0].targetRpe='@7';
    assert.throws(()=>applyUpcomingWeekReview(stale,2,original),/non più valida/i);
});

test('undo refuses started training and conflicting manual changes',()=>{
    const meso=fixture();
    applyUpcomingWeekReview(meso,2,reviewUpcomingWeek(meso,2));
    const future=meso.weeks[1].days[0].exercises[0];
    future.targetRpe='@7';
    assert.throws(()=>undoUpcomingWeekReview(meso,2),/modificato/i);
    future.targetRpe='@7.5';
    future.sets[0].targetRpe='@8';
    assert.throws(()=>undoUpcomingWeekReview(meso,2),/target per serie/i);
    future.sets[0].targetRpe='@7.5';
    future.rpe='@8';
    assert.throws(()=>undoUpcomingWeekReview(meso,2),/modificato/i);
    future.rpe='@7.5';
    future.loggedSets[0]=performed(77,6,8);
    assert.throws(()=>undoUpcomingWeekReview(meso,2),/iniziata/i);
    assert.equal(meso.weeks[1].coachWeeklyReview.changes.length,3);
});
