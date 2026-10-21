// mycoatch/exercisesDB.js
const RAW_EXERCISES = [
    { name: "Hamstring Walkout a Corpo Libero", category: "Femorali", pattern: "isolation", equipment: "bodyweight", cnsCost: 3, defaultReps: "6-10", defaultKg: "" },
    // --- PETTO / SPINTA ---
    { name: "Panca Piana con Bilanciere", category: "Petto", pattern: "horizontal_push", equipment: "barbell", cnsCost: 8, profile: "Curva bilanciata - Max tensione medio-range", defaultReps: "6-8", defaultKg: "" },
    { name: "Panca Inclinata con Manubri", category: "Petto", pattern: "horizontal_push", equipment: "dumbbell", cnsCost: 6, profile: "Enfasi fascio clavicolare - Ottimizzazione ROM", defaultReps: "8-10", defaultKg: "" },
    { name: "Dip alle Parallele (sovraccarico)", category: "Petto", pattern: "vertical_push", equipment: "bodyweight", cnsCost: 7, profile: "Forte enfasi in allungamento sul basso petto", defaultReps: "8-12", defaultKg: "" },
    { name: "Croci ai Cavi in Allungamento", category: "Petto", pattern: "isolation", equipment: "cable", cnsCost: 3, profile: "Resistenza costante - Picco in massimo allungamento", defaultReps: "12-15", defaultKg: "" },
    { name: "Croci con Manubri su Panca Piana", category: "Petto", pattern: "isolation", equipment: "dumbbell", cnsCost: 3, defaultReps: "10-15", defaultKg: "" },

    // --- SCHIENA / TRAZIONE ---
    { name: "Trazioni alla Sbarra (Pull-up)", category: "Back_Lats", pattern: "vertical_pull", equipment: "bodyweight", cnsCost: 7, profile: "Catena cinetica chiusa - Gran dorsale e teres major", defaultReps: "6-8", defaultKg: "" },
    { name: "Lat Machine con Triangolo", category: "Back_Lats", pattern: "vertical_pull", equipment: "lat_machine", cnsCost: 5, profile: "Vettore adduzione/estensione - Curva stabile", defaultReps: "8-10", defaultKg: "" },
    { name: "Rematore con Bilanciere", category: "Back_Thickness", pattern: "horizontal_pull", equipment: "barbell", cnsCost: 8, profile: "Spessore mid-traps e romboidi - Carico alto", defaultReps: "6-8", defaultKg: "" },
    { name: "Pulley Basso a T", category: "Back_Thickness", pattern: "horizontal_pull", equipment: "cable", cnsCost: 5, profile: "Massimo allungamento scapolare in scarico", defaultReps: "10-12", defaultKg: "" },

    // --- GAMBE / LOWER BODY ---
    { name: "Squat con Bilanciere", category: "Quadricipiti", pattern: "squat", equipment: "barbell", cnsCost: 10, profile: "Multiarticolare fondamentale - ROM completo ginocchio", defaultReps: "5-6", defaultKg: "" },
    { name: "Front Squat", category: "Quadricipiti", pattern: "squat", equipment: "barbell", cnsCost: 9, profile: "Maggiore verticalità tronco - enfasi quadricipite", defaultReps: "6-8", defaultKg: "" },
    { name: "Leg Press 45°", category: "Quadricipiti", pattern: "squat", equipment: "machine", cnsCost: 6, profile: "Azzeramento carico spinale - Target stabilità", defaultReps: "10-12", defaultKg: "" },
    { name: "Stacco da Terra Convenzionale", category: "Femorali", pattern: "hinge", equipment: "barbell", cnsCost: 10, profile: "Catena posteriore completa - Espressione di forza pura", defaultReps: "4-5", defaultKg: "" },
    { name: "Stacco Rumeno (RDL)", category: "Femorali", pattern: "hinge", equipment: "barbell", cnsCost: 8, profile: "Allungamento sotto carico - Ischiocrurali e glutei", defaultReps: "8-10", defaultKg: "" },
    { name: "Leg Curl Steso", category: "Femorali", pattern: "isolation", equipment: "machine", cnsCost: 4, profile: "Curve di resistenza a flessione di ginocchio", defaultReps: "10-12", defaultKg: "" },
    { name: "Affondi con Manubri", category: "Quadricipiti", pattern: "squat", equipment: "dumbbell", cnsCost: 7, profile: "Lavoro unilaterale - Stabilità core e glutei", defaultReps: "8-12", defaultKg: "" },

    // --- SPALLE ---
    { name: "Military Press con Bilanciere", category: "Spalle", pattern: "vertical_push", equipment: "barbell", cnsCost: 8, profile: "Stabilità core e deltoide anteriore / asse claveare", defaultReps: "6-8", defaultKg: "" },
    { name: "Spinte con Manubri da Seduto", category: "Spalle", pattern: "vertical_push", equipment: "dumbbell", cnsCost: 6, profile: "Isolamento spinta verticale con supporto spinale", defaultReps: "8-10", defaultKg: "" },
    { name: "Alzate Laterali con Manubri", category: "Spalle", pattern: "isolation", equipment: "dumbbell", cnsCost: 3, profile: "Focus deltoide laterale - ROM limitato in basso", defaultReps: "12-15", defaultKg: "" },
    { name: "Alzate Laterali ai Cavi", category: "Spalle", pattern: "isolation", equipment: "cable", cnsCost: 3, profile: "Curva di resistenza uniforme sul deltoide laterale", defaultReps: "12-15", defaultKg: "" },

    // --- BRACCIA ---
    { name: "Estensioni Tricipiti con Manubrio", category: "Tricipiti", pattern: "isolation", equipment: "dumbbell", cnsCost: 3, defaultReps: "10-15", defaultKg: "" },
    { name: "Curl con Bilanciere EZ", category: "Bicipiti", pattern: "isolation", equipment: "barbell", cnsCost: 4, profile: "Flessione gomito - Minimo stress polsi", defaultReps: "8-10", defaultKg: "" },
    { name: "Curl Manubri su Panca Inclinata", category: "Bicipiti", pattern: "isolation", equipment: "dumbbell", cnsCost: 3, profile: "Enfasi capo lungo in massimo allungamento", defaultReps: "10-12", defaultKg: "" },
    { name: "French Press con Bilanciere EZ", category: "Tricipiti", pattern: "isolation", equipment: "barbell", cnsCost: 4, profile: "Capo mediale e laterale - Allungamento gomito", defaultReps: "8-10", defaultKg: "" },
    { name: "Pushdown ai Cavi con Corda", category: "Tricipiti", pattern: "isolation", equipment: "cable", cnsCost: 3, profile: "Resistenza lineare - Picco di contrazione", defaultReps: "10-12", defaultKg: "" },
    // Varianti compatibili con cavi alti/bassi della home gym.
    { name: "Leg Curl ai Cavi (cavigliera)", category: "Femorali", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "10-15", defaultKg: "" },
    { name: "Pushdown ai Cavi", category: "Tricipiti", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "10-15", defaultKg: "" },
    { name: "Curl ai Cavi Bassi", category: "Bicipiti", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "10-15", defaultKg: "" },
    // --- COMPLEMENTARI, VARIANTI E DISTRETTI NON COPERTI ---
    { name: "Panca Inclinata con Bilanciere", category: "Petto", pattern: "horizontal_push", equipment: "barbell", cnsCost: 7, defaultReps: "6-10", defaultKg: "" },
    { name: "Push-up a Terra", category: "Petto", pattern: "horizontal_push", equipment: "bodyweight", cnsCost: 4, defaultReps: "8-20", defaultKg: "" },
    { name: "Panca Stretta con Bilanciere", category: "Tricipiti", pattern: "horizontal_push", equipment: "barbell", cnsCost: 7, defaultReps: "6-10", defaultKg: "" },
    { name: "Lat Machine Presa Larga", category: "Back_Lats", pattern: "vertical_pull", equipment: "lat_machine", cnsCost: 5, defaultReps: "8-12", defaultKg: "" },
    { name: "Lat Machine Presa Supina", category: "Back_Lats", pattern: "vertical_pull", equipment: "lat_machine", cnsCost: 5, defaultReps: "8-12", defaultKg: "" },
    { name: "Rematore con Manubrio a Un Braccio", category: "Back_Thickness", pattern: "horizontal_pull", equipment: "dumbbell", cnsCost: 5, defaultReps: "8-12", defaultKg: "" },
    { name: "Rematore con Manubri su Panca Inclinata", category: "Back_Thickness", pattern: "horizontal_pull", equipment: "dumbbell", cnsCost: 5, defaultReps: "8-12", defaultKg: "" },
    { name: "Pulldown ai Cavi a Braccia Tese", category: "Back_Lats", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "10-15", defaultKg: "" },
    { name: "Goblet Squat con Manubrio", category: "Quadricipiti", pattern: "squat", equipment: "dumbbell", cnsCost: 5, defaultReps: "8-12", defaultKg: "" },
    { name: "Bulgarian Split Squat con Manubri", category: "Quadricipiti", pattern: "squat", equipment: "dumbbell", cnsCost: 6, defaultReps: "8-12", defaultKg: "" },
    { name: "Step-up con Manubri", category: "Quadricipiti", pattern: "squat", equipment: "dumbbell", cnsCost: 5, defaultReps: "8-12", defaultKg: "" },
    { name: "Hip Thrust con Bilanciere", category: "Glutei", pattern: "hip_thrust", equipment: "barbell", cnsCost: 6, defaultReps: "8-12", defaultKg: "" },
    { name: "Glute Bridge con Bilanciere", category: "Glutei", pattern: "hip_thrust", equipment: "barbell", cnsCost: 5, defaultReps: "10-15", defaultKg: "" },
    { name: "Pull-through ai Cavi", category: "Glutei", pattern: "hip_thrust", equipment: "cable", cnsCost: 4, defaultReps: "10-15", defaultKg: "" },
    { name: "Alzate Posteriori con Manubri", category: "Spalle", pattern: "isolation", equipment: "dumbbell", cnsCost: 3, defaultReps: "12-20", defaultKg: "" },
    { name: "Face Pull ai Cavi", category: "Spalle", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "12-20", defaultKg: "" },
    { name: "Reverse Fly ai Cavi", category: "Spalle", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "12-20", defaultKg: "" },
    { name: "Curl Martello con Manubri", category: "Bicipiti", pattern: "isolation", equipment: "dumbbell", cnsCost: 3, defaultReps: "8-12", defaultKg: "" },
    { name: "Estensioni Tricipiti Sopra la Testa ai Cavi", category: "Tricipiti", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "10-15", defaultKg: "" },
    { name: "Calf Raise in Piedi con Manubri", category: "Polpacci", pattern: "isolation", equipment: "dumbbell", cnsCost: 3, defaultReps: "10-20", defaultKg: "" },
    { name: "Calf Raise Monopodalico", category: "Polpacci", pattern: "isolation", equipment: "bodyweight", cnsCost: 2, defaultReps: "12-20", defaultKg: "" },
    { name: "Crunch ai Cavi", category: "Core", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "10-20", defaultKg: "" },
    { name: "Reverse Crunch su Panca", category: "Core", pattern: "isolation", equipment: "bodyweight", cnsCost: 2, defaultReps: "12-20", defaultKg: "" },
    { name: "Pallof Press ai Cavi", category: "Core", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "8-15", defaultKg: "" },
];

