import { EXERCISE_DATABASE } from './exercisesDB.js';

/**
 * Profilo temporaneo per la proposta, distinto dallo storico dei workout.
 * Nessuna diagnosi, nessuna stima arbitraria dell'1RM e nessuna persistenza
 * automatica di preferenze/limitazioni personali.
 */
export const EXPERIENCE_LEVELS = Object.freeze(['beginner', 'intermediate', 'advanced']);
export const CALIBRATION_MODES = Object.freeze(['guided', 'regular']);
export const MUSCLE_PRIORITIES = Object.freeze([
    'Petto', 'Back_Lats', 'Back_Thickness', 'Spalle', 'Quadricipiti',
    'Femorali', 'Glutei', 'Bicipiti', 'Tricipiti', 'Polpacci', 'Core'
]);
export const LIFT_NAMES = Object.freeze(['bench', 'squat', 'military', 'hinge']);
export const MAX_REFERENCE_AGE_DAYS = 90;
export const AVOIDABLE_LIFTS = Object.freeze([
    'Hamstring Walkout a Corpo Libero',
    'Panca Piana con Bilanciere',
    'Squat con Bilanciere',
    'Military Press con Bilanciere',
    'Stacco da Terra Convenzionale',
    'Stacco Rumeno (RDL)'
]);

function finiteNumber(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const text = String(value).trim().replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
}

function validIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
        ? date : null;
}

function calendarAgeDays(date, today = new Date()) {
    const reference = validIsoDate(date);
    if (!reference || !Number.isFinite(today?.getTime?.())) return null;
    const midnightUtcToday = Date.UTC(
        today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()
    );
    return Math.round((midnightUtcToday - reference.getTime()) / 86400000);
}

function ensureKnownExcluded(excluded) {
    if (!Array.isArray(excluded) || excluded.some(item =>
        typeof item !== 'string' || !AVOIDABLE_LIFTS.includes(item))) {
        throw new Error('Uno degli esercizi da evitare non è riconosciuto.');
    }
    return [...new Set(excluded)];
}

function normalizeReference(raw, lift) {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw !== 'object' || Array.isArray(raw) ||
        Object.keys(raw).some(key => !['kg', 'reps', 'rpe', 'performedOn'].includes(key))) {
        throw new Error('Riferimento di carico non valido per ' + lift + '.');
    }
    const kg = finiteNumber(raw.kg);
    const reps = finiteNumber(raw.reps);
    const rpe = finiteNumber(raw.rpe);
    const empty = [raw.kg, raw.reps, raw.rpe].every(value =>
        value === '' || value === null || value === undefined);
    if (empty) return null;
    if (kg === null || kg <= 0 || kg > 500 ||
        !Number.isInteger(reps) || reps < 1 || reps > 30) {
        throw new Error('Per ' + lift + ' inserisci kg e ripetizioni reali, entrambi validi.');
    }
    if (raw.rpe !== '' && raw.rpe !== null && raw.rpe !== undefined &&
        (rpe === null || rpe < 6 || rpe > 10)) {
        throw new Error('RPE di riferimento non valido per ' + lift + ' (6–10).');
    }
    const performedOn = String(raw.performedOn ?? '').trim();
    if (performedOn && (!validIsoDate(performedOn) ||
        calendarAgeDays(performedOn) < 0)) {
        throw new Error('Data della serie non valida per ' + lift + ': non può essere futura.');
    }
    return { kg, reps, rpe, performedOn: performedOn || null };
}

