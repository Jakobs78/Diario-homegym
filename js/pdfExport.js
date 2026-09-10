/**
 * Module: pdfExport.js
 * Summary: Genera report formattati in PDF del giorno di allenamento con KPI di riassunto (Volume, Set, RPE, Indice Volume, Durata), celle out-of-range evidenziate in rosso e QR Code per riaprire l'app.
 */

import { state } from './state.js';
import { calculateSetVolumeTrend, findPreviousExercise } from './helpers.js';
import { supabase } from './config.js';

/**
 * Genera l'immagine Base64 del codice QR tramite API
 */
async function getQRCodeDataUrl(text) {
    try {
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(text)}&format=png`;
        const resp = await fetch(qrApiUrl);
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("Impossibile caricare il QR code:", e);
        return null;
    }
}

export async function exportWorkoutPDF(dayData = null, metadata = null) {
    const jsPDF = window.jsPDF || window.jspdf?.jsPDF;

    if (!jsPDF) {
        alert("Libreria jsPDF non trovata. Assicurati che sia inclusa in index.html.");
        return;
    }

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

    const { data: { user } } = await supabase.auth.getUser();
    const athleteName = user?.user_metadata?.full_name || 'Atleta';

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    const contentWidth = pageWidth - (margin * 2);
    let y = 8;

    function checkPageOverflow(neededHeight) {
        if (y + neededHeight > pageHeight - 10) {
            doc.addPage();
            y = 10;
        }
    }

    // -------------------------------------------------------------
    // 1. INTESTAZIONE PRINCIPALE
    // -------------------------------------------------------------
    doc.setFillColor(2, 132, 199); // #0284c7
    doc.roundedRect(margin, y, contentWidth, 18, 3, 3, 'F');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    const dayTitle = (metadata.dayName || selectedDay.dayName || selectedDay.name || 'Giorno').toUpperCase();
    doc.text(`REPORT ALLENAMENTO: ${dayTitle}`, margin + 5, y + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(224, 242, 254);
    const mesoText = metadata.mesocycleName || 'Mesociclo 1';
    const weekText = metadata.weekNumber ? `Settimana ${metadata.weekNumber}` : 'Sett. 1';
    const athleteText = athleteName || metadata.athlete || state.workoutData?.athlete?.email || 'Atleta';
    const dateText = metadata.dayDate || selectedDay.date || new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

    doc.text(`Atleta: ${athleteText}  |  Programma: ${mesoText} - ${weekText}  |  Data: ${dateText}`, margin + 5, y + 13);

    y += 21;

    // -------------------------------------------------------------
    // 2. SCHEDE KPI DI RIASSUNTO (VOLUME, SET, RPE, INDICE VOLUME, DURATA)
    // -------------------------------------------------------------
    let totalVolume = 0;
    let totalSets = 0;
    let completedSets = 0;
    let rpeSum = 0;
    let rpeCount = 0;

    (selectedDay.exercises || []).forEach(ex => {
        const rawSets = Array.isArray(ex.loggedSets) ? ex.loggedSets : (ex.sets || []);
        rawSets.forEach(s => {
            totalSets++;
            if (s.isLocked) {
                completedSets++;
                const w = parseFloat(s.weight) || 0;
                const r = parseInt(s.reps) || 0;
                totalVolume += (w * r);

                const rpeVal = parseFloat(String(s.rpe || '').replace('@', '').replace(',', '.'));
                if (!isNaN(rpeVal) && rpeVal > 0) {
                    rpeSum += rpeVal;
                    rpeCount++;
                }
            }
        });
    });

    const avgRpe = rpeCount > 0 ? (rpeSum / rpeCount).toFixed(1) : '-';
    const sessionTime = selectedDay.totalDurationMinutes ? `${selectedDay.totalDurationMinutes} min` : '-';
    const volumeDisplay = totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)} t` : `${totalVolume} kg`;
    
    // Recupero dell'indice di conteggio volume dalla sessione o dal DOM
    const volumeIndexVal = selectedDay.volumeIndex !== undefined 
        ? selectedDay.volumeIndex 
        : (selectedDay.volumeCount !== undefined 
            ? selectedDay.volumeCount 
            : (document?.getElementById?.('volume-index')?.innerText || '-'));

    const kpiCards = [
        { label: "TONNELLAGGIO", val: volumeDisplay, color: [2, 132, 199] },
        { label: "SET COMPLETATI", val: `${completedSets}/${totalSets}`, color: [22, 163, 74] },
        { label: "RPE MEDIO", val: avgRpe, color: [217, 119, 6] },
        { label: "INDICE VOLUME", val: String(volumeIndexVal), color: [147, 51, 234] },
        { label: "DURATA", val: sessionTime, color: [109, 40, 217] }
    ];

    const totalGap = (kpiCards.length - 1) * 2;
    const kpiBoxWidth = (contentWidth - totalGap) / kpiCards.length;

    kpiCards.forEach((kpi, kIdx) => {
        const kX = margin + (kIdx * (kpiBoxWidth + 2));

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.roundedRect(kX, y, kpiBoxWidth, 12, 1.5, 1.5, 'FD');

        // Bordo superiore di accento colorato
        doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
        doc.rect(kX, y, kpiBoxWidth, 1, 'F');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.5);
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.label, kX + (kpiBoxWidth / 2), y + 4.5, { align: 'center' });

        doc.setFontSize(9);
        doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
        doc.text(kpi.val, kX + (kpiBoxWidth / 2), y + 9.5, { align: 'center' });
    });

    y += 15;

    // -------------------------------------------------------------
    // 3. NOTE COACH / GIORNO
    // -------------------------------------------------------------
    const globalCoachNotes = (metadata.coachNotes || selectedDay.coachNotes || '').trim();
    const globalUserNotes = (selectedDay.notes || selectedDay.userNotes || '').trim();

    if (globalCoachNotes !== '') {
        const splitCoach = doc.splitTextToSize(globalCoachNotes, contentWidth - 8);
        const coachBoxHeight = (splitCoach.length * 3.5) + 7;
        checkPageOverflow(coachBoxHeight);

        doc.setFillColor(239, 246, 255);
        doc.setDrawColor(191, 219, 254);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, y, contentWidth, coachBoxHeight, 2, 2, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(29, 78, 216);
        doc.text("📋 NOTE DELL'ALLENATORE", margin + 4, y + 4.5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(30, 58, 138);
        doc.text(splitCoach, margin + 4, y + 8.5);

        y += coachBoxHeight + 4;
    }

    if (globalUserNotes !== '') {
        const splitUserNotes = doc.splitTextToSize(globalUserNotes, contentWidth - 8);
        const userBoxHeight = (splitUserNotes.length * 3.5) + 7;
        checkPageOverflow(userBoxHeight);

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, y, contentWidth, userBoxHeight, 2, 2, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text("📝 NOTE GENERALI ATLETA", margin + 4, y + 4.5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(splitUserNotes, margin + 4, y + 8.5);

        y += userBoxHeight + 4;
    }

    // -------------------------------------------------------------
    // 4. SCHEDE ESERCIZI & TABELLE
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
        const userNotes = ex.userNotes ? ex.userNotes.trim() : '';

        const approxHeight = 14 + (validSets.length * 5.2) + (userNotes ? 8 : 0);
        checkPageOverflow(approxHeight);

        doc.setFillColor(2, 132, 199);
        doc.roundedRect(margin, y, 2.5, 6, 1, 1, 'F');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(`${idx + 1}. ${(ex.name || 'Esercizio').toUpperCase()}`, margin + 4.5, y + 4.5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        
        let targetStr = "";
        if (ex.targetSets || ex.targetReps) targetStr += `Target: ${ex.targetSets || '-'}x${ex.targetReps || '-'}`;
        if (ex.rest || ex.restSeconds) targetStr += `${targetStr ? '  |  ' : ''}Recupero: ${ex.rest || ex.restSeconds}`;
        
        if (targetStr) {
            doc.text(targetStr, pageWidth - margin - doc.getTextWidth(targetStr), y + 4.5);
        }

        y += 7.5;

        const targetText = ex.targetInfo || `TARGET: ${ex.targetTopsetKg ? 'Topset ' + ex.targetTopsetKg + ' kg | ' : ''}${ex.targetSets || 2} set x ${ex.targetReps || '5-8'}rep @${ex.targetRpe || '6.0'} | rest ${ex.rest || '2min'}`;
        
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.roundedRect(margin, y, contentWidth, 6, 1.5, 1.5, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        doc.text(targetText, margin + 3, y + 4);
        y += 7.5;

        const lastSessionText = ex.lastSession || ex.prevStats || ex.previousSessionSummary || '';
        if (lastSessionText) {
            doc.setFillColor(240, 249, 255);
            doc.setDrawColor(186, 230, 253);
            doc.roundedRect(margin, y, contentWidth, 6, 1.5, 1.5, 'FD');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(3, 105, 161);
            doc.text(`ULTIMA SESSIONE PRECEDENTE: ${lastSessionText}`, margin + 3, y + 4);
            y += 7.5;
        }

        const colWidths = { set: 28, kg: 45, reps: 45, rpe: 45, status: 22 };

        doc.setFillColor(224, 242, 254);
        doc.setDrawColor(186, 230, 253);
        doc.setLineWidth(0.2);
        doc.roundedRect(margin, y, contentWidth, 5.5, 1, 1, 'FD');

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(3, 105, 161);

        let xCurr = margin;
        doc.text("SET", xCurr + 3, y + 3.8); xCurr += colWidths.set;
        doc.text("KG", xCurr + 2, y + 3.8); xCurr += colWidths.kg;
        doc.text("REPS", xCurr + 2, y + 3.8); xCurr += colWidths.reps;
        doc.text("RPE", xCurr + 2, y + 3.8); xCurr += colWidths.rpe;
        doc.text("STATO", xCurr + 2, y + 3.8);

        y += 5.5;

        if (validSets.length === 0) {
            doc.rect(margin, y, contentWidth, 5.5);
            doc.setFont("helvetica", "italic");
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text("Nessun set registrato", margin + 3, y + 3.8);
            y += 5.5;
        } else {
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

                let deltaText = s.deltaText || s.trendText || s.delta || '';
                let isPositive = false;
                let isNegative = false;

                if (isChecked && prevEx) {
                    const rawPrevSets = Array.isArray(prevEx.loggedSets) ? prevEx.loggedSets : (Array.isArray(prevEx.sets) ? prevEx.sets : []);
                    const prevSet = rawPrevSets[sIdx];
                    
                    const trend = calculateSetVolumeTrend(s, prevSet);
                    if (trend) {
                        deltaText = trend.text; 
                        isPositive = trend.isPositive;
                        isNegative = trend.isNegative;
                    }
                }

                if (deltaText) {
                    deltaText = deltaText.replace(/%|\(.*%\)/g, '').trim();
                }

                doc.setFont("helvetica", "bold");
                doc.setFontSize(7.5);
                doc.setTextColor(15, 23, 42);
                doc.text(String(sIdx + 1), xCurr + 3, y + 3.8);

                if (deltaText) {
                    doc.setFontSize(6);
                    if (isPositive || deltaText.includes('+') || deltaText.includes('▲')) {
                        doc.setTextColor(22, 101, 52);
                    } else if (isNegative || deltaText.includes('-') || deltaText.includes('▼')) {
                        doc.setTextColor(185, 28, 28);
                    } else {
                        doc.setTextColor(100, 116, 139);
                    }
                    doc.text(deltaText, xCurr + 8, y + 3.8);
                }
                xCurr += colWidths.set;

                if (isChecked) {
                    const kgText = (s.weight !== undefined && s.weight !== '' && s.weight !== 0) ? `${s.weight} kg` : '-';
                    const repsText = (s.reps !== undefined && String(s.reps).trim() !== '') ? String(s.reps) : '-';
                    const rpeText = (s.rpe !== undefined && String(s.rpe).trim() !== '') ? (String(s.rpe).startsWith('@') ? s.rpe : `@${s.rpe}`) : '-';

                    const isOutOfRange = Boolean(s.isOutOfRange || s.outOfRange || s.isRed);

                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(7.5);

                    // Gestione evidenziazione contorno rosso (out of range)
                    if (isOutOfRange) {
                        doc.setDrawColor(239, 68, 68); // #ef4444 rosso
                        doc.setLineWidth(0.4);
                        doc.setFillColor(255, 255, 255); // Sfondo trasparente/bianco come richiesto
                        doc.roundedRect(xCurr + 1, y + 0.6, colWidths.kg - 2, 4.3, 1, 1, 'FD');
                        doc.setTextColor(220, 38, 38);
                    } else {
                        doc.setTextColor(15, 23, 42);
                    }

                    doc.text(kgText, xCurr + 2, y + 3.8); 
                    xCurr += colWidths.kg;

                    if (isOutOfRange) {
                        doc.setDrawColor(239, 68, 68);
                        doc.setLineWidth(0.4);
                        doc.setFillColor(255, 255, 255);
                        doc.roundedRect(xCurr + 1, y + 0.6, colWidths.reps - 2, 4.3, 1, 1, 'FD');
                        doc.setTextColor(220, 38, 38);
                    } else {
                        doc.setTextColor(15, 23, 42);
                    }

                    doc.text(repsText, xCurr + 2, y + 3.8); 
                    xCurr += colWidths.reps;

                    doc.setTextColor(15, 23, 42);
                    doc.text(rpeText, xCurr + 2, y + 3.8); 
                    xCurr += colWidths.rpe;

                    doc.setFillColor(220, 252, 231);
                    doc.roundedRect(xCurr + 1, y + 1, 15, 3.8, 1, 1, 'F');
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(6.5);
                    doc.setTextColor(21, 128, 61);
                    doc.text("✓ OK", xCurr + 4, y + 3.6);

                } else {
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(7);
                    doc.setTextColor(148, 163, 184);

                    doc.text("-", xCurr + 2, y + 3.8); xCurr += colWidths.kg;
                    doc.text("-", xCurr + 2, y + 3.8); xCurr += colWidths.reps;
                    doc.text("-", xCurr + 2, y + 3.8); xCurr += colWidths.rpe;

                    doc.setFillColor(254, 226, 226);
                    doc.roundedRect(xCurr + 1, y + 1, 18, 3.8, 1, 1, 'F');
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(6);
                    doc.setTextColor(185, 28, 28);
                    doc.text("Non svolto", xCurr + 2.5, y + 3.6);
                }

                y += 5.5;
            });
        }

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

        y += 4;
    });

    // -------------------------------------------------------------
    // 5. BLOCCO FOOTER CON QR CODE PER RIAPRIRE L'APP
    // -------------------------------------------------------------
    const appUrl = window.location.origin || 'https://workout-app.local';
    const qrDataBase64 = await getQRCodeDataUrl(appUrl);

    checkPageOverflow(22);

    const footerY = y + 2;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, footerY, contentWidth, 18, 2, 2, 'FD');

    if (qrDataBase64) {
        doc.addImage(qrDataBase64, 'PNG', margin + 3, footerY + 1.5, 15, 15);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text("REGISTRA O CONTINUA L'ALLENAMENTO NELL'APP", margin + 22, footerY + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("Inquadra il codice QR con la fotocamera del tuo dispositivo per accedere alla webapp.", margin + 22, footerY + 12);

    // -------------------------------------------------------------
    // 6. ESPORTAZIONE O CONDIVISIONE MOBILE
    // -------------------------------------------------------------
    const sanitizedDay = dayTitle.toLowerCase().replace(/\s+/g, '_');
    const filename = `report_${sanitizedDay}.pdf`;

    const pdfBlob = doc.output('blob');
    const pdfFile = new File([pdfBlob], filename, {
        type: 'application/pdf',
        lastModified: Date.now()
    });

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        navigator.share({
            files: [pdfFile],
            title: `Report Allenamento: ${dayTitle}`,
            text: 'Ecco il tuo report di allenamento PDF.'
        }).catch(err => {
            if (err.name !== 'AbortError') {
                console.error('Errore durante la condivisione PDF:', err);
            }
        });
        return;
    }

    const shareUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = shareUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(shareUrl), 1000);
}

