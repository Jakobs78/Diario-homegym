import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSmartMesocycle} from '../mycoatch/engine.js';
import {generationSchedule} from '../mycoatch/generationSchedule.js';
import {parseCoachPreferences} from '../mycoatch/userPreferences.js';
import {normalizeSelectionPreferences,isExerciseAvailable,selectExerciseForSlot} from '../mycoatch/exerciseSelection.js';
import {EXERCISE_DATABASE} from '../mycoatch/exercisesDB.js';
import {MyCoatch} from '../mycoatch/index.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
import {auditLatestBlock} from '../mycoatch/macrocyclePlanner.js';
import {buildMesocyclePdfOutline} from '../js/mesocyclePdfModel.js';

test('schedule validates boundaries in UI and engine; no extra/truncated weeks',()=>{
    for(const durationWeeks of ['',0,13,4.5,'abc'])assert.throws(()=>generationSchedule({durationWeeks}),/settimane/);
    for(const daysPerWeek of ['',0,7,2.5,'abc'])assert.throws(()=>generationSchedule({daysPerWeek}),/allenamenti/);
    const p=parseCoachPreferences({selectedTime:'60',userAge:49,daysPerWeek:'6',durationWeeks:'8',focus:'hybrid'});
    assert.equal(p.durationWeeks,8);assert.equal(p.daysPerWeek,6);
    assert.throws(()=>generateSmartMesocycle({durationWeeks:13}),/settimane/);
});

test('1/2/3/4/5/6 days and 1/5/8/12 weeks stay within time, with unique unperformed exercises',()=>{
    for(const durationWeeks of [1,5,8,12])for(const daysPerWeek of [1,2,3,4,5,6]){
        const m=generateSmartMesocycle({durationWeeks,daysPerWeek,maxSessionMinutes:60,
            deloadWeek:false,availableAccessories:['rack','flat_bench','ankle_strap'],
            athleteProfile:{experience:'intermediate',calibration:'guided'}});
        assert.equal(m.weeks.length,durationWeeks);
        for(const [i,w] of m.weeks.entries()){
            assert.equal(w.weekNumber,i+1);assert.equal(w.days.length,daysPerWeek);
            for(const [j,d] of w.days.entries()){
                assert.equal(d.dayNumber,j+1);assert.ok(d.estimatedSeconds<=3600);
                assert.equal(new Set(d.exercises.map(e=>e.name)).size,d.exercises.length);
                for(const e of d.exercises){
                    assert.ok(EXERCISE_DATABASE.find(x=>x.name===e.name).generationAllowed);
                    assert.ok(e.sets.every(s=>!s.completed&&!s.actualKg));
                }
            }
        }
    }
});

test('an eight-week guided plan has no accidental fourth-week deload target',()=>{
    const m=generateSmartMesocycle({durationWeeks:8,daysPerWeek:4,deloadWeek:false,
        athleteProfile:{experience:'intermediate',calibration:'guided'}});
    assert.equal(m.weeks[3].isDeloadWeek,false);
    assert.ok(m.weeks[3].targetRpe>=m.weeks[2].targetRpe);
    const last=generateSmartMesocycle({durationWeeks:8,deloadWeek:true});
    assert.deepEqual(last.weeks.filter(w=>w.isDeloadWeek).map(w=>w.weekNumber),[8]);
});

test('one machine flag cannot invent other machines; new allowed variants are selectable',()=>{
    const pref=normalizeSelectionPreferences({availableEquipment:['machine'],availableMachines:['leg_press'],cableSetup:'none',availableAccessories:[]});
    assert.deepEqual(EXERCISE_DATABASE.filter(e=>isExerciseAvailable(e,pref)).map(e=>e.name),['Leg Press 45°']);
    const p=normalizeSelectionPreferences({availableEquipment:['machine'],availableMachines:['chest_press'],cableSetup:'none',availableAccessories:[]});
    assert.equal(selectExerciseForSlot({muscle:'Petto',pattern:'horizontal_push',anchor:'bench'},{preferences:p}).exercise.name,'Chest Press');
    assert.throws(()=>normalizeSelectionPreferences({availableMachines:['invented']}),/macchine/);
});

test('missing knee flexion is disclosed; no bodyweight fallback; imported exercise identity survives',()=>{
    const p=normalizeSelectionPreferences();
    assert.equal(selectExerciseForSlot({muscle:'Femorali',pattern:'isolation',optional:true},{preferences:p}).exercise,null);
    assert.ok(EXERCISE_DATABASE.find(e=>e.name==='Hamstring Walkout a Corpo Libero'));
    assert.ok(EXERCISE_DATABASE.filter(e=>e.equipment==='bodyweight').every(e=>!e.generationAllowed));
    assert.equal(EXERCISE_DATABASE.find(e=>e.name==='Alzate Laterali ai Cavi').unilateral,true);
});

test('one detailed block only; full CSV export reaches week 12 / day 6 without mutating history',()=>{
    const history={history:{years:{2026:{mesocycles:[]}}}};const before=JSON.stringify(history);
    const m=MyCoatch.generateNextFromHistory(history,{durationWeeks:12,daysPerWeek:6,maxSessionMinutes:60,deloadWeek:false});
    assert.equal(JSON.stringify(history),before);
    assert.equal(m.generationScope.detailedMesocycles,1);
    assert.equal(m.macrocycle.blocks[1].conditional,true);
    assert.ok(MyCoatch.exportAsCSV().split('\n').some(row=>row.startsWith('12;6;')));
    assert.match(MyCoatch.exportAsCSV(),/SPLIT MYCOATCH\] Lower C/);
    assert.equal(auditLatestBlock(m).weeksPlanned,12);
    assert.equal(auditLatestBlock(m).completed,false);
    const outline=buildMesocyclePdfOutline(m);
    assert.equal(outline.filter(row=>row.kind==='week').length,12);
    assert.equal(outline.filter(row=>row.kind==='day').length,72);
    assert.equal(outline.filter(row=>row.kind==='week').at(-1).title,'Settimana 12');
});

test('live reconciliation still reaches week 8 / day 6 and protects confirmed source and manual entries',()=>{
    const name='Panca Piana con Bilanciere';
    const source={name,set:'2 set',reps:'6-8',rpe:8,sets:[{},{}],loggedSets:[0,1].map(()=>({weight:80,reps:8,rpe:7,isLocked:true}))};
    const pending=()=>({name,set:'2 set',reps:'6-8',rpe:8,sets:[{},{}],loggedSets:[{weight:'77',reps:'',rpe:'',isLocked:false},{}]});
    const m={weeks:[{weekNumber:7,days:[{dayNumber:1,exercises:[source]}]},
        {weekNumber:8,days:Array.from({length:6},(_,i)=>({dayNumber:i+1,exercises:[pending()]}))}]};
    const before=JSON.stringify(source);const d={history:{years:{2026:{mesocycles:[m]}}}};
    reconcileTrainingPlan(d,{year:2026,mesoIndex:0});
    assert.equal(JSON.stringify(source.loggedSets),JSON.stringify(JSON.parse(before).loggedSets));
    const last=m.weeks[1].days[5].exercises[0];
    assert.ok(last.coachSetProposals[0]);assert.equal(last.loggedSets[0].weight,'77');
    assert.equal(last.coachSetProposals[0].destination.weekNumber,8);
    assert.equal(last.coachSetProposals[0].destination.dayIndex,5);
});
