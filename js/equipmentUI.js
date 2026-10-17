import {EXERCISE_DATABASE} from '../mycoatch/exercisesDB.js';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
const catalog=new Map(EXERCISE_DATABASE.map(ex=>[canonicalExerciseKey(ex.name),ex.equipment]));
export const PLATES_AUTO_OPEN_KG=35;
export function equipmentKind(exercise){
    const explicit=String(exercise?.equipment||'').toLowerCase();
    const name=String(exercise?.name||'').toLowerCase();
    // A specific implement in the name overrides generic/legacy catalogue aliases.
    if(/manubr|dumbbell|kettlebell|cav[oi]|cable|macchina|machine|smith|multipower/.test(name+' '+explicit))return 'other';
    if(/bilanciere|barbell|barra ez/.test(name+' '+explicit))return 'barbell';
    const known=catalog.get(canonicalExerciseKey(name));
    return known==='barbell'?'barbell':known?'other':'unknown';
}
export function automaticallyShowPlates(exercise,weight){
    return equipmentKind(exercise)==='barbell' && Number(String(weight).replace(',','.'))>PLATES_AUTO_OPEN_KG;
}


// User-owned barbells: no bar, diameter or inventory is presumed to exist.
// Keep the legacy per-exercise assignments readable without migrating or deleting them.
export function normalizeOwnedBarbells(bars) {
    if (!Array.isArray(bars)) return [];
    const seen = new Set();
    const valid = [];
    for (const bar of bars) {
        const weight = Number(bar?.weight);
        const diameter = String(bar?.diameter ?? '');
        if (!Number.isFinite(weight) || weight <= 0 || weight > 30 ||
            Math.abs(weight * 4 - Math.round(weight * 4)) > 1e-9 ||
            !['50', '29'].includes(diameter)) continue;
        const key = weight + '|' + diameter;
        if (seen.has(key)) continue;
        seen.add(key);
        valid.push({weight, diameter});
    }
    return valid;
}

export function barbellOptionValue(bar) {
    return bar ? String(bar.weight) + '|' + String(bar.diameter) : '';
}

export function selectableBarbells(exercise, athlete = {}) {
    const owned = normalizeOwnedBarbells(athlete.ownedBarbells);
    if (owned.length) return owned;
    // Previously saved bindings must keep working before the user configures
    // the new list. Never infer ownership from old inventory quantities.
    const key = canonicalExerciseKey(exercise?.name);
    return normalizeOwnedBarbells([athlete.barbellAssignments?.[key]]);
}

export function suggestedBarbell(exercise, athlete = {}) {
    const options = selectableBarbells(exercise, athlete);
    const assignment = normalizeOwnedBarbells([
        athlete.barbellAssignments?.[canonicalExerciseKey(exercise?.name)]
    ])[0];
    if (assignment && options.some(bar => barbellOptionValue(bar) === barbellOptionValue(assignment))) {
        return assignment;
    }
    const preferred = normalizeOwnedBarbells([athlete.defaultBarbell])[0];
    if (preferred && options.some(bar => barbellOptionValue(bar) === barbellOptionValue(preferred))) {
        return preferred;
    }
    return options[0] || null;
}
