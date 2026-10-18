import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_DATABASE, DEFAULT_HOME_GYM_ACCESSORIES, DEFAULT_HOME_GYM_EQUIPMENT } from '../mycoatch/exercisesDB.js';
import { getTemplateForDays, generateSmartMesocycle } from '../mycoatch/engine.js';
import { FUNDAMENTAL_CHOICES, normalizeSelectionPreferences,
    selectExerciseForSlot, isExerciseAvailable } from '../mycoatch/exerciseSelection.js';
import { parseCoachPreferences } from '../mycoatch/userPreferences.js';
import { estimateDayMinutes } from '../mycoatch/timeEstimator.js';
import { auditWeeklyCoverage } from '../mycoatch/weeklyCoverage.js';
import { MyCoatch } from '../mycoatch/index.js';
import { formatCoachReview, compareMesocyclePlans } from '../mycoatch/mesocycleComparison.js';

const base = { daysPerWeek: 4, durationWeeks: 4, userAge: 49,
    focus: 'hybrid', maxSessionMinutes: 60 };
const noHistory = { byExercise: {}, stalledExercises: [], exerciseNotes: {} };
const plan = (config = {}, previous = null) =>
    generateSmartMesocycle({ ...base, ...config }, noHistory, previous);

test('catalogo di 52 esercizi con ID stabili, categorie e dotazioni esplicite', () => {
    assert.equal(EXERCISE_DATABASE.length, 52);
    assert.equal(new Set(EXERCISE_DATABASE.map(e => e.id)).size, 51);
    assert.equal(new Set(EXERCISE_DATABASE.map(e => e.name)).size, 51);
    assert.ok(EXERCISE_DATABASE.every(ex =>
        /^[a-z0-9_]+$/.test(ex.id) &&
        ex.primaryMuscle === ex.category &&
        Array.isArray(ex.secondaryMuscles) &&
        Array.isArray(ex.requires) && Number.isFinite(ex.estimatedFatigue)));
    for (const muscle of ['Petto', 'Back_Lats', 'Back_Thickness', 'Spalle',
        'Quadricipiti', 'Femorali', 'Glutei', 'Polpacci', 'Bicipiti',
        'Tricipiti', 'Core']) {
        assert.ok(EXERCISE_DATABASE.some(e => e.category === muscle), muscle);
    }
});

test('dotazione standard non inventa macchine, EZ, dip o cavigliere', () => {
    const pref = normalizeSelectionPreferences();
    assert.deepEqual(pref.availableEquipment, [...DEFAULT_HOME_GYM_EQUIPMENT]);
    assert.deepEqual(pref.availableAccessories, [...DEFAULT_HOME_GYM_ACCESSORIES]);
    for (const name of ['Leg Press 45°', 'Leg Curl Steso',
        'Dip alle Parallele (sovraccarico)', 'Leg Curl ai Cavi (cavigliera)',
        'Curl con Bilanciere EZ', 'Panca Inclinata con Manubri']) {
        const ex = EXERCISE_DATABASE.find(e => e.name === name);
        assert.ok(ex);
        assert.equal(isExerciseAvailable(ex, pref), false, name);
    }
    const enabled = normalizeSelectionPreferences({
        availableAccessories: ['rack', 'flat_bench', 'incline_bench',
            'ankle_strap', 'ez_bar', 'dip_station']
    });
    for (const name of ['Leg Curl ai Cavi (cavigliera)',
        'Curl con Bilanciere EZ', 'Panca Inclinata con Manubri',
        'Dip alle Parallele (sovraccarico)']) {
        const ex = EXERCISE_DATABASE.find(e => e.name === name);
        assert.equal(isExerciseAvailable(ex, enabled), true, name);
    }
});

