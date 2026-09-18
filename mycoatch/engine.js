// mycoatch/engine.js
import { EXERCISE_DATABASE } from './exercisesDB.js';

/**
 * Punti di riferimento del volume ipertrofico settimanale (Evidence-Based)
 */
export const MUSCLE_VOLUME_LANDMARKS = {
    Petto: { mev: 8, mav: 14, mrv: 20 },
    Back_Lats: { mev: 10, mav: 16, mrv: 22 },
    Back_Thickness: { mev: 8, mav: 14, mrv: 20 },
    Gambe: { mev: 10, mav: 16, mrv: 22 },
    Spalle: { mev: 8, mav: 14, mrv: 20 },
    Braccia: { mev: 6, mav: 12, mrv: 18 }
};

/**
 * Genera un mesociclo ottimizzato bilanciando MEV/MAV/MRV, focus muscolari,
 * progressioni RPE e tecniche di intensità temporizzate.
 */
export function generateSmartMesocycle(config = {}, analysis = {}, historicalData = {}) {
    const safeHistory = historicalData || {};
    
    const { 
        name = "Mesociclo Adattivo MyCoach", 
        durationWeeks = 4, 
        daysPerWeek = 3, 
        focus = "hybrid", 
        focusMuscleGroup = null, 
        stepKg = 2.5, 
        maxSessionMinutes = 60,
        userAge = 30,
        trainingYears = 3
    } = config;

    // 1. Parametri di recupero biologico
    const isMaster = userAge >= 45;
    const ageRecoveryFactor = isMaster ? 0.8 : (userAge > 35 ? 0.9 : 1.0);
    const experienceMultiplier = trainingYears < 2 ? 0.9 : 1.0;
    const deloadWeekNumber = isMaster ? 3 : durationWeeks;

    // 2. Vincoli di tempo
    const isShortTime = maxSessionMinutes <= 50;
    const useSupersets = maxSessionMinutes <= 60;

    const templateDays = getTemplateForDays(daysPerWeek);
    
    // Calcolo della frequenza settimanale reale per ogni gruppo muscolare nel template
    const muscleFrequencyMap = {};
    templateDays.forEach(day => {
        const slots = isShortTime ? day.slots.slice(0, 4) : day.slots;
        slots.forEach(slot => {
            const mainMuscle = Object.keys(MUSCLE_VOLUME_LANDMARKS).find(m => slot.muscle.toLowerCase().includes(m.toLowerCase())) || "Petto";
            muscleFrequencyMap[mainMuscle] = (muscleFrequencyMap[mainMuscle] || 0) + 1;
        });
    });

    const weeks = [];

    for (let w = 1; w <= durationWeeks; w++) {
        const weekDays = [];
        const isDeloadWeek = (w === deloadWeekNumber);

        // Progressione dinamica del target RPE di settimana in settimana
        let rpeString = "@8.0";
        if (isDeloadWeek) {
            rpeString = "@6.5";
        } else if (focus === 'strength') {
            rpeString = w === 1 ? "@8.0" : w === 2 ? "@8.5" : "@9.0";
        } else {
            rpeString = w === 1 ? "@7.5" : w === 2 ? "@8.0" : "@8.5";
        }

        templateDays.forEach((dayTemplate, dayIndex) => {
            const activeSlots = isShortTime ? dayTemplate.slots.slice(0, 4) : dayTemplate.slots;
            
            const exercisesSelectedToday = [];
            
            // 🧠 NUOVO: Limite di tolleranza neurale giornaliero (Max 26 punti)
            const MAX_DAILY_CNS = isMaster ? 22 : 26;
            let currentDailyCNS = 0;

            let rawExercises = activeSlots.map(slot => {
                const exercise = selectExerciseBySlot(
                    slot, 
                    analysis.stalledExercises || [], 
                    exercisesSelectedToday, 
                    currentDailyCNS, 
                    MAX_DAILY_CNS
                );
                
                if (exercise) {
                    exercisesSelectedToday.push(exercise.name);
                    currentDailyCNS += (exercise.cnsCost || 5);
                }
                return exercise;
            }).filter(Boolean);

            rawExercises = applySpecializationFocus(rawExercises, safeHistory);

            const processedExercises = rawExercises.map((exItem, index) => {
                const ex = exItem;
                
                let baseKg = safeHistory[ex.name]?.lastKg !== undefined 
                    ? safeHistory[ex.name].lastKg 
                    : (parseFloat(ex.defaultKg) || 0);

                // 🧠 INTEGRAZIONE 1: Auto-Deload Preventivo per Inattività (Readiness)
                // Se esiste una data di ultimo allenamento nello storico ed è più vecchia di 7 giorni
                const isReturningFromBreak = safeHistory.lastWorkoutDate && 
                    ((new Date() - new Date(safeHistory.lastWorkoutDate)) / (1000 * 60 * 60 * 24)) > 7;
                
                if (isReturningFromBreak && w === 1) {
                    baseKg = baseKg * 0.85; // Taglio automatico del 15% per evitare DOMS invalidanti
                    ex.noteOverride = (ex.noteOverride || "") + " 🛡️ [AUTO-DELOAD INATTIVITÀ]: Carico ridotto preventivamente del 15% per il rientro.";
                }
                
                    if (w > 1 && !isDeloadWeek) {
                    const multiplier = (focus === 'strength' || (focus === 'hybrid' && index === 0)) ? 1 : 0.5;
                    const effectiveStep = baseKg < 12.5 ? Math.min(stepKg, 1.0) : stepKg;
                    baseKg += effectiveStep * (w - 1) * multiplier;
                }

                if (isDeloadWeek) {
                    baseKg = baseKg * 0.85;
                }

                const targetKgMin = baseKg < 12.5 ? Math.round(baseKg * 2) / 2 : Math.round(baseKg / 2.5) * 2.5;
                const targetKgMax = targetKgMin + (baseKg < 12.5 ? 2 : 5);

                // Trova la categoria macro dell'esercizio per calcolare i set personalizzati sulla split
                const mainMuscle = Object.keys(MUSCLE_VOLUME_LANDMARKS).find(m => ex.category.toLowerCase().includes(m.toLowerCase())) || "Petto";
                const realFrequency = muscleFrequencyMap[mainMuscle] || 2;

                // Calcolo dinamico delle serie con allocazione del Set-Budget (MEV/MAV)
                let baseSets = calculateTargetSets({
                    category: ex.category,
                    focusMuscleGroup,
                    isDeloadWeek,
                    weekNumber: w,
                    isMaster,
                    frequency: realFrequency
                });
                
                const setsCount = Math.max(2, Math.round(baseSets * ageRecoveryFactor * experienceMultiplier));

                let reps = ex.defaultReps || "8-12";
                if (focus === 'strength' && index === 0) {
                    reps = "3-5";
                } else if (focus === 'hypertrophy') {
                    reps = index === 0 ? "6-8" : "10-15";
                }

                let topsetStr = "";
                let noteFinal = exItem.noteOverride || generateContextNote(index, isDeloadWeek, focus, useSupersets);

                // 🧠 INTEGRAZIONE 2A: Auto Warm-Up (Solo sul primo esercizio multiarticolare)
                const isFirstCompound = index === 0 && ["squat", "hinge", "horizontal_push", "vertical_push", "vertical_pull"].includes(ex.pattern);
                
                if (isFirstCompound) {
                    const w1 = Math.round(baseKg * 0.5);
                    const w2 = Math.round(baseKg * 0.7);
                    const w3 = Math.round(baseKg * 0.85);
                    noteFinal = `🔥 [WARM-UP AUTO]: 8x${w1}kg, 4x${w2}kg, 2x${w3}kg. | ` + noteFinal;
                }

                if (index === 0 && !isDeloadWeek && focus !== 'strength') {
                    const topKg = targetKgMin + (baseKg < 12.5 ? 1 : 2.5);
                    topsetStr = `1x${reps.split('-')[0]} @ ${topKg}kg (RPE 9)`;
                    noteFinal += ` | 🎯 Top Set eseguito, poi Back-Off automatico del 10%.`;
                }

                // 🛡️ SICUREZZA LINT: Gestione pulita della tecnica d'intensità senza variabili esterne non definite
                const currentTechnique = exItem.intensityTechnique || null;

                const setsArray = Array.from({ length: setsCount }, (_, setIdx) => {
                    let setKg = targetKgMin;
                    
                    if (setIdx === 0 && topsetStr) {
                        setKg = targetKgMin + (baseKg < 12.5 ? 1 : 2.5); // Peso del Top Set
                    } else if (setIdx > 0 && topsetStr) {
                        const topKg = targetKgMin + (baseKg < 12.5 ? 1 : 2.5);
                        setKg = Math.round((topKg * 0.9) / 2.5) * 2.5; // Back-off del 10%
                    }

                    const isLastSet = (setIdx === setsCount - 1);

                    return {
                        setNumber: setIdx + 1,
                        targetReps: reps,
                        targetKg: setKg > 0 ? setKg.toString() : "-",
                        actualReps: "",
                        actualKg: "",
                        completed: false,
                        isWarmup: false,
                        intensityTechnique: (isLastSet && currentTechnique) ? currentTechnique : null
                    };
                });

                return {
                    name: ex.name,
                    setsCount: setsCount,
                    reps: reps,
                    kgMin: targetKgMin.toString(),
                    kgMax: targetKgMax.toString(),
                    topset: topsetStr,
                    rpe: rpeString,
                    notes: noteFinal,
                    sets: setsArray
                };
            });

            weekDays.push({
                dayNumber: dayIndex + 1,
                dayName: dayTemplate.name,
                exercises: processedExercises
            });
        });

        weeks.push({
            weekNumber: w,
            days: weekDays
        });
    }

    return {
        id: `mycoatch_meso_${Date.now()}`,
        name: name,
        createdAt: new Date().toISOString(),
        config: config,
        weeks: weeks
    };
}

