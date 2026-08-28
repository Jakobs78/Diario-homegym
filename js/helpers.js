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

/**
 * Genera il riassunto dell'esercizio formattato per la scheda
 */
export function formatExerciseSummary(ex) {
    const formatVal = (val) => (!val || val === '0' || val === 0) ? '-' : val;

    const kgMin = formatVal(ex.kgMin);
    const kgMax = formatVal(ex.kgMax);
    const sets = formatVal(ex.sets);
    const reps = formatVal(ex.reps);
    const rpe = formatVal(ex.rpe);
    const rest = formatVal(ex.restTime);
    const topset = formatVal(ex.topset);

    let kgStr = '-';
    if (kgMin !== '-' || kgMax !== '-') {
        kgStr = kgMin === kgMax ? `${kgMin}kg` : `${kgMin}-${kgMax}kg`;
    }

    const kgHtml = `<span style="color: #ef4444; font-weight: 700;">${kgStr}</span>`;
    const topsetHtml = `<span style="color: #ef4444; font-weight: 700;">${topset}${topset !== '-' ? 'kg' : ''}</span>`;

    return `${kgHtml} | ${sets} set x ${reps} reps @${rpe} | rest ${rest} | Topset ${topsetHtml}`;
}

/**
 * Distingue lo stimolo dell'esercizio (Forza vs Ipertrofia) basandosi sul target reps
 */
export function getExerciseSignature(ex) {
    const slug = slugify(ex.name || '');
    const repsStr = String(ex.reps || '');
    const firstNum = parseInt(repsStr.match(/\d+/)?.[0] || '8', 10);
    
    // Se le reps target sono <= 5 viene classificato come Forza, altrimenti Ipertrofia
    const type = firstNum <= 5 ? 'strength' : 'hypertrophy';
    return `${slug}_${type}`;
}
// js/helpers.js

export function getPlateBreakdown(totalWeight, barWeight = 20) {
    if (!totalWeight || totalWeight <= barWeight) {
        return null;
    }

    let sideWeight = (totalWeight - barWeight) / 2;
    const availablePlates = [20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5];
    const combination = [];
    for (const plate of availablePlates) {
            while (sideWeight >= plate) {
                combination.push(plate);
                sideWeight = Math.round((sideWeight - plate) * 100) / 100;
            }
        }

        const sideTotal = (totalWeight - barWeight) / 2;
        return {
            sideWeight: sideTotal,
            plates: combination,
            str: combination.length > 0 ? combination.join(' + ') : 'Nessun disco'
        };
}