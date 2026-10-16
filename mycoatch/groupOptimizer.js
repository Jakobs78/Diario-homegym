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

function optionsFor(exercises, availableMinutes, allowGrouping = true) {
    const solo = resetGroups(exercises);
    const variants = [{ label: 'singole', exercises: solo }];
    if (allowGrouping && availableMinutes <= 60) {
        variants.push({ label: 'superset', exercises: groupAccessories(solo, 2) });
    }
    if (allowGrouping && availableMinutes <= 50) {
        variants.push({ label: 'triset', exercises: groupAccessories(solo, 3) });
    }
    return variants.map(option => ({
        ...option,
        seconds: estimateDaySeconds(option.exercises),
        groups: option.exercises.filter(ex => ex.groupType && ex.isGroupLast).length
    }));
}

function choosePlan(exercises, maxSeconds, maxSessionMinutes, allowGrouping = true) {
    const candidates = optionsFor(exercises, maxSessionMinutes, allowGrouping);
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
 * L'ordine di scheda NON rappresenta da solo la priorita': un fondamentale
 * (anchorKey o priorityProtected) puo' essere il terzo slot della Full Body. I primi due esercizi
 * continuano a essere protetti per compatibilita' con piani non marcati.
 */
function protectedExercise(exercise, index) {
    return index < 2 || Boolean(exercise.anchorKey) || Boolean(exercise.priorityProtected);
}

/**
 * Prima accessori facoltativi, poi isolamenti necessari al volume; i
 * multiarticolari non-anchor vengono sacrificati soltanto come ultima risorsa.
 * L'ordine della scheda viene usato solo per sciogliere i pari merito.
 */
function sacrificePriority(exercise) {
    // Gli slot dichiarati facoltativi sono sempre sacrificabili prima dei
    // complementari obbligatori, anche se sono multiarticolari secondari.
    if (exercise.isOptional && exercise.pattern === 'isolation') return 0;
    if (exercise.isOptional) return 1;
    if (exercise.pattern === 'isolation') return 2;
    return 3;
}

function selectLeastEssential(exercises) {
    const removable = exercises.map((exercise, index) =>
        protectedExercise(exercise, index) ? null : ({
            index, priority: sacrificePriority(exercise)
        })).filter(Boolean);
    removable.sort((a, b) => a.priority - b.priority || b.index - a.index);
    return removable[0]?.index ?? -1;
}

/**
 * Ottimizza la durata proteggendo i fondamentali con anchorKey o con
 * priorita' esplicita (es. squat nel terzo slot della Full Body A), oltre ai
 * primi due movimenti. Se il tempo e' insufficiente anche senza complementari
 * non nasconde lo squat/panca/stacco: restituisce un errore esplicito.
 *
 * Per gli accessori taglia prima le serie oltre il minimo, poi elimina
 * l'esercizio. Come ULTIMA risorsa riduce le serie dei movimenti protetti
 * fino a due, senza eliminarli né accorciarne le pause. Se non basta, errore.
 * Le tecniche temporali rimangono riservate agli accessori compatibili.
 */
export function optimizeSession(exercises, maxSessionMinutes, options = {}) {
    const allowGrouping = options.allowGrouping !== false;
    const minutes = Number(maxSessionMinutes);
    if (!Number.isInteger(minutes) || minutes < 25 || minutes > 180) {
        throw new Error('Seleziona un tempo disponibile valido da 25 a 180 minuti.');
    }
    if (!Array.isArray(exercises) || exercises.length < 2) {
        throw new Error('La giornata richiede almeno due esercizi prioritari.');
    }

    const secondsBudget = minutes * 60;
    const base = resetGroups(exercises);
    let candidate = choosePlan(base, secondsBudget, minutes, allowGrouping);
    let reducedSets = 0;
    let reducedPrioritySets = 0;
    let removedExercises = 0;
    let iterations = 0;

    while (candidate.seconds > secondsBudget && iterations++ < 32) {
        const targetIndex = selectLeastEssential(base);
        if (targetIndex >= 0) {
            const exercise = base[targetIndex];
            if (exercise.setsCount > MIN_ACCESSORY_SETS) {
                exercise.setsCount--;
                exercise.sets = exercise.sets.slice(0, exercise.setsCount);
                reducedSets++;
            } else {
                base.splice(targetIndex, 1);
                removedExercises++;
            }
        } else {
            // Il tempo breve puo' richiedere un minimo di volume sui
            // fondamentali, MA mai eliminarli: prima riduciamo quello piu'
            // avanti nella scheda, senza alterare la durata del recupero.
            let priorityIndex = -1;
            for (let i = base.length - 1; i >= 0; i--) {
                if (protectedExercise(base[i], i) &&
                    base[i].setsCount > MIN_ACCESSORY_SETS) {
                    priorityIndex = i;
                    break;
                }
            }
            if (priorityIndex === -1) {
                throw new Error(
                    'Non è possibile rispettare ' + minutes +
                    ' minuti mantenendo almeno due serie per ogni fondamentale. ' +
                    'La seduta minima stimata dura ' +
                    Math.ceil(candidate.seconds / 60) + ' minuti. ' +
                    'Aumenta la durata o modifica lo schema di allenamento.'
                );
            }
            const priority = base[priorityIndex];
            priority.setsCount--;
            priority.sets = priority.sets.slice(0, priority.setsCount);
            reducedPrioritySets++;
        }
        candidate = choosePlan(base, secondsBudget, minutes, allowGrouping);
    }
    if (candidate.seconds > secondsBudget) {
        throw new Error('Impossibile rispettare il limite di tempo richiesto.');
    }

    return {
        exercises: candidate.exercises,
        estimatedMinutes: Math.ceil(candidate.seconds / 60),
        estimatedSeconds: candidate.seconds,
        timeBudgetMinutes: minutes,
        groupCount: candidate.groups,
        reducedAccessorySets: reducedSets,
        reducedPrioritySets,
        removedAccessoryExercises: removedExercises
    };
}
