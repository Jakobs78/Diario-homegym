import { EXERCISE_DATABASE, DEFAULT_HOME_GYM_EQUIPMENT, DEFAULT_HOME_GYM_ACCESSORIES } from './exercisesDB.js';
import { canonicalExerciseKey } from './exerciseIdentity.js';

/**
 * Le 4 alzate-ancora rappresentano gli schemi prioritari, non un obbligo
 * anatomico per ogni atleta. L'utente può scegliere una variante equivalente.
 */
export const FUNDAMENTAL_CHOICES = Object.freeze({
    bench: Object.freeze([
        'Panca Piana con Bilanciere', 'Panca Inclinata con Manubri',
        'Panca Inclinata con Bilanciere', 'Push-up a Terra'
    ]),
    squat: Object.freeze([
        'Squat con Bilanciere', 'Front Squat',
        'Goblet Squat con Manubrio', 'Bulgarian Split Squat con Manubri'
    ]),
    military: Object.freeze([
        'Military Press con Bilanciere', 'Spinte con Manubri da Seduto'
    ]),
    hinge: Object.freeze([
        'Stacco Rumeno (RDL)', 'Stacco da Terra Convenzionale'
    ])
});

export const OPTIONAL_ACCESSORIES = Object.freeze([
    Object.freeze({ id: 'incline_bench', label: 'Panca inclinabile' }),
    Object.freeze({ id: 'pullup_bar', label: 'Barra per trazioni' }),
    Object.freeze({ id: 'ankle_strap', label: 'Cavigliera per cavi' }),
    Object.freeze({ id: 'ez_bar', label: 'Bilanciere EZ' }),
    Object.freeze({ id: 'dip_station', label: 'Parallele per dip' })
]);

const catalogByName = new Map(EXERCISE_DATABASE.map(exercise => [
    canonicalExerciseKey(exercise.name), exercise
]));

function normalizeList(value, fallback, allowed, label) {
    if (value === undefined || value === null) return [...fallback];
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' ||
        !allowed.includes(item))) {
        throw new Error('Attrezzatura non valida (' + label + ').');
    }
    return [...new Set(value)];
}

export function normalizeSelectionPreferences(config = {}) {
    const equipmentIds = [...DEFAULT_HOME_GYM_EQUIPMENT, 'machine'];
    const accessoryIds = [...DEFAULT_HOME_GYM_ACCESSORIES,
        ...OPTIONAL_ACCESSORIES.map(x => x.id)];
    const availableEquipment = normalizeList(
        config.availableEquipment, DEFAULT_HOME_GYM_EQUIPMENT, equipmentIds, 'base'
    );
    const availableAccessories = normalizeList(
        config.availableAccessories, DEFAULT_HOME_GYM_ACCESSORIES, accessoryIds, 'accessori'
    );
    const raw = config.preferredLifts ?? {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
        Object.keys(raw).some(key => !Object.hasOwn(FUNDAMENTAL_CHOICES, key))) {
        throw new Error('Preferenze dei fondamentali non valide.');
    }
    const excludedExercises = config.excludedExercises ?? [];
    if (!Array.isArray(excludedExercises) ||
        excludedExercises.some(name => typeof name !== 'string' ||
            !EXERCISE_DATABASE.some(exercise => exercise.name === name))) {
        throw new Error('Lista di esercizi da evitare non valida.');
    }
    const excluded = [...new Set(excludedExercises)];
    const preferredLifts = {};
    for (const [key, value] of Object.entries(raw)) {
        if (value === '' || value === null || value === 'auto') continue;
        if (typeof value !== 'string' || !FUNDAMENTAL_CHOICES[key].includes(value)) {
            throw new Error('Variante del fondamentale non riconosciuta: ' + key);
        }
        preferredLifts[key] = value;
    }
    for (const name of Object.values(preferredLifts)) {
        if (excluded.includes(name)) {
            throw new Error('La variante selezionata è fra gli esercizi da evitare: ' + name);
        }
    }
    return { availableEquipment, availableAccessories, preferredLifts,
        ...(config.excludedExercises === undefined ? {} : { excludedExercises: excluded }) };
}

export function isExerciseAvailable(exercise, preferences) {
    return preferences.availableEquipment.includes(exercise.equipment) &&
        !(preferences.excludedExercises || []).includes(exercise.name) &&
        (exercise.requires || []).every(x => preferences.availableAccessories.includes(x));
}

export function defaultFundamentalName(key, goal) {
    if (key === 'bench') return 'Panca Piana con Bilanciere';
    if (key === 'squat') return 'Squat con Bilanciere';
    if (key === 'military') return 'Military Press con Bilanciere';
    if (key === 'hinge') return goal === 'strength'
        ? 'Stacco da Terra Convenzionale' : 'Stacco Rumeno (RDL)';
    return null;
}

