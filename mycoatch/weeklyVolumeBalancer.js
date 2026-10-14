import { optimizeSession } from './groupOptimizer.js';
import { canonicalExerciseKey } from './exerciseIdentity.js';

const MAX_SESSION_EXERCISES = 6;
const MAX_ACCESSORY_SETS_PER_EXERCISE = 4;
const CROSS_FOCUS_MUSCLES = new Set(['Bicipiti', 'Tricipiti']);

function cloneExercise(exercise) {
    return {
        ...exercise,
        sets: Array.isArray(exercise.sets)
            ? exercise.sets.map(set => ({ ...set })) : []
    };
}

function trackSets(exercises, totals) {
    for (const exercise of exercises || []) {
        const category = exercise.category || 'Non classificato';
        const sets = Number(exercise.setsCount) || 0;
        totals[category] = (totals[category] || 0) + sets;
    }
}

function movementClass(dayName) {
    const label = String(dayName || '').toLowerCase();
    if (label.startsWith('upper')) return 'upper';
    if (label.startsWith('lower')) return 'lower';
    return 'fullbody';
}

function canReceive(donor, recipient, category, receivedCrossFocus) {
    if (donor.dayNumber === recipient.dayNumber) return false;
    const donorType = movementClass(donor.dayName);
    const recipientType = movementClass(recipient.dayName);
    if (donorType === recipientType) return true;
    // Upper -> Lower: ammessi solo pochi accessori braccia, senza trasformare
    // il giorno gambe in una seconda seduta upper.
    return donorType === 'upper' && recipientType === 'lower' &&
        CROSS_FOCUS_MUSCLES.has(category) && !receivedCrossFocus;
}

function additionalSets(exercise, count) {
    const previous = exercise.sets || [];
    const last = previous.at(-1) || {
        targetReps: exercise.reps || '',
        targetKg: exercise.kgMin || '',
        actualReps: '', actualKg: '', completed: false
    };
    const extra = Array.from({ length: count }, (_, i) => ({
        ...last,
        setNumber: previous.length + i + 1,
        actualReps: '',
        actualKg: '',
        completed: false,
        isLocked: false
    }));
    return {
        ...exercise,
        setsCount: exercise.setsCount + count,
        sets: [...previous.map(set => ({ ...set })), ...extra]
    };
}

function donorDeficits(days, requestedDays) {
    const missing = [];
    requestedDays.forEach((requested, dayIndex) => {
        const current = days[dayIndex];
        const plannedByExercise = new Map(
            current.exercises.map(ex => [canonicalExerciseKey(ex.name), ex.setsCount])
        );
        requested.forEach((ex, index) => {
            // Niente trasferimenti di fondamentali o multiarticolari: il tempo
            // corto non deve trasformare una seduta in un giro di compound.
            if (index < 2 || ex.pattern !== 'isolation') return;
            const planned = Number(ex.setsCount) || 0;
            const scheduled = Number(plannedByExercise.get(canonicalExerciseKey(ex.name))) || 0;
            const absent = Math.max(0, planned - scheduled);
            if (absent) {
                missing.push({
                    fromIndex: dayIndex,
                    source: ex,
                    missingSets: absent
                });
            }
        });
    });
    return missing;
}

function proposedAddition(day, source, count) {
    const original = day.exercises.map(cloneExercise);
    const existingIndex = original.findIndex(ex =>
        ex.pattern === 'isolation' && ex.category === source.category);
    if (existingIndex >= 0) {
        const current = original[existingIndex];
        if (current.setsCount + count > MAX_ACCESSORY_SETS_PER_EXERCISE) return null;
        original[existingIndex] = additionalSets(current, count);
        return { exercises: original, targetName: current.name, newExercise: false };
    }
    if (original.length >= MAX_SESSION_EXERCISES) return null;

    const moved = cloneExercise(source);
    moved.setsCount = count;
    moved.sets = moved.sets.slice(0, count).map((set, index) => ({
        ...set, setNumber: index + 1, actualReps: '', actualKg: '',
        completed: false, isLocked: false
    }));
    moved.notes = [moved.notes, '[VOLUME RIDISTRIBUITO] Accessorio spostato da un altro giorno della settimana.']
        .filter(Boolean).join(' | ');
    original.push(moved);
    return { exercises: original, targetName: moved.name, newExercise: true };
}

function fitsWithoutSacrifice(oldExercises, plannedExercises, optimized) {
    if (optimized.exercises.length !== plannedExercises.length) return false;
    // Non dichiarare volume recuperato se, per far posto all'accessorio,
    // l'ottimizzatore ha dovuto ridurre/rimuovere altro volume preesistente.
    if (optimized.removedAccessoryExercises || optimized.reducedAccessorySets) return false;
    return oldExercises.every(ex => {
        const candidate = optimized.exercises.find(next =>
            canonicalExerciseKey(next.name) === canonicalExerciseKey(ex.name)
        );
        return candidate && candidate.setsCount === ex.setsCount;
    });
}

