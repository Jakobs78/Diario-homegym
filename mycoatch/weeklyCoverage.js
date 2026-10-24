import { EXERCISE_DATABASE } from './exercisesDB.js';
import { canonicalExerciseKey } from './exerciseIdentity.js';
import { summarizeWeeklyMuscleVolume, VOLUME_ACCOUNTING_METHOD } from './volumeAccounting.js';

const byName = new Map(EXERCISE_DATABASE.map(ex => [canonicalExerciseKey(ex.name), ex]));
const TRACKED_GROUPS = Object.freeze([
    'Petto', 'Back_Lats', 'Back_Thickness', 'Spalle', 'Quadricipiti',
    'Femorali', 'Glutei', 'Polpacci', 'Bicipiti', 'Tricipiti', 'Core'
]);
const MOVEMENT_GROUPS = Object.freeze([
    'horizontal_push', 'vertical_push', 'vertical_pull',
    'horizontal_pull', 'squat', 'hinge', 'hip_thrust'
]);

/**
 * Verifica della copertura specifica sul piano EFFETTIVAMENTE programmato.
 * Ogni conteggio è una serie primaria/diretta; il lavoro indiretto rimane
 * disponibile separatamente nel report generale.
 *
 * L'assenza di un esercizio non è una diagnosi di scarso sviluppo muscolare.
 * Per la flessione del ginocchio si riconoscono solo le varianti realmente
 * presenti nel catalogo corrente, evitando di equiparare uno stacco rumeno
 * a un leg curl.
 */
const FUNCTIONAL_PATTERNS = Object.freeze({
    rearDeltoids: {
        label: 'Deltoidi posteriori (isolamento)',
        applies: meta => meta.shoulderHeadIsolation === 'posteriore'
    },
    kneeFlexion: {
        label: 'Femorali (flessione del ginocchio)',
        applies: meta => meta.category === 'Femorali' &&
            meta.pattern === 'isolation' && /leg curl|hamstring walkout/i.test(meta.name)
    },
    calves: {
        label: 'Polpacci (diretto)',
        applies: meta => meta.category === 'Polpacci'
    },
    core: {
        label: 'Addominali e core (diretto)',
        applies: meta => meta.category === 'Core'
    }
});

function countFunctionalSets(days = []) {
    const counts = Object.fromEntries(Object.keys(FUNCTIONAL_PATTERNS).map(key => [key, 0]));
    for (const day of days) {
        const exercises = Array.isArray(day) ? day : (day?.exercises || []);
        for (const exercise of exercises) {
            const meta = byName.get(canonicalExerciseKey(exercise.name));
            const sets = Number(exercise.setsCount);
            if (!meta || !Number.isInteger(sets) || sets < 1) continue;
            for (const [key, rule] of Object.entries(FUNCTIONAL_PATTERNS)) {
                if (rule.applies(meta)) counts[key] += sets;
            }
        }
    }
    return counts;
}


/**
 * Controllo DOPO il taglio al limite di tempo: la presenza di uno slot nel
 * template non significa che sia rimasto nel CSV. Le serie secondarie NON
 * sono considerate serie dirette intere.
 */