export function normalizeAthleteProfile(input = null) {
    if (input === null || input === undefined) return null; // vecchie integrazioni
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Profilo atleta non valido.');
    }
    const experience = String(input.experience ?? '');
    if (!EXPERIENCE_LEVELS.includes(experience)) {
        throw new Error('Seleziona il livello di esperienza: principiante, intermedio o avanzato.');
    }
    const calibration = String(input.calibration ?? 'guided');
    if (!CALIBRATION_MODES.includes(calibration)) {
        throw new Error('Modalità di calibrazione non valida.');
    }
    const priorityMuscle = input.priorityMuscle || null;
    if (priorityMuscle !== null && !MUSCLE_PRIORITIES.includes(priorityMuscle)) {
        throw new Error('Gruppo muscolare prioritario non valido.');
    }
    const excludedExercises = ensureKnownExcluded(input.excludedExercises ?? []);
    const rawReferences = input.referenceLoads || {};
    if (!rawReferences || typeof rawReferences !== 'object' ||
        Array.isArray(rawReferences) ||
        Object.keys(rawReferences).some(lift => !LIFT_NAMES.includes(lift))) {
        throw new Error('Riferimenti di carico non validi.');
    }
    const referenceLoads = {};
    for (const lift of LIFT_NAMES) {
        const reference = normalizeReference(rawReferences[lift], lift);
        if (reference) referenceLoads[lift] = reference;
    }
    return {
        version: 1, experience, calibration, priorityMuscle,
        excludedExercises, referenceLoads
    };
}

export function parseRepsRange(reps) {
    const s = String(reps ?? '').trim();
    const match = s.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
    if (match && Number(match[1]) <= Number(match[2])) {
        return { min: Number(match[1]), max: Number(match[2]) };
    }
    const single = s.match(/^\d{1,2}$/);
    if (single) return { min: Number(s), max: Number(s) };
    return null;
}

/**
 * Un riferimento autodichiarato senza data non è verificabilmente recente.
 * Ne ammettiamo l'uso SOLO come valore provvisorio per la medesima variante,
 * con RPE misurato, ripetizioni confrontabili e data non oltre 90 giorni.
 * Non è una prova massimale e non modifica mai lo storico.
 */
export function eligibleReferenceLoad(profile, lift, prescribedReps, { today = new Date() } = {}) {
    const raw = profile?.referenceLoads?.[lift];
    const range = parseRepsRange(prescribedReps);
    const ageDays = calendarAgeDays(raw?.performedOn, today);
    if (!raw || !range || ageDays === null || ageDays < 0 ||
        ageDays > MAX_REFERENCE_AGE_DAYS ||
        raw.rpe === null || raw.rpe < 6 || raw.rpe > 8 ||
        raw.reps < range.min || raw.reps > range.max) return null;
    return raw.kg;
}

export function onboardingPlan(profile, hasConfirmedHistory) {
    if (!profile) return {
        experience: null, calibrationWeek: false,
        active: false, volumeCap: null, rpeTargets: null
    };
    const calibrationWeek = !hasConfirmedHistory && profile.calibration === 'guided';
    const beginner = profile.experience === 'beginner';
    return {
        experience: profile.experience,
        active: true,
        calibrationWeek,
        volumeCap: beginner ? 2 : profile.experience === 'intermediate' ? 3 : null,
        // Il RPE e' una prescrizione di impegno, non un RPE "misurato".
        rpeTargets: calibrationWeek
            ? (beginner ? ['6.5', '7.0', '7.5', '6.0'] :
                profile.experience === 'intermediate'
                    ? ['7.0', '7.5', '8.0', '6.5']
                    : ['7.5', '8.0', '8.5', '6.5'])
            : null
    };
}

export function profileSummary(profile, plan) {
    if (!profile) return null;
    const labels = { beginner: 'Principiante', intermediate: 'Intermedio',
        advanced: 'Avanzato' };
    return {
        level: labels[profile.experience],
        calibrationWeek: Boolean(plan.calibrationWeek),
        priorityMuscle: profile.priorityMuscle,
        excludedExercises: [...profile.excludedExercises],
        referencesProvided: Object.keys(profile.referenceLoads),
        caution: 'Carichi dichiarati dall’atleta: non sono test massimali né risultati confermati nel diario.'
    };
}