test('4 giorni: Upper A, Lower A, Upper B, Lower B con fondamentali protetti', () => {
    const template = getTemplateForDays(4);
    assert.deepEqual(template.map(d => d.name.split(' ')[0]),
        ['Upper', 'Lower', 'Upper', 'Lower']);
    assert.deepEqual(template.map(d => d.slots.find(x => x.anchor)?.anchor),
        ['bench', 'squat', 'military', 'hinge']);
    for (const minutes of [30, 35, 40, 45, 60, 90]) {
        const meso = plan({ maxSessionMinutes: minutes });
        for (const week of meso.weeks) {
            assert.equal(week.days.length, 4);
            const chosen = week.days.map(day => day.exercises[0].name);
            assert.deepEqual(chosen, [
                'Panca Piana con Bilanciere', 'Squat con Bilanciere',
                'Military Press con Bilanciere', 'Stacco Rumeno (RDL)'
            ]);
            assert.ok(week.weeklyCoverage.allPriorityLiftsPresent);
            assert.equal(week.weeklyCoverage.anchors.length, 4);
            for (const day of week.days) {
                assert.ok(day.estimatedMinutes <= minutes);
                assert.equal(day.estimatedMinutes, estimateDayMinutes(day.exercises));
                assert.ok(day.exercises[0].notes.includes('[SCELTA MYCOATCH]'));
            }
        }
    }
});

test('3 giorni rimane una Full Body con panca, squat, military e hip hinge', () => {
    for (const minutes of [35, 45, 60]) {
        const meso = plan({ daysPerWeek: 3, maxSessionMinutes: minutes });
        for (const week of meso.weeks) {
            assert.equal(week.days.length, 3);
            assert.deepEqual(week.weeklyCoverage.daysOrder,
                ['Full', 'Full', 'Full']);
            assert.equal(week.weeklyCoverage.anchors.length, 4);
            assert.ok(week.weeklyCoverage.allPriorityLiftsPresent);
        }
    }
});

test('4 fondamentali personalizzabili senza cambiare lo schema motorio richiesto', () => {
    const preferences = {
        bench: 'Panca Inclinata con Manubri',
        squat: 'Front Squat',
        military: 'Spinte con Manubri da Seduto',
        hinge: 'Stacco da Terra Convenzionale'
    };
    const meso = plan({
        preferredLifts: preferences,
        availableAccessories: ['rack', 'flat_bench', 'incline_bench']
    });
    for (const week of meso.weeks) {
        assert.deepEqual(week.days.map(d => d.exercises[0].name),
            Object.values(preferences));
        assert.equal(week.weeklyCoverage.allPriorityLiftsPresent, true);
    }
    const csvPlan = MyCoatch.generateNextFromHistory(
        { history: { years: {} } },
        { ...base, preferredLifts: preferences,
            availableAccessories: ['rack', 'flat_bench', 'incline_bench'] }
    );
    assert.deepEqual(csvPlan.weeks[0].days.map(d => d.exercises[0].name),
        Object.values(preferences));
    const csv = MyCoatch.exportAsCSV().trim().split('\n');
    assert.ok(csv.every(row => row.split(';').length === 12));
    assert.match(MyCoatch.exportAsCSV(), /Stacco da Terra Convenzionale/);
});

test('focus forza privilegia stacco convenzionale; ibrido e ipertrofia il rumeno', () => {
    assert.equal(plan({ focus: 'strength' }).weeks[0].days[3].exercises[0].name,
        'Stacco da Terra Convenzionale');
    assert.equal(plan({ focus: 'hypertrophy' }).weeks[0].days[3].exercises[0].name,
        'Stacco Rumeno (RDL)');
});

test('nessuna sostituzione silenziosa con movimenti incompatibili o attrezzi mancanti', () => {
    assert.throws(() => plan({ preferredLifts: {
        bench: 'Panca Inclinata con Manubri'
    } }), /non è disponibile/);
    assert.throws(() => plan({ preferredLifts: {
        military: 'Macchina per le spalle'
    } }), /non riconosciuta/);
    assert.throws(() => plan({ availableEquipment: ['bodyweight'] }),
        /Nessun esercizio disponibile|fondamentale/);
    assert.throws(() => normalizeSelectionPreferences({
        preferredLifts: { stranger: 'Squat con Bilanciere' }
    }), /non valide/);
    assert.throws(() => normalizeSelectionPreferences({
        availableAccessories: ['sconosciuto']
    }), /Attrezzatura non valida/);
    assert.throws(() => parseCoachPreferences({
        selectedTime: '60', daysPerWeek: '4', userAge: '49',
        focus: 'hybrid', preferredLifts: {
            bench: 'Panca Inclinata con Manubri'
        }
    }), /richiede attrezzatura/);
});

