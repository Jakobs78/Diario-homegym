// pdfTextMapper.js - Converte il testo estratto dal PDF del coach nella struttura dati della webapp

export function mapPdfTextToWorkoutData(cleanedText) {
    const workoutData = {
        athlete: { email: "Atleta" },
        history: {
            years: {
                [new Date().getFullYear().toString()]: {
                    mesocycles: [
                        {
                            name: "Mesociclo Importato da Coach",
                            locked: false,
                            weeks: []
                        }
                    ]
                }
            }
        }
    };

    const meso = workoutData.history.years[new Date().getFullYear().toString()].mesocycles[0];

    // Dividiamo il testo in base alle settimane
    const weekChunks = cleanedText.split(/--- PAGINA \d+ ---|Settimana\s+/i).filter(Boolean);

    weekChunks.forEach((chunk, index) => {
        const weekNumber = index + 1;
        
        const weekObj = {
            weekNumber: weekNumber,
            coachNotes: "",
            days: []
        };

        // Suddividiamo la settimana in giorni (cercando "giorno" o "Giorno")
        const dayChunks = chunk.split(/giorno\s+/i);

        // Se non troviamo divisioni per giorno esplicite, trattiamo il blocco come un unico giorno
        if (dayChunks.length <= 1) {
            weekObj.days.push({
                dayName: "Giorno 1",
                exercises: extractExercisesFromText(chunk)
            });
        } else {
            // Saltiamo il primo elemento se è solo intestazione
            dayChunks.forEach((dayChunk, dIdx) => {
                if (dIdx === 0) return; // intestazione iniziale

                const dayNumMatch = dayChunk.match(/^(\d+)/);
                const dayNumber = dayNumMatch ? parseInt(dayNumMatch[1], 10) : dIdx;

                const exercises = extractExercisesFromText(dayChunk);

                if (exercises.length > 0) {
                    weekObj.days.push({
                        dayName: `Giorno ${dayNumber}`,
                        exercises: exercises
                    });
                }
            });
        }

        // Fallback di sicurezza se la settimana è vuota
        if (weekObj.days.length === 0) {
            weekObj.days.push({
                dayName: "Giorno 1",
                exercises: [{
                    name: "Esercizio da importazione PDF",
                    targetSets: 3,
                    targetReps: "8-10",
                    loggedSets: [
                        { weight: "", reps: "", rpe: "", isLocked: false },
                        { weight: "", reps: "", rpe: "", isLocked: false },
                        { weight: "", reps: "", rpe: "", isLocked: false }
                    ]
                }]
            });
        }

        meso.weeks.push(weekObj);
    });

    console.log("WorkoutData mappato correttamente:", workoutData);
    return workoutData;
}

// Funzione interna di supporto per isolare gli esercizi dal testo del giorno
function extractExercisesFromText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const exercises = [];
    
    // Parole chiave da ignorare perché appartengono alle intestazioni delle tabelle del coach
    const headerKeywords = [
        'ESERCIZIO', 'SERIE', 'RIPETIZIONI', 'CARICO', 'TOPSET', 
        'MASSIMALE', 'RPE', 'TARGET', 'LRV', 'VL', 'EFFETTIVO', '---'
    ];

    lines.forEach(line => {
        const upperLine = line.toUpperCase();
        
        // Controlla se la riga è un'intestazione o un numero isolato
        const isHeader = headerKeywords.some(keyword => upperLine.includes(keyword));
        const isNumericOnly = /^\d+([.,]\d+)?$/.test(line);

        if (!isHeader && !isNumericOnly && line.length > 3) {
            exercises.push({
                name: line,
                targetSets: 3,
                targetReps: "8-10",
                loggedSets: [
                    { weight: "", reps: "", rpe: "", isLocked: false },
                    { weight: "", reps: "", rpe: "", isLocked: false },
                    { weight: "", reps: "", rpe: "", isLocked: false }
                ]
            });
        }
    });

    return exercises;
}