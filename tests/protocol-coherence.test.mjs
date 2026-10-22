import {applyPersonalExerciseMapping,inheritPersonalExerciseMapping,exerciseIdentity} from '../mycoatch/exerciseIdentity.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {findPreviousExercise,findPriorExerciseExposures,formatExerciseSummary} from '../js/helpers.js';
import {getSetPrefill} from '../js/setPrefill.js';
import {recommendNextExposure} from '../mycoatch/nextExposure.js';
import {recommendCrossExposureLoad} from '../mycoatch/crossExposureLoad.js';
import {resolveNearbyLoad} from '../mycoatch/loadProposal.js';
import {plannedWorkSetCount,validPerformedSet,localCalendarDay} from '../js/workoutSemantics.js';
import {performanceTimestamp} from '../mycoatch/recentEvidence.js';
import {readFullBackup,buildFullBackup} from '../js/fullBackup.js';
import {evaluateExerciseProgression} from '../mycoatch/progressionPolicy.js';
import {activeExerciseIndices,advanceExercise} from '../js/activeExercise.js';
import {summarizeMesocycleClosure} from '../js/mesocycleClosure.js';
import {recentPainReports} from '../mycoatch/limitationsReview.js';
const set=(weight=79,reps=6,rpe=7)=>({weight,reps,rpe,isLocked:true,completed:true});
const lift=()=>({name:'Squat con Bilanciere',reps:'5-6',targetRpe:7,kgMin:70,setsCount:3,recupero:'180s',loggedSets:[set(79,6,6.5),set(79,6,6.5),set()]});
const history=days=>({history:{years:{2026:{mesocycles:[{weeks:[{weekNumber:1,days}]}]}}}});
test('photo regression: later weekday uses real 79 kg, not original 70; rest change does not force increase',()=>{
    const first=lift(),second={...lift(),recupero:'150s',loggedSets:[{},{},{}]};
    const data=history([{dayNumber:1,completed:true,exercises:[first]},{dayNumber:2,exercises:[second]}]);
    const prior=findPreviousExercise(data,0,1,1,second,false,2026);
    assert.equal(prior,first);
    const advice=recommendNextExposure(prior,second);
    assert.equal(advice.weight,79);assert.equal(advice.kind,'maintain');assert.equal(advice.restChanged,true);
    assert.equal(getSetPrefill(second,0,{previousExercise:prior,nextExposureAdvice:advice}).weight,'79');
    assert.equal(second.kgMin,70);assert.deepEqual(second.loggedSets,[{},{},{}]);
    assert.equal(findPriorExerciseExposures(data,0,1,2,second,2026).length,1);
});
test('warmup exercise and one warmup set never authorize performance transfer',()=>{
    const prior=lift(),next={...lift(),loggedSets:[{},{},{}]};
    prior.isWarmup=true;assert.equal(recommendNextExposure(prior,next),null);
    delete prior.isWarmup;prior.loggedSets[0].isWarmup=true;
    assert.equal(plannedWorkSetCount({...prior,sets:[{},{},{}]}),2);
    assert.equal(validPerformedSet(prior,prior.loggedSets[0]),false);
    const advice=recommendNextExposure(prior,{...next,loggedSets:[{isWarmup:true},{},{}]});
    assert.equal(advice.basedOn.length,2);
});
test('only one rep is added and manual input wins over next-exposure advice',()=>{
    const prior=lift();prior.loggedSets[0].reps=5;
    const next={...lift(),loggedSets:[{weight:81},{},{}]};
    const advice=recommendNextExposure(prior,next);
    assert.deepEqual(advice.reps,[6,6,6]);assert.equal(advice.weight,79);
    assert.equal(getSetPrefill(next,0,{previousExercise:prior,nextExposureAdvice:advice}).weight,'81');
});
test('historical performance date has precedence over edit/confirmation date',()=>{
    assert.equal(performanceTimestamp({completedAt:'2026-10-22T18:00:00Z'},{date:'2025-01-10'}),Date.parse('2025-01-10'));
    assert.equal(performanceTimestamp({performedAt:'2025-01-10',updatedAt:'2026-10-22'},{}),Date.parse('2025-01-10'));
    assert.match(localCalendarDay(new Date(2026,9,22,0,1)),/^2026-10-22$/);
});
test('bodyweight zero is valid but missing external weight is not',()=>{
    assert.equal(validPerformedSet({name:'Hamstring Walkout a Corpo Libero'},set(0,8,5)),true);
    assert.equal(validPerformedSet({name:'Squat con Bilanciere'},set('',8,7)),false);
});
test('malformed backup cannot introduce null sets or malformed archived attempts',()=>{
    const data=history([{dayNumber:1,exercises:[{name:'Squat',loggedSets:[null]}]}]);
    assert.throws(()=>readFullBackup(JSON.stringify(buildFullBackup(data))),/Serie/);
    data.history.years[2026].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets=[set()];
    data.history.years[2026].mesocycles[0].weeks[0].days[0].sessionArchives=[null];
    assert.throws(()=>readFullBackup(JSON.stringify(buildFullBackup(data))),/archiviata/);
});
test('actual nonuniform dumbbell stock takes precedence over nominal increments',()=>{
    assert.equal(resolveNearbyLoad({equipment:'dumbbell'},11,{availableLoads:{dumbbell:[8,10,14]}},{min:10.1,max:12}).weight,null);
    assert.equal(resolveNearbyLoad({equipment:'dumbbell'},13,{availableLoads:{dumbbell:[8,10,14]}}).weight,14);
});
test('strength and volume streams are evaluated independently',()=>{
    const exposure=(week,range,kg)=>({weekId:week,repRange:range,targetRpe:8,completedSets:3,plannedSets:3,allStraightSets:true,uniformWeight:true,workingKg:kg,topKg:kg,allRpeWithinTarget:true,allRepsAtTop:true,allRepsInRange:true});
    const a={min:4,max:6},b={min:8,max:12};
    const result=evaluateExerciseProgression([exposure('a',a,80),exposure('a',b,60),exposure('b',a,80),exposure('b',b,60)]);
    assert.equal(Object.keys(result.byRole).length,2);
    assert.ok(Object.values(result.byRole).every(role=>role.readyForLoad));
});
test('last checkbox advances only when whole exercise or circuit is complete',()=>{
    const a={loggedSets:[{},{}]},b={loggedSets:[{}]},day={exercises:[a,b]};
    assert.deepEqual(activeExerciseIndices(day),[0]);a.loggedSets[1]=set();advanceExercise(day,0);assert.deepEqual(activeExerciseIndices(day),[0]);
    a.loggedSets[0]=set();advanceExercise(day,0);assert.deepEqual(activeExerciseIndices(day),[1]);
    b.loggedSets[0]=set();advanceExercise(day,1);assert.deepEqual(activeExerciseIndices(day),[]);
    const pair=[{groupType:'superset',groupBase:'x',loggedSets:[set()]},{groupType:'superset',groupBase:'x',loggedSets:[{}]}];
    const grouped={exercises:[...pair,{loggedSets:[{}]}]};advanceExercise(grouped,0);assert.deepEqual(activeExerciseIndices(grouped),[0,1]);
    pair[1].loggedSets[0]=set();advanceExercise(grouped,1);assert.deepEqual(activeExerciseIndices(grouped),[2]);
});
test('all report exercises retained, with missing-data reasons instead of hidden rows',()=>{
    const exercises=Array.from({length:12},(_,i)=>({name:'Personale '+i,setsCount:1,loggedSets:i===0?[set()]:[{}]}));
    const report=summarizeMesocycleClosure({weeks:[{weekNumber:1,days:[{exercises}]}]});
    assert.equal(report.exerciseCoverage.length,12);assert.equal(report.exerciseCoverage[1].comparisonStatus,'no_valid_working_sets');
});
test('recent pain review is time bounded and never assumes location',()=>{
    const data=history([{exercises:[],coachCheckin:{pain:'present',checkedAt:'2026-10-20T12:00:00Z'}}]);
    const result=recentPainReports(data,{now:Date.parse('2026-10-22')});assert.equal(result.length,1);assert.equal(result[0].location,'');
    assert.equal(recentPainReports(data,{now:Date.parse('2027-02-01')}).length,0);
});