test('una variante già usata rimane se compatibile, senza cambiarla casualmente', () => {
    const previous = { weeks: [{
        weekNumber: 1,
        days: [{ dayNumber: 1, exercises: [
            { name: 'Panca Inclinata con Manubri' }
        ] }]
    }] };
    const preference = normalizeSelectionPreferences({
        availableAccessories: ['rack', 'flat_bench', 'incline_bench']
    });
    const selected = selectExerciseForSlot(getTemplateForDays(4)[0].slots[0], {
        preferences: preference,
        focus: 'hybrid',
        previousName: previous.weeks[0].days[0].exercises[0].name
    });
    assert.equal(selected.exercise.name, 'Panca Inclinata con Manubri');
    const meso = plan({ availableAccessories: preference.availableAccessories },
        previous);
    assert.equal(meso.weeks[0].days[0].exercises[0].name,
        'Panca Inclinata con Manubri');
});

test('copertura muscolare distingue serie dirette e presenza indiretta', () => {
    const meso = plan({ maxSessionMinutes: 60 });
    const week = meso.weeks[0];
    assert.deepEqual(week.weeklyCoverage, auditWeeklyCoverage(
        week.days, getTemplateForDays(4)));
    assert.ok(week.weeklyCoverage.directSetsByMuscle.Petto > 0);
    assert.ok(week.weeklyCoverage.directSetsByMuscle.Quadricipiti > 0);
    assert.ok(week.weeklyCoverage.directSetsByMuscle.Polpacci > 0);
    assert.ok(week.weeklyCoverage.directSetsByMuscle.Core > 0);
    assert.ok(week.weeklyCoverage.indirectExerciseExposuresByMuscle.Tricipiti > 0);
    assert.ok(week.weeklyCoverage.indirectExerciseExposuresByMuscle.Tricipiti <
        week.weeklyCoverage.directSetsByMuscle.Petto +
        week.weeklyCoverage.directSetsByMuscle.Spalle);
    assert.equal(week.weeklyCoverage.accounting,
        'direct_primary_sets_and_indirect_exercise_exposures_not_effective_sets');
});

test('anteprima spiega le 4 alzate, lo split e gli accessori mancanti', () => {
    const meso = plan({ maxSessionMinutes: 45, athleteProfile: {experience: 'advanced', calibration: 'regular', excludedExercises: ['Hamstring Walkout a Corpo Libero']} });
    const compare = compareMesocyclePlans(null, meso, {});
    const review = formatCoachReview(compare,
        { inspectedMesocycles: 0, sessionsAnalyzed: 0 });
    assert.match(review, /Split programmato: Upper → Lower → Upper → Lower/);
    assert.match(review, /Movimenti cardine:/);
    assert.match(review, /Panca Piana con Bilanciere/);
    assert.match(review, /Military Press con Bilanciere/);
    assert.match(review, /Accessori facoltativi esclusi per attrezzatura/);
    assert.match(review, /G2 Femorali/);
    assert.match(review, /Confermi la proposta/);
});

test('un fondamentale o una regola di frequenza resta protetta anche dopo il tempo', () => {
    const preferences = normalizeSelectionPreferences();
    const template = getTemplateForDays(4);
    for (const slot of template.flatMap(day => day.slots).filter(slot => slot.anchor)) {
        assert.ok(FUNDAMENTAL_CHOICES[slot.anchor]);
        const exercise = selectExerciseForSlot(slot, {
            preferences,
            focus: 'hybrid'
        }).exercise;
        assert.equal(exercise.category, slot.muscle);
        assert.equal(exercise.pattern, slot.pattern);
    }
});

test('la selezione non è casuale e rimane stabile nelle quattro settimane', () => {
    const first = plan({ maxSessionMinutes: 60 });
    const second = plan({ maxSessionMinutes: 60 });
    const names = meso => meso.weeks.map(week => week.days.map(day =>
        day.exercises.map(ex => ex.name)));
    assert.deepEqual(names(first), names(second));
    assert.ok(first.weeks.every(week => week.weeklyCoverage.allPriorityLiftsPresent));
    // Le modifiche di carico/serie tra settimane possono essere adattive,
    // i nomi dei movimenti cardine non cambiano senza una scelta esplicita.
    assert.deepEqual(first.weeks.map(week => week.days.map(day => day.exercises[0].name)),
        Array.from({ length: 4 }, () =>
            first.weeks[0].days.map(day => day.exercises[0].name)));
});

