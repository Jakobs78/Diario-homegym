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
 * Controllo DOPO il taglio al limite di tempo: la presenza di uno slot nel
 * template non significa che sia rimasto nel CSV. Le serie secondarie NON
 * sono considerate serie dirette intere.
 */
export function auditWeeklyCoverage(days, templates = []) {
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
        warnings,
        accounting: 'direct_primary_sets_and_indirect_exercise_exposures_not_effective_sets'
    };
}
