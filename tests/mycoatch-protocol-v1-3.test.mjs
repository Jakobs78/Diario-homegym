import test from 'node:test';
import assert from 'node:assert/strict';
import { getTemplateForDays, generateSmartMesocycle } from '../mycoatch/engine.js';
import { parseCoachPreferences } from '../mycoatch/userPreferences.js';
import { conciseExerciseInstruction } from '../mycoatch/exerciseInstructions.js';
import { groupAccessories } from '../mycoatch/groupOptimizer.js';
import { applyTrisetDropsetGrouping } from '../js/helpers.js';

const SLOTS = ['hinge', 'bench', 'squat', 'military'];

test('il vecchio Upper/Lower rimane il default dei quattro giorni', () => {
  assert.deepEqual(getTemplateForDays(4).map(day => day.name.split(' ')[0]),
    ['Upper', 'Lower', 'Upper', 'Lower']);
  assert.deepEqual(getTemplateForDays(3).map(day => day.name.slice(0, 11)),
    ['Full Body A', 'Full Body B', 'Full Body C']);
});

test('quattro Full Body opt-in: due esposizioni complementari per ogni fondamentale', () => {
  const templates = getTemplateForDays(4, 'fullbody');
  assert.equal(templates.length, 4);
  assert.ok(templates.every(day => day.slots.length <= 6));
  for (const lift of SLOTS) {
    const occurrences = templates.flatMap(day => day.slots)
      .filter(slot => slot.anchor === lift);
    assert.equal(occurrences.length, 2, lift);
    assert.deepEqual(occurrences.map(slot => slot.repIntent).sort(), ['strength','volume'], lift);
  }
  assert.ok(templates.some(day => day.slots.some(slot => slot.muscle === 'Core')));
  assert.ok(templates.some(day => day.slots.some(slot => slot.muscle === 'Polpacci')));
  assert.ok(templates.some(day => day.slots.some(slot =>
    slot.muscle === 'Femorali' && slot.pattern === 'isolation')));
  assert.throws(() => getTemplateForDays(4, 'invented'), /non valida/);
});

test('preferenza Full Body validata senza alterare le opzioni esistenti', () => {
  const fields = { selectedTime:'60', userAge:'49', daysPerWeek:'4', focus:'hybrid' };
  assert.equal(parseCoachPreferences(fields).splitPreference, undefined);
  assert.equal(parseCoachPreferences({...fields,splitPreference:'fullbody'}).splitPreference, 'fullbody');
  assert.throws(() => parseCoachPreferences({...fields,splitPreference:'unknown'}), /struttura/);
});

test('nuovo piano Full Body: fondamentali protetti, rep range distinti e durata calcolata', () => {
  const generated = generateSmartMesocycle({
    durationWeeks: 4,daysPerWeek:4,splitPreference:'fullbody',focus:'hybrid',
    maxSessionMinutes:60,userAge:49
  });
  assert.equal(generated.weeks.length, 4);
  const week=generated.weeks[1];
  assert.equal(week.days.length, 4);
  for(const day of week.days){
    assert.ok(day.dayName.startsWith('Full Body '));
    assert.ok(day.estimatedMinutes<=60, day.dayName + ' ' + day.estimatedMinutes);
    assert.ok(day.exercises.length>=2);
    assert.ok(day.exercises[0].anchorKey);
    assert.ok(day.exercises[1].anchorKey);
  }
  const [a,b,c,d]=week.days.map(day=>day.exercises);
  assert.equal(a[0].reps,'4-6');
  assert.equal(a[1].reps,'8-12');
  assert.equal(b[0].reps,'4-6');
  assert.equal(b[1].reps,'8-12');
  assert.equal(c[0].reps,'6-10');
  assert.equal(c[1].reps,'4-6');
  assert.equal(d[0].reps,'6-10');
  assert.equal(d[1].reps,'4-6');
  assert.match(d[0].notes, /\[SPLIT MYCOATCH\] Full Body D/);
  assert.match(conciseExerciseInstruction(d[0]), /Full Body D/);
});

function ex(name,category,pattern='isolation'){
  return { name,category,pattern,setsCount:2,notes:'Controlla il movimento.',
    restTime:'90s',sets:[{setNumber:1},{setNumber:2}] };
}
const compounds=[ex('Stacco Rumeno','Femorali','hinge'),
  ex('Panca','Petto','horizontal_push')];

test('superset: parola esatta solo sul primo esercizio e card importabili', () => {
  const grouped=groupAccessories([...compounds,ex('Laterali','Spalle'),ex('Curl','Bicipiti')],2);
  assert.match(grouped[2].notes,/\bsuperset\b/);
  assert.doesNotMatch(grouped[3].notes,/\bsuperset\b/i);
  assert.match(conciseExerciseInstruction(grouped[2]), /\bsuperset\b/);
  assert.doesNotMatch(conciseExerciseInstruction(grouped[3]), /\bsuperset\b/i);
  const copied=grouped.map((value,index)=>({...value,block:String(index+1),
    groupType:null,groupBase:null,isGroupLast:false}));
  applyTrisetDropsetGrouping([{exercises:copied}]);
  assert.equal(copied[2].groupType,'superset');
  assert.equal(copied[3].groupType,'superset');
  assert.equal(copied[3].isGroupLast,true);
});

test('triset: etichetta solo sul primo esercizio e reset senza duplicati', () => {
  const group=groupAccessories([...compounds,ex('Laterali','Spalle'),
    ex('Curl','Bicipiti'),ex('Calf','Polpacci')],3);
  assert.match(group[2].notes,/\btriset\b/);
  for (const member of group.slice(3)) assert.doesNotMatch(member.notes,/\btriset\b/i);
  assert.match(conciseExerciseInstruction(group[2]),/\btriset\b/);
  const regrouped=groupAccessories(group,3);
  assert.equal((regrouped[2].notes.match(/\btriset\b/g)||[]).length,1);
});

test('dropset: la nota esportata contiene il termine e la delimitazione ultima serie', () => {
  const drop={...ex('Alzate Laterali con Manubri','Spalle'),
    sets:[{}, {intensityTechnique:'DROP_SET'}]};
  const text=conciseExerciseInstruction(drop);
  assert.match(text,/\bdropset\b/);
  assert.match(text,/\[DROP_SCOPE:LAST\]/);
});
