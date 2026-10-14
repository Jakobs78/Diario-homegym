// mycoatch/exercisesDB.js
export const EXERCISE_DATABASE = [
    // --- PETTO / SPINTA ---
    { name: "Panca Piana con Bilanciere", category: "Petto", pattern: "horizontal_push", equipment: "barbell", cnsCost: 8, profile: "Curva bilanciata - Max tensione medio-range", defaultReps: "6-8", defaultKg: "" },
    { name: "Panca Inclinata con Manubri", category: "Petto", pattern: "horizontal_push", equipment: "dumbbell", cnsCost: 6, profile: "Enfasi fascio clavicolare - Ottimizzazione ROM", defaultReps: "8-10", defaultKg: "" },
    { name: "Dip alle Parallele (sovraccarico)", category: "Petto", pattern: "vertical_push", equipment: "bodyweight", cnsCost: 7, profile: "Forte enfasi in allungamento sul basso petto", defaultReps: "8-12", defaultKg: "" },
    { name: "Croci ai Cavi in Allungamento", category: "Petto", pattern: "isolation", equipment: "cable", cnsCost: 3, profile: "Resistenza costante - Picco in massimo allungamento", defaultReps: "12-15", defaultKg: "" },

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
    { name: "Curl con Bilanciere EZ", category: "Bicipiti", pattern: "isolation", equipment: "barbell", cnsCost: 4, profile: "Flessione gomito - Minimo stress polsi", defaultReps: "8-10", defaultKg: "" },
    { name: "Curl Manubri su Panca Inclinata", category: "Bicipiti", pattern: "isolation", equipment: "dumbbell", cnsCost: 3, profile: "Enfasi capo lungo in massimo allungamento", defaultReps: "10-12", defaultKg: "" },
    { name: "French Press con Bilanciere EZ", category: "Tricipiti", pattern: "isolation", equipment: "barbell", cnsCost: 4, profile: "Capo mediale e laterale - Allungamento gomito", defaultReps: "8-10", defaultKg: "" },
    { name: "Pushdown ai Cavi con Corda", category: "Tricipiti", pattern: "isolation", equipment: "cable", cnsCost: 3, profile: "Resistenza lineare - Picco di contrazione", defaultReps: "10-12", defaultKg: "" },
    // Varianti compatibili con cavi alti/bassi della home gym.
    { name: "Leg Curl ai Cavi (cavigliera)", category: "Femorali", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "10-15", defaultKg: "" },
    { name: "Pushdown ai Cavi", category: "Tricipiti", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "10-15", defaultKg: "" },
    { name: "Curl ai Cavi Bassi", category: "Bicipiti", pattern: "isolation", equipment: "cable", cnsCost: 3, defaultReps: "10-15", defaultKg: "" },
];