function findReceiver(days, deficit, maxSessionMinutes, crossFocusCount) {
    const from = days[deficit.fromIndex];
    const options = [];

    for (let i = 0; i < days.length; i++) {
        const target = days[i];
        const crossFocus = movementClass(from.dayName) !== movementClass(target.dayName);
        if (!canReceive(from, target, deficit.source.category, crossFocusCount[i])) continue;
        for (let count = 1; count <= Math.min(3, deficit.missingSets); count++) {
            const proposed = proposedAddition(target, deficit.source, count);
            if (!proposed) continue;
            let optimized;
            try {
                optimized = optimizeSession(proposed.exercises, maxSessionMinutes);
            } catch {
                continue;
            }
            if (!fitsWithoutSacrifice(target.exercises, proposed.exercises, optimized)) continue;
            options.push({
                index: i,
                count,
                crossFocus,
                targetName: proposed.targetName,
                plan: optimized,
                sameFocus: !crossFocus,
                distance: Math.abs(i - deficit.fromIndex)
            });
        }
    }

    // Recupera quante più serie possibile, privilegiando una seduta che già
    // allena lo stesso distretto; solo poi considera accessori braccia nel lower.
    options.sort((a, b) =>
        b.count - a.count || Number(b.sameFocus) - Number(a.sameFocus) ||
        a.distance - b.distance || a.plan.estimatedSeconds - b.plan.estimatedSeconds);
    return options[0] || null;
}

function weeklyTotals(days, requestedDays, moves, isDeloadWeek) {
    const wanted = {};
    const scheduled = {};
    for (const day of requestedDays) trackSets(day, wanted);
    for (const day of days) trackSets(day.exercises, scheduled);

    const muscles = [...new Set([...Object.keys(wanted), ...Object.keys(scheduled)])].sort();
    const byMuscle = Object.fromEntries(muscles.map(muscle => [
        muscle, {
            plannedSets: wanted[muscle] || 0,
            scheduledSets: scheduled[muscle] || 0,
            shortfallSets: Math.max(0, (wanted[muscle] || 0) - (scheduled[muscle] || 0))
        }
    ]));

    return {
        method: 'direct_primary_category_sets_not_effective_hypertrophy_volume',
        isDeloadWeek,
        recoveredSets: moves.reduce((sum, move) => sum + move.sets, 0),
        shortfallSets: Object.values(byMuscle)
            .reduce((sum, category) => sum + category.shortfallSets, 0),
        plannedSets: Object.values(wanted).reduce((sum, n) => sum + n, 0),
        scheduledSets: Object.values(scheduled).reduce((sum, n) => sum + n, 0),
        byMuscle,
        moves
    };
}

/**
 * Tenta di recuperare SOLO accessori rimossi/ridotti per la durata massima.
 * Non altera i primi due esercizi, non trasferisce multiarticolari,
 * non forza un gruppo o un recupero più breve. Se non trova spazio utile,
 * conserva il deficit nel report invece di dichiarare un volume inesistente.
 *
 * Le serie vengono conteggiate per categoria primaria del database, non
 * rappresentano la somma di tutte le serie effettive per un muscolo.
 */
export function rebalanceWeeklyAccessories(days, requestedDays, maxSessionMinutes, options = {}) {
    if (!Array.isArray(days) || !Array.isArray(requestedDays) ||
        days.length !== requestedDays.length) {
        throw new Error('Riequilibrio settimanale: giorni originali non coerenti.');
    }
    const isDeloadWeek = Boolean(options.isDeloadWeek);
    const updatedDays = days.map(day => ({
        ...day,
        exercises: day.exercises.map(cloneExercise),
        transferredAccessorySetsIn: 0,
        transferredAccessorySetsOut: 0
    }));
    const moves = [];
    const crossFocusCount = updatedDays.map(() => 0);

    if (!isDeloadWeek) {
        // Round-robin per evitare di usare tutti i giorni liberi per un solo
        // muscolo (es. bicipiti), lasciando esclusi gli altri (es. tricipiti).
        const deficits = donorDeficits(updatedDays, requestedDays);
        let madeProgress = true;
        while (madeProgress) {
            madeProgress = false;
            for (const deficit of deficits) {
                if (deficit.missingSets <= 0) continue;
                const choice = findReceiver(
                    updatedDays, deficit, maxSessionMinutes, crossFocusCount
                );
                if (!choice) continue;

                const donor = updatedDays[deficit.fromIndex];
                const recipient = updatedDays[choice.index];
                recipient.exercises = choice.plan.exercises;
                recipient.estimatedMinutes = choice.plan.estimatedMinutes;
                recipient.estimatedSeconds = choice.plan.estimatedSeconds;
                recipient.groupCount = choice.plan.groupCount;
                recipient.transferredAccessorySetsIn += choice.count;
                donor.transferredAccessorySetsOut += choice.count;
                if (choice.crossFocus) crossFocusCount[choice.index]++;

                moves.push({
                    fromDay: donor.dayNumber,
                    toDay: recipient.dayNumber,
                    muscle: deficit.source.category,
                    sourceExercise: deficit.source.name,
                    targetExercise: choice.targetName,
                    sets: choice.count,
                    crossFocus: choice.crossFocus
                });
                deficit.missingSets -= choice.count;
                madeProgress = true;
            }
        }
    }

    return {
        days: updatedDays,
        report: weeklyTotals(updatedDays, requestedDays, moves, isDeloadWeek)
    };
}
