import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSmartMesocycle, previousComparableTrainingDay } from '../mycoatch/engine.js';
import { analyzeTrainingHistory } from '../mycoatch/historyInsights.js';
import { planAdaptiveDecisions } from '../mycoatch/adaptiveDecisions.js';
import { MyCoatch } from '../mycoatch/index.js';
import { coachState } from '../mycoatch/state.js';
import { estimateDayMinutes } from '../mycoatch/timeEstimator.js';
import { DEFAULT_HOME_GYM_ACCESSORIES } from '../mycoatch/exercisesDB.js';

const profile=(experience='advanced',priorityMuscle=null)=>({
    experience,calibration:'regular',priorityMuscle,
    excludedExercises:[],referenceLoads:{}
});
const cfg=(days,time,experience='advanced',priorityMuscle=null)=>({
    daysPerWeek:days,durationWeeks:4,maxSessionMinutes:time,
    focus:'hypertrophy',athleteProfile:profile(experience,priorityMuscle)
});
const sampled=(name,completed=true)=>({
    name,loggedSets:completed?[{
        weight:'40',reps:'8',rpe:'7.5',isLocked:true,completed:true
    }]:[]
});

test('AUDIT MATRIX: 3/4 days x 30/45/60/90m x beginner/advanced x recovery weeks',()=>{
    let inspectedSessions=0;
    for(const days of [3,4])
        for(const minutes of [35,45,60,90])
            for(const experience of ['beginner','advanced']){
                const settings=cfg(days,minutes,experience,'Spalle');
                const immutable=JSON.stringify(settings);
                const plan=generateSmartMesocycle(settings,{byExercise:{},byMuscle:{}});
                assert.equal(JSON.stringify(settings),immutable);
                assert.equal(plan.weeks.length,4);
                for(const week of plan.weeks){
                    for(const day of week.days){
                        inspectedSessions++;
                        assert.ok(day.estimatedMinutes<=minutes,
                            days+'d/'+minutes+'min/'+experience+'/'+week.weekNumber);
                        assert.equal(estimateDayMinutes(day.exercises),day.estimatedMinutes);
                        const names=day.exercises.map(x=>x.name);
                        assert.equal(new Set(names).size,names.length,'no repeated identical exercise');
                        for(const core of day.selectionAudit.protected)
                            assert.ok(names.includes(core),'protected compound survives selection and rebalance');
                        for(const ex of day.exercises){
                            assert.ok(ex.setsCount>=1);
                            assert.equal(ex.setsCount,ex.sets.length);
                            assert.ok(Number(ex.rpe)>=6 && Number(ex.rpe)<=
                                (experience==='beginner'?8:8.5));
                            if(week.isDeloadWeek)
                                assert.equal(Number(ex.rpe),6.5,'deload remains conservative');
                            for(const set of ex.sets){
                                assert.equal(set.completed,false);
                                assert.equal(set.actualKg,'');
                                assert.equal(set.actualReps,'');
                            }
                        }
                    }
                }
            }
    assert.equal(inspectedSessions,(3+4)*4*2*4);
});

test('AUDIT LONGITUDINAL: absent measured RPE never triggers load or rep progression',()=>{
    const meso=generateSmartMesocycle(cfg(3,60),{byExercise:{},byMuscle:{}});
    const completed=JSON.parse(JSON.stringify(meso));
    for(const week of completed.weeks)
        for(const day of week.days){
            day.completed=true;
            day.exercises=day.exercises.map(ex=>({
                ...ex,set:ex.setsCount+' set',
                loggedSets:ex.sets.map(()=>({
                    weight:'20',reps:String(Number.parseInt(ex.reps,10)),
                    rpe:'',completed:true,isLocked:true
                }))
            }));
        }
    const userHistory={history:{years:{2026:{mesocycles:[completed]}}}};
    const initial=JSON.stringify(userHistory);
    const analysis=analyzeTrainingHistory(userHistory);
    assert.ok(analysis.sessionsAnalyzed>=12);
    assert.ok(Object.keys(analysis.byExercise).length>0);
    assert.ok(Object.values(analysis.byExercise).every(ex=>!ex.readyForLoad&&!ex.readyForReps));
    const decisions=planAdaptiveDecisions(analysis);
    assert.ok(Object.values(decisions.byExercise).every(item=>
        item.action!=='increase_load'&&item.action!=='build_reps'));
    try{
        const following=MyCoatch.generateNextFromHistory(userHistory,{
            durationWeeks:4,daysPerWeek:3,maxSessionMinutes:60,
            focus:'hypertrophy',athleteProfile:profile()
        });
        assert.equal(following.coachReport.progressionQuality.proposedLoadIncreases,0);
        assert.equal(following.coachReport.progressionQuality.proposedRepSteps,0);
        assert.equal(following.weeks.length,4);
    }finally{coachState.clear();}
    assert.equal(JSON.stringify(userHistory),initial,'neither full-cycle audit nor coaching changes historical data');
});

test('AUDIT CONTINUITY: use latest confirmed operational variant, not week one or deload',()=>{
    const previous={weeks:[
        {weekNumber:1,days:[{dayNumber:1,exercises:[
            sampled('Panca Piana con Bilanciere')
        ]}]},
        {weekNumber:3,days:[{dayNumber:1,exercises:[
            sampled('Panca Inclinata con Manubri')
        ]}]},
        {weekNumber:4,isDeloadWeek:true,days:[{dayNumber:1,exercises:[
            sampled('Panca Piana con Bilanciere')
        ]}]}
    ]};
    const before=JSON.stringify(previous);
    assert.equal(previousComparableTrainingDay(previous,1)?.exercises[0]?.name,
        'Panca Inclinata con Manubri');
    const selectedWithBench=generateSmartMesocycle({
        ...cfg(3,60),
        availableAccessories:[...DEFAULT_HOME_GYM_ACCESSORIES,'incline_bench']
    },{byExercise:{},byMuscle:{}},previous);
    assert.ok(selectedWithBench.weeks[0].days[0].exercises.some(ex=>
        ex.name==='Panca Inclinata con Manubri'),
        'last confirmed operational variant retained when incline bench exists');
    const unavailable=generateSmartMesocycle(cfg(3,60),
        {byExercise:{},byMuscle:{}},previous);
    assert.ok(!unavailable.weeks[0].days[0].exercises.some(ex=>
        ex.name==='Panca Inclinata con Manubri'),
        'an athlete without incline bench must not receive the exercise');
    assert.equal(JSON.stringify(previous),before,'prior mesocycle is read-only');
});

test('AUDIT CONTINUITY: excluded earlier days and absent past schedule are safe',()=>{
    assert.equal(previousComparableTrainingDay({},1),null);
    assert.equal(previousComparableTrainingDay(null,1),null);
    const old={weeks:[
        {weekNumber:1,days:[{dayNumber:1,exercises:[sampled('Squat con Bilanciere',false)]}]},
        {weekNumber:2,days:[{dayNumber:1,exercises:[sampled('Front Squat',false)]}]}
    ]};
    assert.equal(previousComparableTrainingDay(old,1).exercises[0].name,'Front Squat');
});

