import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWorkoutDuration, parseCoachPreferences } from '../mycoatch/userPreferences.js';
import { DEFAULT_HOME_GYM_EQUIPMENT, DEFAULT_HOME_GYM_ACCESSORIES } from '../mycoatch/exercisesDB.js';

test('durata esplicita: i valori mancanti non diventano 60 minuti', () => {
    for (const value of [null, undefined, '', ' ', 'custom', 'abc', '0', '24', '181', '-30', '45.5']) {
        assert.equal(parseWorkoutDuration(value), null, String(value));
    }
});

test('accetta le durate standard e una durata personalizzata', () => {
    for (const n of [30, 45, 60, 75, 90, 120])
        assert.equal(parseWorkoutDuration(String(n)), n);
    assert.equal(parseWorkoutDuration('custom', '50'), 50);
    assert.equal(parseWorkoutDuration('custom', '25'), 25);
    assert.equal(parseWorkoutDuration('custom', '180'), 180);
    assert.equal(parseWorkoutDuration('custom', ''), null);
    assert.equal(parseWorkoutDuration('custom', '200'), null);
});

test('trasmette esattamente la durata scelta a MyCoatch', () => {
    const fields = { selectedTime: 'custom', customTime: '55', userAge: '49', daysPerWeek: '4', focus: 'hybrid' };
    assert.deepEqual(parseCoachPreferences(fields), {
        maxSessionMinutes: 55, userAge: 49, daysPerWeek: 4,
        focus: 'hybrid', primaryGoal: 'powerbuilding',
        availableEquipment: [...DEFAULT_HOME_GYM_EQUIPMENT],
        availableAccessories: [...DEFAULT_HOME_GYM_ACCESSORIES],
        cableSetup: 'single_high_low',
        preferredLifts: {}, splitPreference: 'auto', deloadWeek: null
    });
});

test('rifiuta durata mancante anche se gli altri dati sono presenti', () => {
    assert.throws(() => parseCoachPreferences({
        selectedTime: '', userAge: '49', daysPerWeek: '4', focus: 'hybrid'
    }), /minuti/);
});

test('rifiuta numero di giorni non supportato e obiettivo sconosciuto', () => {
    assert.throws(() => parseCoachPreferences({
        selectedTime: '60', userAge: '49', daysPerWeek: '7', focus: 'hybrid'
    }), /1 a 6/);
    assert.throws(() => parseCoachPreferences({
        selectedTime: '60', userAge: '49', daysPerWeek: '4', focus: 'unknown'
    }), /obiettivo/);
});

test('interfaccia: scelta obbligatoria e valore iniziale vuoto', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /id="mycoatch-config-form"/);
    assert.match(html, /id="select-time"[^>]+required/);
    assert.match(html, /<option value="" selected disabled>/);
    assert.match(html, /id="mycoatch-custom-time"/);
    assert.match(html, /Quanto tempo hai a disposizione per ogni allenamento/);
});

test('integrazione: tutte le vie di generazione usano il modulo MyCoatch', () => {
    const script = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
    assert.match(script, /parseCoachPreferences/);
    assert.match(script, /generateAndDownloadMesocycleCSV\(options\)/);
    assert.match(script, /startCoachChatAndGenerate/);
});

test('scarico: scelta esplicita validata, automatico legacy invariato',()=>{
    const fields={selectedTime:'60',userAge:'49',daysPerWeek:'4',focus:'hybrid',
        splitPreference:'fullbody'};
    const automatic=parseCoachPreferences({...fields,deloadChoice:'auto'});
    assert.equal(automatic.splitPreference,'fullbody');
    assert.equal(automatic.deloadWeek,null);
    assert.equal(parseCoachPreferences({...fields,deloadChoice:'last'}).deloadWeek,true);
    assert.equal(parseCoachPreferences({...fields,deloadChoice:'none'}).deloadWeek,false);
    assert.throws(()=>parseCoachPreferences({...fields,deloadChoice:'week2'}),/scarico/);
});
test('form espone gestione dello scarico senza attivare scelta obbligatoria',()=>{
    const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
    assert.match(html,/id="mycoatch-deload-choice"/);
    assert.match(html,/<option value="auto" selected>/);
    assert.match(html,/<option value="last">/);
    assert.match(html,/<option value="none">/);
    const main=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
    assert.match(main,/mycoatch-deload-choice/);
});
