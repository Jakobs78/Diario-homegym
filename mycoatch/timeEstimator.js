/**
 * Stima euristica e conservativa della durata di una seduta.
 * Include cinque minuti orientativi di riscaldamento generale e avvicinamento
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

export function repetitionSeconds(exercise) {
    // La stima considera un tempo moderato per serie, non una cadenza imposta.
    const range=String(exercise.reps||exercise.defaultReps||'').match(/^(\d+)(?:[-–](\d+))?/);
    const repCount=range?(Number(range[1])+Number(range[2]||range[1]))/2:null;
    const perSide=repCount===null?(isCompound(exercise)?55:50):Math.max(30,Math.min(100,repCount*3+15));
    const unilateral = exercise.unilateral ?? /Un Braccio|Bulgarian|Affondi|Step-up|Monopodalico|Pallof|Leg Curl ai Cavi/i.test(exercise.name || '');
    return unilateral ? perSide * 2 + 10 : perSide;
}

function setupSeconds(exercise, index) {
    const equipmentSetup = exercise.equipment === 'barbell' ? 105 : 70;
    const transitions = index > 0 ? 45 : 0;
    // Avvicinamento specifico, aggiuntivo rispetto al riscaldamento generale.
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
    const sharedStation=group.filter(ex=>ex.equipment==='cable'||ex.equipment==='barbell').length>1;
    const switchSeconds = sets * (group.length - 1) * (sharedStation?60:20);
    return setup + work + switchSeconds + Math.max(0, sets - 1) * groupRest;
}

/**
 * Restituisce una previsione della durata della giornata, utile per il vincolo
 * sul tempo scelto. Non rappresenta una misurazione effettiva dell'allenamento.
 */
// Il timer del diario parte alla prima serie confermata: riscaldamento e
// prima serie sono esclusi dalla misura reale. Vanno stimati separatamente.
export function firstSetStartOffsetSeconds(exercises) {
    if (!Array.isArray(exercises) || !exercises.length) return 0;
    return 300 + setupSeconds(exercises[0], 0) + repetitionSeconds(exercises[0]);
}

export function estimateDaySeconds(exercises, { paceFactor = 1 } = {}) {
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

    // Correggi soltanto la parte osservabile dal timer. Non accorciare
    // automaticamente avvicinamento e recuperi: il fattore minimo è 1.
    const baseline = seconds + 90 + 300;
    const factor = Number.isFinite(Number(paceFactor))
        ? Math.min(1.25, Math.max(1, Number(paceFactor))) : 1;
    const initial = firstSetStartOffsetSeconds(exercises);
    return Math.ceil(initial + Math.max(0, baseline - initial) * factor);
}

export function estimateDayMinutes(exercises, options = {}) {
    return Math.ceil(estimateDaySeconds(exercises, options) / 60);
}

