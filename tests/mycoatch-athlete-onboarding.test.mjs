import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAthleteProfile, onboardingPlan, eligibleReferenceLoad, MAX_REFERENCE_AGE_DAYS } from '../mycoatch/athleteProfile.js';
const TODAY = new Date().toISOString().slice(0, 10);
import { parseCoachPreferences } from '../mycoatch/userPreferences.js';
import { generateSmartMesocycle } from '../mycoatch/engine.js';
import { MyCoatch } from '../mycoatch/index.js';
import { compareMesocyclePlans, formatCoachReview } from '../mycoatch/mesocycleComparison.js';
import { estimateDayMinutes } from '../mycoatch/timeEstimator.js';

const profile = (experience, extra = {}) => ({
    experience,
    calibration: 'guided',
    priorityMuscle: null,
    excludedExercises: [],
    referenceLoads: {},
    ...extra
});
const config = (athleteProfile, extra = {}) => ({
    userAge: 36, daysPerWeek: 4, durationWeeks: 4,
    focus: 'hybrid', maxSessionMinutes: 60, athleteProfile, ...extra
});
const emptyReport = {
    sessionsAnalyzed: 0,
    byExercise: {}, exerciseNotes: {}, stalledExercises: [],
    decisions: { byExercise: {}, byMuscle: {} }
};
const generate = (athleteProfile, extra = {}, report = emptyReport) =>
    generateSmartMesocycle(config(athleteProfile, extra), report);

test('profilo obbliga un livello valido ma resta opzionale nella API legacy', () => {
    assert.equal(normalizeAthleteProfile(), null);
    for (const level of ['beginner', 'intermediate', 'advanced']) {
        assert.equal(normalizeAthleteProfile(profile(level)).experience, level);
    }
    assert.throws(() => normalizeAthleteProfile({}), /livello di esperienza/);
    assert.throws(() => normalizeAthleteProfile(profile('expert')), /livello di esperienza/);
    assert.throws(() => normalizeAthleteProfile(profile('beginner', {
        priorityMuscle: 'Un gruppo inventato'
    })), /muscolare prioritario/);
    assert.throws(() => normalizeAthleteProfile(profile('beginner', {
        calibration: 'maximum-test'
    })), /calibrazione/);
});

test('carichi reali auto-dichiarati devono contenere kg/reps coerenti e RPE facoltativo', () => {
    assert.deepEqual(normalizeAthleteProfile(profile('intermediate', {
        referenceLoads: { bench: { kg: '70,5', reps: '8', rpe: '7.5' } }
    })).referenceLoads.bench, { kg: 70.5, reps: 8, rpe: 7.5, performedOn: null });
    assert.deepEqual(normalizeAthleteProfile(profile('intermediate', {
        referenceLoads: { squat: { kg: 90, reps: 6, rpe: '' } }
    })).referenceLoads.squat, { kg: 90, reps: 6, rpe: null, performedOn: null });
    for (const raw of [
        { kg: '', reps: '8', rpe: '7' },
        { kg: '-50', reps: '8', rpe: '7' },
        { kg: '60', reps: '8-10', rpe: '7' },
        { kg: '60', reps: '8', rpe: '10.5' },
        { kg: '600', reps: '8', rpe: '8' }
    ]) {
        assert.throws(() => normalizeAthleteProfile(profile('beginner', {
            referenceLoads: { bench: raw }
        })), /validi|RPE/);
    }
    assert.throws(() => normalizeAthleteProfile(profile('beginner', {
        referenceLoads: { secret: { kg: 50, reps: 8 } }
    })), /Riferimenti/);
});

test('senza RPE realmente noto non prescrive un carico dalla sola dichiarazione', () => {
    const athlete = normalizeAthleteProfile(profile('intermediate', {
        referenceLoads: { bench: { kg: 80, reps: 8, rpe: '' } }
    }));
    assert.equal(eligibleReferenceLoad(athlete, 'bench', '6-10'), null);
    const meso = generate(athlete, { maxSessionMinutes: 75, athleteProfile: {
        ...athlete, calibration: 'regular'
    } });
    assert.equal(meso.weeks[0].days[0].exercises[0].kgMin, '');
    assert.match(meso.weeks[0].days[0].exercises[0].notes, /non prescritto automaticamente/);
});

