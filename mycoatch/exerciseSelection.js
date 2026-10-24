import { EXERCISE_DATABASE, DEFAULT_HOME_GYM_EQUIPMENT, DEFAULT_HOME_GYM_ACCESSORIES } from './exercisesDB.js';
import { canonicalExerciseKey } from './exerciseIdentity.js';

/**
 * Le 4 alzate-ancora rappresentano gli schemi prioritari, non un obbligo
 * anatomico per ogni atleta. L'utente può scegliere una variante equivalente.
 */
export const FUNDAMENTAL_CHOICES = Object.freeze({
    bench: Object.freeze([
        'Panca Piana con Bilanciere', 'Panca Inclinata con Manubri',
        'Panca Inclinata con Bilanciere', 'Panca Piana con Manubri', 'Chest Press'
    ]),
    squat: Object.freeze([
        'Squat con Bilanciere', 'Front Squat',
        'Goblet Squat con Manubrio', 'Bulgarian Split Squat con Manubri', 'Leg Press 45°', 'Hack Squat'
    ]),
    military: Object.freeze([
        'Military Press con Bilanciere', 'Spinte con Manubri da Seduto', 'Shoulder Press alla Macchina'
    ]),
    hinge: Object.freeze([
        'Stacco Rumeno (RDL)', 'Stacco da Terra Convenzionale', 'Stacco Rumeno con Manubri'
    ])
});

export const OPTIONAL_ACCESSORIES = Object.freeze([
    Object.freeze({ id: 'incline_bench', label: 'Panca inclinabile' }),
    Object.freeze({ id: 'pullup_bar', label: 'Barra per trazioni' }),
    Object.freeze({ id: 'ankle_strap', label: 'Cavigliera per cavi' }),
    Object.freeze({ id: 'rope_attachment', label: 'Corda per pushdown' }),
    Object.freeze({ id: 'triangle_handle', label: 'Impugnatura triangolare lat machine' }),
    Object.freeze({ id: 'ez_bar', label: 'Bilanciere EZ' }),
    Object.freeze({ id: 'dip_station', label: 'Parallele per dip' })
]);

// Model pulley topology separately from the generic word "cable".
// A single high/low central pulley cannot perform bilateral cable flyes.
export const CABLE_SETUPS = Object.freeze([
    'none', 'high_only', 'low_only', 'single_high_low', 'dual_adjustable'
]);
export const MACHINE_CHOICES = Object.freeze(EXERCISE_DATABASE
    .filter(ex=>ex.machineId).map(ex=>Object.freeze({id:ex.machineId,label:ex.name})));
const HIGH_CABLE_EXERCISES = new Set([
    'Pulldown ai Cavi a Braccia Tese', 'Pushdown ai Cavi',
    'Pushdown ai Cavi con Corda', 'Estensioni Tricipiti Sopra la Testa ai Cavi',
    'Crunch ai Cavi', 'Face Pull ai Cavi'
]);
const LOW_CABLE_EXERCISES = new Set([
    'Pulley Basso a T', 'Curl ai Cavi Bassi', 'Leg Curl ai Cavi (cavigliera)',
    'Alzate Laterali ai Cavi', 'Pull-through ai Cavi'
]);
const DUAL_CABLE_EXERCISES = new Set([
    'Croci ai Cavi in Allungamento', 'Reverse Fly ai Cavi'
]);
const MID_CABLE_EXERCISES = new Set(['Pallof Press ai Cavi']);

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
    const availableMachines = config.availableMachines === undefined ? undefined :
        normalizeList(config.availableMachines, [], MACHINE_CHOICES.map(x=>x.id), 'macchine');
    const cableSetup = config.cableSetup ?? 'single_high_low';
    if (!CABLE_SETUPS.includes(cableSetup)) throw new Error('Configurazione dei cavi non valida.');
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
    return { availableEquipment, availableAccessories, cableSetup, preferredLifts,
        ...(availableMachines === undefined ? {} : {availableMachines}),
        ...(config.excludedExercises === undefined ? {} : { excludedExercises: excluded }) };
}

export function isExerciseAvailable(exercise, preferences) {
    if (exercise.equipment === 'machine' &&
        !(preferences.availableMachines || []).includes(exercise.machineId)) return false;
    const cableSetup = preferences.cableSetup ?? 'single_high_low';
    const hasHigh = ['high_only', 'single_high_low', 'dual_adjustable'].includes(cableSetup);
    const hasLow = ['low_only', 'single_high_low', 'dual_adjustable'].includes(cableSetup);
    const hasDual = cableSetup === 'dual_adjustable';
    if (exercise.equipment === 'cable') {
        if (cableSetup === 'none' ||
            (HIGH_CABLE_EXERCISES.has(exercise.name) && !hasHigh) ||
            (LOW_CABLE_EXERCISES.has(exercise.name) && !hasLow) ||
            (DUAL_CABLE_EXERCISES.has(exercise.name) && !hasDual) ||
            (MID_CABLE_EXERCISES.has(exercise.name) && !hasDual)) return false;
    }
    if (exercise.equipment === 'lat_machine' && !hasHigh) return false;
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
    'Petto:isolation': ['Croci ai Cavi in Allungamento', 'Croci con Manubri su Panca Piana'],
    'Quadricipiti:squat': [
        'Front Squat', 'Bulgarian Split Squat con Manubri',
        'Affondi con Manubri', 'Goblet Squat con Manubrio'
    ],
    'Femorali:hinge': ['Stacco Rumeno (RDL)', 'Stacco da Terra Convenzionale'],
    'Glutei:hip_thrust': [
        'Hip Thrust con Bilanciere', 'Glute Bridge con Bilanciere', 'Pull-through ai Cavi'
    ],
    'Femorali:isolation': ['Leg Curl ai Cavi (cavigliera)', 'Leg Curl Steso', 'Hamstring Walkout a Corpo Libero'],
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
        'Pushdown ai Cavi', 'French Press con Bilanciere EZ', 'Estensioni Tricipiti con Manubrio'
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
    let candidates = EXERCISE_DATABASE.filter(ex =>
        ex.category === slot.muscle && ex.pattern === slot.pattern &&
        // The user's previous lateral raise is NOT an equivalent substitute
        // for a slot specifically reserved for posterior deltoid isolation.
        // A missing targeted accessory is reported, never silently replaced
        // by an anatomically different exercise.
        (!slot.shoulderHeadIsolation ||
            ex.shoulderHeadIsolation === slot.shoulderHeadIsolation) &&
        !usedNames.has(canonicalExerciseKey(ex.name)) &&
        isExerciseAvailable(ex, preferences)
        && ex.generationAllowed !== false
    );
    const alternatives=candidates.filter(ex=>canonicalExerciseKey(ex.name)!==canonicalExerciseKey(options.previousName));
    if(options.allowVariation && alternatives.length && !preferences.preferredLifts[slot.anchor])
        candidates=alternatives;

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
        reason: options.allowVariation && canonicalExerciseKey(chosen.name)!==canonicalExerciseKey(options.previousName)
            ? 'Variante proposta dopo uno stallo persistente su blocchi confrontabili. Calibra il nuovo carico; verifica la risposta nelle prossime sedute.'
            : options.previousName && canonicalExerciseKey(chosen.name) ===
            canonicalExerciseKey(options.previousName)
            ? 'Variante mantenuta dal mesociclo precedente.'
            : 'Selezionato per schema motorio, attrezzatura, ruolo e distribuzione settimanale.'
    };
}