const SLOT_PREFERENCES = {
    'Back_Lats:vertical_pull': [
        'Lat Machine con Triangolo', 'Lat Machine Presa Larga',
        'Trazioni alla Sbarra (Pull-up)', 'Lat Machine Presa Supina'
    ],
    'Back_Thickness:horizontal_pull': [
        'Rematore con Manubrio a Un Braccio', 'Pulley Basso a T',
        'Rematore con Bilanciere', 'Rematore con Manubri su Panca Inclinata'
    ],
    'Petto:horizontal_push': [
        'Panca Inclinata con Manubri', 'Panca Inclinata con Bilanciere',
        'Push-up a Terra', 'Panca Piana con Bilanciere'
    ],
    'Petto:isolation': ['Croci ai Cavi in Allungamento'],
    'Quadricipiti:squat': [
        'Front Squat', 'Bulgarian Split Squat con Manubri',
        'Affondi con Manubri', 'Goblet Squat con Manubrio'
    ],
    'Femorali:hinge': ['Stacco Rumeno (RDL)', 'Stacco da Terra Convenzionale'],
    'Glutei:hip_thrust': [
        'Hip Thrust con Bilanciere', 'Glute Bridge con Bilanciere', 'Pull-through ai Cavi'
    ],
    'Femorali:isolation': ['Leg Curl ai Cavi (cavigliera)', 'Leg Curl Steso'],
    'Spalle:isolation': [
        'Alzate Laterali con Manubri', 'Alzate Laterali ai Cavi',
        'Alzate Posteriori con Manubri', 'Face Pull ai Cavi'
    ],
    'Bicipiti:isolation': [
        'Curl Manubri su Panca Inclinata', 'Curl ai Cavi Bassi',
        'Curl Martello con Manubri', 'Curl con Bilanciere EZ'
    ],
    'Tricipiti:isolation': [
        'Pushdown ai Cavi con Corda', 'Estensioni Tricipiti Sopra la Testa ai Cavi',
        'Pushdown ai Cavi', 'French Press con Bilanciere EZ'
    ],
    'Polpacci:isolation': ['Calf Raise in Piedi con Manubri', 'Calf Raise Monopodalico'],
    'Core:isolation': ['Crunch ai Cavi', 'Pallof Press ai Cavi', 'Reverse Crunch su Panca']
};

function scoreCandidate(exercise, slot, options) {
    const ranking = slot.prefer || SLOT_PREFERENCES[slot.muscle + ':' + slot.pattern] || [];
    const position = ranking.indexOf(exercise.name);
    const plannedCount = options.weeklyCounts?.get(exercise.id) || 0;
    const isHistorical = options.previousName &&
        canonicalExerciseKey(options.previousName) === canonicalExerciseKey(exercise.name);

    // Ripetibilita' tra mesocicli e copertura settimanale hanno precedenza
    // sul semplice cnsCost. Nessun sorteggio casuale.
    return (isHistorical ? 100 : 0) +
        (position === -1 ? 0 : 30 - position * 4) -
        plannedCount * 18 -
        Math.max(0, exercise.estimatedFatigue - 6) * 0.5;
}

/**
 * Sceglie una variante coerente con categoria, movimento e attrezzatura.
 * Mai fallback silenzioso verso un movimento diverso. Preferenze esplicite
 * non disponibili => errore chiaro. Slot facoltativi => null + report altrove.
 */
export function selectExerciseForSlot(slot, options = {}) {
    const preferences = options.preferences || normalizeSelectionPreferences();
    const usedNames = new Set((options.selectedToday || []).map(canonicalExerciseKey));
    const candidates = EXERCISE_DATABASE.filter(ex =>
        ex.category === slot.muscle && ex.pattern === slot.pattern &&
        !usedNames.has(canonicalExerciseKey(ex.name)) &&
        isExerciseAvailable(ex, preferences)
    );

    if (slot.anchor) {
        const desired = preferences.preferredLifts[slot.anchor] ||
            defaultFundamentalName(slot.anchor, options.focus);
        const requested = catalogByName.get(canonicalExerciseKey(desired));
        const userExplicit = Boolean(preferences.preferredLifts[slot.anchor]);
        if (userExplicit && (!requested || !candidates.includes(requested))) {
            throw new Error(
                'La variante scelta per ' + slot.anchor + ' non è disponibile con la dotazione dichiarata: ' + desired
            );
        }
        if (userExplicit) {
            return {
                exercise: requested,
                reason: 'Fondamentale scelto dall’atleta: ' + requested.name + '.'
            };
        }
        // Continuita' della variante gia' usata, ma solo se compatibile.
        const fromHistory = candidates.find(ex =>
            canonicalExerciseKey(ex.name) === canonicalExerciseKey(options.previousName)
        );
        if (fromHistory) return {
            exercise: fromHistory,
            reason: 'Fondamentale mantenuto per confrontare i risultati con il mesociclo precedente.'
        };
        if (requested && candidates.includes(requested)) return {
            exercise: requested,
            reason: 'Fondamentale prioritario per questo schema di movimento.'
        };
    }
    if (!candidates.length) {
        if (slot.optional) return {
            exercise: null,
            reason: 'Accessorio facoltativo non disponibile con l’attrezzatura dichiarata.'
        };
        throw new Error(
            'Nessun esercizio disponibile per ' + slot.muscle + '/' + slot.pattern +
            ': controlla attrezzatura e preferenze.'
        );
    }
    const chosen = [...candidates].sort((a, b) =>
        scoreCandidate(b, slot, options) - scoreCandidate(a, slot, options) ||
        a.id.localeCompare(b.id)
    )[0];
    return {
        exercise: chosen,
        reason: options.previousName && canonicalExerciseKey(chosen.name) ===
            canonicalExerciseKey(options.previousName)
            ? 'Variante mantenuta dal mesociclo precedente.'
            : 'Selezionato per schema motorio, attrezzatura, ruolo e distribuzione settimanale.'
    };
}