export function handlePdfExportFromState(state) {
    const years = state.workoutData?.history?.years || {};
    const yearKeys = Object.keys(years);
    
    if (yearKeys.length === 0) {
        alert("Nessun dato storico presente per l'esportazione.");
        return;
    }

    const activeYearKey = state.currentYear || yearKeys.sort().pop();
    const yearObj = years[activeYearKey];
    const activeMesoKey = state.currentMesocycle !== undefined ? state.currentMesocycle : (state.activeMesocycleIndex + 1);
    const activeWeekNum = state.activeWeek || 1;
    const activeDayNum = state.activeDay || 1;

    let selectedWeek = null;
    if (yearObj && yearObj.mesocycles) {
        const mesos = yearObj.mesocycles;
        let meso = Array.isArray(mesos)
            ? (mesos[activeMesoKey - 1] || mesos[activeMesoKey] || mesos[0])
            : (mesos[activeMesoKey] || mesos[String(activeMesoKey)] || mesos[Object.keys(mesos)[0]]);

        if (meso && meso.weeks) {
            const weeks = meso.weeks;
            if (Array.isArray(weeks)) {
                selectedWeek = weeks[activeWeekNum - 1] || weeks[activeWeekNum];
            } else if (typeof weeks === 'object') {
                selectedWeek = weeks[activeWeekNum] || weeks[String(activeWeekNum)] || weeks[Object.keys(weeks)[activeWeekNum - 1]];
            }
        }
    }

    if (!selectedWeek || !selectedWeek.days) {
        alert("Nessun dato trovato per la settimana selezionata.");
        return;
    }

    const days = selectedWeek.days;
    let selectedDay = null;

    if (Array.isArray(days)) {
        selectedDay = days[activeDayNum - 1] || days[activeDayNum] || days[0];
    } else if (typeof days === 'object') {
        const dayKeys = Object.keys(days);
        selectedDay = days[activeDayNum] || days[String(activeDayNum)] || days[dayKeys[activeDayNum - 1]] || days[dayKeys[0]];
    }

    if (!selectedDay) {
        alert("Nessun giorno selezionato trovato.");
        return;
    }

    const metadata = {
        mesocycleName: `Mesociclo ${activeMesoKey}`,
        weekNumber: activeWeekNum,
        dayName: selectedDay.dayName || selectedDay.name || `Giorno ${activeDayNum}`,
        dayDate: selectedDay.date || '',
        coachNotes: selectedWeek.coachNotes || ''
    };

    exportWorkoutPDF(selectedDay, metadata);
}