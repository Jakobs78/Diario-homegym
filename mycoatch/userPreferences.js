import { normalizeSelectionPreferences, isExerciseAvailable, FUNDAMENTAL_CHOICES } from './exerciseSelection.js';
import { EXERCISE_DATABASE } from './exercisesDB.js';
import { normalizeAthleteProfile } from './athleteProfile.js';
import { generationSchedule } from './generationSchedule.js';

/**
 * Convalida la durata scelta dall'utente, senza convertire input vuoti in valori
 * predefiniti. E' una preferenza per singola sessione, in minuti.
 */
export function parseWorkoutDuration(selectedValue, customValue = '') {
    const raw = selectedValue === 'custom' ? customValue : selectedValue;
    const normalized = String(raw ?? '').trim();
    if (!/^\d+$/.test(normalized)) return null;

    const minutes = Number(normalized);
    if (!Number.isSafeInteger(minutes) || minutes < 25 || minutes > 180) return null;
    return minutes;
}

/** Profilo minimo per la generazione MyCoatch. */
export function parseCoachPreferences(fields = {}) {
    const maxSessionMinutes = parseWorkoutDuration(fields.selectedTime, fields.customTime);
    const userAge = Number(fields.userAge);
    const daysPerWeek = Number(fields.daysPerWeek);
    const focus = String(fields.focus || '');
    const splitPreference = String(fields.splitPreference || 'auto');
    const deloadChoice = String(fields.deloadChoice || 'auto');

    if (maxSessionMinutes === null) {
        throw new Error('Indica quanti minuti hai a disposizione (da 25 a 180).');
    }
    if (!Number.isInteger(userAge) || userAge < 18 || userAge > 100) {
        throw new Error("Inserisci un'età valida (18-100 anni).");
    }
    const schedule = generationSchedule({daysPerWeek,
        ...(fields.durationWeeks !== undefined ? {durationWeeks:fields.durationWeeks} : {})});
    if (!['hybrid', 'strength', 'hypertrophy'].includes(focus)) {
        throw new Error("Seleziona un obiettivo di allenamento.");
    }

    if (!['auto', 'upperlower', 'fullbody'].includes(splitPreference)) {
        throw new Error('Scegli una struttura settimanale valida.');
    }
    if (!['auto', 'last', 'none'].includes(deloadChoice)) {
        throw new Error('Scegli una gestione dello scarico valida.');
    }

    const athleteProfile = normalizeAthleteProfile(fields.athleteProfile);
    const selection = normalizeSelectionPreferences({
        preferredLifts: fields.preferredLifts,
        availableAccessories: fields.availableAccessories,
        availableEquipment: fields.availableEquipment,
        availableMachines: fields.availableMachines,
        cableSetup: fields.cableSetup,
        excludedExercises: athleteProfile?.excludedExercises
    });

    for (const [key, name] of Object.entries(selection.preferredLifts)) {
        if (!FUNDAMENTAL_CHOICES[key]?.includes(name)) {
            throw new Error('Preferenza di fondamentale non valida: ' + key);
        }
        const exercise = EXERCISE_DATABASE.find(ex => ex.name === name);
        if (!exercise || exercise.generationAllowed === false || !isExerciseAvailable(exercise, selection)) {
            throw new Error(
                'La variante ' + name + ' richiede attrezzatura non selezionata. ' +
                'Abilita l’accessorio necessario o scegli la variante automatica.'
            );
        }
    }

    return {
        maxSessionMinutes,
        userAge,
        daysPerWeek,
        ...(fields.durationWeeks !== undefined ? {durationWeeks:schedule.durationWeeks} : {}),
        focus,
        splitPreference,
        ...(deloadChoice === 'last' ? {deloadWeek:true} :
            deloadChoice === 'none' ? {deloadWeek:false} : {deloadWeek:null}),
        ...selection,
        ...(athleteProfile ? { athleteProfile } : {}),
        primaryGoal: focus === 'strength' ? 'powerlifting' :
            focus === 'hypertrophy' ? 'bodybuilding' : 'powerbuilding'
    };
}
