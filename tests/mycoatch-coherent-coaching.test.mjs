import test from 'node:test';
import assert from 'node:assert/strict';
import {MyCoatch} from '../mycoatch/index.js';
import {generateSmartMesocycle} from '../mycoatch/engine.js';
import {stageProfileRevision,commitProfileRevision,latestSavedSettings,latestSavedProfile,assessMesocycleProfileContinuity} from '../mycoatch/profileJournal.js';
import {restoreProposalMetadata} from '../mycoatch/planMetadata.js';
import {resolveNearbyLoad,recommendNextSessionLoad} from '../mycoatch/loadProposal.js';
import {estimatePrescribedLoad} from '../mycoatch/prescribedLoad.js';
import {validateCompletedSet,assessExerciseLive,buildLiveSessionSnapshot} from '../mycoatch/liveCoach.js';
import {suggestedBarbell} from '../js/equipmentUI.js';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
import {selectExerciseForSlot,normalizeSelectionPreferences} from '../mycoatch/exerciseSelection.js';
import {reviewUpcomingWeek} from '../mycoatch/weeklyReview.js';

const name='Panca Piana con Bilanciere';
const config={daysPerWeek:4,maxSessionMinutes:60,focus:'hybrid',userAge:35,durationWeeks:4};
const profile={experience:'intermediate',calibration:'regular',excludedExercises:[]};
const set=(kg=50,reps=8,rpe=8)=>({weight:kg,reps,rpe,isLocked:true});
const lift=(overrides={})=>({name,equipment:'barbell',pattern:'horizontal_push',reps:'6-8',rpe:8,set:'3 set',
    sets:[{},{},{}],loggedSets:[set(),set(),set()],...overrides});

test('cancelled generation choices never survive a complete subsequent request',()=>{
    MyCoatch.generateNextFromHistory({}, {...config,splitPreference:'fullbody',deloadWeek:true});
    MyCoatch.clearProposal();
    const next=MyCoatch.generateNextFromHistory({}, {...config,splitPreference:'auto',deloadWeek:null});
    assert.match(next.weeks[0].days[0].dayName,/^Upper A/);
    const adaptive=MyCoatch.generateNextFromHistory({}, {...config,splitPreference:'fullbody',deloadWeek:null});
    assert.ok(adaptive.weeks.every(w=>!w.isDeloadWeek));
});

test('saved generation preferences are versioned, cloned and separate from previews',()=>{
    const data={};
    const first=stageProfileRevision(data,profile,new Date('2026-10-21'),{...config,splitPreference:'fullbody'});
    commitProfileRevision(data,first);
    const savedPlan={coachProfileSnapshot:{profileVersion:first.version,profile:latestSavedProfile(data),settings:latestSavedSettings(data)}};
    const old=structuredClone(data);
    const draft=stageProfileRevision(data,profile,new Date('2026-10-22'),{...config,maxSessionMinutes:45});
    assert.deepEqual(data,old);
    assert.equal(latestSavedSettings(data).maxSessionMinutes,60);
    commitProfileRevision(data,draft);
    assert.equal(latestSavedSettings(data).maxSessionMinutes,45);
    assert.equal(assessMesocycleProfileContinuity(savedPlan,data).status,'updated_since_plan');
    assert.equal(data.athlete.mycoatchProfileJournal.versions[0].settings.maxSessionMinutes,60);
    const copy=latestSavedSettings(data);copy.maxSessionMinutes=1;
    assert.equal(latestSavedSettings(data).maxSessionMinutes,45);
    assert.equal(assessMesocycleProfileContinuity(savedPlan,data).status,'updated_since_plan');
    assert.equal(latestSavedProfile(data).experience,'intermediate');
});

test('proposal round trip preserves duration, anatomy, priorities and no performed data',()=>{
    const proposal=generateSmartMesocycle({...config,deloadWeek:false},{});
    const imported={weeks:proposal.weeks.map(w=>({weekNumber:w.weekNumber,days:w.days.map(d=>({
        exercises:d.exercises.map(ex=>({name:ex.name,reps:ex.reps,rpe:ex.rpe,kgMin:ex.kgMin,
            sets:Array.from({length:ex.setsCount},()=>({weight:'',reps:'',rpe:'',isLocked:false}))}))
    }))}))};
    const before=structuredClone(imported),source=structuredClone(proposal);
    const restored=restoreProposalMetadata(imported,proposal);
    assert.deepEqual(imported,before);assert.deepEqual(proposal,source);
    const day=restored.weeks[0].days[0];
    assert.equal(day.timeBudgetMinutes,60);
    assert.ok(day.exercises[0].anchorKey);
    assert.equal(day.exercises[0].pattern,'horizontal_push');
    assert.equal(buildLiveSessionSnapshot(day).budgetMinutes,60);
    assert.ok(day.exercises.every(ex=>ex.loggedSets.every(s=>s.isLocked===false)));
    const bad=structuredClone(imported);bad.weeks[0].days[0].exercises[0].reps='1';
    assert.throws(()=>restoreProposalMetadata(bad,proposal),/Prescrizione/);
});

