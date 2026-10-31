import {excludedFromCoaching} from '../mycoatch/setReview.js';
import {bodyweightMetadata} from '../mycoatch/bodyweight.js';
import {isExerciseSkipped} from './sessionSkip.js';
import {specialSeries,hasDropPrescription} from '../mycoatch/seriesTechnique.js';
import {recommendNextExposure} from '../mycoatch/nextExposure.js';
import { recommendNextSessionReps } from '../mycoatch/nextSessionReps.js';

/**
 * Suggerimenti visuali per le serie: mai dati di prestazione confermati.
 * I campi compilati manualmente hanno precedenza sulle proposte.
 * L'RPE suggerito resta una proposta fino al check: la spunta
 * attesta che anche l'RPE visibile corrisponde alla percezione reale.
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
    return n >= 5 && n <= 10 ? String(n) : '';
};
const confirmed = set => set?.isLocked === true || set?.completed === true;
const weightFor = (set,exercise) => bodyweightMetadata(exercise)&&String(set?.weight??set?.actualKg).trim()==='0'?'0':cleanDecimal(set?.weight ?? set?.actualKg);
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
        // Revisione settimanale esplicitamente approvata: il vecchio peso
        // previsto non viene più precompilato per un target RPE ridotto.
        weight: exercise?.coachWeeklyLoadReview ? '' : weight,
        reps: firstReps(plan.targetReps) || top.reps ||
            firstReps(exercise?.reps ?? exercise?.targetReps),
        rpe: targetRpe(plan.targetRpe) ||
            targetRpe(exercise?.targetRpe ?? exercise?.rpeTarget ?? exercise?.rpe)
    };
}


/**
 * Prescription shown under the editable REPS value (never a performance).
 * Keep exact ranges from the original plan; loggedSets and suggested reps
 * must never replace the prescribed target.
 */
export function getSetRepsTarget(exercise, index) {
    const shown = value => {
        if (value === null || value === undefined || typeof value === 'object') return '';
        const s = String(value).trim();
        return s && s !== '-' && s !== '0' ? s : '';
    };
    const bounds = entry => {
        const min = shown(entry?.minReps), max = shown(entry?.maxReps);
        return min && max ? (min === max ? min : min + '–' + max) : (min || max);
    };
    const plan = exercise?.sets?.[index] || {};
    const general = shown(exercise?.reps) || shown(exercise?.targetReps) || bounds(exercise);
    const specific = shown(plan.targetReps) || bounds(plan);

    // Older 12-column CSVs store an explicit first top set in the Topset
    // column, not in sets[].targetReps. Its reps override only an inherited
    // general-range target, never a distinct per-series prescription.
    const top = index === 0
        ? String(exercise?.topset ?? '').match(/\b1\s*[x×]\s*(\d{1,2}(?:\s*[-–]\s*\d{1,2})?)\s*@/i)?.[1]?.trim() || ''
        : '';
    if (specific && specific !== general) return specific;
    return top || specific || general || '';
}

