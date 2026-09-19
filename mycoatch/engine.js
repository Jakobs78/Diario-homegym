// mycoatch/engine.js
import { EXERCISE_DATABASE } from './exercisesDB.js';

/**
 * Punti di riferimento del volume ipertrofico settimanale (Evidence-Based) - Spacchettati per distretto anatomico
 */
export const MUSCLE_VOLUME_LANDMARKS = {
    Petto: { mev: 8, mav: 14, mrv: 20 },
    Back_Lats: { mev: 10, mav: 16, mrv: 22 },
    Back_Thickness: { mev: 8, mav: 14, mrv: 20 },
    Quadricipiti: { mev: 8, mav: 14, mrv: 20 },
    Femorali: { mev: 6, mav: 12, mrv: 16 },
    Spalle: { mev: 8, mav: 14, mrv: 20 },
    Bicipiti: { mev: 6, mav: 10, mrv: 15 },
    Tricipiti: { mev: 6, mav: 10, mrv: 15 },
    Gambe: { mev: 10, mav: 16, mrv: 22 } // Fallback generico
};

/**
 * Genera un mesociclo ottimizzato bilanciando MEV/MAV/MRV, focus muscolari,
 * progressioni RPE e tecniche di intensità temporizzate.
 */
export function generateSmartMesocycle(config = {}, historicalData = {}, rawLastMesocycle = null) {
    const safeHistory = historicalData || {};
    
    // Analizziamo lo storico con il motore avanzato basato su e1RM e note trasparenti
    const analysis = analyzePreviousMesocycle(rawLastMesocycle);
    
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
            
            // 🧠 Limite di tolleranza neurale giornaliero
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

            // Integrazione della funzione di specializzazione originale
            rawExercises = applySpecializationFocus(rawExercises, safeHistory);

            const processedExercises = rawExercises.map((exItem, index) => {
                const ex = exItem;
                
                let baseKg = safeHistory[ex.name]?.lastKg !== undefined 
                    ? safeHistory[ex.name].lastKg 
                    : (parseFloat(ex.defaultKg) || 0);

                // Auto-Deload Preventivo per Inattività
                const isReturningFromBreak = safeHistory.lastWorkoutDate && 
                    ((new Date() - new Date(safeHistory.lastWorkoutDate)) / (1000 * 60 * 60 * 24)) > 7;
                
                let autoNote = "";
                if (isReturningFromBreak && w === 1) {
                    baseKg = baseKg * 0.85; 
                    autoNote += " 🛡️ [AUTO-DELOAD INATTIVITÀ]: Carico ridotto del 15% per rientro da stop. | ";
                }
                
                // Iniettiamo la nota analitica sullo stallo o progresso basata sull'e1RM
                if (analysis.exerciseNotes && analysis.exerciseNotes[ex.name]) {
                    autoNote += `${analysis.exerciseNotes[ex.name]} | `;
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

                const mainMuscle = Object.keys(MUSCLE_VOLUME_LANDMARKS).find(m => ex.category.toLowerCase().includes(m.toLowerCase())) || "Petto";
                const realFrequency = muscleFrequencyMap[mainMuscle] || 2;

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
                let noteFinal = autoNote + (exItem.noteOverride || generateContextNote(index, isDeloadWeek, focus, useSupersets));

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

                const currentTechnique = exItem.intensityTechnique || null;

                const setsArray = Array.from({ length: setsCount }, (_, setIdx) => {
                    let setKg = targetKgMin;
                    
                    if (setIdx === 0 && topsetStr) {
                        setKg = targetKgMin + (baseKg < 12.5 ? 1 : 2.5);
                    } else if (setIdx > 0 && topsetStr) {
                        const topKg = targetKgMin + (baseKg < 12.5 ? 1 : 2.5);
                        setKg = Math.round((topKg * 0.9) / 2.5) * 2.5;
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
                    notes: noteFinal, // <-- Visibile direttamente nel tab delle note della WebApp per spiegare le decisioni
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
 * Calcola il numero di serie target rispettando le soglie ipertrofiche (MEV/MAV/MRV)
 */
function calculateTargetSets({ category = "", focusMuscleGroup, isDeloadWeek, weekNumber, isMaster, frequency = 2 }) {
    if (isDeloadWeek) return 2;

    const mainMuscle = Object.keys(MUSCLE_VOLUME_LANDMARKS).find(m => category.toLowerCase().includes(m.toLowerCase())) || "Petto";
    const landmarks = MUSCLE_VOLUME_LANDMARKS[mainMuscle] || MUSCLE_VOLUME_LANDMARKS.Petto;

    const isSpecialization = focusMuscleGroup && focusMuscleGroup.toLowerCase() === mainMuscle.toLowerCase();
    const targetVolumeLandmark = isSpecialization ? landmarks.mav : landmarks.mev;
    
    let targetSets = Math.round(targetVolumeLandmark / Math.max(1, frequency));
    if (weekNumber === 3) targetSets += 1;

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
    // Filtro Home Gym originale
    const availableEquipment = ["barbell", "dumbbell", "bodyweight", "lat_machine"];

    let matches = EXERCISE_DATABASE.filter(e => {
        const categoryMatch = e.category.toLowerCase() === slot.muscle.toLowerCase();
        const patternMatch = slot.pattern ? e.pattern === slot.pattern : true;
        const isNotDuplicate = !alreadySelected.includes(e.name);
        const hasEquipment = availableEquipment.includes(e.equipment);
        return categoryMatch && patternMatch && isNotDuplicate && hasEquipment;
    });

    if (matches.length === 0) {
        matches = EXERCISE_DATABASE.filter(e => {
            return e.category.toLowerCase() === slot.muscle.toLowerCase() && 
                   !alreadySelected.includes(e.name) && 
                   availableEquipment.includes(e.equipment);
        });
    }

    if (matches.length === 0) return null;

    if (currentCNS > (maxCNS - 6)) {
        matches.sort((a, b) => a.cnsCost - b.cnsCost);
    } else {
        matches.sort((a, b) => b.cnsCost - a.cnsCost);
    }

    let selected = matches.find(e => !stalledExercises.includes(e.name)) || matches[0];

    if ((currentCNS + selected.cnsCost) > maxCNS) {
        selected = { 
            ...selected, 
            noteOverride: `⚠️ [CNS BUDGET LIMIT]: Esercizio inserito ma soglia neurale superata. Consiglio: abbassa i carichi del 10% o esegui 1 set in meno.` 
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
                    { muscle: "Quadricipiti", pattern: "squat" },
                    { muscle: "Spalle", pattern: "isolation" },
                    { muscle: "Bicipiti", pattern: "isolation" }
                ]
            },
            {
                name: "Full Body B (Focus Stacco Rumeno, Spalla & Dorso Spessore)",
                slots: [
                    { muscle: "Femorali", pattern: "hinge" },
                    { muscle: "Spalle", pattern: "vertical_push" },
                    { muscle: "Back_Thickness", pattern: "horizontal_pull" },
                    { muscle: "Petto", pattern: "isolation" },
                    { muscle: "Tricipiti", pattern: "isolation" }
                ]
            },
            {
                name: "Full Body C (Focus Leg Press, Petto Inclinato & Braccia)",
                slots: [
                    { muscle: "Quadricipiti", pattern: "squat" },
                    { muscle: "Petto", pattern: "horizontal_push" },
                    { muscle: "Back_Lats", pattern: "vertical_pull" },
                    { muscle: "Bicipiti", pattern: "isolation" },
                    { muscle: "Tricipiti", pattern: "isolation" }
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
                { muscle: "Bicipiti", pattern: "isolation" }
            ]
        },
        {
            name: "Lower A (Focus Squat & Femorali)",
            slots: [
                { muscle: "Quadricipiti", pattern: "squat" },
                { muscle: "Femorali", pattern: "hinge" },
                { muscle: "Quadricipiti", pattern: "squat" },
                { muscle: "Femorali", pattern: "isolation" }
            ]
        },
        {
            name: "Upper B (Focus Military Press, Rematore & Tricipiti)",
            slots: [
                { muscle: "Back_Lats", pattern: "vertical_pull" },
                { muscle: "Spalle", pattern: "vertical_push" },
                { muscle: "Back_Thickness", pattern: "horizontal_pull" },
                { muscle: "Petto", pattern: "isolation" },
                { muscle: "Tricipiti", pattern: "isolation" }
            ]
        },
        {
            name: "Lower B (Focus Stacco Rumeno & Quadricipiti)",
            slots: [
                { muscle: "Femorali", pattern: "hinge" },
                { muscle: "Quadricipiti", pattern: "squat" },
                { muscle: "Spalle", pattern: "isolation" },
                { muscle: "Tricipiti", pattern: "isolation" }
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

/**
 * 🧠 ANALISI STALLO AVANZATA BASATA SULL'e1RM (Epley + RPE)
 * Sostituisce il controllo rudimentale sulle ripetizioni e genera note trasparenti per la webapp.
 */
export function analyzePreviousMesocycle(lastMesocycle) {
    if (!lastMesocycle || !lastMesocycle.weeks) {
        return { stalledExercises: [], exerciseNotes: {}, recommendation: 'standard' };
    }

    const historyTracking = {};
    const exerciseNotes = {};

    lastMesocycle.weeks.forEach(week => {
        const wNum = week.weekNumber;
        
        (week.days || []).forEach(day => {
            (day.exercises || []).forEach(ex => {
                const logs = ex.loggedSets || ex.sets || ex.completedLogs || [];
                const validSets = logs.filter(s => s.completed || s.isLocked || (s.weight && s.reps));

                if (validSets.length > 0) {
                    // Calcolo e1RM reale per ogni set registrato usando Epley modificato con RPE
                    const e1Rms = validSets.map(s => {
                        const w = parseFloat(s.weight || s.actualKg || ex.kgMin) || 0;
                        const r = parseInt(s.reps || s.actualReps, 10) || 0;
                        const rpe = parseFloat(String(s.rpe).replace('@', '')) || 8;
                        const effectiveReps = r + Math.max(0, 10 - rpe);
                        return w * (1 + 0.0333 * effectiveReps);
                    }).filter(val => val > 0);

                    if (e1Rms.length > 0) {
                        const maxE1RM = Math.max(...e1Rms);
                        if (!historyTracking[ex.name]) {
                            historyTracking[ex.name] = [];
                        }
                        historyTracking[ex.name].push({ week: wNum, e1RM: maxE1RM });
                    }
                }
            });
        });
    });

    const stalledExercises = [];

    Object.keys(historyTracking).forEach(exerciseName => {
        const dataPoints = historyTracking[exerciseName];

        if (dataPoints.length >= 2) {
            const recentPoints = dataPoints.slice(-2);
            const e1rmPrev = recentPoints[0].e1RM;
            const e1rmLast = recentPoints[1].e1RM;

            // Se l'e1RM ristagna o scende nonostante i tentativi di progressione
            if (e1rmLast <= e1rmPrev * 1.01) {
                stalledExercises.push(exerciseName);
                exerciseNotes[exerciseName] = `⚠️ [STALLO e1RM RILEVATO]: e1RM stabile o in calo (${Math.round(e1rmLast)}kg vs ${Math.round(e1rmPrev)}kg). Variazione biomeccanica attivata.`;
            } else {
                exerciseNotes[exerciseName] = `🔥 [PROGRESSO e1RM]: Ottimo incremento a ${Math.round(e1rmLast)}kg (vs ${Math.round(e1rmPrev)}kg).`;
            }
        }
    });

    return {
        stalledExercises,
        exerciseNotes,
        recommendation: stalledExercises.length > 2 ? 'rotation_suggested' : 'progressive_overload'
    };
}