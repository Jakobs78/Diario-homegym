export function exportMesocycleToCSV(mesocicloObj) {
    let csvContent = "Settimana,Giorno,Esercizio,Serie,Reps,KgMin,KgMax,Topset,RPE,Note\n";

    mesocicloObj.weeks.forEach(week => {
        week.days.forEach(day => {
            day.exercises.forEach(ex => {
                const totalSets = ex.sets && ex.sets.length > 0 ? ex.sets.length : 3;

                for (let s = 1; s <= totalSets; s++) {
                    const row = [
                        week.weekNumber,
                        day.dayNumber,
                        `"${(ex.name || '').replace(/"/g, '""')}"`,
                        totalSets,
                        `"${(ex.reps || '').replace(/"/g, '""')}"`,
                        `"${(ex.kgMin || '').replace(/"/g, '""')}"`,
                        `"${(ex.kgMax || '').replace(/"/g, '""')}"`,
                        `"${(ex.topset || '').replace(/"/g, '""')}"`,
                        `"${(ex.rpe || '').replace(/"/g, '""')}"`,
                        `"${(ex.notes || '').replace(/"/g, '""')}"`
                    ];
                    csvContent += row.join(",") + "\n";
                }
            });
        });
    });

    return csvContent;
}

export function downloadMesocycleFile(mesocicloObj) {
    const csvText = exportMesocycleToCSV(mesocicloObj);
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${mesocicloObj.name.toLowerCase().replace(/\s+/g, '_')}_scheda.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}