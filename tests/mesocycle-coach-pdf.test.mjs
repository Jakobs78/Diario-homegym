import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMesocycleCoachPdfReport } from '../js/mesocyclePdfCoachReport.js';

const set=(weight,reps,rpe,ok=true,extras={})=>({
    weight:String(weight),reps:String(reps),rpe:String(rpe ?? ''),
    isLocked:ok,completed:ok,...extras
});

test('coach PDF combines closure review, weekly metrics and muscle percent shares without changing history',()=>{
    const meso={
        name:'Mesociclo demo',email:'private@example.org',athleteId:'sensitive',
        weeks:[
            {weekNumber:1,days:[{dayNumber:1,dayName:'Push',sessionArchives:[
                {exercises:[{name:'Panca Piana con Bilanciere',
                    loggedSets:[set(500,5,9)]}]}
            ],exercises:[
                {name:'Panca Piana con Bilanciere',setsCount:2,notes:'COACH PRIVATE',
                    userNotes:'PRIVATE NOTES',loggedSets:[set(80,8,8),
                        set(85,7,9,false)]},
                {name:'Squat con Bilanciere',setsCount:1,loggedSets:[
                    set(50,5,7,true,{isWarmup:true})]},
                {name:'Esercizio Sconosciuto ABC',setsCount:1,loggedSets:[
                    set(30,10,8)]}
            ]}]},
            {weekNumber:2,isDeloadWeek:true,days:[{dayNumber:1,dayName:'Push',
                exercises:[{name:'Panca Piana con Bilanciere',setsCount:2,
                    loggedSets:[set(80,9,null),set(80,9,8)]}]
            }]}
        ]
    };
    const original=JSON.stringify(meso);
    const report=buildMesocycleCoachPdfReport(meso);
    assert.equal(JSON.stringify(meso),original,'report must be strictly read-only');
    assert.equal(report.closure.plannedSessions,2);
    assert.equal(report.closure.completedSets,4,'includes confirmed unknown exercise but not warmup');
    assert.equal(report.closure.archivedRepeats,1,'archive appears separately, never in main totals');
    assert.equal(report.closure.measuredRpeSets,3);
    assert.equal(report.tonnage,80*8+30*10+80*9+80*9);
    assert.deepEqual(report.physicalSets,{plannedRecognized:5,confirmedRecognized:3});
    assert.deepEqual(report.unclassified,['Esercizio Sconosciuto ABC']);
    assert.equal(report.weekly.length,2);
    assert.equal(report.weekly[1].isDeloadWeek,true);
    const petto=report.muscles.find(x=>x.muscle==='Petto');
    assert.equal(petto.direct,3);
    assert.equal(petto.planned,4);
    assert.equal(petto.execution,75);
    assert.ok(petto.share>0&&petto.share<100);
    assert.equal(report.muscles.reduce((sum,r)=>sum+(r.share||0),0)>99,true);
    assert.equal(report.muscles.reduce((sum,r)=>sum+(r.share||0),0)<101,true);
    assert.ok(report.rows.some(x=>x.kind==='coach-section'&&x.title.includes('MYCOATCH')));
    assert.ok(report.rows.some(x=>x.kind==='coach-section'&&x.title.includes('MUSCOLARI')));
    assert.ok(report.rows.some(x=>x.kind==='coach-text'&&x.text.includes('RPE mancanti')));
    assert.ok(report.rows.some(x=>x.kind==='coach-text'&&x.text.includes('Esercizio Sconosciuto ABC')));
    assert.ok(report.rows.some(x=>x.kind==='coach-text'&&x.text.includes('non sommate alle sedute')));
    const reportText=JSON.stringify(report.rows);
    for(const secret of ['private@example.org','sensitive','COACH PRIVATE','PRIVATE NOTES','500'])
        assert.doesNotMatch(reportText,new RegExp(secret),'MyCoatch overview should not expose raw notes, identifiers or archives');
});

test('no completed workout: never imply a trained muscle percentage or invented results',()=>{
    const m={weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[
        {name:'Panca Piana con Bilanciere',setsCount:3,
         loggedSets:[set(60,8,8,false),set(65,8,8,false),set(65,8,8,false)]}
    ]}]}]};
    const report=buildMesocycleCoachPdfReport(m);
    assert.equal(report.closure.completedSets,0);
    assert.equal(report.tonnage,0);
    assert.equal(report.muscles.find(r=>r.muscle==='Petto').planned,3);
    assert.ok(report.muscles.every(r=>r.share===null));
    assert.ok(report.muscles.some(r=>r.muscle==='Petto'&&r.execution===0));
    assert.ok(report.rows.some(r=>r.kind==='coach-text'&&r.text.includes('dati insufficienti')));
});

test('weight and RPE validation match MyCoatch closure, and warmups are excluded',()=>{
    const m={weeks:[{days:[{exercises:[
        {name:'Panca Piana con Bilanciere',setsCount:4,loggedSets:[
            set(80,8,8,true,{isWarmup:true}),set('',10,8),
            set(75,'6-8',8),set(75,8,14)
        ]},
        {name:'Squat con Bilanciere',isExcluded:true,setsCount:2,
         loggedSets:[set(200,8,8),set(200,8,8)]}
    ]}]}]};
    const report=buildMesocycleCoachPdfReport(m);
    assert.equal(report.physicalSets.confirmedRecognized,0);
    assert.equal(report.tonnage,0);
    assert.equal(report.closure.completedSets,0);
    assert.ok(report.muscles.every(r=>r.credited===0));
});