/**
 * Catalogo con identita' immutabile e funzioni allenanti.
 * `id` resta stabile anche se in futuro il testo italiano del nome cambia:
 * migrare le vecchie etichette prima di modificare uno di questi ID.
 * Le `secondaryMuscles` indicano coinvolgimento, NON serie effettive misurate.
 */
const STABLE_IDS = new Map([
    ["Estensioni Tricipiti con Manubrio", "estensioni_tricipiti_con_manubrio"],
    ["Hamstring Walkout a Corpo Libero", "hamstring_walkout_corpo_libero"],
    ["Panca Piana con Bilanciere", "panca_piana_con_bilanciere"],
    ["Panca Inclinata con Manubri", "panca_inclinata_con_manubri"],
    ["Dip alle Parallele (sovraccarico)", "dip_alle_parallele_sovraccarico"],
    ["Croci ai Cavi in Allungamento", "croci_ai_cavi_in_allungamento"],
    ["Croci con Manubri su Panca Piana", "croci_con_manubri_su_panca_piana"],
    ["Trazioni alla Sbarra (Pull-up)", "trazioni_alla_sbarra_pull_up"],
    ["Lat Machine con Triangolo", "lat_machine_con_triangolo"],
    ["Rematore con Bilanciere", "rematore_con_bilanciere"],
    ["Pulley Basso a T", "pulley_basso_a_t"],
    ["Squat con Bilanciere", "squat_con_bilanciere"],
    ["Front Squat", "front_squat"],
    ["Leg Press 45°", "leg_press_45"],
    ["Stacco da Terra Convenzionale", "stacco_da_terra_convenzionale"],
    ["Stacco Rumeno (RDL)", "stacco_rumeno_rdl"],
    ["Leg Curl Steso", "leg_curl_steso"],
    ["Affondi con Manubri", "affondi_con_manubri"],
    ["Military Press con Bilanciere", "military_press_con_bilanciere"],
    ["Spinte con Manubri da Seduto", "spinte_con_manubri_da_seduto"],
    ["Alzate Laterali con Manubri", "alzate_laterali_con_manubri"],
    ["Alzate Laterali ai Cavi", "alzate_laterali_ai_cavi"],
    ["Curl con Bilanciere EZ", "curl_con_bilanciere_ez"],
    ["Curl Manubri su Panca Inclinata", "curl_manubri_su_panca_inclinata"],
    ["French Press con Bilanciere EZ", "french_press_con_bilanciere_ez"],
    ["Pushdown ai Cavi con Corda", "pushdown_ai_cavi_con_corda"],
    ["Leg Curl ai Cavi (cavigliera)", "leg_curl_ai_cavi_cavigliera"],
    ["Pushdown ai Cavi", "pushdown_ai_cavi"],
    ["Curl ai Cavi Bassi", "curl_ai_cavi_bassi"],
    ["Panca Inclinata con Bilanciere", "panca_inclinata_con_bilanciere"],
    ["Push-up a Terra", "push_up_a_terra"],
    ["Panca Stretta con Bilanciere", "panca_stretta_con_bilanciere"],
    ["Lat Machine Presa Larga", "lat_machine_presa_larga"],
    ["Lat Machine Presa Supina", "lat_machine_presa_supina"],
    ["Rematore con Manubrio a Un Braccio", "rematore_con_manubrio_a_un_braccio"],
    ["Rematore con Manubri su Panca Inclinata", "rematore_con_manubri_su_panca_inclinata"],
    ["Pulldown ai Cavi a Braccia Tese", "pulldown_ai_cavi_a_braccia_tese"],
    ["Goblet Squat con Manubrio", "goblet_squat_con_manubrio"],
    ["Bulgarian Split Squat con Manubri", "bulgarian_split_squat_con_manubri"],
    ["Step-up con Manubri", "step_up_con_manubri"],
    ["Hip Thrust con Bilanciere", "hip_thrust_con_bilanciere"],
    ["Glute Bridge con Bilanciere", "glute_bridge_con_bilanciere"],
    ["Pull-through ai Cavi", "pull_through_ai_cavi"],
    ["Alzate Posteriori con Manubri", "alzate_posteriori_con_manubri"],
    ["Face Pull ai Cavi", "face_pull_ai_cavi"],
    ["Reverse Fly ai Cavi", "reverse_fly_ai_cavi"],
    ["Curl Martello con Manubri", "curl_martello_con_manubri"],
    ["Estensioni Tricipiti Sopra la Testa ai Cavi", "estensioni_tricipiti_sopra_la_testa_ai_cavi"],
    ["Calf Raise in Piedi con Manubri", "calf_raise_in_piedi_con_manubri"],
    ["Calf Raise Monopodalico", "calf_raise_monopodalico"],
    ["Crunch ai Cavi", "crunch_ai_cavi"],
    ["Reverse Crunch su Panca", "reverse_crunch_su_panca"],
    ["Pallof Press ai Cavi", "pallof_press_ai_cavi"],
]);

