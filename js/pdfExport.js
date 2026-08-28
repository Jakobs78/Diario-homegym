export function exportWorkoutPDF(workoutData) {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
        alert("Libreria jsPDF non caricata correttamente.");
        return;
    }

    const doc = new jsPDF();
    let y = 15;
    const lineHeight = 6;
    const pageHeight = doc.internal.pageSize.getHeight();

    const checkPageBreak = (needed = 10) => {
        if (y + needed >= pageHeight - 15) {
            doc.addPage();
            y = 15;
        }
    };

    // Intestazione
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Report Allenamenti - Workout Tracker", 14, y);
    y += 10;

    const years = workoutData?.history?.years;
    if (!years || Object.keys(years).length === 0) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("Nessun dato storico presente per l'esportazione.", 14, y);
        doc.save("workout_report.pdf");
        return;
    }

    // Iterazione Anni
    Object.keys(years).sort().reverse().forEach(yearKey => {
        checkPageBreak(12);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(2, 132, 199); // Accent color
        doc.text(`Anno: ${yearKey}`, 14, y);
        y += 8;

        const mesocycles = years[yearKey].mesocycles || {};
        
        // Iterazione Mesocicli
        Object.keys(mesocycles).forEach(mesoKey => {
            const meso = mesocycles[mesoKey];
            checkPageBreak(10);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(22, 163, 74); // Success color
            doc.text(`  Mesociclo: ${meso.name || mesoKey}`, 16, y);
            y += 6;

            const weeks = meso.weeks || {};
            
            // Iterazione Settimane
            Object.keys(weeks).forEach(weekKey => {
                const week = weeks[weekKey];
                checkPageBreak(8);
                doc.setFontSize(10);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(100, 116, 139); // Text muted
                doc.text(`    Settimana ${weekKey}`, 20, y);
                y += 5;

                const days = week.days || {};
                
                // Iterazione Giorni
                Object.keys(days).forEach(dayKey => {
                    const day = days[dayKey];
                    checkPageBreak(8);
                    doc.setFontSize(9);
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(15, 23, 42); // Primary text
                    doc.text(`      Giorno: ${day.name || dayKey} (${day.date || 'Data N/D'})`, 24, y);
                    y += 5;

                    // Iterazione Esercizi
                    (day.exercises || []).forEach(ex => {
                        checkPageBreak(6);
                        doc.setFontSize(8);
                        doc.setFont("helvetica", "normal");
                        
                        const setsSummary = (ex.sets || [])
                            .map(s => `${s.kg || 0}kg x ${s.reps || 0}`)
                            .join(" | ");

                        doc.text(`        • ${ex.name}: ${setsSummary}`, 28, y);
                        y += lineHeight;
                    });
                    y += 2;
                });
            });
        });
        y += 4;
    });

    doc.save(`workout_report_${new Date().toISOString().slice(0, 10)}.js.pdf`);
}