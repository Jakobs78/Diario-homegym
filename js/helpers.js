// helpers.js
export function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Sostituisce gli spazi con -
        .replace(/[^\w\-]+/g, '')       // Rimuove tutti i caratteri non parola
        .replace(/\-\-+/g, '-')         // Sostituisce multipli - con un singolo -
        .replace(/^-+/, '')             // Rimuove - dall'inizio
        .replace(/-+$/, '');            // Rimuove - dalla fine
}

export function assignMuscleGroup(exerciseName) {
    const name = exerciseName.toLowerCase();
    if (name.includes('panca') || name.includes('push') || name.includes('croci')) return 'Petto';
    if (name.includes('squat') || name.includes('leg') || name.includes('pressa')) return 'Gambe';
    if (name.includes('trazioni') || name.includes('rematore') || name.includes('pulldown') || name.includes('lat')) return 'Dorso';
    if (name.includes('curl')) return 'Bicipiti';
    if (name.includes('french') || name.includes('pushdown') || name.includes('estensioni')) return 'Tricipiti';
    if (name.includes('military') || name.includes('lento') || name.includes('alzate')) return 'Spalle';
    if (name.includes('crunch') || name.includes('plank')) return 'Addome';
    return 'Altro';
}

export function generateExerciseSignature(exerciseName, index) {
    return `${slugify(exerciseName)}-${index}`;
}

export function parseRecoveryTime(recoveryString) {
    if (!recoveryString) return 0;
    const parts = recoveryString.toString().trim().split(':');
    if (parts.length === 2) {
        return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
    }
    return parseInt(recoveryString, 10) || 0;
}