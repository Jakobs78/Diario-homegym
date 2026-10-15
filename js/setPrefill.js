/**
 * Suggerimenti visuali per le serie: mai dati di prestazione confermati.
 * I campi compilati manualmente hanno precedenza sulle proposte.
 * L'RPE suggerito e' un TARGET, non una misura percepita dall'atleta.
 */
const filled = value => value !== null && value !== undefined && String(value).trim() !== '';
const cleanDecimal = value => {
    const s = String(value ?? '').trim().replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(s)) return '';
    const n = Number(s);
    return n > 0 && n <= 700 ? String(n) : '';
};
const firstReps = value => {
    const s = String(value ?? '').trim();
    const match = s.match(/^(\d{1,2})\s*(?:-|–|a)\s*(\d{1,2})$/i);
    if (match && Number(match[1]) <= Number(match[2])) return match[1];
    return /^\d{1,2}$/.test(s) && Number(s) >= 1 ? s : '';
};
const targetRpe = value => {
    const s = String(value ?? '').trim().replace(/^@/, '').replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(s)) return '';
    const n = Number(s);
    return n >= 6 && n <= 10 ? String(n) : '';
};
const confirmed = set => set?.isLocked === true || set?.completed === true;
const weightFor = set => cleanDecimal(set?.weight ?? set?.actualKg);
const repsFor = set => {
    const s = String(set?.reps ?? set?.actualReps ?? '').trim();
    // Mantieni le tecniche speciali soltanto se confermate in precedenza.
    return /^\d{1,3}(?:\+\d{1,3})*$/.test(s) ? s : '';
};

function topSetTarget(exercise) {
    const text = String(exercise?.topset ?? '');
    const kg = text.match(/@\s*(\d+(?:[.,]\d+)?)\s*kg\b/i);
    const reps = text.match(/\b1\s*[x×]\s*(\d{1,2})\s*@/i);
    return { weight: kg ? cleanDecimal(kg[1]) : '',
        reps: reps ? firstReps(reps[1]) : '' };
}


// Valori PREVISTI per ciascuna posizione. Mantiene distinti i top set dai
// back-off e non trasforma intervalli come "8-12" in ripetizioni effettuate.
function plannedFor(exercise, index) {
    const plan = exercise?.sets?.[index] || {};
    const top = index === 0 ? topSetTarget(exercise) : { weight: '', reps: '' };
    const weight = cleanDecimal(
        plan.targetKg ?? plan.kg ?? (index === 0
            ? (exercise?.topsetKgMin ?? exercise?.topsetKg ?? top.weight)
            : '')
    ) || top.weight ||
        cleanDecimal(exercise?.kgMin) || cleanDecimal(exercise?.kgMax);
    return {
        weight,
        reps: firstReps(plan.targetReps) || top.reps ||
            firstReps(exercise?.reps ?? exercise?.targetReps),
        rpe: targetRpe(plan.targetRpe) ||
            targetRpe(exercise?.targetRpe ?? exercise?.rpeTarget ?? exercise?.rpe)
    };
}

function repsCompatible(reps, exercise) {
    const value = String(reps);
    // Tecniche speciali non vanno trasferite ad un esercizio ordinario.
    if (value.includes('+')) {
        return Boolean(exercise?.isDropset ||
            exercise?.groupType === 'dropset');
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 100) return false;
    const range = String(exercise?.reps ?? exercise?.targetReps ?? '').trim();
    const m = range.match(/^(\d+)\s*(?:-|–|a)\s*(\d+)$/i);
    if (m) return n >= Number(m[1]) && n <= Number(m[2]);
    // L'esercizio puo' avere una singola prescrizione numerica ma eseguire
    // una ripetizione diversa: non ci serve inventare una validazione clinica.
    return true;
}

/**
 * Prefill da CSV e, nelle settimane successive, da serie davvero confermate
 * nello STESSO mesociclo. Per sicurezza e confrontabilita' si confronta la
 * stessa posizione (top set con top set, back-off con back-off).
 *
 * La priorita' e':
 * 1. modifiche gia' scritte dall'atleta;
 * 2. serie confermata nella seduta corrente (se non e' un top-set da cui
 *    non si deve ereditare il carico nei back-off);
 * 3. stessa serie nella settimana precedente quando il piano kg non cambia;
 * 4. prescrizione valida del CSV; mai carichi inventati.
 *
 * Le proposte restano solo sullo schermo. Le statistiche MyCoatch leggono
 * esclusivamente set con checked/confirmed e dati reali.
 */
export function getSetPrefill(exercise, index, { previousExercise = null } = {}) {
    const logs = Array.isArray(exercise?.loggedSets) ? exercise.loggedSets : [];
    const current = logs[index] || {};
    const plan = plannedFor(exercise, index);
    let previous = null;
    for (let i = index - 1; i >= 0; i--) {
        if (confirmed(logs[i]) && !logs[i].isWarmup && !logs[i].warmup &&
            !logs[i].is_warmup && weightFor(logs[i]) && repsFor(logs[i])) {
            previous = logs[i];
            break;
        }
    }

    const firstTop = topSetTarget(exercise);
    const baseWeight = cleanDecimal(exercise?.kgMin) || cleanDecimal(exercise?.kgMax);
    const backoffAfterTop = index > 0 && previous === logs[0] &&
        firstTop.weight && baseWeight &&
        Number(firstTop.weight) > Number(baseWeight);
    const sameSession = Boolean(previous && !backoffAfterTop);

    const priorSet = previousExercise?.loggedSets?.[index];
    const priorPlan = previousExercise ? plannedFor(previousExercise, index) : null;
    const comparablePlan = !plan.weight ||
        (priorPlan?.weight && Number(plan.weight) === Number(priorPlan.weight));
    const fromLastWeek = !sameSession && priorSet &&
        confirmed(priorSet) && !priorSet.isWarmup && !priorSet.warmup &&
        !priorSet.is_warmup && comparablePlan &&
        weightFor(priorSet) && repsFor(priorSet) &&
        repsCompatible(repsFor(priorSet), exercise);
    const source = sameSession ? 'confirmed_previous_set' :
        fromLastWeek ? 'confirmed_previous_week' : 'csv_target';
    return {
        weight: filled(current.weight) ? String(current.weight)
            : sameSession ? weightFor(previous)
                : fromLastWeek ? weightFor(priorSet) : plan.weight,
        reps: filled(current.reps) ? String(current.reps)
            : sameSession ? repsFor(previous)
                : fromLastWeek ? repsFor(priorSet) : plan.reps,
        // Il valore visibile e' sempre una proposta, NON un RPE misurato.
        // Il check registra RPE solo se editato esplicitamente dall'atleta.
        rpe: filled(current.rpe) ? String(current.rpe)
            : previous && targetRpe(previous.rpe)
                ? targetRpe(previous.rpe) : plan.rpe,
        source,
        isSuggestedWeight: !filled(current.weight),
        isSuggestedReps: !filled(current.reps),
        isSuggestedRpe: !filled(current.rpe)
    };
}