const CATEGORY_SECONDARIES = {
    Petto: ['Tricipiti', 'Spalle'],
    Back_Lats: ['Bicipiti', 'Back_Thickness'],
    Back_Thickness: ['Bicipiti', 'Back_Lats'],
    Quadricipiti: ['Glutei'],
    Femorali: ['Glutei'],
    Glutei: ['Femorali'],
    Spalle: ['Tricipiti'],
    Bicipiti: [],
    Tricipiti: [],
    Polpacci: [],
    Core: []
};
const REQUIRES = {
    'Panca Piana con Bilanciere': ['rack', 'flat_bench'],
    'Croci con Manubri su Panca Piana': ['flat_bench'],
    'Lat Machine con Triangolo': ['triangle_handle'],
    'Pushdown ai Cavi con Corda': ['rope_attachment'],
    'Squat con Bilanciere': ['rack'],
    'Front Squat': ['rack'],
    'Panca Inclinata con Bilanciere': ['rack', 'incline_bench'],
    'Hip Thrust con Bilanciere': ['flat_bench'],
    'Reverse Crunch su Panca': ['flat_bench'],
    'Dip alle Parallele (sovraccarico)': ['dip_station'],
    'Trazioni alla Sbarra (Pull-up)': ['pullup_bar'],
    'Curl con Bilanciere EZ': ['ez_bar'],
    'French Press con Bilanciere EZ': ['ez_bar'],
    'Leg Curl ai Cavi (cavigliera)': ['ankle_strap'],
    'Panca Inclinata con Manubri': ['incline_bench'],
    'Rematore con Manubri su Panca Inclinata': ['incline_bench'],
    'Curl Manubri su Panca Inclinata': ['incline_bench']
};

