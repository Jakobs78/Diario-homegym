// pdfExport.js
import { state } from './state.js'; // <-- 1. Importato lo state globale

export function exportWorkoutPDF(dayData = null, metadata = null) {
    // 1. Recupera la classe jsPDF dallo scope globale di window
    const jsPDF = window.jsPDF || window.jspdf?.jsPDF;

    if (!jsPDF) {
        alert("Libreria jsPDF non trovata. Assicurati che sia inclusa in index.html.");
        return;
    }
    // Se non vengono passati parametri espliciti, li ricava dallo state globale
    if (!dayData) {
        const currentMesoKey = state.currentMesocycle || 1;
        const currentWeekNum = state.activeWeek || 1;
        const currentDayNum = state.activeDay || 1;
        
        const yearData = state.workoutData?.history?.years?.[state.currentYear || new Date().getFullYear()];
        const meso = yearData?.mesocycles?.[currentMesoKey - 1] || yearData?.mesocycles?.[currentMesoKey];
        const week = meso?.weeks?.[currentWeekNum - 1] || meso?.weeks?.[currentWeekNum];
        dayData = week?.days?.[currentDayNum - 1] || week?.days?.[currentDayNum];

        metadata = {
            mesocycleName: `Mesociclo ${currentMesoKey}`,
            weekNumber: currentWeekNum,
            dayName: dayData?.name || `Giorno ${currentDayNum}`,
            dayDate: dayData?.date || '',
            coachNotes: week?.coachNotes || ''
        };
    }

    if (!dayData) {
        alert("Nessun giorno selezionato o dati non validi.");
        return;
    }

    // 2. Uniformata la variabile per la compatibilità con il layout sottostante
    const selectedDay = dayData;
    metadata = metadata || {};

    // Configurazione A4 Ultra-Compatto (210mm x 297mm)
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
    const margin = 8;                                     // Margini ridotti a 8mm
    const contentWidth = pageWidth - (margin * 2);        // 194 mm utili
    let y = 8;

    // --- 1. INTESTAZIONE COMPATTA ---
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'F');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    const dayTitle = (metadata.dayName || selectedDay.dayName || selectedDay.name || 'Giorno').toUpperCase();
    doc.text(`REPORT ALLENAMENTO: ${dayTitle}`, margin + 4, y + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    const mesoText = metadata.mesocycleName || 'Mesociclo 1';
    const weekText = metadata.weekNumber ? `Settimana ${metadata.weekNumber}` : 'Sett. 1';
    const athleteText = metadata.athlete || 'Atleta';
    const dateText = metadata.dayDate || selectedDay.date || new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

    doc.text(`Atleta: ${athleteText}   |   Prog: ${mesoText} - ${weekText}   |   Data: ${dateText}`, margin + 4, y + 10.5);

    y += 17;

    // --- 2. CICLO ESERCIZI ---
    const exercises = selectedDay.exercises || [];
    if (exercises.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("Nessun esercizio registrato per questa giornata.", margin, y);
        y += 6;
    }

    exercises.forEach((ex, idx) => {
        const rawSets = Array.isArray(ex.loggedSets) 
            ? ex.loggedSets 
            : (Array.isArray(ex.sets) ? ex.sets : []);

        const validSets = rawSets.filter(s => s && typeof s === 'object' && !s.isWarmup);
        const coachNotes = ex.notes ? ex.notes.trim() : '';
        const userNotes = ex.userNotes ? ex.userNotes.trim() : '';

        // A. TITOLO ESERCIZIO
        doc.setFillColor(2, 132, 199); // Sky 600
        doc.rect(margin, y, 2.5, 4.5, 'F');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(`${idx + 1}. ${(ex.name || 'Esercizio').toUpperCase()}`, margin + 4, y + 3.5);

        y += 6;

        // B. NOTE ALLENATORE (COMPATTE)
        if (coachNotes !== '') {
            const splitCoach = doc.splitTextToSize(coachNotes, contentWidth - 8);
            const coachBoxHeight = (splitCoach.length * 3.2) + 4;

            doc.setFillColor(240, 249, 255);
            doc.setDrawColor(186, 230, 253);
            doc.setLineWidth(0.2);
            doc.roundedRect(margin, y, contentWidth, coachBoxHeight, 1.5, 1.5, 'FD');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.5);
            doc.setTextColor(3, 105, 161);
            doc.text("NOTE ALLENATORE", margin + 3, y + 3.2);

            doc.setFont("helvetica", "italic");
            doc.setFontSize(7.5);
            doc.setTextColor(15, 23, 42);
            doc.text(splitCoach, margin + 3, y + 6.2);

            y += coachBoxHeight + 2;
        }

        // C. TABELLA DEI SET (RIGA RIDOTTA A 4.5mm)
        const colWidths = {
            set: 24,
            kg: 55,
            reps: 57,
            rpe: 58  // Totale: 194 mm
        };

        // Intestazione Tabella
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.2);
        doc.rect(margin, y, contentWidth, 4.5, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(51, 65, 85);

        let xCurr = margin;
        doc.text("SET", xCurr + 2, y + 3.2); xCurr += colWidths.set;
        doc.text("KG", xCurr + 2, y + 3.2); xCurr += colWidths.kg;
        doc.text("REPS", xCurr + 2, y + 3.2); xCurr += colWidths.reps;
        doc.text("RPE", xCurr + 2, y + 3.2);

        y += 4.5;

        // Righe Dati
        if (validSets.length === 0) {
            doc.rect(margin, y, contentWidth, 4.5);
            doc.setFont("helvetica", "italic");
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text("-", margin + 2, y + 3.2);
            y += 4.5;
        } else {
            validSets.forEach((s, sIdx) => {
                if (sIdx % 2 === 1) {
                    doc.setFillColor(248, 250, 252);
                    doc.rect(margin, y, contentWidth, 4.5, 'F');
                }
                
                doc.setDrawColor(226, 232, 240);
                doc.rect(margin, y, contentWidth, 4.5, 'S');

                const kgVal = (s.weight ?? s.kg ?? 0) !== 0 ? `${s.weight ?? s.kg} kg` : '-';
                const repsVal = (s.reps && String(s.reps).trim() !== '') ? s.reps : '-';

                let rawRpe = s.rpe || ex.targetRpe || ex.rpe || '';
                const numericMatch = String(rawRpe).match(/[\d.]+/);
                const rpeVal = numericMatch ? numericMatch[0] : '-';

                xCurr = margin;

                doc.setFont("helvetica", "bold");
                doc.setFontSize(7.5);
                doc.setTextColor(15, 23, 42);
                doc.text(String(sIdx + 1), xCurr + 2, y + 3.2); xCurr += colWidths.set;

                doc.setFont("helvetica", "normal");
                doc.text(String(kgVal), xCurr + 2, y + 3.2); xCurr += colWidths.kg;
                doc.text(String(repsVal), xCurr + 2, y + 3.2); xCurr += colWidths.reps;
                doc.text(String(rpeVal), xCurr + 2, y + 3.2);

                y += 4.5;
            });
        }

        // D. NOTE ATLETA (COMPATTE)
        if (userNotes !== '') {
            y += 1.5;
            const splitUser = doc.splitTextToSize(userNotes, contentWidth - 8);
            const userBoxHeight = (splitUser.length * 3.2) + 4;

            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.2);
            doc.roundedRect(margin, y, contentWidth, userBoxHeight, 1.5, 1.5, 'FD');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.5);
            doc.setTextColor(71, 85, 105);
            doc.text("NOTE ATLETA", margin + 3, y + 3.2);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(15, 23, 42);
            doc.text(splitUser, margin + 3, y + 6.2);

            y += userBoxHeight + 1.5;
        }

        y += 3.5; // Spazio minimo tra blocchi di esercizi
    });

    const sanitizedDay = dayTitle.toLowerCase().replace(/\s+/g, '_');
    doc.save(`report_${sanitizedDay}.pdf`);
}