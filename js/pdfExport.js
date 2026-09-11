/**
 * Module: pdfExport.js
 * Summary: Genera e scarica il report PDF dettagliato dell'allenamento corrente,
 * integrando la stringa di target, il box della sessione precedente, i delta di volume
 * e la colorazione intelligente dei bordi delle celle (Verde/Rosso).
 */

import { formatExerciseSummary, findPreviousExercise, calculateSetVolumeTrend, isValueOutOfRange } from './helpers.js';

const { jsPDF } = window.jspdf;

export function handlePdfExportFromState(state) {
    const currentYear = new Date().getFullYear().toString();
    const mesocycles = state.workoutData?.history?.years?.[currentYear]?.mesocycles || [];
    const activeMesoIdx = state.activeMesocycleIndex || 0;
    const activeMeso = mesocycles[activeMesoIdx];

    if (!activeMeso) {
        alert("Nessun mesociclo attivo trovato per l'esportazione.");
        return;
    }

    const activeWeekNum = state.activeWeek || 1;
    const activeWeekObj = activeMeso.weeks?.find(w => w.weekNumber === activeWeekNum);

    if (!activeWeekObj || !activeWeekObj.days || activeWeekObj.days.length === 0) {
        alert("Nessun giorno di allenamento trovato per la settimana corrente.");
        return;
    }

    const activeDayNum = state.activeDay || 1;
    const dayData = activeWeekObj.days[activeDayNum - 1];

    if (!dayData) {
        alert("Dati del giorno non trovati.");
        return;
    }

    // Passiamo l'intero stato e i riferimenti per consentire a findPreviousExercise di trovare lo storico
    exportWorkoutPDF(dayData, {
        state: state,
        mesoIndex: activeMesoIdx,
        weekNumber: activeWeekNum,
        dayNumber: activeDayNum,
        mesoName: activeMeso.name || `Mesociclo ${activeMesoIdx + 1}`
    });
}