test('9 kg bar with odd inventory yields an exact cross-exposure load',()=>{
    const source={name:'Squat con bilanciere',equipment:'barbell',reps:'8-8',targetRpe:8,setsCount:2,loggedSets:[set(49,8,8),set(49,8,8)]};
    const next={...source,reps:'6-8',kgMin:'',kgMax:'',loggedSets:[{},{}]};
    const equipment={barbellAssignments:{'squat con bilanciere':{weight:9,diameter:'29'}},plateInventories:{'29':{'20':1,'1':3}},barbell:2.5};
    const result=recommendCrossExposureLoad(next,[source],equipment);
    assert.equal(result.kg,51);
});

test('warmup rows do not block navigation after the last working set',()=>{
    const first={loggedSets:[{isWarmup:true},set()]},second={loggedSets:[{}]},day={exercises:[first,second]};
    advanceExercise(day,0);assert.deepEqual(activeExerciseIndices(day),[1]);
});
test('different planned loads and different cable configurations cannot be overwritten from history',()=>{
    const prior=lift(),future={...lift(),kgMin:85,loggedSets:[{},{},{}]};
    assert.equal(recommendNextExposure(prior,future),null);
    const cable={...prior,name:'Curl ai Cavi Bassi',equipment:'cable'};
    assert.equal(recommendNextExposure(cable,{...cable,loggedSets:[{},{},{}]},{stationConfigurations:{machine:'nuova carrucola'}}),null);
});

test('confirmed personal mapping persists across occurrences and later imports without rewriting names or logs',()=>{
    const ex={name:'Il mio squat',loggedSets:[set()]},data=history([{exercises:[ex,{...structuredClone(ex)}]}]);
    const before=JSON.stringify(ex.loggedSets);
    applyPersonalExerciseMapping(data,'Il mio squat',{name:'Squat con Bilanciere',category:'Quadricipiti',equipment:'barbell'});
    const next=inheritPersonalExerciseMapping(data,{name:'Il mio squat',loggedSets:[]});
    assert.equal(next.exerciseId,ex.exerciseId);assert.equal(ex.name,'Il mio squat');assert.equal(JSON.stringify(ex.loggedSets),before);
    assert.equal(exerciseIdentity(next),'squat con bilanciere');
    applyPersonalExerciseMapping(data,'Il mio squat',null);assert.equal(ex.catalogMapping,undefined);
});

test('declared capacity caps actual inventory suggestions',()=>{
    const result=resolveNearbyLoad({equipment:'dumbbell'},14,{availableLoads:{dumbbell:[10,14]},loadLimits:{dumbbell:12}});
    assert.equal(result.weight,10);
});

test('generated-plan summary uses explicit set count and avoids duplicate fixed load range',()=>{
 const text=formatExerciseSummary({setsCount:3,reps:'5-6',kgMin:'70',kgMax:'70',targetRpe:7,restTime:'150s'});
 assert.match(text,/3 set/);assert.match(text,/150s/);assert.doesNotMatch(text,/70-70/);
});