/**
 * Calcola il numero di serie target rispettando le soglie ipertrofiche (MEV/MAV/MRV) basate sulla frequenza reale
 */
function calculateTargetSets({ category = "", focusMuscleGroup, isDeloadWeek, weekNumber, isMaster, frequency = 2 }) {
    if (isDeloadWeek) return 2;

    const mainMuscle = Object.keys(MUSCLE_VOLUME_LANDMARKS).find(m => category.toLowerCase().includes(m.toLowerCase())) || "Petto";
    const landmarks = MUSCLE_VOLUME_LANDMARKS[mainMuscle];

    const isSpecialization = focusMuscleGroup && focusMuscleGroup.toLowerCase() === mainMuscle.toLowerCase();
    const targetVolumeLandmark = isSpecialization ? landmarks.mav : landmarks.mev;
    
    // Distribuzione basata sulla frequenza settimanale reale di quel muscolo all'interno del template attivo
    let targetSets = Math.round(targetVolumeLandmark / Math.max(1, frequency));

    // Accumulo progressivo di volume durante il picco della settimana 3
    if (weekNumber === 3) targetSets += 1;

    // Cappiamo entro la soglia limite derivata dall'MRV distribuito
    const maxAllowed = isMaster ? 3 : Math.min(5, Math.ceil(landmarks.mrv / Math.max(1, frequency)));
    return Math.max(2, Math.min(targetSets, maxAllowed));
}
function generateContextNote(index, isDeload, focus, useSupersets) {
    let note;

    if (isDeload) {
        note = "🛡️ Scarico attivo: mantieni il controllo eccentrico, fermati a 2-3 RIR dal cedimento.";
    } else if (index === 0) {
        note = focus === 'strength'
            ? "🔥 Focus forza: recuperi completi e spinta esplosiva concentrica."
            : "🎯 Esercizio primario: rispetta il buffer (1-2 RIR) mantenendo la forma pulita.";
    } else if (index === 1) {
        note = "⚡ Tensione continua: cerca il pompaggio e tieni 1s di contrazione di picco.";
    } else {
        note = "💧 Gestione metabolica: controlla la fase negativa (2-3s) ed evita slanci parassiti.";
    }

    if (useSupersets && index >= 2) {
        if (index % 2 === 1) {
            note += " ⏱️ [SUPERSERIE]: Esegui abbinato all'esercizio precedente con recupero 45-60s.";
        } else {
            note += " ⏱️ [SUPERSERIE]: Passa subito all'esercizio successivo.";
        }
    }

    return note;
}

