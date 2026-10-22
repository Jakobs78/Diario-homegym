import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_DATABASE } from '../mycoatch/exercisesDB.js';
import { normalizeSelectionPreferences, isExerciseAvailable } from '../mycoatch/exerciseSelection.js';
import { generateSmartMesocycle } from '../mycoatch/engine.js';
import { conciseExerciseInstruction } from '../mycoatch/exerciseInstructions.js';
import { MyCoatch } from '../mycoatch/index.js';

const byName=name=>EXERCISE_DATABASE.find(ex=>ex.name===name);
const allowed=(name,config={})=>isExerciseAvailable(byName(name),normalizeSelectionPreferences(config));
const basic={daysPerWeek:4,durationWeeks:4,maxSessionMinutes:60,userAge:49,
    focus:'hybrid'};

test('rack centrale alto/basso: permette cavi singoli, non inventa crossover, corda o triangolo',()=>{
    const single={cableSetup:'single_high_low'};
    for(const exercise of ['Crunch ai Cavi', 'Pulley Basso a T','Pulldown ai Cavi a Braccia Tese',
        'Pushdown ai Cavi','Curl ai Cavi Bassi','Lat Machine Presa Larga'])
        assert.equal(allowed(exercise,single),true,exercise);
    for(const exercise of ['Croci ai Cavi in Allungamento','Reverse Fly ai Cavi',
        'Pallof Press ai Cavi','Pushdown ai Cavi con Corda','Lat Machine con Triangolo',
        'Leg Curl ai Cavi (cavigliera)'])
        assert.equal(allowed(exercise,single),false,exercise);
    assert.equal(allowed('Croci con Manubri su Panca Piana',single),true);
    const withGrips={...single,availableAccessories:['rack','flat_bench',
        'triangle_handle','rope_attachment','ankle_strap']};
    assert.equal(allowed('Lat Machine con Triangolo',withGrips),true);
    assert.equal(allowed('Pushdown ai Cavi con Corda',withGrips),true);
    assert.equal(allowed('Leg Curl ai Cavi (cavigliera)',withGrips),true);
});

test('topologia: solo alto, solo basso, doppio crossover o nessun cavo',()=>{
    assert.equal(allowed('Crunch ai Cavi',{cableSetup:'high_only'}),true);
    assert.equal(allowed('Pulley Basso a T',{cableSetup:'high_only'}),false);
    assert.equal(allowed('Pulley Basso a T',{cableSetup:'low_only'}),true);
    assert.equal(allowed('Lat Machine Presa Larga',{cableSetup:'low_only'}),false);
    assert.equal(allowed('Croci ai Cavi in Allungamento',{cableSetup:'dual_adjustable'}),true);
    assert.equal(allowed('Pallof Press ai Cavi',{cableSetup:'dual_adjustable'}),true);
    assert.equal(allowed('Croci ai Cavi in Allungamento',{cableSetup:'none'}),false);
    assert.equal(allowed('Crunch ai Cavi',{cableSetup:'none'}),false);
    assert.throws(()=>normalizeSelectionPreferences({cableSetup:'impossible'}),
        /Configurazione dei cavi non valida/);
});

test('MyCoatch non propone croci ai due cavi quando ne e disponibile solo uno',()=>{
    const config={...basic,cableSetup:'single_high_low'};
    const proposal=generateSmartMesocycle(config);
    const upper=proposal.weeks[0].days[0].exercises;
    assert.ok(upper.some(ex=>ex.name==='Croci con Manubri su Panca Piana'));
    for(const week of proposal.weeks)
      for(const day of week.days)
        for(const ex of day.exercises)
          assert.equal(isExerciseAvailable(ex,normalizeSelectionPreferences(config)),true,ex.name);
    const dual=generateSmartMesocycle({...basic,cableSetup:'dual_adjustable'});
    assert.ok(dual.weeks[0].days[0].exercises
        .some(ex=>ex.name==='Croci ai Cavi in Allungamento'));
});

test('istruzioni CSV brevi: split, warmup, superserie, triset, drop restano interpretabili',()=>{
    const shared={name:'Panca Piana con Bilanciere',pattern:'horizontal_push',equipment:'barbell',
      kgMin:'80',notes:'[SPLIT MYCOATCH] Upper A | [SUPERSERIE] Esegui con il prossimo esercizio. | '+
      '🔥 [WARM-UP AUTO]: 8x40kg, 4x56kg, 2x68kg. | '+
      '[SCELTA MYCOATCH] Motivo interno molto lungo. | '+
      '[PROGRESSIONE] Aumenta prima le ripetizioni nel range e poi i kg. | '+
      '[DURATA STIMATA] 55 minuti su 60.',sets:[{},{intensityTechnique:'DROP_SET'}]};
    const instructions=conciseExerciseInstruction(shared);
    for(const tag of ['[SPLIT MYCOATCH] Upper A','[SUPERSERIE]','[WARM-UP AUTO]',
        '[DROP_SET]','[DROP_SCOPE:LAST]'])assert.ok(instructions.includes(tag),tag);
    for(const unwanted of ['[SCELTA MYCOATCH]','[PROGRESSIONE]'])
        assert.ok(!instructions.includes(unwanted),unwanted);
    assert.ok(instructions.length<650,instructions); // Expanded guidance must remain legible.
    assert.ok(conciseExerciseInstruction({...shared,notes:'[TRISET] Segui gli esercizi.'})
      .includes('[TRISET]'));
    const noHistory={history:{years:{}}};
    MyCoatch.generateNextFromHistory(noHistory,configForNoHistory());
    const csv=MyCoatch.exportAsCSV();
    assert.ok(csv.includes('[SPLIT MYCOATCH]'));
    assert.ok(!csv.includes('[SCELTA MYCOATCH]'));
    const notes=[...csv.matchAll(/;"([^"\n]*)";"[^"\n]*"$/gm)].map(m=>m[1]);
    assert.ok(notes.length>20,'each row should have a concise note');
    assert.ok(notes.every(n=>n.length<700),Math.max(...notes.map(n=>n.length)));
});
const configForNoHistory=()=>({...basic,cableSetup:'single_high_low'});