test('prima settimana principiante: due serie, RPE moderato, senza carichi fittizi', () => {
    const meso = generate(profile('beginner'), { maxSessionMinutes: 75 });
    assert.equal(meso.athleteOnboarding.level, 'Principiante');
    assert.equal(meso.athleteOnboarding.calibrationWeek, true);
    assert.deepEqual(meso.weeks.map(w => w.days[0].exercises[0].rpe),
        ['6.5', '7.0', '7.5', '6.5']);
    for (const week of meso.weeks) {
        for (const day of week.days) {
            for (const ex of day.exercises) {
                assert.ok(ex.setsCount <= 2, ex.name);
                assert.equal(ex.setsCount, ex.sets.length);
                assert.equal(ex.kgMin, '');
                assert.equal(ex.kgMax, '');
                assert.ok(ex.sets.every(set => set.targetKg === '' &&
                    set.actualKg === '' && !set.completed));
            }
        }
    }
    const first = meso.weeks[0].days[0].exercises[0];
    assert.equal(first.reps, '8-12');
    assert.match(first.notes, /CALIBRAZIONE MYCOATCH/);
});

test('intermedio e avanzato: volume iniziale diverso dal principiante', () => {
    const low = generate(profile('beginner'));
    const mid = generate(profile('intermediate'));
    const high = generate(profile('advanced'));
    const first = m => m.weeks[0].days[0].exercises[0];
    assert.ok(first(low).setsCount <= first(mid).setsCount);
    assert.ok(first(mid).setsCount <= first(high).setsCount);
    assert.equal(first(low).rpe, '6.5');
    assert.equal(first(mid).rpe, '7.0');
    assert.equal(first(high).rpe, '7.5');
    assert.equal(mid.athleteOnboarding.level, 'Intermedio');
    assert.equal(high.athleteOnboarding.level, 'Avanzato');
});

test('senza fase guidata: ripetizioni/RPE standard e carico auto-dichiarato solo se valido', () => {
    const athlete = profile('intermediate', {
        calibration: 'regular',
        referenceLoads: { bench: { kg: 80, reps: 8, rpe: 7, performedOn: TODAY } }
    });
    const meso = generate(athlete, { maxSessionMinutes: 75 });
    const exercise = meso.weeks[0].days[0].exercises[0];
    assert.equal(meso.athleteOnboarding.calibrationWeek, false);
    assert.equal(exercise.kgMin, '80');
    assert.match(exercise.notes, /RIFERIMENTO ATLETA/);
    assert.match(exercise.notes, /Peso provvisorio/);
    assert.ok(!exercise.notes.includes('CALIBRAZIONE MYCOATCH'));
    assert.equal(meso.weeks[1].days[0].exercises[0].kgMin, '80');
    assert.equal(meso.weeks[2].days[0].exercises[0].kgMin, '80');
    assert.equal(meso.weeks[3].days[0].exercises[0].kgMin, '67.5');
});

test('con prima settimana guidata non presuppone lo stesso peso nemmeno se comunicato', () => {
    const meso = generate(profile('intermediate', {
        referenceLoads: { bench: { kg: 80, reps: 8, rpe: 7 } }
    }));
    const first = meso.weeks[0].days[0].exercises[0];
    assert.equal(first.kgMin, '');
    assert.match(first.notes, /80 kg/);
    assert.match(first.notes, /non prescritto automaticamente/);
});

