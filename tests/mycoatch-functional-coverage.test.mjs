import test from 'node:test';
import assert from 'node:assert/strict';
import { auditWeeklyCoverage } from '../mycoatch/weeklyCoverage.js';
import { EXERCISE_DATABASE } from '../mycoatch/exercisesDB.js';
import { generateSmartMesocycle } from '../mycoatch/engine.js';

function ex(name, setsCount = 2) {
    const meta=EXERCISE_DATABASE.find(item=>item.name===name);
    if(!meta)throw Error('Esercizio mancante: '+name);
    return { name,category:meta.category,pattern:meta.pattern,setsCount };
}
const day=(n,exercises)=>({dayNumber:n,dayName:'Full Body '+n,exercises});
const bench=ex('Panca Piana con Bilanciere',3);
const hinge=ex('Stacco Rumeno (RDL)',3);
const row=ex('Rematore con Bilanciere',2);
const rear=ex('Alzate Posteriori con Manubri',2);
const curl=ex('Leg Curl ai Cavi (cavigliera)',2);
const calves=ex('Calf Raise in Piedi con Manubri',2);
const abs=ex('Reverse Crunch su Panca',2);

test('conta la copertura diretta sui giorni realmente rimasti dopo ottimizzazione',()=>{
    const requested=[[bench,rear,abs],[hinge,curl,calves],[row],[]];
    const actual=[day(1,[bench]),day(2,[hinge]),day(3,[row]),day(4,[])];
    const info=auditWeeklyCoverage(actual,[],requested);
    for(const key of ['rearDeltoids','kneeFlexion','calves','core']) {
        assert.equal(info.functionalCoverage[key].plannedSets,2,key);
        assert.equal(info.functionalCoverage[key].scheduledSets,0,key);
        assert.equal(info.functionalCoverage[key].shortfallSets,2,key);
        assert.equal(info.functionalCoverage[key].status,'omitted_after_optimization',key);
    }
    assert.ok(info.warnings.some(w=>w.includes('flessione del ginocchio')&&w.includes('nessuna serie diretta')));
    assert.ok(info.warnings.some(w=>w.includes('Deltoidi posteriori')&&w.includes('nessuna serie diretta')));
    assert.equal(info.directSetsByMuscle.Petto,3);
    assert.equal(info.setsByMovement.hinge,3);
    // RDL non equivale a flessione del ginocchio.
    assert.equal(info.functionalCoverage.kneeFlexion.scheduledSets,0);
});

test('riduzione parziale segnalata senza dichiarare mancato allenamento',()=>{
    const requested=[[bench,rear,calves],[hinge,curl],[abs],[]];
    const actual=[day(1,[bench,rear]),day(2,[hinge,curl]),day(3,[abs]),day(4,[])];
    const info=auditWeeklyCoverage(actual,[],requested);
    assert.equal(info.functionalCoverage.rearDeltoids.status,'present');
    assert.equal(info.functionalCoverage.calves.status,'omitted_after_optimization');
    assert.equal(info.functionalCoverage.kneeFlexion.status,'present');
    assert.equal(info.functionalCoverage.core.status,'present');
    assert.ok(!info.warnings.some(w=>w.startsWith('Deltoidi posteriori')));
});

test('programma che non prevedeva un isolamento non finge un taglio temporale',()=>{
    const actual=[day(1,[bench]),day(2,[hinge]),day(3,[row]),day(4,[])];
    const info=auditWeeklyCoverage(actual,[],[[bench],[hinge],[row],[]]);
    assert.equal(info.functionalCoverage.core.status,'not_programmed');
    assert.equal(info.functionalCoverage.core.plannedSets,0);
    assert.equal(info.functionalCoverage.core.shortfallSets,0);
    assert.ok(info.warnings.some(w=>w.includes('Addominali e core')&&w.includes('nessuna serie diretta')));
    assert.ok(!info.warnings.some(w=>w.includes('Addominali e core')&&w.includes('previste prima')));
});

test('ogni piano generato fornisce serie finali coerenti, anche se il tempo forza tagli',()=>{
    for(const minutes of [30,45,60]){
        const result=generateSmartMesocycle({
            daysPerWeek:4,durationWeeks:4,userAge:49,focus:'hybrid',
            maxSessionMinutes:minutes,splitPreference:'fullbody'
        });
        for(const week of result.weeks){
            const audit=week.weeklyCoverage;
            const actual=week.days.flatMap(day=>day.exercises);
            const count=(matcher)=>actual.reduce((n,entry)=>{
                const meta=EXERCISE_DATABASE.find(item=>item.name===entry.name);
                return n+(meta&&matcher(meta)?entry.setsCount:0);
            },0);
            assert.equal(audit.functionalCoverage.rearDeltoids.scheduledSets,
                count(meta=>meta.shoulderHeadIsolation==='posteriore'));
            assert.equal(audit.functionalCoverage.kneeFlexion.scheduledSets,
                count(meta=>meta.category==='Femorali'&&meta.pattern==='isolation'&&
                    /leg curl|hamstring walkout/i.test(meta.name)));
            assert.equal(audit.functionalCoverage.calves.scheduledSets,
                count(meta=>meta.category==='Polpacci'));
            assert.equal(audit.functionalCoverage.core.scheduledSets,
                count(meta=>meta.category==='Core'));
            assert.ok(week.days.every(day=>day.estimatedMinutes<=minutes));
            assert.ok(Object.values(audit.functionalCoverage).every(
                value=>value.shortfallSets>=0));
        }
    }
});
