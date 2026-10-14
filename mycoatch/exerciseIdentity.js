/**
 * Identificazione prudente degli esercizi attraverso i mesocicli.
 * L'aliasing è esplicito: panca inclinata e piana, squat e front squat,
 * rematore e lat machine NON vengono fusi.
 */
export function normalizeExerciseLabel(label) {
    return String(label ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[_\-]/g, ' ')
        .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const aliases = new Map();

function addAliases(canonical, variants) {
    for (const name of [canonical, ...variants]) {
        const key = normalizeExerciseLabel(name);
        if (aliases.has(key) && aliases.get(key) !== canonical) {
            throw new Error('Alias esercizio ambiguo: ' + name);
        }
        aliases.set(key, canonical);
    }
}

addAliases('Panca Piana con Bilanciere', [
    'panca', 'panca piana', 'panca bilanciere', 'panca piana bilanciere',
    'bench press', 'barbell bench press', 'flat bench press', 'panca piana bb'
]);
addAliases('Panca Inclinata con Manubri', [
    'panca inclinata manubri', 'panca inclinata con manubri',
    'incline dumbbell bench press', 'distensioni manubri inclinata'
]);
addAliases('Squat con Bilanciere', [
    'squat', 'back squat', 'squat bilanciere', 'back squat bilanciere'
]);
addAliases('Front Squat', ['squat frontale', 'front squat bilanciere']);
addAliases('Stacco Rumeno (RDL)', [
    'rdl', 'stacco rumeno', 'stacchi rumeni', 'romanian deadlift', 'stacco rumeno bilanciere'
]);
addAliases('Stacco da Terra Convenzionale', [
    'stacco da terra', 'stacco convenzionale', 'deadlift convenzionale',
    'conventional deadlift', 'deadlift'
]);
addAliases('Military Press con Bilanciere', [
    'military press', 'military', 'lento avanti', 'lento avanti bilanciere',
    'overhead press bilanciere'
]);
addAliases('Lat Machine con Triangolo', [
    'lat machine', 'lat machine presa stretta', 'lat machine triangolo',
    'lat triangolo', 'lat pulldown'
]);
addAliases('Rematore con Bilanciere', [
    'rematore bilanciere', 'rematore con bilanciere', 'barbell row',
    'bent over barbell row'
]);
addAliases('Pulley Basso a T', [
    'pulley basso', 'pulley basso a t', 'seated cable row'
]);
addAliases('Croci ai Cavi in Allungamento', [
    'croci cavi', 'croci ai cavi', 'cable fly'
]);
addAliases('Alzate Laterali con Manubri', [
    'alzate laterali', 'alzate laterali manubri', 'dumbbell lateral raises'
]);
addAliases('Alzate Laterali ai Cavi', [
    'alzate laterali cavi', 'cable lateral raise'
]);
addAliases('Pushdown ai Cavi con Corda', [
    'pushdown corda', 'pushdown rope', 'triceps rope pushdown'
]);
addAliases('Curl con Bilanciere EZ', [
    'curl bilanciere ez', 'curl ez', 'ez curl'
]);
addAliases('Curl Manubri su Panca Inclinata', [
    'curl manubri inclinata', 'incline dumbbell curl'
]);
addAliases('French Press con Bilanciere EZ', [
    'french press', 'french press ez'
]);
addAliases('Affondi con Manubri', [
    'affondi manubri', 'dumbbell lunges'
]);
addAliases('Leg Curl ai Cavi (cavigliera)', [
    'leg curl cavi', 'leg curl ai cavi'
]);
addAliases('Curl ai Cavi Bassi', [
    'curl cavi bassi', 'curl ai cavi'
]);

export function canonicalExerciseName(label) {
    const normalized = normalizeExerciseLabel(label);
    return aliases.get(normalized) || String(label ?? '').trim();
}

export function canonicalExerciseKey(label) {
    return normalizeExerciseLabel(canonicalExerciseName(label));
}
