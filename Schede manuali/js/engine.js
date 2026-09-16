/**
 * Module: builderEngine.js
 * Summary: Motore logico per il wizard esterno del mesociclo. Gestisce la struttura della Settimana 1,
 * applica le logiche di progressione (carico o volume) per le settimane successive e genera
 * il file CSV finale perfettamente compatibile con la webapp principale.
 * Genera l'intero oggetto mesociclo partendo dai dati base e applicando le regole di progressione
*/
export function generateMesocycleData(state) {
    const { name, durationWeeks, stepKg } = state.config;
    const daysExercises = state.exercises;
    
    const weeks = [];

    for (let w = 1; w <= durationWeeks; w++) {
        const uniqueDays = [...new Set(daysExercises.map(ex => ex.dayNumber || 1))].sort((a, b) => a - b);

        const weekDays = uniqueDays.map(dayNum => {
            const exercisesForDay = daysExercises.filter(ex => (ex.dayNumber || 1) === dayNum);

            return {
                dayNumber: dayNum,
                dayName: `Giorno ${dayNum}`,
                exercises: exercisesForDay.map(ex => {
                    const sets = JSON.parse(JSON.stringify(ex.sets || []));
                    let targetKgMin = ex.kgMin !== '' ? parseFloat(ex.kgMin) || 0 : 0;
                    let targetKgMax = ex.kgMax !== '' ? parseFloat(ex.kgMax) || 0 : 0;

                    if (w > 1 && ex.progressionType === 'load') {
                        const increment = (parseFloat(stepKg) || 1) * (w - 1);
                        targetKgMin += increment;
                        targetKgMax += increment;
                    }

                    return {
                        block: ex.block || 1,
                        name: ex.name,
                        set: `${sets.length} set`,
                        reps: ex.reps,
                        kgMin: targetKgMin ? targetKgMin.toString() : '',
                        kgMax: targetKgMax ? targetKgMax.toString() : '',
                        topset: ex.topset || '',
                        rpe: ex.rpe || '',
                        rest: ex.rest || '90',
                        notes: ex.notes || '',
                        sets: sets
                    };
                })
            };
        });

        weeks.push({
            weekNumber: w,
            coachNotes: `Settimana ${w} - Programmazione Ibrida (Forza / Ipertrofia)`,
            days: weekDays
        });
    }

    return {
        id: `meso_wizard_${Date.now()}`,
        name: name,
        createdAt: new Date().toISOString(),
        weeks: weeks
    };
}