/**
 * Suggerimenti visuali per le serie: mai dati di prestazione confermati.
 * I campi compilati manualmente hanno precedenza sulle proposte.
 * L'RPE suggerito e' un TARGET, non una misura percepita dall'atleta.
 */
const filled = value => value !== null && value !== undefined && String(value).trim() !== '';
const cleanDecimal = value => {
    const s = String(value ?? '').trim().replace(',', '.');
    if (!/^\\d+(?:\\.\\d+)?$/.test(s)) return '';
    const n = Number(s);
    return n > 0 && n <= 700 ? String(n) : '';
};
const firstReps = value => {
    const s = String(value ?? '').trim();
    const match = s.match(/^(\\d{1,2})\\s*(?:-|–|a)\\s*(\\d{1,2})$/i);
    if (match && Number(match[1]) <= Number(match[2])) return match[1];
    return /^\\d{1,2}$/.test(s) && Number(s) >= 1 ? s : '';
};
const targetRpe = value => {
    const s = String(value ?? '').trim().replace(/^@/, '').replace(',', '.');
    if (!/^\\d+(?:\\.\\d+)?$/.test(s)) return '';
    const n = Number(s);
    return n >= 6 && n <= 10 ? String(n) : '';
};
const confirmed = set => set?.isLocked === true || set?.completed === true;
const weightFor = set => cleanDecimal(set?.weight ?? set?.actualKg);
const repsFor = set => {
    const s = String(set?.reps ?? set?.actualReps ?? '').trim();
    // Mantieni le tecniche speciali soltanto se confermate in precedenza.
    return /^\\d{1,3}(?:\\+\\d{1,3})*$/.test(s) ? s : '';
};

function topSetTarget(exercise) {
    const text = String(exercise?.topset ?? '');
    const kg = text.match(/@\\s*(\\d+(?:[.,]\\d+)?)\\s*kg\\b/i);
    const reps = text.match(/\\b1\\s*[x×]\\s*(\\d{1,2})\\s*@/i);
    return { weight: kg ? cleanDecimal(kg[1]) : '',
        reps: reps ? firstReps(reps[1]) : '' };
}

/**
 * Le prime celle vengono valorizzate da target CSV numerici.
 * Dopo ogni check, le prossime righe ancora libere mostrano la serie
 * confermata piu' vicina. Non scrive nulla nel diario fino al check.
 */
export function getSetPrefill(exercise, index) {
    const logs = Array.isArray(exercise?.loggedSets) ? exercise.loggedSets : [];
    const current = logs[index] || {};
    const plan = exercise?.sets?.[index] || {};
    let previous = null;
    for (let i = index - 1; i >= 0; i--) {
        if (confirmed(logs[i]) && weightFor(logs[i]) && repsFor(logs[i])) {
            previous = logs[i];
            break;
        }
    }
    const top = index === 0 ? topSetTarget(exercise) : { weight: '', reps: '' };
    const originalWeight = cleanDecimal(
        plan.targetKg ?? plan.kg ?? (index === 0 ? (exercise?.topsetKgMin ??
            exercise?.topsetKg ?? top.weight) : '') ??
            ''
    );
    const plannedWeight = originalWeight || top.weight ||
        cleanDecimal(exercise?.kgMin) || cleanDecimal(exercise?.kgMax);
    const plannedReps = firstReps(plan.targetReps) ||
        top.reps || firstReps(exercise?.reps ?? exercise?.targetReps);
    const plannedRpe = targetRpe(plan.targetRpe) ||
        targetRpe(exercise?.targetRpe ?? exercise?.rpeTarget ?? exercise?.rpe);
    const source = previous ? 'confirmed_previous_set' : 'csv_target';
    return {
        weight: filled(current.weight) ? String(current.weight)
            : previous ? weightFor(previous) : plannedWeight,
        reps: filled(current.reps) ? String(current.reps)
            : previous ? repsFor(previous) : plannedReps,
        // RPE precedentemente confermato resta un suggerimento, non una misura
        // da registrare automaticamente nella nuova serie.
        rpe: filled(current.rpe) ? String(current.rpe)
            : previous && targetRpe(previous.rpe)
                ? targetRpe(previous.rpe) : plannedRpe,
        source,
        isSuggestedWeight: !filled(current.weight),
        isSuggestedReps: !filled(current.reps),
        isSuggestedRpe: !filled(current.rpe)
    };
}