test('riferimento RPE 9 o ripetizioni incompatibili non diventa prescrizione', () => {
    for (const source of [
        { kg: 90, reps: 8, rpe: 9 },
        { kg: 90, reps: 15, rpe: 7 },
        { kg: 90, reps: 3, rpe: 7 }
    ]) {
        const meso = generate(profile('advanced', {
            calibration: 'regular',
            referenceLoads: { bench: source }
        }));
        assert.equal(meso.weeks[0].days[0].exercises[0].kgMin, '');
    }
});

test('esercizio da evitare non appare in nessuna seduta o settimana', () => {
    const athlete = profile('intermediate', {
        excludedExercises: [
            'Squat con Bilanciere',
            'Stacco Rumeno (RDL)',
            'Military Press con Bilanciere'
        ]
    });
    const meso = generate(athlete);
    const namePerWeek = meso.weeks.map(w =>
        w.days.flatMap(day => day.exercises.map(ex => ex.name)));
    for (const names of namePerWeek) {
        for (const excluded of athlete.excludedExercises) {
            assert.equal(names.includes(excluded), false, excluded);
        }
    }
    assert.equal(meso.weeks[0].days[1].exercises[0].pattern, 'squat');
    assert.equal(meso.weeks[0].days[2].exercises[0].name,
        'Spinte con Manubri da Seduto');
    assert.equal(meso.weeks[0].days[3].exercises[0].name,
        'Stacco da Terra Convenzionale');
    assert.equal(meso.weeks[0].weeklyCoverage.allPriorityLiftsPresent, true);
});

test('preferenza di esercizio esplicita in conflitto con esclusione blocca la scheda', () => {
    const excluded = ['Panca Piana con Bilanciere'];
    assert.throws(() => generate(profile('beginner', {
        excludedExercises: excluded
    }), { preferredLifts: { bench: 'Panca Piana con Bilanciere' } }),
    /fra gli esercizi da evitare/);
    assert.throws(() => normalizeAthleteProfile(profile('beginner', {
        excludedExercises: ['Esercizio non presente']
    })), /non è riconosciuto/);
});

test('specializzazione dichiarata segue il gruppo muscolare senza inventare un nuovo esercizio', () => {
    const meso = generate(profile('intermediate', {
        priorityMuscle: 'Petto'
    }), { maxSessionMinutes: 90 });
    const first = meso.weeks[0];
    assert.equal(meso.athleteOnboarding.priorityMuscle, 'Petto');
    assert.ok(first.weeklyCoverage.directSetsByMuscle.Petto > 0);
});

test('dati convalidati nello storico hanno precedenza sul carico dichiarato', () => {
    const history = {
        sessionsAnalyzed: 3,
        byExercise: {},
        exerciseNotes: {},
        decisions: { byExercise: {}, byMuscle: {} }
    };
    const meso = generate(profile('advanced', {
        referenceLoads: { bench: { kg: 100, reps: 8, rpe: 7 } }
    }), {}, history);
    assert.equal(meso.athleteOnboarding.calibrationWeek, false);
    assert.equal(meso.weeks[0].days[0].exercises[0].kgMin, '');
    assert.ok(!meso.weeks[0].days[0].exercises[0].notes.includes('RIFERIMENTO ATLETA'));
});

test('anteprima esplicita profilo, calibrazione, esclusioni, e carichi dichiarati', () => {
    const meso = generate(profile('beginner', {
        priorityMuscle: 'Petto',
        excludedExercises: ['Squat con Bilanciere'],
        referenceLoads: { bench: { kg: 50, reps: 8, rpe: 7 } }
    }), { maxSessionMinutes: 75 });
    const report = { inspectedMesocycles: 0, sessionsAnalyzed: 0,
        athleteOnboarding: meso.athleteOnboarding };
    const review = formatCoachReview(compareMesocyclePlans(null, meso, {}), report);
    assert.match(review, /PROFILO INIZIALE: Principiante/);
    assert.match(review, /PRIMA SETTIMANA DI CALIBRAZIONE/);
    assert.match(review, /Esercizi esclusi dall’atleta/);
    assert.match(review, /Carichi dichiarati, NON verificati/);
    assert.match(review, /Confermi la proposta/);
});