const MUSCLE_OVERRIDES = {
    'Stacco da Terra Convenzionale': ['Glutei', 'Back_Thickness', 'Quadricipiti'],
    'Stacco Rumeno (RDL)': ['Glutei', 'Back_Thickness'],
    'Military Press con Bilanciere': ['Tricipiti', 'Core'],
    'Spinte con Manubri da Seduto': ['Tricipiti'],
    'Alzate Laterali con Manubri': [],
    'Alzate Laterali ai Cavi': [],
    'Alzate Posteriori con Manubri': ['Back_Thickness'],
    'Face Pull ai Cavi': ['Back_Thickness'],
    'Reverse Fly ai Cavi': ['Back_Thickness'],
    'Hip Thrust con Bilanciere': ['Femorali'],
    'Glute Bridge con Bilanciere': ['Femorali'],
    'Pull-through ai Cavi': ['Femorali']
};

// Copertura dei capi deltoidei: un isolamento diretto non si confonde
// con il lavoro indiretto di panca/rematore o con una misura di crescita.
const SHOULDER_HEAD = Object.freeze({
    'Alzate Laterali con Manubri': 'laterale',
    'Alzate Laterali ai Cavi': 'laterale',
    'Alzate Posteriori con Manubri': 'posteriore',
    'Face Pull ai Cavi': 'posteriore',
    'Reverse Fly ai Cavi': 'posteriore'
});

