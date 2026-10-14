import { estimateDaySeconds } from './timeEstimator.js';

const MIN_ACCESSORY_SETS = 2;
const GROUP_NOTES = {
    superset: '[SUPERSERIE] Esegui con il prossimo esercizio, poi recupera al termine della coppia.',
    triset: '[TRISET] Esegui i prossimi tre esercizi in sequenza, poi recupera al termine del gruppo.'
};

/**
 * Rimuove soltanto tag di raggruppamento generati dal planner, prima di
 * ricalcolare il piano. Gli altri appunti rimangono invariati.
 */
function resetGroups(exercises) {
    return exercises.map(exercise => {
        const copy = { ...exercise, sets: [...(exercise.sets || [])] };
        delete copy.groupType;
        delete copy.groupBase;
        delete copy.isGroupLast;
        // Un piano ricalcolato non deve conservare vecchie etichette TRISET
        // o SUPERSERIE: l'importatore le userebbe per raggruppare i vicini sbagliati.
        for (const note of Object.values(GROUP_NOTES)) {
            if (String(copy.notes || '').startsWith(note)) {
                copy.notes = String(copy.notes).slice(note.length).replace(/^\\s*\\|\\s*/, '').trim();
            }
        }
        return copy;
    });
}

function compatible(group) {
    const category = group.map(exercise => exercise.category);
    if (new Set(category).size !== group.length) return false;
    if (!group.every(exercise => exercise.pattern === 'isolation' &&
        Number.isInteger(exercise.setsCount) && exercise.setsCount === group[0].setsCount)) {
        return false;
    }

    // Evita gli accoppiamenti con maggiore interferenza muscolare.
    const muscles = new Set(category);
    if (muscles.has('Petto') && muscles.has('Tricipiti')) return false;
    if (muscles.has('Spalle') && muscles.has('Tricipiti')) return false;
    if (muscles.has('Back_Lats') && muscles.has('Bicipiti')) return false;
    if (muscles.has('Back_Thickness') && muscles.has('Bicipiti')) return false;
    return true;
}

export function groupAccessories(exercises, size = 2) {
    if (![2, 3].includes(size)) throw new Error('I gruppi devono essere superset o triset.');
    const result = resetGroups(exercises);
    const kind = size === 2 ? 'superset' : 'triset';

    // Mantieni i primi due movimenti senza raggruppamenti che possano penalizzare
    // forza, tecnica e recuperi. Preferisci gli ultimi accessori contigui.
    for (let start = result.length - size; start >= 2; start--) {
        const candidates = result.slice(start, start + size);
        if (!compatible(candidates)) continue;

        const base = String(start + 1);
        candidates.forEach((exercise, i) => {
            exercise.groupType = kind;
            exercise.groupBase = base;
            exercise.isGroupLast = i === size - 1;
        });

        const first = result[start];
        first.notes = [GROUP_NOTES[kind], first.notes || ''].filter(Boolean).join(' | ');
        const last = result[start + size - 1];
        const lastRest = Number.parseInt(last.restTime, 10);
        const minimum = size === 3 ? 120 : 90;
        last.restTime = `${Math.max(minimum, Number.isFinite(lastRest) ? lastRest : minimum)}s`;
        return result;
    }

    return result;
}

function optionsFor(exercises, availableMinutes) {
    const solo = resetGroups(exercises);
    const variants = [{ label: 'singole', exercises: solo }];
    if (availableMinutes <= 60) {
        variants.push({ label: 'superset', exercises: groupAccessories(solo, 2) });
    }
    if (availableMinutes <= 50) {
        variants.push({ label: 'triset', exercises: groupAccessories(solo, 3) });
    }
    return variants.map(option => ({
        ...option,
        seconds: estimateDaySeconds(option.exercises),
        groups: option.exercises.filter(ex => ex.groupType && ex.isGroupLast).length
    }));
}

function choosePlan(exercises, maxSeconds, maxSessionMinutes) {
    const candidates = optionsFor(exercises, maxSessionMinutes);
    const fitting = candidates.filter(plan => plan.seconds <= maxSeconds);
    if (fitting.length) {
        // Se la seduta sta nel tempo, evitare raggruppamenti non necessari.
        // Nei programmi fino a 60 min usare comunque una coppia compatibile per
        // ottimizzare le transizioni; triset soltanto quando la coppia non basta.
        const preferred = maxSessionMinutes <= 60
            ? fitting.find(item => item.label === 'superset' && item.groups) : null;
        if (preferred) return preferred;
        return fitting.find(item => item.label === 'singole') || fitting[0];
    }
    return [...candidates].sort((a, b) => a.seconds - b.seconds)[0];
}

/**
 * Ottimizza la durata preservando gli esercizi principali (posizioni 1 e 2).
 * Prima prova gruppi non interferenti, poi riduce serie di accessori e infine
 * elimina accessori non essenziali. Non accorcia mai i recuperi dei fondamentali.
 *
 * Se anche la seduta minima eccede il budget, non restituisce un piano non
 * realistico: solleva un errore esplicito.
 */
export function optimizeSession(exercises, maxSessionMinutes) {
    const minutes = Number(maxSessionMinutes);
    if (!Number.isInteger(minutes) || minutes < 25 || minutes > 180) {
        throw new Error('Seleziona un tempo disponibile valido da 25 a 180 minuti.');
    }
    if (!Array.isArray(exercises) || exercises.length < 2) {
        throw new Error('La giornata richiede almeno due esercizi prioritari.');
    }

    const secondsBudget = minutes * 60;
    const base = resetGroups(exercises);
    let candidate = choosePlan(base, secondsBudget, minutes);
    let reducedSets = 0;
    let removedExercises = 0;
    let iterations = 0;

    while (candidate.seconds > secondsBudget && iterations++ < 32) {
        // Non ridurre le serie dei primi due esercizi prioritari.
        let targetIndex = -1;
        for (let i = base.length - 1; i >= 2; i--) {
            if (base[i].setsCount > MIN_ACCESSORY_SETS) {
                targetIndex = i;
                break;
            }
        }
        if (targetIndex !== -1) {
            const ex = base[targetIndex];
            ex.setsCount--;
            ex.sets = ex.sets.slice(0, ex.setsCount);
            reducedSets++;
        } else if (base.length > 2) {
            base.pop();
            removedExercises++;
        } else {
            throw new Error(
                `Non è possibile rispettare ${minutes} minuti senza sacrificare i due esercizi prioritari. ` +
                `La seduta minima stimata dura ${Math.ceil(candidate.seconds / 60)} minuti. ` +
                'Aumenta la durata o modifica la distribuzione settimanale.'
            );
        }
        candidate = choosePlan(base, secondsBudget, minutes);
    }
    if (candidate.seconds > secondsBudget) throw new Error('Impossibile rispettare il limite di tempo richiesto.');

    return {
        exercises: candidate.exercises,
        estimatedMinutes: Math.ceil(candidate.seconds / 60),
        estimatedSeconds: candidate.seconds,
        timeBudgetMinutes: minutes,
        groupCount: candidate.groups,
        reducedAccessorySets: reducedSets,
        removedAccessoryExercises: removedExercises
    };
}
