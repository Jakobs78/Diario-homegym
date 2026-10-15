import { normalizeSelectionPreferences, isExerciseAvailable, FUNDAMENTAL_CHOICES } from './exerciseSelection.js';
import { EXERCISE_DATABASE } from './exercisesDB.js';

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

    if (maxSessionMinutes === null) {
        throw new Error('Indica quanti minuti hai a disposizione (da 25 a 180).');
    }
    if (!Number.isInteger(userAge) || userAge < 18 || userAge > 100) {
        throw new Error("Inserisci un'età valida (18-100 anni).");
    }
    if (![3, 4].includes(daysPerWeek)) {
        throw new Error('La programmazione attuale supporta 3 o 4 allenamenti a settimana.');
    }
    if (!['hybrid', 'strength', 'hypertrophy'].includes(focus)) {
        throw new Error("Seleziona un obiettivo di allenamento.");
    }

    const selection = normalizeSelectionPreferences({
        preferredLifts: fields.preferredLifts,
        availableAccessories: fields.availableAccessories,
        availableEquipment: fields.availableEquipment
    });

    for (const [key, name] of Object.entries(selection.preferredLifts)) {
        if (!FUNDAMENTAL_CHOICES[key]?.includes(name)) {
            throw new Error('Preferenza di fondamentale non valida: ' + key);
        }
        const exercise = EXERCISE_DATABASE.find(ex => ex.name === name);
        if (!exercise || !isExerciseAvailable(exercise, selection)) {
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
        focus,
        ...selection,
        primaryGoal: focus === 'strength' ? 'powerlifting' :
            focus === 'hypertrophy' ? 'bodybuilding' : 'powerbuilding'
    };
}