function repsCompatible(reps, exercise,index) {
    const value = String(reps);
    // Tecniche speciali non vanno trasferite ad un esercizio ordinario.
    if (value.includes('+')) {
        return specialSeries(exercise,index)&&!hasDropPrescription(exercise,index);
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
 * La priorita' per kg e ripetizioni e':
 * 1. valori gia' scritti dall'atleta;
 * 2. serie confermata in questa seduta solo per set omogenei;
 * 3. stessa posizione dell'ultima sessione solo se il piano non cambia;
 * 4. prescrizione corrente CSV/MyCoatch, senza inventare carichi.
 * L'RPE parte invece dal TARGET ATTUALE: la fatica della seduta passata
 * non va copiata in automatico quando il coach l'ha gia' prescritta.
 *
 * Le proposte restano solo sullo schermo. Le statistiche MyCoatch leggono
 * esclusivamente set con checked/confirmed e dati reali.
 */
export function getSetPrefill(exercise, index, { previousExercise = null, crossExposureAdvice = null, nextExposureAdvice = null } = {}) {
    const logs = Array.isArray(exercise?.loggedSets) ? exercise.loggedSets : [];
    const current = logs[index] || {};
    const plan = plannedFor(exercise, index);
    const protocol=exercise?.coachSetProposals?.[index];
    if(protocol && !specialSeries(exercise,index) && !(current.isWarmup||current.warmup||current.is_warmup))return {
        weight:filled(current.weight)?String(current.weight):protocol.weight===null?'':String(protocol.weight),
        reps:filled(current.reps)?String(current.reps):protocol.reps===null?'':String(protocol.reps),
        rpe:filled(current.rpe)?String(current.rpe):protocol.rpe===null?'':String(protocol.rpe),
        source:filled(current.weight)||filled(current.reps)||filled(current.rpe)?'current_entry':'mycoatch_protocol',
        reason:protocol.reason,range:protocol.range,
        isSuggestedWeight:!filled(current.weight),isSuggestedReps:!filled(current.reps),isSuggestedRpe:!filled(current.rpe)
    };

    let previous = null;
    let previousIndex = -1;
    for (let i = index - 1; i >= 0; i--) {
        if (confirmed(logs[i]) && !excludedFromCoaching(logs[i]) && !logs[i].isWarmup && !logs[i].warmup &&
            !logs[i].is_warmup && weightFor(logs[i],exercise) && repsFor(logs[i])) {
            previous = logs[i];
            previousIndex = i;
            break;
        }
    }

    const firstTop = topSetTarget(exercise);
    const baseWeight = cleanDecimal(exercise?.kgMin) || cleanDecimal(exercise?.kgMax);
    const backoffAfterTop = index > 0 && previous === logs[0] &&
        firstTop.weight && baseWeight &&
        Number(firstTop.weight) > Number(baseWeight);
    const earlierPlan = previousIndex >= 0 ? plannedFor(exercise, previousIndex) : null;
    // Protegge anche le progressioni impostate serie per serie: il carico
    // target del set corrente prevale sull'ultima serie confermata.
    const programmedStep = Boolean((plan.weight && earlierPlan?.weight &&
        Number(plan.weight) !== Number(earlierPlan.weight)) ||
        (plan.reps && earlierPlan?.reps && plan.reps !== earlierPlan.reps) ||
        (plan.rpe && earlierPlan?.rpe && plan.rpe !== earlierPlan.rpe));
    // Un carico usato nella serie appena confermata e' utile quando il
    // programma prescrive lavoro omogeneo. Non copiarlo nei back-off, nei
    // ramping set o tra target RPE/ripetizioni differenti.
    const sameSession = Boolean(previous && !backoffAfterTop && !programmedStep &&
        repsCompatible(repsFor(previous),exercise,index) &&
        (!specialSeries(exercise,previousIndex,previous)||specialSeries(exercise,index)));

    if(isExerciseSkipped(previousExercise))previousExercise=null;
    const priorSet = previousExercise?.loggedSets?.[index];
    const priorPlan = previousExercise ? plannedFor(previousExercise, index) : null;
    // L'ultima prestazione e' una scorciatoia, mai un sostituto della
    // prescrizione quando cambiano kg, obiettivo ripetizioni o intensita'.
    const comparablePlan = (!plan.weight ||
        (priorPlan?.weight && Number(plan.weight) === Number(priorPlan.weight))) &&
        (!plan.reps || !priorPlan?.reps || plan.reps === priorPlan.reps) &&
        (!plan.rpe || !priorPlan?.rpe || plan.rpe === priorPlan.rpe) &&
        !exercise?.isDeload && !exercise?.isDeloadWeek &&
        (!specialSeries(previousExercise,index,priorSet)||specialSeries(exercise,index));
    // Prevent copying a 7–9@7 day into a 5–7@8 day, or matching only
    // the first number of two different ranges. Count/slot must also match.
    const priorComparable=Boolean(previousExercise) &&
        String(exercise?.reps??exercise?.targetReps??'').trim()===
            String(previousExercise?.reps??previousExercise?.targetReps??'').trim();
    const fromLastWeek = !exercise?.coachWeeklyLoadReview && !sameSession && priorSet &&
        confirmed(priorSet) && !excludedFromCoaching(priorSet) && !priorSet.isWarmup && !priorSet.warmup &&
        !priorSet.is_warmup && comparablePlan && priorComparable &&
        weightFor(priorSet,exercise) && repsFor(priorSet) &&
        repsCompatible(repsFor(priorSet), exercise,index);
    const nextAdvice = nextExposureAdvice || recommendNextExposure(previousExercise,exercise);
    const currentWarm=Boolean(current.isWarmup||current.warmup||current.is_warmup);
    const workIndex=logs.slice(0,index+1).filter(s=>!s.isWarmup&&!s.warmup&&!s.is_warmup).length-1;
    const advisedWeight = currentWarm?null:nextAdvice?.weight;
    const advisedReps = currentWarm?null:nextAdvice?.reps?.[workIndex];
    const nextReps = fromLastWeek
        ? recommendNextSessionReps(previousExercise, exercise) : null;
    const coachedReps = nextReps?.kind === 'build_reps'
        ? String(nextReps.reps[index]) : null;
    const crossKg = !plan.weight && !exercise?.coachWeeklyLoadReview &&
        Number(crossExposureAdvice?.kg)>0 ? String(crossExposureAdvice.kg) : '';
    const source = filled(current.weight) || filled(current.reps) || filled(current.rpe)
        ? 'current_entry' : sameSession ? 'confirmed_previous_set' :
        coachedReps !== null ? 'mycoatch_next_reps' :
        nextAdvice ? 'mycoatch_next_exposure' : fromLastWeek ? 'confirmed_previous_week' :
        crossKg ? 'estimated_cross_exposure' : 'csv_target';
    const body=bodyweightMetadata(exercise);
    return {
        weight: filled(current.weight) ? String(current.weight)
            : body?.unloaded ? '0' : body && !plan.weight && !fromLastWeek && !sameSession ? '0'
            : !currentWarm && nextAdvice?.suppressLoad ? '' : sameSession ? weightFor(previous,exercise)
                : advisedWeight ? String(advisedWeight) : fromLastWeek ? weightFor(priorSet,exercise) : plan.weight || crossKg,
        reps: filled(current.reps) ? String(current.reps)
            : sameSession ? repsFor(previous)
                : advisedReps ? String(advisedReps) : coachedReps !== null ? coachedReps
                    : fromLastWeek ? repsFor(priorSet) : plan.reps,
        // RPE = obiettivo della seduta corrente, NON fatica percepita
        // nell'ultima sessione. Se il piano non indica un RPE, proponi solo
        // una misura reale e confermata, privilegiando lo stesso esercizio.
        // La spunta attesta l'intera riga e solo allora la salva.
        rpe: filled(current.rpe) ? String(current.rpe) : plan.rpe ||
            (sameSession && targetRpe(previous?.rpe)) ||
            (fromLastWeek && targetRpe(priorSet?.rpe)) || '',
        source,
        reason: nextAdvice ? nextAdvice.reason : coachedReps !== null ? nextReps.reason :
            fromLastWeek ? 'Carico e ripetizioni provenienti da serie precedenti confermate con prescrizione confrontabile.' :
            crossKg ? crossExposureAdvice.reason :
            'Prescrizione attuale senza incremento automatico.',
        isSuggestedWeight: !filled(current.weight),
        isSuggestedReps: !filled(current.reps),
        isSuggestedRpe: !filled(current.rpe)
    };
}