test('3/4 giorni e durata scelta rispettati, CSV compatibile e nessun check fantasma', () => {
    for (const daysPerWeek of [3, 4]) {
        for (const minutes of [35, 45, 60, 90]) {
            const meso = generate(profile('beginner'), { daysPerWeek, maxSessionMinutes: minutes });
            for (const w of meso.weeks) {
                assert.ok(w.weeklyCoverage.allPriorityLiftsPresent);
                for (const day of w.days) {
                    assert.ok(day.estimatedMinutes <= minutes);
                    assert.equal(day.estimatedMinutes, estimateDayMinutes(day.exercises));
                    assert.ok(day.exercises.every(ex => ex.sets.every(set => !set.completed)));
                }
            }
        }
    }
    MyCoatch.generateNextFromHistory({ history: { years: {} } }, config(profile('beginner')));
    const csv = MyCoatch.exportAsCSV().trim().split('\n');
    assert.equal(csv[0],
        'Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset');
    assert.ok(csv.slice(1).every(line => line.split(';').length === 12));
    assert.match(MyCoatch.exportAsCSV(), /CALIBRAZIONE MYCOATCH/);
});

test('form valida età/tempo ed esperienza; la vecchia API senza profilo continua a funzionare', () => {
    const bare = parseCoachPreferences({
        selectedTime: '60', userAge: '49', daysPerWeek: '4', focus: 'hybrid'
    });
    assert.equal(bare.athleteProfile, undefined);
    assert.equal(parseCoachPreferences({
        selectedTime: '60', userAge: '49', daysPerWeek: '4', focus: 'hybrid',
        athleteProfile: profile('advanced')
    }).athleteProfile.experience, 'advanced');
    assert.throws(() => parseCoachPreferences({
        selectedTime: '60', userAge: '49', daysPerWeek: '4', focus: 'hybrid',
        athleteProfile: profile('')
    }), /Seleziona il livello/);
});

test('un peso autodichiarato senza data non diventa una prescrizione, anche con RPE buono', () => {
    const athlete = profile('intermediate', {
        calibration: 'regular',
        referenceLoads: { bench: { kg: 80, reps: 8, rpe: 7 } }
    });
    assert.equal(eligibleReferenceLoad(normalizeAthleteProfile(athlete), 'bench', '6-10'), null);
    const meso = generate(athlete, { maxSessionMinutes: 75 });
    assert.equal(meso.weeks[0].days[0].exercises[0].kgMin, '');
    assert.match(meso.weeks[0].days[0].exercises[0].notes, /Peso non prescritto automaticamente/);
});

test('data reale del riferimento: massimo 90 giorni, no future e no date inventate', () => {
    assert.equal(MAX_REFERENCE_AGE_DAYS, 90);
    const today = new Date('2026-10-15T12:00:00Z');
    const daysBefore = days => new Date(today.getTime() - days * 86400000)
        .toISOString().slice(0, 10);
    const athlete = days => normalizeAthleteProfile(profile('advanced', {
        calibration: 'regular',
        referenceLoads: {
            bench: { kg: 85, reps: 8, rpe: 7, performedOn: daysBefore(days) }
        }
    }));
    assert.equal(eligibleReferenceLoad(athlete(0), 'bench', '6-10', { today }), 85);
    assert.equal(eligibleReferenceLoad(athlete(90), 'bench', '6-10', { today }), 85);
    assert.equal(eligibleReferenceLoad(athlete(91), 'bench', '6-10', { today }), null);
    assert.throws(() => normalizeAthleteProfile(profile('advanced', {
        referenceLoads: { bench: { kg: 85, reps: 8, rpe: 7,
            performedOn: '2099-01-01' } }
    })), /non può essere futura/);
    assert.throws(() => normalizeAthleteProfile(profile('advanced', {
        referenceLoads: { bench: { kg: 85, reps: 8, rpe: 7,
            performedOn: '2026-02-30' } }
    })), /non può essere futura/);
});

