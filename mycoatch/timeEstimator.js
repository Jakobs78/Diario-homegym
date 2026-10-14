/**
 * Stima euristica e conservativa della durata di una seduta.
 * Non include un riscaldamento generale obbligatorio; include invece avvicinamento
 * al primo fondamentale, serie, recuperi, allestimento e cambio attrezzo.
 * I tempi sono stime da calibrare usando i workout realmente registrati.
 */

function secondsOfRecovery(value) {
    const str = String(value ?? '').trim().toLowerCase();
    if (/^\d+s$/.test(str)) return Number.parseInt(str, 10);
    if (/^\d+min$/.test(str)) return Number.parseInt(str, 10) * 60;
    if (/^\d+$/.test(str)) return Number.parseInt(str, 10);
    throw new Error('Recupero non valido nello stimatore: ' + str);
}

function setsOf(exercise) {
    const number = Number(exercise?.setsCount);
    if (!Number.isInteger(number) || number < 1) throw new Error('Numero di serie non valido.');
    return number;
}

function isCompound(exercise) {
    return exercise.pattern !== 'isolation';
}

function repetitionSeconds(exercise) {
    // La stima considera un tempo moderato per serie, non una cadenza imposta.
    return isCompound(exercise) ? 55 : 50;
}

function setupSeconds(exercise, index) {
    const equipmentSetup = exercise.equipment === 'barbell' ? 105 : 70;
    const transitions = index > 0 ? 45 : 0;
    // Riscaldamento generale escluso; avvicinamento specifico ai movimenti principali.
    const warmup = index === 0 && isCompound(exercise) ? 300 :
        index === 1 && isCompound(exercise) ? 120 : 0;
    return equipmentSetup + transitions + warmup;
}

function singleExerciseSeconds(exercise, index) {
    const sets = setsOf(exercise);
    return setupSeconds(exercise, index) +
        sets * repetitionSeconds(exercise) +
        Math.max(0, sets - 1) * secondsOfRecovery(exercise.restTime);
}

function groupSeconds(group, firstIndex) {
    const sets = setsOf(group[0]);
    if (!group.every(exercise => setsOf(exercise) === sets && exercise.pattern === 'isolation')) {
        throw new Error('Superset/triset incompatibile: servono accessori con lo stesso numero di serie.');
    }
    const groupRest = secondsOfRecovery(group[group.length - 1].restTime);
    const setup = group.reduce((total, exercise, i) =>
        total + setupSeconds(exercise, firstIndex + i), 0);
    const work = sets * group.reduce((total, exercise) =>
        total + repetitionSeconds(exercise), 0);
    const switchSeconds = sets * (group.length - 1) * 20;
    return setup + work + switchSeconds + Math.max(0, sets - 1) * groupRest;
}

/**
 * Restituisce una previsione della durata della giornata, utile per il vincolo
 * sul tempo scelto. Non rappresenta una misurazione effettiva dell'allenamento.
 */
export function estimateDaySeconds(exercises) {
    if (!Array.isArray(exercises) || !exercises.length) return 0;
    let seconds = 0;

    for (let i = 0; i < exercises.length;) {
        const first = exercises[i];
        if (first.groupType === 'superset' || first.groupType === 'triset') {
            const size = first.groupType === 'triset' ? 3 : 2;
            const group = exercises.slice(i, i + size);
            if (group.length !== size || !group.every((ex, j) =>
                ex.groupType === first.groupType &&
                ex.groupBase === first.groupBase &&
                ex.isGroupLast === (j === size - 1))) {
                throw new Error('Raggruppamento incoerente con il timer della webapp.');
            }
            seconds += groupSeconds(group, i);
            i += size;
        } else {
            if (first.groupType) throw new Error('Gruppo privo del primo esercizio.');
            seconds += singleExerciseSeconds(first, i);
            i++;
        }
    }

    // Margine pratico per spostamenti e registrazione delle serie.
    return seconds + 90;
}

export function estimateDayMinutes(exercises) {
    return Math.ceil(estimateDaySeconds(exercises) / 60);
}
