// mycoatch/engine.js
import { EXERCISE_DATABASE } from './exercisesDB.js';
import { analyzeCompletedMesocycle } from './historyAnalysis.js';
import { canonicalExerciseKey } from './exerciseIdentity.js';
import { optimizeSession } from './groupOptimizer.js';
import { rebalanceWeeklyAccessories } from './weeklyVolumeBalancer.js';
import { normalizeSelectionPreferences, selectExerciseForSlot } from './exerciseSelection.js';
import { auditWeeklyCoverage } from './weeklyCoverage.js';

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
    Gambe: { mev: 10, mav: 16, mrv: 22 }, // Fallback generico
    Glutei: { mev: 4, mav: 8, mrv: 16 },
    Polpacci: { mev: 4, mav: 8, mrv: 14 },
    Core: { mev: 4, mav: 8, mrv: 12 }
};

/**
 * Genera un mesociclo ottimizzato bilanciando MEV/MAV/MRV, focus muscolari,
 * progressioni RPE e tecniche di intensità temporizzate.
 */
export function generateSmartMesocycle(config = {}, historicalData = {}, rawLastMesocycle = null) {
    const safeHistory = historicalData || {};
    
    // Analizziamo lo storico con il motore avanzato basato su e1RM e note trasparenti
    const analysis = safeHistory.byExercise ? safeHistory : analyzeCompletedMesocycle(rawLastMesocycle);
    
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
    const isMaster = false; // Non imporre riduzioni automatiche basate solo sull'età.
    const deloadWeekNumber = config.deloadWeek === false ? null : durationWeeks; // Scarico di fine blocco disattivabile.

    // 2. Vincoli di tempo
    // Il vincolo è il tempo realmente stimato, non un taglio prefissato degli slot.

    const templateDays = getTemplateForDays(daysPerWeek);
    const selectionPreferences = normalizeSelectionPreferences(config);
    
    // Calcolo della frequenza settimanale reale per ogni gruppo muscolare nel template
    const muscleFrequencyMap = {};
    templateDays.forEach(day => {
        const slots = day.slots;
        slots.forEach(slot => {
            const mainMuscle = slot.muscle;
            muscleFrequencyMap[mainMuscle] = (muscleFrequencyMap[mainMuscle] || 0) + 1;
        });
    });

    const weeks = [];

    for (let w = 1; w <= durationWeeks; w++) {
        const weekDays = [];
        const intendedDays = [];
        const volumeAdjustmentsApplied = new Set();
        const weeklySelectionCounts = new Map();
        const excludedOptionalSlots = [];
        const isDeloadWeek = (deloadWeekNumber !== null && w === deloadWeekNumber);

        // Progressione dinamica del target RPE di settimana in settimana
        let rpeString = "8.0";
        if (isDeloadWeek) {
            rpeString = "6.5";
        } else if (focus === 'strength') {
            rpeString = w === 1 ? "8.0" : w === 2 ? "8.5" : "9.0";
        } else {
            rpeString = w === 1 ? "7.5" : w === 2 ? "8.0" : "8.5";
        }

        templateDays.forEach((dayTemplate, dayIndex) => {
            const activeSlots = dayTemplate.slots;
            
            const exercisesSelectedToday = [];
            const previousDay = rawLastMesocycle?.weeks?.[0]?.days
                ?.find(d => Number(d.dayNumber) === dayIndex + 1);
            // Il selettore non confonde una preferenza storica con uno schema
            // motorio diverso. Le quattro alzate fondamentali occupano posizioni
            // protette contro i tagli per il tempo, ma possono essere sostituite
            // esplicitamente dall'atleta con varianti dello stesso pattern.
            let rawExercises = activeSlots.flatMap((slot, slotIndex) => {
                const previousName = previousDay?.exercises?.[slotIndex]?.name || null;
                const selected = selectExerciseForSlot(slot, {
                    preferences: selectionPreferences,
                    focus,
                    previousName,
                    selectedToday: exercisesSelectedToday,
                    weeklyCounts: weeklySelectionCounts
                });
                if (!selected.exercise) {
                    excludedOptionalSlots.push({
                        dayNumber: dayIndex + 1,
                        muscle: slot.muscle,
                        pattern: slot.pattern,
                        reason: selected.reason
                    });
                    return [];
                }
                const exercise = selected.exercise;
                exercisesSelectedToday.push(exercise.name);
                weeklySelectionCounts.set(exercise.id,
                    (weeklySelectionCounts.get(exercise.id) || 0) + 1);
                return [{ ...exercise, selectionReason: selected.reason }];
            });

            // Integrazione della funzione di specializzazione originale
            rawExercises = applySpecializationFocus(rawExercises, safeHistory);

            const processedExercises = rawExercises.map((exItem, index) => {
                const ex = exItem;
                
                const canonicalKey = canonicalExerciseKey(ex.name);
                const prior = analysis.byExercise?.[canonicalKey];
                const loadDecision = analysis.decisions?.byExercise?.[canonicalKey];
                let baseKg = Number.isFinite(loadDecision?.plannedKg) && loadDecision.plannedKg > 0
                    ? loadDecision.plannedKg : (Number.isFinite(prior?.lastKg) && prior.lastKg > 0 ? prior.lastKg : null);

                // Auto-Deload Preventivo per Inattività
                let autoNote = "";
                
                // Iniettiamo la nota analitica sullo stallo o progresso basata sull'e1RM
                if (analysis.exerciseNotes && analysis.exerciseNotes[canonicalExerciseKey(ex.name)]) {
                    autoNote += `${analysis.exerciseNotes[canonicalExerciseKey(ex.name)]} | `;
                }
                
                // Il carico progredisce in base alle prestazioni e all'RPE, non al calendario.
                const plannedKg = baseKg === null ? null : (isDeloadWeek ? baseKg * 0.85 : baseKg);
                const targetKgMin = plannedKg === null ? '' :
                    String(plannedKg < 12.5 ? Math.round(plannedKg * 2) / 2 : Math.round(plannedKg / 2.5) * 2.5);
                const targetKgMax = plannedKg === null ? '' : targetKgMin;

                const mainMuscle = ex.category;
                const realFrequency = muscleFrequencyMap[mainMuscle] || 2;

                let baseSets = calculateTargetSets({
                    category: ex.category,
                    focusMuscleGroup,
                    isDeloadWeek,
                    weekNumber: w,
                    isMaster,
                    frequency: realFrequency
                });
                
                let setsCount = Math.max(2, baseSets);
                const volumeDecision = analysis.decisions?.byMuscle?.[ex.category];
                if (!isDeloadWeek && ex.pattern === 'isolation' &&
                    !volumeAdjustmentsApplied.has(ex.category) && volumeDecision?.volumeDelta) {
                    const suggested = Math.max(2, Math.min(4, setsCount + volumeDecision.volumeDelta));
                    if (suggested !== setsCount) {
                        setsCount = suggested;
                        volumeAdjustmentsApplied.add(ex.category);
                        autoNote += `${volumeDecision.reason} | `;
                    }
                }

                let reps = ex.defaultReps || "8-12";
                if (focus === 'strength' && index === 0) {
                    reps = "3-5";
                } else if (focus === 'hypertrophy') {
                    reps = index === 0 ? "6-8" : "10-15";
                }

                let topsetStr = "";
                if (loadDecision && loadDecision.action !== 'maintain') {
                    autoNote += `${loadDecision.reason} | `;
                }
                let noteFinal = autoNote + generateContextNote(index, isDeloadWeek, focus) +
                    (exItem.selectionReason ? ' | [SCELTA MYCOATCH] ' + exItem.selectionReason : '') +
                    (exItem.noteOverride ? ' | ' + exItem.noteOverride : '');

                const isFirstCompound = index === 0 && ["squat", "hinge", "horizontal_push", "vertical_push", "vertical_pull"].includes(ex.pattern);
                
                if (isFirstCompound && plannedKg !== null) {
                    const w1 = Math.round(baseKg * 0.5);
                    const w2 = Math.round(baseKg * 0.7);
                    const w3 = Math.round(baseKg * 0.85);
                    noteFinal = `🔥 [WARM-UP AUTO]: 8x${w1}kg, 4x${w2}kg, 2x${w3}kg. | ` + noteFinal;
                }

                if (config.useTopset === true && index === 0 && plannedKg !== null && !isDeloadWeek && focus !== 'strength') {
                    const topKg = Number(targetKgMin) + (baseKg < 12.5 ? 1 : 2.5);
                    topsetStr = `1x${reps.split('-')[0]} @ ${topKg}kg (RPE 9)`;
                    noteFinal += ` | 🎯 Top Set eseguito, poi Back-Off automatico del 10%.`;
                }

                const currentTechnique = exItem.intensityTechnique || null;

                const setsArray = Array.from({ length: setsCount }, (_, setIdx) => {
                    let setKg = plannedKg === null ? null : Number(targetKgMin);
                    
                    if (setIdx === 0 && topsetStr) {
                        setKg = Number(targetKgMin) + (baseKg < 12.5 ? 1 : 2.5);
                    } else if (setIdx > 0 && topsetStr) {
                        const topKg = Number(targetKgMin) + (baseKg < 12.5 ? 1 : 2.5);
                        setKg = Math.round((topKg * 0.9) / 2.5) * 2.5;
                    }

                    const isLastSet = (setIdx === setsCount - 1);

                    return {
                        setNumber: setIdx + 1,
                        targetReps: reps,
                        targetKg: setKg !== null && setKg > 0 ? setKg.toString() : "",
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
                    kgMin: String(targetKgMin),
                    kgMax: String(targetKgMax),
                    restTime: index === 0 ? "180s" : (ex.pattern === "isolation" ? "90s" : "150s"),
                    category: ex.category,
                    pattern: ex.pattern,
                    equipment: ex.equipment,
                    topset: topsetStr,
                    rpe: rpeString,
                    notes: noteFinal, // <-- Visibile direttamente nel tab delle note della WebApp per spiegare le decisioni
                    sets: setsArray
                };
            });

            intendedDays.push(processedExercises);
            const timedPlan = optimizeSession(processedExercises, maxSessionMinutes);
            weekDays.push({
                dayNumber: dayIndex + 1,
                dayName: dayTemplate.name,
                ...timedPlan
            });
        });

        // Il limite di minuti si applica a OGNI giornata. Solo dopo avere
        // costruito la settimana si possono recuperare accessori nei giorni
        // compatibili con margine sufficiente. Non modificare il deload.
        const balanced = rebalanceWeeklyAccessories(
            weekDays, intendedDays, maxSessionMinutes, { isDeloadWeek }
        );
        for (const day of balanced.days) {
            // Il CSV originale non contiene la colonna "nome giornata":
            // conserviamo lo split nella nota del primo esercizio, così
            // l'importatore può mostrare Upper A / Lower A / Upper B / Lower B.
            const dayLabel = String(day.dayName).match(/^(Upper [AB]|Lower [AB]|Full Body [ABC])\b/)?.[1];
            const splitNote = dayLabel ? `[SPLIT MYCOATCH] ${dayLabel}` : '';
            const durationNote = `[DURATA STIMATA] ${day.estimatedMinutes} minuti su ${maxSessionMinutes} disponibili.`;
            const adjustments = [];
            if (day.reducedAccessorySets) adjustments.push(`${day.reducedAccessorySets} serie accessorie ridotte`);
            if (day.removedAccessoryExercises) adjustments.push(`${day.removedAccessoryExercises} esercizi rimossi`);
            if (day.transferredAccessorySetsIn) {
                adjustments.push(`${day.transferredAccessorySetsIn} serie accessorie recuperate da altri giorni`);
            }
            if (day.transferredAccessorySetsOut) {
                adjustments.push(`${day.transferredAccessorySetsOut} serie recuperate su un altro giorno`);
            }
            if (adjustments.length) {
                adjustments.push('verificare il riepilogo del volume settimanale');
            }
            // Il CSV resta a 12 colonne: note con stima e compromessi.
            day.exercises[0].notes = [
                splitNote, day.exercises[0].notes, durationNote,
                adjustments.length ? '[TEMPO RIDOTTO] ' + adjustments.join(', ') + '.' : ''
            ].filter(Boolean).join(' | ');
        }
        weeks.push({
            weekNumber: w,
            days: balanced.days,
            volumeBalance: balanced.report,
            weeklyCoverage: auditWeeklyCoverage(balanced.days, templateDays),
            optionalSlotsNotAvailable: excludedOptionalSlots
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

    const mainMuscle = Object.keys(MUSCLE_VOLUME_LANDMARKS).find(m => m.toLowerCase() === category.toLowerCase()) || "Gambe";
    const landmarks = MUSCLE_VOLUME_LANDMARKS[mainMuscle] || MUSCLE_VOLUME_LANDMARKS.Petto;

    const isSpecialization = focusMuscleGroup && focusMuscleGroup.toLowerCase() === mainMuscle.toLowerCase();
    const targetVolumeLandmark = isSpecialization ? landmarks.mav : landmarks.mev;
    
    let targetSets = Math.round(targetVolumeLandmark / Math.max(1, frequency));
    if (weekNumber === 3) targetSets += 1;

    const maxAllowed = Math.min(3, Math.ceil(landmarks.mrv / Math.max(1, frequency)));
    return Math.max(2, Math.min(targetSets, maxAllowed));
}

function generateContextNote(index, isDeload, focus) {
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

    return note;
}

export function getTemplateForDays(daysPerWeek = 3) {
    if (daysPerWeek === 3) {
        // Con tre sedute si preferisce la Full Body: i quattro fondamentali
        // restano distribuiti nella settimana, senza tre lower consecutivi.
        return [
            {
                name: 'Full Body A (Panca, dorsali, quadricipiti)',
                slots: [
                    { muscle: 'Petto', pattern: 'horizontal_push', anchor: 'bench' },
                    { muscle: 'Back_Lats', pattern: 'vertical_pull' },
                    { muscle: 'Quadricipiti', pattern: 'squat' },
                    { muscle: 'Spalle', pattern: 'isolation' },
                    { muscle: 'Bicipiti', pattern: 'isolation' },
                    { muscle: 'Polpacci', pattern: 'isolation', optional: true }
                ]
            },
            {
                name: 'Full Body B (Hip hinge, spinta verticale, dorso)',
                slots: [
                    { muscle: 'Femorali', pattern: 'hinge', anchor: 'hinge' },
                    { muscle: 'Spalle', pattern: 'vertical_push', anchor: 'military' },
                    { muscle: 'Back_Thickness', pattern: 'horizontal_pull' },
                    { muscle: 'Petto', pattern: 'isolation' },
                    { muscle: 'Tricipiti', pattern: 'isolation' },
                    { muscle: 'Core', pattern: 'isolation', optional: true }
                ]
            },
            {
                name: 'Full Body C (Squat, petto, dorsali)',
                slots: [
                    { muscle: 'Quadricipiti', pattern: 'squat', anchor: 'squat' },
                    { muscle: 'Petto', pattern: 'horizontal_push' },
                    { muscle: 'Back_Lats', pattern: 'vertical_pull' },
                    { muscle: 'Glutei', pattern: 'hip_thrust', optional: true },
                    { muscle: 'Bicipiti', pattern: 'isolation' },
                    { muscle: 'Core', pattern: 'isolation', optional: true }
                ]
            }
        ];
    }
    if (daysPerWeek !== 4) throw new Error('MyCoatch supporta 3 o 4 giorni a settimana.');

    return [
        {
            name: 'Upper A (Priorità panca, dorsali)',
            slots: [
                { muscle: 'Petto', pattern: 'horizontal_push', anchor: 'bench' },
                { muscle: 'Back_Lats', pattern: 'vertical_pull' },
                { muscle: 'Petto', pattern: 'isolation' },
                { muscle: 'Spalle', pattern: 'isolation', prefer: [
                    'Alzate Laterali con Manubri', 'Alzate Laterali ai Cavi'
                ] },
                { muscle: 'Bicipiti', pattern: 'isolation' }
            ]
        },
        {
            name: 'Lower A (Priorità squat, glutei)',
            slots: [
                { muscle: 'Quadricipiti', pattern: 'squat', anchor: 'squat' },
                { muscle: 'Glutei', pattern: 'hip_thrust' },
                { muscle: 'Quadricipiti', pattern: 'squat', prefer: [
                    'Bulgarian Split Squat con Manubri', 'Affondi con Manubri',
                    'Goblet Squat con Manubrio', 'Front Squat'
                ] },
                { muscle: 'Femorali', pattern: 'isolation', optional: true },
                { muscle: 'Polpacci', pattern: 'isolation' },
                { muscle: 'Core', pattern: 'isolation', optional: true }
            ]
        },
        {
            name: 'Upper B (Priorità military press, richiamo petto e dorso)',
            slots: [
                { muscle: 'Spalle', pattern: 'vertical_push', anchor: 'military' },
                { muscle: 'Back_Thickness', pattern: 'horizontal_pull' },
                { muscle: 'Petto', pattern: 'horizontal_push', prefer: [
                    'Panca Inclinata con Manubri', 'Panca Inclinata con Bilanciere',
                    'Push-up a Terra'
                ] },
                // I tricipiti hanno la priorità sui richiami facoltativi del dorso:
                // la spinta verticale non sostituisce sempre serie dirette di estensione.
                { muscle: 'Tricipiti', pattern: 'isolation' },
                { muscle: 'Back_Lats', pattern: 'vertical_pull', optional: true },
                { muscle: 'Spalle', pattern: 'isolation', prefer: [
                    'Alzate Posteriori con Manubri', 'Face Pull ai Cavi',
                    'Reverse Fly ai Cavi'
                ], optional: true }
            ]
        },
        {
            name: 'Lower B (Priorità stacco rumeno o convenzionale)',
            slots: [
                { muscle: 'Femorali', pattern: 'hinge', anchor: 'hinge' },
                { muscle: 'Quadricipiti', pattern: 'squat', prefer: [
                    'Front Squat', 'Goblet Squat con Manubrio',
                    'Bulgarian Split Squat con Manubri'
                ] },
                { muscle: 'Femorali', pattern: 'isolation', optional: true },
                { muscle: 'Glutei', pattern: 'hip_thrust', optional: true },
                { muscle: 'Polpacci', pattern: 'isolation' },
                { muscle: 'Core', pattern: 'isolation', optional: true }
            ]
        }
    ];
}

export function applySpecializationFocus(exercises, historicalData) {
    return exercises.map(ex => {
        const exHistory = historicalData.byExercise?.[canonicalExerciseKey(ex.name)];
        
        if (exHistory && exHistory.status === "possible_stall") {
            return {
                ...ex,
                noteOverride: "Possibile stallo: verifica recupero, aderenza e tecnica prima di cambiare il programma."
            };
        }
        return ex;
    });
}

/** @deprecated Usa analyzeTrainingHistory per lo storico completo. */
export function analyzePreviousMesocycle(lastMesocycle) {
    return analyzeCompletedMesocycle(lastMesocycle);
}