export function auditWeeklyCoverage(days, templates = [], requestedDays = []) {
    const actualFunctions = countFunctionalSets(days);
    const intendedFunctions = requestedDays.length
        ? countFunctionalSets(requestedDays) : null;
    const functionalCoverage = Object.fromEntries(
        Object.entries(FUNCTIONAL_PATTERNS).map(([key, rule]) => {
            const scheduledSets = actualFunctions[key];
            const plannedSets = intendedFunctions ? intendedFunctions[key] : null;
            return [key, {
                label: rule.label,
                scheduledSets,
                plannedSets,
                shortfallSets: plannedSets === null ? null :
                    Math.max(0, plannedSets - scheduledSets),
                // 'not_planned' can also mean unavailable equipment or a
                // different chosen strategy; it is not proof of no stimulus.
                status: scheduledSets === 0
                    ? (plannedSets > 0 ? 'omitted_after_optimization' : 'not_programmed')
                    : (plannedSets !== null && scheduledSets < plannedSets
                        ? 'reduced_after_optimization' : 'present')
            }];
        })
    );
    const direct = Object.fromEntries(TRACKED_GROUPS.map(muscle => [muscle, 0]));
    const indirect = Object.fromEntries(TRACKED_GROUPS.map(muscle => [muscle, 0]));
    const patterns = Object.fromEntries(MOVEMENT_GROUPS.map(pattern => [pattern, 0]));
    const anchors = [];
    const exercisesUnknown = [];
    const shoulderHeadDirectIsolationSets = { laterale: 0, posteriore: 0 };
    let verticalPressSets = 0;
    const fractionalVolume = summarizeWeeklyMuscleVolume(days);

    (days || []).forEach((day, dayIndex) => {
        const actual = day.exercises || [];
        const expected = templates[dayIndex]?.slots || [];
        for (const slot of expected) {
            if (!slot.anchor) continue;
            const found = actual.find(ex =>
                ex.category === slot.muscle && ex.pattern === slot.pattern);
            anchors.push({
                lift: slot.anchor,
                dayNumber: day.dayNumber,
                exercise: found?.name || null,
                present: Boolean(found)
            });
        }
        for (const exercise of actual) {
            const meta = byName.get(canonicalExerciseKey(exercise.name));
            if (!meta) {
                exercisesUnknown.push(exercise.name);
                continue;
            }
            const count = Number(exercise.setsCount);
            if (!Number.isInteger(count) || count < 1) continue;
            direct[meta.category] = (direct[meta.category] || 0) + count;
            if (meta.shoulderHeadIsolation) {
                shoulderHeadDirectIsolationSets[meta.shoulderHeadIsolation] += count;
            }
            if (meta.category === 'Spalle' && meta.pattern === 'vertical_push') {
                verticalPressSets += count;
            }
            if (Object.hasOwn(patterns, meta.pattern)) patterns[meta.pattern] += count;
            for (const muscle of meta.secondaryMuscles) {
                indirect[muscle] = (indirect[muscle] || 0) + 1;
            }
        }
    });

    // Indicare l'assenza di lavoro diretto non significa che il distretto
    // non sia allenato indirettamente. I rapporti restano descrittivi.
    const notDirectlyCovered = TRACKED_GROUPS.filter(muscle => !direct[muscle]);
    const warnings = [];
    for (const anchor of anchors) {
        if (!anchor.present) warnings.push(
            'Fondamentale ' + anchor.lift + ' non presente nel giorno ' + anchor.dayNumber
        );
    }
    // Volume is a programming estimate, never a diagnosis. Flag large
    // imbalances for preview without inserting unrequested series.
    const backSets = (direct.Back_Lats || 0) + (direct.Back_Thickness || 0);
    if(direct.Petto >= 8 && backSets < direct.Petto * .75)
        warnings.push('Volume diretto di dorso (' + backSets + ') inferiore al petto (' + direct.Petto + '): verifica priorità e recupero prima di riequilibrare.');
    if(shoulderHeadDirectIsolationSets.laterale >= 4 && shoulderHeadDirectIsolationSets.posteriore === 0)
        warnings.push('Deltoide posteriore: nessuna serie di isolamento dedicata. Verifica se serve in base al lavoro di tirata e alle priorità.');
    if (exercisesUnknown.length) warnings.push(
        'Esercizi non riconosciuti nel catalogo: ' + exercisesUnknown.join(', ')
    );
    for (const item of Object.values(functionalCoverage)) {
        if (item.status === 'omitted_after_optimization') {
            warnings.push(item.label + ': ' + item.plannedSets +
                ' serie previste prima della selezione per il tempo, nessuna serie diretta rimasta. ' +
                'Verifica la distribuzione; lo stimolo indiretto non è conteggiato come lavoro diretto.');
        } else if (item.status === 'reduced_after_optimization') {
            warnings.push(item.label + ': riduzione da ' + item.plannedSets +
                ' a ' + item.scheduledSets + ' serie dirette dopo l’ottimizzazione.');
        } else if (item.status === 'not_programmed' && (days || []).length > 0) {
            warnings.push(item.label + ': nessuna serie diretta nella settimana. ' +
                'Controlla obiettivi e attrezzatura; non implica assenza di stimolo indiretto.');
        }
    }
    return {
        daysOrder: (days || []).map(day => String(day.dayName || '').split(' ')[0]),
        anchors,
        allPriorityLiftsPresent: anchors.every(entry => entry.present),
        directSetsByMuscle: direct,
        shoulderHeadCoverage: {
            directIsolationSets: shoulderHeadDirectIsolationSets,
            verticalPressSets,
            note: 'Conteggi di programmazione, non misure di attivazione, recupero o ipertrofia.'
        },
        indirectExerciseExposuresByMuscle: indirect,
        // Crediti frazionari, distinti dalle esposizioni legacy.
        fractionalVolumeByMuscle: fractionalVolume.byMuscle,
        fractionalAccountingMethod: VOLUME_ACCOUNTING_METHOD,
        fractionallyCountedPhysicalSets: fractionalVolume.physicalSets,
        setsByMovement: patterns,
        notDirectlyCovered,
        functionalCoverage,
        warnings,
        accounting: 'direct_primary_sets_and_indirect_exercise_exposures_not_effective_sets'
    };
}