function selectExerciseBySlot(slot, stalledExercises, alreadySelected = [], currentCNS = 0, maxCNS = 26) {
    // 🛠️ FILTRO HOME GYM: L'utente possiede solo pesi liberi, rack e lat machine.
    const availableEquipment = ["barbell", "dumbbell", "bodyweight", "lat_machine"];

    let matches = EXERCISE_DATABASE.filter(e => {
        const categoryMatch = e.category.toLowerCase() === slot.muscle.toLowerCase();
        const patternMatch = slot.pattern ? e.pattern === slot.pattern : true;
        const isNotDuplicate = !alreadySelected.includes(e.name);
        const hasEquipment = availableEquipment.includes(e.equipment);
        
        return categoryMatch && patternMatch && isNotDuplicate && hasEquipment;
    });

    // Fallback elastico se il vincolo di pattern è troppo stringente
    if (matches.length === 0) {
        matches = EXERCISE_DATABASE.filter(e => {
            return e.category.toLowerCase() === slot.muscle.toLowerCase() && 
                   !alreadySelected.includes(e.name) && 
                   availableEquipment.includes(e.equipment);
        });
    }

    if (matches.length === 0) return null;

    // 🧠 GESTIONE CNS: Se il budget neurale giornaliero sta per esplodere, 
    // forza la scelta verso varianti meno tassanti (es. Manubri invece di Bilanciere per lo stesso pattern)
    if (currentCNS > (maxCNS - 6)) {
        matches.sort((a, b) => a.cnsCost - b.cnsCost); // Ordina dal meno tassante al più tassante
    } else {
        matches.sort((a, b) => b.cnsCost - a.cnsCost); // Ad inizio sessione, priorità ai multiarticolari pesanti
    }

    // Cerca una variante che non sia in stallo nei mesocicli precedenti
    let selected = matches.find(e => !stalledExercises.includes(e.name)) || matches[0];

    // Se l'esercizio scelto ci fa sforare pesantemente il budget, applichiamo un warning automatico
    if ((currentCNS + selected.cnsCost) > maxCNS) {
        selected = { 
            ...selected, 
            noteOverride: `⚠️ [CNS BUDGET LIMIT]: Esercizio inserito ma soglia neurale superata. Consiglio: abbassa i carichi del 10% o esegui 1 set in meno per preservare il recupero.` 
        };
    } else if (stalledExercises.includes(selected.name)) {
        selected = { 
            ...selected, 
            noteOverride: "🔄 Variante di rotazione per stallo registrato nei mesocicli precedenti." 
        };
    }

    return selected;
}

