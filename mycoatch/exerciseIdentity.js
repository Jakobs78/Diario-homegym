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
    'lat machine triangolo', 'lat triangolo'
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

export function exerciseIdentity(exercise){
    if(!exercise||typeof exercise!=='object')return canonicalExerciseKey(exercise);
    return exercise.catalogMapping?.confirmed===true && exercise.catalogMapping.name
        ? canonicalExerciseKey(exercise.catalogMapping.name) : canonicalExerciseKey(exercise.name);
}
export function confirmExerciseMapping(exercise,catalogName,{category=null,equipment=null}={}){
    if(!exercise||!String(catalogName||'').trim())throw Error('Associazione esercizio non valida.');
    return {...exercise,exerciseId:exercise.exerciseId||'exercise_'+crypto.randomUUID(),originalName:exercise.originalName||exercise.name,
        catalogMapping:{confirmed:true,name:canonicalExerciseName(catalogName),category,equipment}};
}

/** Personal aliases are explicit, reversible and shared across occurrences. */
export function applyPersonalExerciseMapping(data,label,catalog=null){
    const key=normalizeExerciseLabel(label);
    if(!key)throw Error('Nome personale mancante.');
    data.athlete ||= {};data.athlete.exerciseCatalogMappings ||= {};
    const registry=data.athlete.exerciseCatalogMappings;
    const exerciseId=registry[key]?.exerciseId||'exercise:'+key;
    if(catalog)registry[key]={confirmed:true,name:catalog.name,category:catalog.category,equipment:catalog.equipment,exerciseId};
    else delete registry[key];
    const apply=meso=>{for(const week of meso.weeks||[])for(const day of week.days||[])
        for(const session of [day,...(day.sessionArchives||[])])for(const ex of session.exercises||[]){
            if(normalizeExerciseLabel(ex.originalName||ex.name)!==key && normalizeExerciseLabel(ex.name)!==key)continue;
            ex.originalName ||= ex.name;ex.exerciseId=exerciseId;
            if(catalog)ex.catalogMapping=structuredClone(registry[key]);else delete ex.catalogMapping;
        }};
    for(const year of Object.values(data.history?.years||{}))for(const meso of year.mesocycles||[])apply(meso);
    for(const item of data.archivedMesocycles||[])apply(item.mesocycle);
}
export function inheritPersonalExerciseMapping(data,exercise){
    exercise.originalName ||= exercise.name;
    const key=normalizeExerciseLabel(exercise.originalName);
    const saved=data.athlete?.exerciseCatalogMappings?.[key];
    exercise.exerciseId ||= saved?.exerciseId||'exercise:'+key;
    if(saved?.confirmed)exercise.catalogMapping=structuredClone(saved);
    return exercise;
}