export async function exportWorkoutPDF(dayData = null, metadata = null) {
    if (!dayData) {
        alert("Nessun dato da esportare.");
        return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    let cursorY = 15;

    // Colori palette
    const primaryColor = [15, 23, 42];   // Slate 900
    const grayBg = [248, 250, 252];      // Slate 50
    const borderColor = [226, 232, 240]; // Slate 200

    // Intestazione Report
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...primaryColor);
    doc.text(`REPORT ALLENAMENTO: ${dayData.dayName || 'Giornata'}`, 14, cursorY);

    cursorY += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    
    let metaString = `Data: ${new Date().toLocaleDateString()}`;
    if (metadata) {
        metaString = `${metadata.mesoName} | Settimana ${metadata.weekNumber} | Giorno ${metadata.dayNumber} — ${metaString}`;
    }
    doc.text(metaString, 14, cursorY);
    cursorY += 10;

    const exercises = dayData.exercises || [];
    if (exercises.length === 0) {
        doc.text("Nessun esercizio registrato in questa sessione.", 14, cursorY);
        doc.save(`Allenamento_${dayData.dayName || 'Sessione'}.pdf`);
        return;
    }

    exercises.forEach((ex, exIdx) => {
        if (cursorY > 250) {
            doc.addPage();
            cursorY = 15;
        }

        // Titolo Esercizio
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...primaryColor);
        doc.text(`${exIdx + 1}. ${ex.name || 'Esercizio'}`, 14, cursorY);
        cursorY += 6;

        // 1. Stringa di Target ripulita dai tag HTML
        const rawTargetSummary = formatExerciseSummary(ex);
        const cleanTargetSummary = rawTargetSummary.replace(/<[^>]*>?/gm, '');
        const rpeTargetStr = (ex.targetRpe || ex.rpeTarget || ex.rpe) ? ` | ${ex.targetRpe || ex.rpeTarget || ex.rpe}` : '';
        const fullTargetText = `TARGET: ${cleanTargetSummary}${rpeTargetStr}`;

        doc.setFillColor(...grayBg);
        doc.setDrawColor(...borderColor);
        doc.roundedRect(14, cursorY, pageWidth - 28, 7, 1, 1, 'FD');
        
        doc.setFont("courier", "bold");
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text(fullTargetText, 18, cursorY + 4.5);
        cursorY += 10;

        // 2. Recupero dello storico della sessione precedente tramite l'oggetto state globale
        const stateSource = metadata?.state || { workoutData: { history: { years: { [new Date().getFullYear()]: { mesocycles: [] } } } } };
        const prevExercise = findPreviousExercise(
            stateSource, 
            metadata?.mesoIndex ?? 0, 
            metadata?.weekNumber ?? 1, 
            metadata?.dayNumber ?? 1, 
            ex
        );

        let prevSessionLines = [];
        if (prevExercise && prevExercise.loggedSets && prevExercise.loggedSets.length > 0) {
            const validPrevSets = prevExercise.loggedSets.filter(s => s.weight || s.reps);
            if (validPrevSets.length > 0) {
                const rangeStr = (prevExercise.minReps && prevExercise.maxReps) 
                    ? `${prevExercise.minReps}-${prevExercise.maxReps}` 
                    : null;

                validPrevSets.forEach((s, sIdx) => {
                    const kgStr = s.weight ? `${s.weight}kg` : '-';
                    const repsStr = rangeStr ? `${s.reps || rangeStr} reps` : `${s.reps || '-'} reps`;
                    const rpeStr = s.rpe ? `, con @${String(s.rpe).replace('@', '')} rpe` : '';
                    prevSessionLines.push(`${sIdx + 1}° set: ${kgStr}, ${repsStr}${rpeStr}`);
                });
            }
        }

        // 3. Box Note allenatore / Ultima sessione precedente
        if (ex.notes || prevSessionLines.length > 0) {
            let boxHeight = 6;
            if (ex.notes) boxHeight += 8;
            if (prevSessionLines.length > 0) boxHeight += (prevSessionLines.length * 5) + 4;

            if (cursorY + boxHeight > 275) {
                doc.addPage();
                cursorY = 15;
            }

            doc.setFillColor(240, 249, 255); // #f0f9ff
            doc.setDrawColor(224, 242, 254); // #e0f2fe
            doc.roundedRect(14, cursorY, pageWidth - 28, boxHeight, 1, 1, 'FD');

            let innerY = cursorY + 5;
            if (ex.notes) {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(7.5);
                doc.setTextColor(3, 105, 161);
                doc.text("NOTE ALLENATORE", 18, innerY);
                innerY += 4;
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8.5);
                doc.setTextColor(15, 23, 42);
                doc.text(ex.notes, 18, innerY, { maxWidth: pageWidth - 40 });
                innerY += 6;
            }

            if (prevSessionLines.length > 0) {
                if (ex.notes) {
                    doc.setDrawColor(186, 230, 253);
                    doc.line(18, innerY - 2, pageWidth - 18, innerY - 2);
                    innerY += 2;
                }
                doc.setFont("helvetica", "bold");
                doc.setFontSize(7.5);
                doc.setTextColor(2, 132, 199);
                doc.text("ULTIMA SESSIONE PRECEDENTE", 18, innerY);
                innerY += 4;

                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.setTextColor(15, 23, 42);
                prevSessionLines.forEach(line => {
                    doc.text(line, 18, innerY);
                    innerY += 5;
                });
            }

            cursorY += boxHeight + 4;
        }

        // 4. Tabella Set Svolti
        const loggedSets = ex.loggedSets || [];
        if (loggedSets.length > 0) {
            const tableHeaders = ["SET", "KG", "REPS", "RPE", "✓"];
            const colWidths = [18, 32, 32, 32, 40];
            const startX = 14;
            let currentX = startX;

            doc.setFillColor(...grayBg);
            doc.setDrawColor(...borderColor);
            doc.rect(startX, cursorY, pageWidth - 28, 6, 'FD');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);

            tableHeaders.forEach((header, hIdx) => {
                doc.text(header, currentX + (colWidths[hIdx] / 2), cursorY + 4, { align: 'center' });
                currentX += colWidths[hIdx];
            });
            cursorY += 6;

            loggedSets.forEach((setObj, setIdx) => {
                if (cursorY > 275) {
                    doc.addPage();
                    cursorY = 15;
                }

                currentX = startX;
                const rowHeight = 10;
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(...borderColor);
                doc.rect(startX, cursorY, pageWidth - 28, rowHeight, 'FD');

                const currentKg = parseFloat(setObj.weight) || 0;
                const currentReps = parseInt(setObj.reps) || 0;
                const prevSet = prevExercise?.loggedSets?.[setIdx];
                const prevKg = prevSet ? parseFloat(prevSet.weight) || 0 : 0;
                const prevReps = prevSet ? parseInt(prevSet.reps) || 0 : 0;

                // Calcolo trend di volume rispetto alla sessione precedente
                let trendText = "";
                let isPositiveTrend = true;
                const trend = calculateSetVolumeTrend(
                    { weight: currentKg, reps: currentReps },
                    { weight: prevKg, reps: prevReps }
                );
                if (trend) {
                    trendText = trend.text;
                    isPositiveTrend = trend.isPositive;
                }

                // Definizione target min/max per logica out-of-range e colori dei bordi
                let currentKgMin = ex.kgMin;
                let currentKgMax = ex.kgMax;
                if ((setIdx === 0 || setObj.isTopset) && (ex.topsetKgMin || ex.topsetKgMax || ex.topsetKg)) {
                    currentKgMin = ex.topsetKgMin || ex.topsetKg;
                    currentKgMax = ex.topsetKgMax || ex.topsetKg;
                }

                const displayWeight = setObj.weight !== undefined ? setObj.weight : '';
                const displayReps = setObj.reps !== undefined ? setObj.reps : '';
                const displayRpe = setObj.rpe !== undefined ? setObj.rpe : '';

                const maxAllowedKg = parseFloat(currentKgMax) || 0;
                const minAllowedKg = parseFloat(currentKgMin) || 0;

                // Logica cromatica intelligente:
                // - Bordo Verde se supera il massimo del target
                // - Bordo Rosso se è inferiore al minimo del target
                // - Bordo standard se è in target
                let cellBorderColor = borderColor;
                let cellBorderWidth = 0.2;
                let isCustomBorder = false;

                if (displayWeight !== '') {
                    const wNum = parseFloat(displayWeight);
                    if (maxAllowedKg > 0 && wNum > maxAllowedKg) {
                        cellBorderColor = [22, 163, 74]; // Verde (Superamento positivo)
                        cellBorderWidth = 0.6;
                        isCustomBorder = true;
                    } else if (minAllowedKg > 0 && wNum < minAllowedKg) {
                        cellBorderColor = [239, 68, 68]; // Rosso (Sotto target)
                        cellBorderWidth = 0.6;
                        isCustomBorder = true;
                    }
                }

                // Colonna 1: Set + Delta volume
                doc.setFont("helvetica", "bold");
                doc.setFontSize(8.5);
                doc.setTextColor(...primaryColor);
                doc.text(`${setIdx + 1}`, currentX + (colWidths[0] / 2), cursorY + 4, { align: 'center' });

                if (trendText) {
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(6);
                    doc.setTextColor(isPositiveTrend ? 22 : 185, isPositiveTrend ? 163 : 38, isPositiveTrend ? 74 : 60);
                    doc.text(trendText, currentX + (colWidths[0] / 2), cursorY + 8.5, { align: 'center' });
                }
                currentX += colWidths[0];

                // Funzione per disegnare celle con bordo condizionale (Verde/Rosso)
                const drawCellWithSmartBorder = (val, width) => {
                    if (isCustomBorder) {
                        doc.setDrawColor(...cellBorderColor);
                        doc.setLineWidth(cellBorderWidth);
                        doc.rect(currentX + 2, cursorY + 1.5, width - 4, rowHeight - 3);
                        doc.setLineWidth(0.2);
                        doc.setDrawColor(...borderColor);
                    }
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(8.5);
                    doc.setTextColor(...primaryColor);
                    doc.text(val ? String(val) : '-', currentX + (width / 2), cursorY + 6, { align: 'center' });
                    currentX += width;
                };

                drawCellWithSmartBorder(displayWeight ? `${displayWeight}` : '', colWidths[1]);
                
                // Reps e Rpe normali
                doc.text(displayReps ? String(displayReps) : '-', currentX + (colWidths[2] / 2), cursorY + 6, { align: 'center' });
                currentX += colWidths[2];

                doc.text(displayRpe ? (String(displayRpe).startsWith('@') ? displayRpe : `@${displayRpe}`) : '-', currentX + (colWidths[3] / 2), cursorY + 6, { align: 'center' });
                currentX += colWidths[3];

                // Colonna 5: Icona di spunta (Stato OK o vuoto)
                const isLocked = setObj.isLocked || false;
                if (isLocked) {
                    doc.setFillColor(37, 99, 235); // Blu icona spunta simile alla webapp
                    doc.circle(currentX + (colWidths[4] / 2), cursorY + 5, 3.5, 'FD');
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(6);
                    doc.setTextColor(255, 255, 255);
                    doc.text("✓", currentX + (colWidths[4] / 2), cursorY + 6.2, { align: 'center' });
                }
                currentX += colWidths[4];

                cursorY += rowHeight;
            });
            cursorY += 2;
        }

        // 5. Box note atleta
        const athleteNotes = ex.userNotes || '';
        if (athleteNotes) {
            if (cursorY + 14 > 275) {
                doc.addPage();
                cursorY = 15;
            }

            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(203, 213, 225);
            doc.roundedRect(14, cursorY, pageWidth - 28, 12, 1, 1, 'FD');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(71, 85, 105);
            doc.text("NOTE ATLETA (ESERCIZIO)", 18, cursorY + 4);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(15, 23, 42);
            doc.text(athleteNotes, 18, cursorY + 9, { maxWidth: pageWidth - 40 });
            cursorY += 15;
        }

        cursorY += 6;
    });

    const safeDayName = (dayData.dayName || 'Allenamento').replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`${safeDayName}_Report.pdf`);
}