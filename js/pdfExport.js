// pdfExport.js
import { state } from './state.js';
import { calculateSetVolumeTrend, findPreviousExercise} from './helpers.js';

export function exportWorkoutPDF(dayData = null, metadata = null) {
    const jsPDF = window.jsPDF || window.jspdf?.jsPDF;

    if (!jsPDF) {
        alert("Libreria jsPDF non trovata. Assicurati che sia inclusa in index.html.");
        return;
    }

    // Fallback basato coerentemente su activeMesocycleIndex (0-based)
    if (!dayData) {
        const currentMesoIdx = state.activeMesocycleIndex !== undefined ? state.activeMesocycleIndex : 0;
        const currentWeekNum = state.activeWeek || 1;
        const currentDayNum = state.activeDay || 1;
        
        const yearData = state.workoutData?.history?.years?.[state.currentYear || new Date().getFullYear()];
        const mesos = yearData?.mesocycles || [];
        const meso = mesos[currentMesoIdx] || mesos[0];
        
        const weeks = meso?.weeks || [];
        const week = Array.isArray(weeks) 
            ? weeks[currentWeekNum - 1] 
            : (weeks[currentWeekNum] || weeks[Object.keys(weeks)[currentWeekNum - 1]]);
            
        const days = week?.days || [];
        dayData = Array.isArray(days) 
            ? days[currentDayNum - 1] 
            : (days[currentDayNum] || days[Object.keys(days)[0]]);

        metadata = {
            mesocycleName: meso?.name || `Mesociclo ${currentMesoIdx + 1}`,
            weekNumber: currentWeekNum,
            dayName: dayData?.dayName || dayData?.name || `Giorno ${currentDayNum}`,
            dayDate: dayData?.date || '',
            coachNotes: week?.coachNotes || dayData?.coachNotes || ''
        };
    }

    if (!dayData) {
        alert("Nessun giorno selezionato o dati non validi.");
        return;
    }

    const selectedDay = dayData;
    metadata = metadata || {};

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    const contentWidth = pageWidth - (margin * 2);
    let y = 8;

    // Funzione helper per verificare e gestire il cambio pagina
    function checkPageOverflow(neededHeight) {
        if (y + neededHeight > pageHeight - 10) {
            doc.addPage();
            y = 10;
        }
    }

    // -------------------------------------------------------------
    // 1. INTESTAZIONE PRINCIPALE
    // -------------------------------------------------------------
    doc.setFillColor(15, 23, 42); // Dark Navy
    doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'F');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    const dayTitle = (metadata.dayName || selectedDay.dayName || selectedDay.name || 'Giorno').toUpperCase();
    doc.text(`REPORT ALLENAMENTO: ${dayTitle}`, margin + 4, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    const mesoText = metadata.mesocycleName || 'Mesociclo 1';
    const weekText = metadata.weekNumber ? `Settimana ${metadata.weekNumber}` : 'Sett. 1';
    const athleteText = metadata.athlete || state.workoutData?.athlete?.email || 'Atleta';
    const dateText = metadata.dayDate || selectedDay.date || new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

    doc.text(`Atleta: ${athleteText}   |   Prog: ${mesoText} - ${weekText}   |   Data: ${dateText}`, margin + 4, y + 11.5);

    y += 19;

    // -------------------------------------------------------------
    // 2. NOTE COACH / GIORNO GENERALE
    // -------------------------------------------------------------
    const globalCoachNotes = (metadata.coachNotes || selectedDay.coachNotes || '').trim();
    const globalUserNotes = (selectedDay.notes || selectedDay.userNotes || '').trim();

    if (globalCoachNotes !== '') {
        const splitCoach = doc.splitTextToSize(globalCoachNotes, contentWidth - 8);
        const coachBoxHeight = (splitCoach.length * 3.3) + 6;
        checkPageOverflow(coachBoxHeight);

        doc.setFillColor(238, 242, 255); // Indigo chiaro
        doc.setDrawColor(199, 210, 254);
        doc.setLineWidth(0.2);
        doc.roundedRect(margin, y, contentWidth, coachBoxHeight, 1.5, 1.5, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(67, 56, 202);
        doc.text("📋 NOTE DELL'ALLENATORE (SETTIMANA / GIORNO)", margin + 3, y + 3.8);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(splitCoach, margin + 3, y + 7.5);

        y += coachBoxHeight + 3;
    }

    if (globalUserNotes !== '') {
        const splitUserNotes = doc.splitTextToSize(globalUserNotes, contentWidth - 8);
        const userBoxHeight = (splitUserNotes.length * 3.3) + 6;
        checkPageOverflow(userBoxHeight);

        doc.setFillColor(243, 244, 246);
        doc.setDrawColor(209, 213, 219);
        doc.setLineWidth(0.2);
        doc.roundedRect(margin, y, contentWidth, userBoxHeight, 1.5, 1.5, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(55, 65, 81);
        doc.text("📝 NOTE GENERALI ATLETA", margin + 3, y + 3.8);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(31, 41, 55);
        doc.text(splitUserNotes, margin + 3, y + 7.5);

        y += userBoxHeight + 3;
    }

    // -------------------------------------------------------------
    // 3. ESERCIZI
    // -------------------------------------------------------------
    const exercises = selectedDay.exercises || [];
    if (exercises.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text("Nessun esercizio registrato per questa giornata.", margin, y);
        y += 6;
    }

    exercises.forEach((ex, idx) => {
        const rawSets = Array.isArray(ex.loggedSets) 
            ? ex.loggedSets 
            : (Array.isArray(ex.sets) ? ex.sets : []);

        const validSets = rawSets.filter(s => s && typeof s === 'object');
        const coachNotes = ex.notes ? ex.notes.trim() : '';
        const userNotes = ex.userNotes ? ex.userNotes.trim() : '';

        // Calcola altezza stimata esercizio per evitare tagli brutti tra le pagine
        const approxHeight = 12 + (validSets.length * 4.8) + (coachNotes ? 8 : 0) + (userNotes ? 8 : 0);
        checkPageOverflow(approxHeight);

        // Barra laterale colorata
        doc.setFillColor(2, 132, 199); // Sky blue
        doc.rect(margin, y, 2.5, 5, 'F');

        // Titolo Esercizio
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`${idx + 1}. ${(ex.name || 'Esercizio').toUpperCase()}`, margin + 4, y + 3.8);

        // Target / Rest Badges
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        
        let targetStr = "";
        if (ex.targetSets || ex.targetReps) targetStr += `Target: ${ex.targetSets || '-'}x${ex.targetReps || '-'}`;
        if (ex.rest || ex.restSeconds) targetStr += `${targetStr ? '  |  ' : ''}Pausa: ${ex.rest || ex.restSeconds}s`;
        
        if (targetStr) {
            doc.text(targetStr, pageWidth - margin - doc.getTextWidth(targetStr), y + 3.8);
        }

        y += 6.5;

        // --- 1. BOX TARGET & ULTIMA SESSIONE PRECEDENTE ---
        const targetText = ex.targetInfo || `TARGET: ${ex.targetTopsetKg ? 'Topset ' + ex.targetTopsetKg + ' kg | ' : ''}${ex.targetSets || 2} set x ${ex.targetReps || '5-8'}rep @${ex.targetRpe || '6,0'} | rest ${ex.rest || '2min'}`;
        
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(targetText, margin + 3, y + 4);
        y += 7.5;

        // Ultima Sessione Precedente
        const lastSessionText = ex.lastSession || ex.prevStats || ex.previousSessionSummary || '';
        if (lastSessionText) {
            doc.setFillColor(240, 249, 255);
            doc.setDrawColor(186, 230, 253);
            doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'FD');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(3, 105, 161);
            doc.text(`ULTIMA SESSIONE PRECEDENTE: ${lastSessionText}`, margin + 3, y + 4);
            y += 7.5;
        }

        // --- 2. TABELLA SET CON STATO CHECK & DELTA TREND ---
const colWidths = { set: 28, kg: 45, reps: 45, rpe: 45, status: 22 };

doc.setFillColor(241, 245, 249);
doc.setDrawColor(203, 213, 225);
doc.setLineWidth(0.2);
doc.rect(margin, y, contentWidth, 5, 'FD');

doc.setFont("helvetica", "bold");
doc.setFontSize(7);
doc.setTextColor(51, 65, 85);

let xCurr = margin;
doc.text("SET", xCurr + 2, y + 3.5); xCurr += colWidths.set;
doc.text("KG", xCurr + 2, y + 3.5); xCurr += colWidths.kg;
doc.text("REPS", xCurr + 2, y + 3.5); xCurr += colWidths.reps;
doc.text("RPE", xCurr + 2, y + 3.5); xCurr += colWidths.rpe;
doc.text("STATO", xCurr + 2, y + 3.5);

y += 5;

if (validSets.length === 0) {
    doc.rect(margin, y, contentWidth, 5);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Nessun set registrato", margin + 2, y + 3.5);
    y += 5;
} else {
    // 📍 INSERISCI QUI IL TUO BLOCCO:

    // Recupera l'esercizio della sessione precedente per il calcolo dei trend
    const currentMesoIdx = state.activeMesocycleIndex !== undefined ? state.activeMesocycleIndex : 0;
    const currentWeekNum = state.activeWeek || 1;
    const currentDayIdx = (state.activeDay || 1) - 1;
    const prevEx = findPreviousExercise(state.workoutData, currentMesoIdx, currentWeekNum, currentDayIdx, ex.name);

    validSets.forEach((s, sIdx) => {
        checkPageOverflow(6);

        const isChecked = Boolean(s.isLocked);

        if (sIdx % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y, contentWidth, 5.5, 'F');
        }
        
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, y, contentWidth, 5.5, 'S');

        xCurr = margin;

        // --- CALCOLO TREND VOLUME DALLA HELPER ---
        let deltaText = s.deltaText || s.trendText || s.delta || '';
        let isPositive = false;
        let isNegative = false;

        if (isChecked && prevEx) {
            const rawPrevSets = Array.isArray(prevEx.loggedSets) ? prevEx.loggedSets : (Array.isArray(prevEx.sets) ? prevEx.sets : []);
            const prevSet = rawPrevSets[sIdx];
            
            const trend = calculateSetVolumeTrend(s, prevSet);
            if (trend) {
                // Usa direttamente trend.text che contiene solo le frecce e i kg (es. "▲ +10 kg")
                deltaText = trend.text; 
                isPositive = trend.isPositive;
                isNegative = trend.isNegative;
            }
        }

        // Se deltaText contiene per qualche motivo ancora il %, lo rimuoviamo prima di stampare
        if (deltaText) {
            deltaText = deltaText.replace(/%|\(.*%\)/g, '').trim(); // Elimina qualsiasi % o ( % )
        }

        // COLONNA SET
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(String(sIdx + 1), xCurr + 2, y + 3.8);

        // RENDERING TREND DELTA NEL PDF (SOLO KG)
        if (deltaText) {
            doc.setFontSize(6);
            if (isPositive || deltaText.includes('+') || deltaText.includes('▲')) {
                doc.setTextColor(22, 101, 52); // Verde
            } else if (isNegative || deltaText.includes('-') || deltaText.includes('▼')) {
                doc.setTextColor(185, 28, 28); // Rosso
            } else {
                doc.setTextColor(100, 116, 139); // Grigio
            }
            doc.text(deltaText, xCurr + 7, y + 3.8);
        }
        xCurr += colWidths.set;

        // STAMPA DEI VALORI (KG, REPS, RPE, STATO)
        if (isChecked) {
            const kgText = (s.weight !== undefined && s.weight !== '' && s.weight !== 0) ? `${s.weight} kg` : '-';
            const repsText = (s.reps !== undefined && String(s.reps).trim() !== '') ? String(s.reps) : '-';
            const rpeText = (s.rpe !== undefined && String(s.rpe).trim() !== '') ? (String(s.rpe).startsWith('@') ? s.rpe : `@${s.rpe}`) : '-';

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(15, 23, 42);

            doc.text(kgText, xCurr + 2, y + 3.8); xCurr += colWidths.kg;
            doc.text(repsText, xCurr + 2, y + 3.8); xCurr += colWidths.reps;
            doc.text(rpeText, xCurr + 2, y + 3.8); xCurr += colWidths.rpe;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(22, 101, 52);
            doc.text("✓ OK", xCurr + 2, y + 3.8);

        } else {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);

            doc.text("-", xCurr + 2, y + 3.8); xCurr += colWidths.kg;
            doc.text("-", xCurr + 2, y + 3.8); xCurr += colWidths.reps;
            doc.text("-", xCurr + 2, y + 3.8); xCurr += colWidths.rpe;

            doc.setFont("helvetica", "italic");
            doc.setTextColor(185, 28, 28);
            doc.text("Non svolto", xCurr + 2, y + 3.8);
        }

        y += 5.5;
    });
}

        // --- NOTE UTENTE SULL'ESERCIZIO ---
        if (userNotes !== '') {
            y += 1.5;
            const splitUser = doc.splitTextToSize(userNotes, contentWidth - 8);
            const userBoxHeight = (splitUser.length * 3) + 4;

            checkPageOverflow(userBoxHeight);

            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.15);
            doc.roundedRect(margin, y, contentWidth, userBoxHeight, 1, 1, 'FD');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.5);
            doc.setTextColor(71, 85, 105);
            doc.text("NOTE ATLETA (ESERCIZIO)", margin + 3, y + 3);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(15, 23, 42);
            doc.text(splitUser, margin + 3, y + 5.8);

            y += userBoxHeight + 1.5;
        }

        y += 3.5;
    });

// -------------------------------------------------------------
    // 4. GENERAZIONE & DOWNLOAD / CONDIVISIONE
    // -------------------------------------------------------------
    const sanitizedDay = dayTitle.toLowerCase().replace(/\s+/g, '_');
    const filename = `report_${sanitizedDay}.pdf`;

    const pdfBlob = doc.output('blob');
    const pdfFile = new File([pdfBlob], filename, {
        type: 'application/pdf',
        lastModified: Date.now()
    });

    // Controllo se il dispositivo è un Mobile (iOS / Android)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Condivisione Nativa solo su Mobile
    if (isMobile && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        navigator.share({
            files: [pdfFile],
            title: `Report Allenamento: ${dayTitle}`,
            text: 'Ecco la tua scheda di allenamento in formato PDF.'
        }).catch(err => {
            if (err.name !== 'AbortError') {
                console.error('Errore durante la condivisione PDF:', err);
            }
        });
        return;
    }

    // Fallback Download Diretto per Desktop (Safari Mac, Chrome, Firefox, Edge)
    const shareUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = shareUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(shareUrl), 1000);
}