export function getTemplateForDays(daysPerWeek = 3) {
    if (daysPerWeek === 3) {
        return [
            {
                name: "Full Body A (Focus Spinta Petto, Lat Machine & Quadricipiti)",
                slots: [
                    { muscle: "Petto", pattern: "horizontal_push" },
                    { muscle: "Back_Lats", pattern: "vertical_pull" },
                    { muscle: "Gambe", pattern: "squat" },
                    { muscle: "Spalle", pattern: "isolation" },
                    { muscle: "Braccia", pattern: "isolation" }
                ]
            },
            {
                name: "Full Body B (Focus Stacco Rumeno, Spalla & Dorso Spessore)",
                slots: [
                    { muscle: "Gambe", pattern: "hinge" },
                    { muscle: "Spalle", pattern: "vertical_push" },
                    { muscle: "Back_Thickness", pattern: "horizontal_pull" },
                    { muscle: "Petto", pattern: "isolation" },
                    { muscle: "Braccia", pattern: "isolation" }
                ]
            },
            {
                name: "Full Body C (Focus Leg Press, Petto Inclinato & Braccia)",
                slots: [
                    { muscle: "Gambe", pattern: "squat" },
                    { muscle: "Petto", pattern: "horizontal_push" },
                    { muscle: "Back_Lats", pattern: "vertical_pull" },
                    { muscle: "Gambe", pattern: "isolation" },
                    { muscle: "Braccia", pattern: "isolation" }
                ]
            }
        ];
    }

    return [
        {
            name: "Upper A (Focus Petto Piano, Lat Machine & Bicipiti)",
            slots: [
                { muscle: "Petto", pattern: "horizontal_push" },
                { muscle: "Back_Lats", pattern: "vertical_pull" },
                { muscle: "Petto", pattern: "isolation" },
                { muscle: "Spalle", pattern: "isolation" },
                { muscle: "Braccia", pattern: "isolation" }
            ]
        },
        {
            name: "Lower A (Focus Squat & Femorali)",
            slots: [
                { muscle: "Gambe", pattern: "squat" },
                { muscle: "Gambe", pattern: "hinge" },
                { muscle: "Gambe", pattern: "squat" },
                { muscle: "Gambe", pattern: "isolation" }
            ]
        },
        {
            name: "Upper B (Focus Military Press, Rematore & Tricipiti)",
            slots: [
                { muscle: "Back_Lats", pattern: "vertical_pull" },
                { muscle: "Spalle", pattern: "vertical_push" },
                { muscle: "Back_Thickness", pattern: "horizontal_pull" },
                { muscle: "Petto", pattern: "isolation" },
                { muscle: "Braccia", pattern: "isolation" }
            ]
        },
        {
            name: "Lower B (Focus Stacco Rumeno & Quadricipiti)",
            slots: [
                { muscle: "Gambe", pattern: "hinge" },
                { muscle: "Gambe", pattern: "squat" },
                { muscle: "Spalle", pattern: "isolation" },
                { muscle: "Braccia", pattern: "isolation" }
            ]
        }
    ];
}

