import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {conciseExerciseInstruction} from '../mycoatch/exerciseInstructions.js';
import {generateSmartMesocycle} from '../mycoatch/engine.js';
import {MyCoatch} from '../mycoatch/index.js';
const file=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('coach notes are practical Italian explanations while preserving CSV control tags',()=>{
  const templates=[
    {name:'Alzate Posteriori con Manubri',equipment:'dumbbell',pattern:'isolation'},
    {name:'Alzate Laterali con Manubri',equipment:'dumbbell',pattern:'isolation'},
    {name:'Lat Machine Presa Larga',equipment:'lat_machine',pattern:'vertical_pull'},
    {name:'Panca Piana con Bilanciere',equipment:'barbell',pattern:'horizontal_push'},
    {name:'Squat con Bilanciere',equipment:'barbell',pattern:'squat'},
    {name:'Stacco Rumeno (RDL)',equipment:'barbell',pattern:'hinge'},
    {name:'Military Press con Bilanciere',equipment:'barbell',pattern:'vertical_push'}
  ];
  for(const ex of templates){
    const note=conciseExerciseInstruction({...ex,kgMin:'',notes:'[SPLIT MYCOATCH] Upper A | [WARM-UP] | [SUPERSERIE]'});
    assert.match(note,/\[SPLIT MYCOATCH\] Upper A/);
    assert.match(note,/\[WARM-UP\]/);
    assert.match(note,/\[SUPERSERIE\]/);
    assert.ok(note.length>160,ex.name+': explanation too short');
    assert.ok(!note.includes(';'),ex.name+': semicolon breaks 12-column CSV');
  }
  const rear=conciseExerciseInstruction({name:'Alzate Posteriori con Manubri'});
  const lateral=conciseExerciseInstruction({name:'Alzate Laterali con Manubri'});
  assert.match(rear,/Inclina il busto/);
  assert.match(lateral,/ai lati/);
  assert.notEqual(rear,lateral);
});

test('safety: training prescription and imported data remain unchanged by copy edits',()=>{
  const generated=generateSmartMesocycle({
    daysPerWeek:4,durationWeeks:4,userAge:35,focus:'hybrid',
    maxSessionMinutes:60,splitPreference:'upperlower',deloadWeek:false
  },{sessionsAnalyzed:0,byExercise:{},exerciseNotes:{},
    decisions:{byExercise:{},byMuscle:{}}});
  assert.equal(generated.weeks.length,4);
  assert.ok(generated.weeks.every(w=>w.days.length===4));
  for(const w of generated.weeks)
    for(const day of w.days)
      for(const ex of day.exercises){
        const note=conciseExerciseInstruction(ex);
        assert.ok(!note.includes(';'),ex.name);
      }
});

test('menu labels explain export, import, automatic deload and pulley attachment',async()=>{
  const html=await file('index.html');
  assert.match(html,/Genera e scarica CSV \(senza importare\)/);
  assert.match(html,/Automatica — può inserire/);
  assert.match(html,/non l’impugnatura della lat machine/);
  assert.match(html,/Importa una scheda nel diario/);
  assert.match(html,/Elimina tutto lo storico/);
  assert.match(html,/Confronta due mesocicli/);
  const manual=await file('js/manual.js');
  assert.match(manual,/barra lunga da agganciare alla puleggia alta/);
});
