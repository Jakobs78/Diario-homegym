// mycoatch/engine.js
import { EXERCISE_DATABASE } from './exercisesDB.js';

export function generateSmartMesocycle(config = {}, analysis = {}, historicalData = {}) {
    const { 
        name = "Nuovo Mesociclo Ibrido", 
        durationWeeks = 4, 
        daysPerWeek = 3, 
        focus = "hybrid", 
        stepKg = 2.5, 
        maxSessionMinutes = 60,
        userAge = 30,
        trainingYears = 3 
    } = config;

    const ageRecoveryFactor = userAge > 45 ? 0.8 : (userAge > 35 ? 0.9 : 1.0);
    const experienceMultiplier = trainingYears < 2 ? 0.9 : 1.0;

    const weeks = [];

    for (let w = 1; w <= durationWeeks; w++) {
        const weekDays = [];
        const isDeloadWeek = (w === durationWeeks);

        for (let d = 1; d <= daysPerWeek; d++) {
            let exercisesForDay = selectExercisesForDay(d, focus, analysis.stalledExercises || []);
            
            exercisesForDay = applySpecializationFocus(exercisesForDay, historicalData);

            let structuredExercises = applyDensityAndNotes(exercisesForDay, maxSessionMinutes, isDeloadWeek);

            const processedExercises = structuredExercises.map((item, index) => {
                const ex = item.exercise;
                
                // Cerca il carico nel formato storico strutturato o nei log recenti
                let baseKg = historicalData[ex.name]?.lastKg !== undefined 
                    ? historicalData[ex.name].lastKg 
                    : (parseFloat(ex.defaultKg) || 0);

                if (w > 1 && !isDeloadWeek) {
                    const multiplier = (focus === 'strength' || (focus === 'hybrid' && index === 0)) ? 1 : 0.5;
                    
                    let effectiveStep = stepKg;
                    if (baseKg < 12.5) {
                        effectiveStep = Math.min(stepKg, 1.0);
                    }

                    baseKg += effectiveStep * (w - 1) * multiplier;
                }

                if (isDeloadWeek) {
                    baseKg = baseKg * 0.85;
                }

                const targetKgMin = baseKg < 12.5 ? Math.round(baseKg * 2) / 2 : Math.round(baseKg / 2.5) * 2.5;
                const targetKgMax = targetKgMin + (baseKg < 12.5 ? 2 : 5);

                let setsCount = 3;
                if (focus === 'strength') {
                    setsCount = isDeloadWeek ? 2 : (w === 3 ? 5 : 4);
                } else if (focus === 'hypertrophy' || focus === 'hybrid') {
                    if (isDeloadWeek) {
                        setsCount = 2;
                    } else {
                        setsCount = w === 1 ? 3 : (w === 3 ? 4 : 3);
                    }
                }

                if ((ageRecoveryFactor < 1.0 || experienceMultiplier < 1.0) && setsCount > 3 && !isDeloadWeek) {
                    setsCount = 3; 
                }

                let reps = ex.defaultReps;
                if (focus === 'strength') {
                    reps = "3-5";
                } else if (focus === 'hypertrophy') {
                    reps = index === 0 ? "6-8" : "10-15";
                } else if (focus === 'hybrid') {
                    reps = "8-12";
                }

                let topsetStr = "";
                let notesFinal = item.note;

                if (index === 0 && !isDeloadWeek && focus !== 'strength') {
                    const topKg = targetKgMin + (baseKg < 12.5 ? 1 : 2.5);
                    topsetStr = `1x${reps.split('-')[0]} @ ${topKg}kg (RPE 9)`;
                    notesFinal += ` | Esegui il Top Set indicato, poi scala il carico del 10% per le successive ${setsCount - 1} serie di back-off.`;
                }

                const setsArray = Array.from({ length: setsCount }, (_, setIdx) => {
                    let setKg = targetKgMin;
                    let setReps = reps;
                    
                    if (setIdx === 0 && topsetStr) {
                        setKg = targetKgMin + (baseKg < 12.5 ? 1 : 2.5);
                    }

                    return {
                        setNumber: setIdx + 1,
                        targetReps: setReps,
                        targetKg: setKg > 0 ? setKg.toString() : "-",
                        actualReps: "",
                        actualKg: "",
                        completed: false,
                        isWarmup: false
                    };
                });

                return {
                    name: ex.name,
                    setsCount: setsCount,
                    reps: reps,
                    kgMin: targetKgMin.toString(),
                    kgMax: targetKgMax.toString(),
                    topset: topsetStr,
                    rpe: isDeloadWeek ? "@6.5" : (focus === 'strength' ? "@8.5" : "@8.0"),
                    notes: notesFinal,
                    sets: setsArray
                };
            });

            weekDays.push({
                dayNumber: d,
                dayName: `Seduta ${d}`,
                exercises: processedExercises
            });
        }

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

function selectExercisesForDay(dayNum, focus, stalledExercises) {
    let rawList;
    
    if (dayNum === 1) {
        rawList = [
            EXERCISE_DATABASE.find(e => e.name.includes("Panca Piana")),
            EXERCISE_DATABASE.find(e => e.name.includes("Panca Inclinata")),
            EXERCISE_DATABASE.find(e => e.name.includes("Pushdown ai Cavi")),
            EXERCISE_DATABASE.find(e => e.name.includes("Croci ai Cavi"))
        ];
    } else if (dayNum === 2) {
        rawList = [
            EXERCISE_DATABASE.find(e => e.name.includes("Squat")),
            EXERCISE_DATABASE.find(e => e.name.includes("Stacco Rumeno")),
            EXERCISE_DATABASE.find(e => e.name.includes("Leg Curl Steso")),
            EXERCISE_DATABASE.find(e => e.name.includes("Leg Press 45°"))
        ];
    } else {
        rawList = [
            EXERCISE_DATABASE.find(e => e.name.includes("Trazioni")),
            EXERCISE_DATABASE.find(e => e.name.includes("Rematore")),
            EXERCISE_DATABASE.find(e => e.name.includes("Curl con Bilanciere EZ")),
            EXERCISE_DATABASE.find(e => e.name.includes("Curl Manubri su Panca Inclinata"))
        ];
    }

    return rawList.filter(Boolean).map(ex => {
        if (stalledExercises.includes(ex.name)) {
            return { ...ex, noteOverride: "Variante di rotazione per stallo precedente" };
        }
        return ex;
    });
}

function applyDensityAndNotes(exercises, maxMinutes, isDeload, focus) {
    const formatted = [];

    exercises.forEach((ex, idx) => {
        let note = ex.noteOverride || "";

        // Se non c'è un override specifico per stallo, creiamo una nota contestuale ricca
        if (!note) {
            if (isDeload) {
                note = "🛡️ Scarico attivo: mantieni il controllo eccentrico, fermati a 2-3 ripetizioni dal cedimento tecnico e non forzare i carichi.";
            } else if (idx === 0) {
                // Primo esercizio (il fondamentale pesante)
                note = focus === 'strength' 
                    ? "🔥 Focus su espressività di forza e compattezza: rispetta i recuperi completi e cura la spinta esplosiva concentrica." 
                    : "🎯 Esercizio chiave del giorno: gestisci il buffer programmato (1-2 RIR) senza sporcare l'esecuzione nelle prime serie.";
            } else if (idx === 1) {
                // Secondo esercizio
                note = "⚡ Transizione a tensione continua: cerca un buon pompaggio muscolare e un picco di contrazione di 1 secondo nel punto di massimo accorciamento.";
            } else {
                // Esercizi complementari / accessori finali
                note = "💧 Gestione metabolica: esegui con esecuzione rigorosa, controlla la fase negativa (2-3 secondi) ed evita slanci parassiti.";
            }

            // Aggiunta dinamica basata sui minuti massimi (densità / superserie)
            if (maxMinutes <= 50 && idx >= 2) {
                if (idx % 2 === 1) {
                    note += " ⏱️ [SUPERSERIE]: Esegui abbinato all'esercizio precedente senza pause intermedie.";
                } else {
                    note += " ⏱️ [SUPERSERIE]: Passa subito all'esercizio successivo mantenendo alta la densità.";
                }
            }
        }

        formatted.push({
            exercise: ex,
            note: note
        });
    });

    return formatted;
}

export function applySpecializationFocus(exercises, historicalData) {
    return exercises.map(ex => {
        const exHistory = historicalData[ex.name];
        if (exHistory && exHistory.stallsCount >= 2) {
            return {
                ...ex,
                noteOverride: "SPECIALIZZAZIONE CARENZA: Utilizza la tecnica Myo-Reps o Rest-Pause sull'ultima serie per sbloccare la crescita."
            };
        }
        return ex;
    });
}

export function analyzePreviousMesocycle(lastMesocycle) {
    if (!lastMesocycle || !lastMesocycle.weeks) return { stalledExercises: [], recommendation: 'standard' };

    let stalledExercises = [];
    lastMesocycle.weeks.forEach(week => {
        (week.days || []).forEach(day => {
            (day.exercises || []).forEach(ex => {
                // 👈 Supporta sia completedLogs che loggedSets salvati da csvHandler
                const logs = ex.completedLogs || ex.loggedSets || [];
                const validLogs = logs.filter(s => s.isLocked || (s.weight && s.reps));

                if (validLogs.length >= 3) {
                    const recent = validLogs.slice(-2);
                    const reps1 = recent[0].actualReps || recent[0].reps;
                    const reps2 = recent[1].actualReps || recent[1].reps;
                    
                    if (reps1 && reps2 && reps1 === reps2) {
                        stalledExercises.push(ex.name);
                    }
                }
            });
        });
    });

    return {
        stalledExercises,
        recommendation: stalledExercises.length > 2 ? 'rotation_suggested' : 'progressive_overload'
    };
}