export function applySpecializationFocus(exercises, historicalData) {
    return exercises.map(ex => {
        const exHistory = historicalData[ex.name];
        
        if (exHistory && exHistory.stallsCount >= 2) {
            return {
                ...ex,
                noteOverride: "SPECIALIZZAZIONE STALLO: Utilizza la tecnica Myo-Reps o Rest-Pause sull'ultima serie per sbloccare la crescita."
            };
        }
        return ex;
    });
}

export function analyzePreviousMesocycle(lastMesocycle) {
    if (!lastMesocycle || !lastMesocycle.weeks) {
        return { stalledExercises: [], recommendation: 'standard' };
    }

    const historyTracking = {};

    lastMesocycle.weeks.forEach(week => {
        const wNum = week.weekNumber;
        
        (week.days || []).forEach(day => {
            (day.exercises || []).forEach(ex => {
                const logs = ex.loggedSets || ex.sets || ex.completedLogs || [];
                const validSets = logs.filter(s => s.completed || s.isLocked || (s.weight && s.reps));

                if (validSets.length > 0) {
                    const totalReps = validSets.reduce((sum, s) => sum + (parseInt(s.reps, 10) || 0), 0);
                    const avgReps = totalReps / validSets.length;

                    if (!historyTracking[ex.name]) {
                        historyTracking[ex.name] = [];
                    }
                    
                    historyTracking[ex.name].push({
                        week: wNum,
                        avgReps: avgReps
                    });
                }
            });
        });
    });

    const stalledExercises = [];

    Object.keys(historyTracking).forEach(exerciseName => {
        const dataPoints = historyTracking[exerciseName];

        if (dataPoints.length >= 3) {
            const recentPoints = dataPoints.slice(-2);
            const repsWeekPrev = recentPoints[0].avgReps;
            const repsWeekLast = recentPoints[1].avgReps;

            if (repsWeekLast <= repsWeekPrev) {
                stalledExercises.push(exerciseName);
            }
        }
    });

    return {
        stalledExercises,
        recommendation: stalledExercises.length > 2 ? 'rotation_suggested' : 'progressive_overload'
    };
}