export const EXERCISE_DATABASE = Object.freeze(RAW_EXERCISES.map(exercise => {
    const id = STABLE_IDS.get(exercise.name);
    if (!id) throw new Error('Esercizio privo di ID immutabile: ' + exercise.name);
    const secondaries = exercise.pattern === 'isolation'
        ? (MUSCLE_OVERRIDES[exercise.name] || [])
        : (MUSCLE_OVERRIDES[exercise.name] || CATEGORY_SECONDARIES[exercise.category] || []);
    return Object.freeze({
        ...exercise,
        id,
        primaryMuscle: exercise.category,
        shoulderHeadIsolation: SHOULDER_HEAD[exercise.name] || null,
        secondaryMuscles: Object.freeze([...secondaries]),
        requires: Object.freeze([...(REQUIRES[exercise.name] || [])]),
        role: exercise.pattern === 'isolation' ? 'accessory' : 'compound',
        // cnsCost e' un punteggio euristico, non una misura fisiologica.
        estimatedFatigue: exercise.cnsCost
    });
}));

export const DEFAULT_HOME_GYM_EQUIPMENT = Object.freeze([
    'barbell', 'dumbbell', 'bodyweight', 'lat_machine', 'cable'
]);

// Confrontare con le dotazioni dichiarate: NON presumere dip station,
// barra trazioni, bilanciere EZ, cavigliera o panca inclinabile.
export const DEFAULT_HOME_GYM_ACCESSORIES = Object.freeze(['rack', 'flat_bench']);

