import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {conciseExerciseInstruction} from '../mycoatch/exerciseInstructions.js';
import {MyCoatch} from '../mycoatch/index.js';
import {compareMesocyclePlans,formatCoachReview} from '../mycoatch/mesocycleComparison.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('menu actions explain their effect and preserve stable action identifiers',async()=>{
  const html=await read('index.html');
  for(const action of [
    'export-pdf','export-meso-pdf','generate-mycoatch-csv',
    'import-plan','export-csv','import-history','backup-json','restore-json',
    'reset-meso','clear-data','delete-account'
  ]){
    const escaped=action;
    const matched=new RegExp('<button[^>]+data-action="'+escaped+'">([\\s\\S]*?)<\\/button>').exec(html);
    assert.ok(matched,'menu action missing '+action);
    assert.match(matched[1],/class="sheet-item-help">[^<]{35,}/,action);
  }
  assert.match(html,/pullup_bar"> Sbarra fissa per trazioni a corpo libero/);
  assert.match(html,/triangle_handle"> Impugnatura triangolare a V per lat machine/);
  assert.match(html,/può inserire una settimana leggera/);
  assert.match(html,/Scarica solo CSV \(non importa\)/);
  assert.match(html,/Importa la proposta nel diario/);
});

test('Italian coach notes explain executable steps without breaking importer tags',()=>{
  const base={name:'Alzate Posteriori con Manubri',equipment:'dumbbell',
    kgMin:'',notes:'[SPLIT MYCOATCH] Upper B | [SUPERSERIE] | [WARM-UP]'};
  const note=conciseExerciseInstruction(base);
  assert.match(note,/^\[SPLIT MYCOATCH\] Upper B/);
  assert.match(note,/\[SUPERSERIE\]/);
  assert.match(note,/senza pausa tra i due/i);
  assert.match(note,/\[WARM-UP\]/);
  assert.match(note,/senza arrivare alla fatica/i);
  assert.match(note,/busto/i);
  assert.match(note,/Carico da scegliere:/);
  assert.match(note,/RPE 8/);
  assert.ok(!note.includes(';'),'CSV notes cannot contain pseudo-separators');
  const tri=conciseExerciseInstruction({...base,notes:'[TRISET]'});
  assert.match(tri,/\[TRISET\]/);
  assert.match(tri,/tre esercizi consecutivi/i);
  const deload=conciseExerciseInstruction({...base,notes:'🛡️ Scarico: riduci il lavoro'});
  assert.match(deload,/SCARICO:.*meno serie e sforzo/i);
  const drop=conciseExerciseInstruction({...base,sets:[{intensityTechnique:'DROP_SET'}],notes:''});
  assert.match(drop,/\[DROP_SET\] \[DROP_SCOPE:LAST\]/);
});

test('generated powerbuilding CSV still contains twelve columns, clear notes, no accidental import',()=>{
  const plan=MyCoatch.generateNextFromHistory({history:{years:{}}},{
    daysPerWeek:4,durationWeeks:4,maxSessionMinutes:60,
    userAge:35,focus:'hybrid',splitPreference:'upperlower',deloadWeek:false
  });
  assert.equal(plan.weeks.length,4);
  const rows=MyCoatch.exportAsCSV().trim().split('\n');
  assert.equal(rows[0],'Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset');
  assert.ok(rows.length>=81,'must have a complete 4-week plan');
  for(const row of rows.slice(1)){
    assert.equal(row.split(';').length,12,'CSV column count is preserved');
  }
  const notes=rows.slice(1).map(row=>row.split(';')[10]);
  assert.ok(notes.some(note=>note.includes('Carico da scegliere:')),'uncalibrated kg require practical instructions');
  assert.ok(notes.some(note=>note.includes('[SUPERSERIE]') && note.includes('senza pausa')));
  assert.ok(notes.some(note=>note.includes('Alzate') || note.includes('spalle') || note.includes('gomiti')));
});

test('report explicitly distinguishes estimated credits, recorded RPE and CSV download',()=>{
  const plan=MyCoatch.generateNextFromHistory({history:{years:{}}},{
    daysPerWeek:4,durationWeeks:4,maxSessionMinutes:60,
    userAge:35,focus:'hybrid',splitPreference:'upperlower'
  });
  const text=formatCoachReview(compareMesocyclePlans(null,plan,{}),{
    inspectedMesocycles:0,sessionsAnalyzed:0
  });
  assert.match(text,/COME È DISTRIBUITO IL LAVORO TRA I MUSCOLI:/);
  assert.match(text,/SPALLE: lavoro mirato per il deltoide laterale/);
  assert.match(text,/scaricare soltanto il file CSV/);
  assert.match(text,/download NON importa la scheda/i);
  assert.match(text,/RPE 8 corrisponde a circa due ripetizioni/);
});

test('manual provides practical navigation, terminology and protected operations',async()=>{
  const manual=await read('js/manual.js');
  const css=await read('css/style.css');
  assert.match(manual,/Quale menu usare e che cosa succede dopo/);
  assert.match(manual,/Come leggere i termini del programma e del CSV/);
  assert.match(manual,/L’impugnatura triangolare è un accessorio separato/);
  assert.match(manual,/non unisce|non combina/i);
  assert.match(css,/\.sheet-item-help/);
});
