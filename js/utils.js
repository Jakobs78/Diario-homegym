// funzioni di supporto (slugify, helper muscolari)
// js/utils.js

export function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Rimuove gli accenti
        .replace(/\s+/g, '_')                            // Sostituisce gli spazi con underscore
        .replace(/[^\w\-]+/g, '')                        // Rimuove caratteri speciali
        .replace(/\-\-+/g, '-');
}

export function getAutoMuscleGroup(exerciseName) {
    if (!exerciseName) return 'Generico';
    const name = exerciseName.toLowerCase();
    
    if (name.includes('panca') || name.includes('spinte') || name.includes('croci')) return 'Petto';
    if (name.includes('squat') || name.includes('leg press') || name.includes('affondi') || name.includes('stacco')) return 'Gambe';
    if (name.includes('trazioni') || name.includes('lat') || name.includes('rematore') || name.includes('pulley')) return 'Dorso';
    if (name.includes('lento') || name.includes('shoulder') || name.includes('alzate')) return 'Spalle';
    if (name.includes('curl') || name.includes('bicipiti')) return 'Bicipiti';
    if (name.includes('tricipiti') || name.includes('pushdown') || name.includes('francese')) return 'Tricipiti';
    if (name.includes('calf')) return 'Polpacci';
    if (name.includes('addominali') || name.includes('crunch') || name.includes('plank')) return 'Addome';
    
    return 'Altro';
}

export function getExerciseSignature(ex) {
    const baseName = ex.Esercizio || 'esercizio';
    const repsSchema = ex.Reps || 'reps';
    return `${slugify(baseName)}_${slugify(repsSchema)}`;
}