test('same-variant e1RM reference is conservative and never extrapolates above twelve',()=>{
    const history={exposures:[66.6666667,67,100].map(loadReferenceE1rm=>({
        loadReferenceE1rm,allStraightSets:true,completedSets:3,plannedSets:3
    }))};
    const estimate=estimatePrescribedLoad(history,'6-8',8);
    assert.equal(estimate.reference,67);
    assert.ok(Math.abs(estimate.raw-52.89)<.02);
    assert.equal(estimatePrescribedLoad(history,'13-15',8),null);
    assert.equal(estimatePrescribedLoad({},'6-8',8),null);
});

test('actual odd-weight bar inventory is searched instead of rounding to imaginary plates',()=>{
    const equipment={barbellAssignments:{[canonicalExerciseKey(name)]:{weight:9,diameter:'29'}},
        plateInventories:{'29':{'20':1,'1':3,'0.5':2}}};
    assert.equal(resolveNearbyLoad(lift(),52.6,equipment,{min:50,max:54}).weight,53);
    const measuredBar={...equipment,barbellAssignments:{[canonicalExerciseKey(name)]:{weight:9.1,diameter:'29'}}};
    assert.equal(resolveNearbyLoad(lift(),52.7,measuredBar,{min:50,max:54}).weight,53.1);
    assert.equal(resolveNearbyLoad(lift(),52.6,{plateInventories:{'29':{}}}).weight,null);
    assert.equal(resolveNearbyLoad(lift(),52.6,{}).verified,false);
    assert.equal(resolveNearbyLoad(lift(),52.6,{...equipment,ownedBarbells:[]}).weight,null);
});

test('rep progression survives limited loading and does not extend the range silently',()=>{
    const ex=lift({loggedSets:[set(50,6),set(50,7),set(50,6)]});
    const advice=recommendNextSessionLoad(ex);
    assert.equal(advice.suggestedWeight,null);
    assert.deepEqual(advice.nextReps,[7,7,6]);
    const high=lift({equipment:'dumbbell',reps:'15-25',loggedSets:[set(5,25),set(5,25),set(5,25)]});
    const hold=recommendNextSessionLoad(high,{equipmentSettings:{dumbbell:5}});
    assert.ok(hold.suggestedWeight>5&&hold.suggestedWeight<=5.25);
    assert.equal(hold.repGoal,15);assert.equal(hold.verified,false);
    assert.match(hold.reason,/indicativo/);
});

test('live load changes respect configured equipment and low RPE is stored without e1RM',()=>{
    assert.equal(validateCompletedSet({weight:50,reps:6,rpe:5},lift()).ok,true);
    const low=assessExerciseLive(lift({loggedSets:[set(50,6,5),{},{}]}));
    assert.equal(low.e1rm,null);
    const easy=lift({loggedSets:[set(50,8,6),set(50,8,6),{}]});
    assert.equal(assessExerciseLive(easy,0,{equipmentSettings:{plateInventories:{'29':{}}}}).suggestedWeight,null);
});

test('barbell assignment persists by canonical exercise and never falls back after removal',()=>{
    const equipment={ownedBarbells:[{weight:9,diameter:'29'},{weight:20,diameter:'50'}],
        defaultBarbell:{weight:20,diameter:'50'},barbellAssignments:{
            [canonicalExerciseKey(name)]:{weight:9,diameter:'29'}}};
    assert.equal(suggestedBarbell({name:'PANCA'},equipment).weight,9);
    equipment.ownedBarbells=[{weight:20,diameter:'50'}];
    assert.equal(suggestedBarbell({name},equipment),null);
});

test('short full-body plans retain weekly pulls and knee flexion within the actual budget',()=>{
    for(const maxSessionMinutes of [30,45,60]){
        const p=generateSmartMesocycle({...config,splitPreference:'fullbody',maxSessionMinutes,deloadWeek:false,
            availableAccessories:['rack','flat_bench','ankle_strap']},{});
        for(const week of p.weeks){
            const exercises=week.days.flatMap(day=>day.exercises);
            for(const pattern of ['horizontal_pull','vertical_pull','horizontal_push','vertical_push','squat','hinge'])
                assert.ok(exercises.some(ex=>ex.pattern===pattern),maxSessionMinutes+': '+pattern);
            assert.ok(exercises.some(ex=>ex.category==='Femorali'&&ex.pattern==='isolation'));
            assert.ok(week.days.every(day=>day.estimatedMinutes<=maxSessionMinutes));
        }
    }
});

test('working exercise stays; a persistent stall can offer a compatible calibrated alternative',()=>{
    const slot={muscle:'Bicipiti',pattern:'isolation'};
    const preferences=normalizeSelectionPreferences();
    const previousName='Curl ai Cavi Bassi';
    assert.equal(selectExerciseForSlot(slot,{preferences,previousName}).exercise.name,previousName);
    const varied=selectExerciseForSlot(slot,{preferences,previousName,allowVariation:true});
    assert.notEqual(varied.exercise.name,previousName);
    assert.match(varied.reason,/stallo persistente/);
});

test('two reliable hard days remain reviewable even if an unrelated day is unfinished',()=>{
    const day=()=>({completed:true,exercises:[lift({loggedSets:[set(50,8,9.5),set(50,8,9.5),set(50,8,9.5)]})]});
    const meso={weeks:[{weekNumber:1,days:[day(),day(),{completed:false,exercises:[]}]},
        {weekNumber:2,days:[{exercises:[lift({loggedSets:[]})]}]}]};
    assert.equal(reviewUpcomingWeek(meso,2).status,'ready');
});
