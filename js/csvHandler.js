// csvHandler.js
export function exportToCSV(workoutData) {
    // Estrae tutti gli esercizi dall'albero gerarchico per portarli in formato piatto tabellare
    const flatRows = [];
    
    const yearsObj = workoutData.history?.years || {};
    Object.keys(yearsObj).forEach(year => {
        (yearsObj[year].mesocycles || []).forEach(meso => {
            (meso.weeks || []).forEach(week => {
                (week.days || []).forEach(day => {
                    (day.exercises || []).forEach(ex => {
                        (ex.loggedSets || []).forEach(set => {
                            flatRows.push({
                                year,
                                mesocycle: meso.name,
                                week: week.weekNumber,
                                date: day.date,
                                exercise: ex.name,
                                setNumber: set.set,
                                reps: set.reps,
                                weight: set.weight,
                                rpe: set.rpe || ''
                            });
                        });
                    });
                });
            });
        });
    });

    if (flatRows.length === 0) {
        alert("Nessun dato strutturato da esportare.");
        return;
    }
    
    const headers = Object.keys(flatRows[0]).join(',');
    const rows = flatRows.map(row => Object.values(row).join(','));
    
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `workout_history_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function parseCSVAndMerge(file, currentWorkoutData) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            const text = event.target.result;
            const lines = text.split('\n').filter(line => line.trim() !== '');
            
            if (lines.length < 2) {
                reject("File CSV vuoto o formato non valido.");
                return;
            }
            
            const currentYear = new Date().getFullYear().toString();
            if (!currentWorkoutData.history.years[currentYear]) {
                currentWorkoutData.history.years[currentYear] = { mesocycles: [] };
            }
            
            // Crea un mesociclo apposito per l'importazione CSV
            const importedMeso = {
                id: `meso_csv_${Date.now()}`,
                name: "Scheda Importata da CSV",
                startDate: new Date().toISOString().split('T')[0],
                endDate: "",
                status: "active",
                weeks: [
                    {
                        weekNumber: 1,
                        days: [
                            {
                                dayId: `day_csv_${Date.now()}`,
                                dayName: "Import CSV",
                                date: new Date().toISOString().split('T')[0],
                                completed: true,
                                exercises: []
                            }
                        ]
                    }
                ]
            };
            
            // Logica semplificata di parsing righe CSV
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                if (cols.length >= 4) {
                    importedMeso.weeks[0].days[0].exercises.push({
                        signature: `csv_ex_${i}`,
                        name: cols[3] || 'Esercizio CSV',
                        targetSets: 3,
                        loggedSets: [
                            { set: 1, reps: parseInt(cols[5]) || 0, weight: parseFloat(cols[6]) || 0, rpe: 0 }
                        ]
                    });
                }
            }
            
            currentWorkoutData.history.years[currentYear].mesocycles.push(importedMeso);
            resolve(currentWorkoutData);
        };
        
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}