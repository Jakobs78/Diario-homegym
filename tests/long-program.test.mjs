import test from 'node:test';
import assert from 'node:assert/strict';
import {MyCoatch} from '../mycoatch/index.js';
import {programSchedule,compactProgramForJournal} from '../mycoatch/longProgram.js';
import {nextProgramSession} from '../mycoatch/sessionSequence.js';
import {buildAIExchange,formatAIExchangeMarkdown,UNIVERSAL_REVIEW_PROMPT} from '../mycoatch/aiExchange.js';
import {encodeCloudPayload,decodeCloudPayload} from '../js/cloudPayload.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';

const config={durationWeeks:6,programWeeks:26,daysPerWeek:4,maxSessionMinutes:60,deloadWeek:false,
    athleteProfile:{experience:'intermediate',calibration:'regular'}};

test('long programmes preserve 1–12 week blocks; 26/52 weeks have no calendar dependency or invented results',()=>{
    for(const programWeeks of [26,52]){
        const history={history:{years:{2026:{mesocycles:[]}}}},before=JSON.stringify(history);
        const p=MyCoatch.generateNextFromHistory(history,{...config,programWeeks});
        assert.equal(JSON.stringify(history),before);
        assert.equal(p.weeks.length,programWeeks);
        assert.equal(p.program.blocks.at(-1).weekTo,programWeeks);
        assert.equal(p.program.blocks.at(-1).durationWeeks,programWeeks%6||6);
        assert.equal(p.macrocycle.durationWeeks,programWeeks);
        assert.equal(p.generationScope.detailedMesocycles,p.program.blocks.length);
        assert.equal(p.program.weekBasis,'session_sequence');
        for(const [i,week] of p.weeks.entries()){
            assert.equal(week.weekNumber,i+1);
            assert.equal(week.weekInMesocycle,i%6+1);
            assert.equal(week.conditional,i>=6);
            for(const day of week.days){
                assert.ok(day.estimatedSeconds<=3600);
                for(const ex of day.exercises)assert.ok(ex.sets.every(s=>!s.completed&&!s.isLocked&&!s.actualKg));
            }
        }
        const csv=MyCoatch.exportAsCSV();
        assert.match(csv.split('\n')[0],/ProgrammaSettimane;MesocicloSettimane$/);
        assert.ok(csv.split('\n').some(row=>row.startsWith(programWeeks+';4;')));
        assert.ok(csv.split('\n').slice(1).every(row=>row.endsWith(';'+programWeeks+';6')));
    }
    for(const programWeeks of ['',null,-1,53,2.5,true])assert.throws(()=>programSchedule({...config,programWeeks}));
    assert.throws(()=>programSchedule({durationWeeks:6,programWeeks:4}));
});

const fixture=()=>({name:'Programma',program:{totalWeeks:2,blocks:[]},weeks:[1,2].map(weekNumber=>({weekNumber,
    days:[1,2,3,4].map(dayNumber=>({dayNumber,completed:true,sessionDate:'2020-01-01',exercises:[{
        name:'Panca Piana con Bilanciere',setsCount:2,reps:'6-8',rpe:8,kgMin:70,
        sets:[{},{}],loggedSets:[{},{}]}]}))}))});
const done=()=>({weight:70,reps:8,rpe:8,isLocked:true});
test('sequence resumes the first unresolved session, ignores dates and stale completed flags, never counts invalid work',()=>{
    const p=fixture();assert.equal(nextProgramSession(p).next.dayNumber,1);
    for(const d of p.weeks[0].days.slice(0,3))d.exercises[0].loggedSets=[done(),done()];
    assert.deepEqual(nextProgramSession(p).next,{weekNumber:1,dayNumber:4,mesocycleNumber:1,dayName:'Seduta 4'});
    p.weeks[0].days[3].exercises[0].loggedSets=[done(),{...done(),weight:''}];
    assert.equal(nextProgramSession(p).completed,3);
    p.weeks[0].days[3].exercises[0].loggedSets=[done(),done()];
    assert.equal(nextProgramSession(p).next.weekNumber,2);
    p.weeks[1].days[0].exercises[0].sessionSkip={active:true};
    assert.equal(nextProgramSession(p).next.dayNumber,2);
});

test('future programmes do not receive repeated proposal metadata; manual/confirmed results remain unchanged',()=>{
    const p=fixture();p.weeks[0].days[0].exercises[0].loggedSets=[done(),done()];
    const before=JSON.stringify(p.weeks[0].days[0].exercises[0].loggedSets);
    const data={history:{years:{2026:{mesocycles:[p]}}}};
    reconcileTrainingPlan(data,{year:2026,mesoIndex:0});
    assert.equal(JSON.stringify(p.weeks[0].days[0].exercises[0].loggedSets),before);
    assert.ok(p.weeks[0].days[1].exercises[0].coachSetProposals);
    assert.equal(p.weeks[1].days[3].exercises[0].coachSetProposals,undefined);
});

test('AI exchange works with arbitrary imported plans, distinguishes targets/results, excludes notes and embeds a universal prompt',()=>{
    const p=fixture();delete p.program;
    p.email='private@example.test';p.weeks[0].days[0].exercises[0].userNotes='PRIVATE-NOTE';
    p.weeks[0].days[0].exercises[0].loggedSets=[done(),{}];
    const before=JSON.stringify(p),full=buildAIExchange(p),only=buildAIExchange(p,{includeResults:false});
    assert.equal(JSON.stringify(p),before);
    assert.equal(full.prescriptions.length,1);
    assert.equal(full.sessions[0].exercises[0].observedSets.length,1);
    assert.equal(full.sessions[0].exercises[0].missingSets,1);
    assert.equal(only.summary,undefined);
    assert.ok(only.sessions.every(s=>s.exercises.every(e=>e.observedSets===undefined)));
    const text=formatAIExchangeMarkdown(p);
    assert.ok(text.includes(UNIVERSAL_REVIEW_PROMPT));
    assert.ok(!text.includes('PRIVATE-NOTE'));assert.ok(!text.includes('private@example.test'));
    assert.ok(!text.includes('2020-01-01'));
});

test('cloud compression is lossless for long programmes and legacy data remains readable',async()=>{
    const p=MyCoatch.generateNextFromHistory({},config),before=JSON.stringify(p);
    const compact=compactProgramForJournal(p);
    assert.equal(JSON.stringify(p),before);
    assert.ok(JSON.stringify(compact).length<before.length);
    const data={history:{years:{2026:{mesocycles:[compact]}}},athlete:{ownedDumbbells:[10,12.5]}};
    const encoded=await encodeCloudPayload(data);
    assert.equal(encoded.format,'homegym-cloud-gzip');
    assert.ok(JSON.stringify(encoded).length<JSON.stringify(data).length*0.2);
    assert.deepEqual(await decodeCloudPayload(encoded),JSON.parse(JSON.stringify(data)));
    assert.equal(await decodeCloudPayload(data),data);
    const legacy={history:{years:{2026:{mesocycles:[{weeks:[]}]}}}};
    assert.equal(await encodeCloudPayload(legacy),legacy);
    await assert.rejects(()=>decodeCloudPayload({...encoded,schemaVersion:2}));
    await assert.rejects(()=>decodeCloudPayload({...encoded,data:'damaged'}));
    await assert.rejects(()=>decodeCloudPayload({...encoded,uncompressedBytes:1}));
});
