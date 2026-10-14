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

    return {
        maxSessionMinutes,
        userAge,
        daysPerWeek,
        focus,
        primaryGoal: focus === 'strength' ? 'powerlifting' :
            focus === 'hypertrophy' ? 'bodybuilding' : 'powerbuilding'
    };
}
