/* global QRCode */
/**
 * Module: pdfExport.js
 * Summary: Genera e scarica il report PDF dettagliato dell'allenamento corrente,
 * con estrazione pulita dell'atleta, QR code universale di rientro alla sessione,
 * spunta verde "✓ OK" per i set completati, target e bordi dinamici.
 */

import { 
    formatExerciseSummary, 
    findPreviousExercise, 
    calculateSetVolumeTrend, 
    isValueOutOfRange, 
    isValueExceedingTarget 
} from './helpers.js';

const { jsPDF } = window.jspdf;

/**
 * Generatore universale di QR Code in formato Data URL.
 * Tenta l'uso delle librerie JS locali e usa un fallback Canvas se non presenti.
 */
async function generateQRCodeDataUrl(text) {
    // 1. Libreria QRCode.toDataURL (npm / modern bundle)
    try {
        if (window.QRCode && typeof window.QRCode.toDataURL === 'function') {
            return await window.QRCode.toDataURL(text, { margin: 1 });
        }
        if (typeof QRCode !== 'undefined' && typeof QRCode.toDataURL === 'function') {
            return await QRCode.toDataURL(text, { margin: 1 });
        }
    } catch (e) {
        console.warn("QRCode.toDataURL non riuscito, provo metodo alternativo...", e);
    }

    // 2. Libreria QRCode.js classica (new QRCode(container, text))
    try {
        if (typeof QRCode !== 'undefined' || window.QRCode) {
            const QRCodeCtor = window.QRCode || QRCode;
            const tempDiv = document.createElement('div');
            tempDiv.style.display = 'none';
            document.body.appendChild(tempDiv);
            
            new QRCodeCtor(tempDiv, { text: text, width: 128, height: 128 });
            await new Promise(r => setTimeout(r, 100));
            
            const imgEl = tempDiv.querySelector('img') || tempDiv.querySelector('canvas');
            let dataUrl = null;
            if (imgEl) {
                dataUrl = imgEl.tagName.toLowerCase() === 'canvas' ? imgEl.toDataURL('image/png') : imgEl.src;
            }
            document.body.removeChild(tempDiv);
            if (dataUrl) return dataUrl;
        }
    } catch (e) {
        console.warn("new QRCode() non riuscito, proseguo con fallback API...", e);
    }

    // 3. Fallback universale via Canvas / QR API (garantisce sempre l'immagine)
    try {
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(text)}`;
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        return await new Promise((resolve) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(null);
            img.src = qrApiUrl;
        });
    } catch (e) {
        console.warn("Generazione QR Code fallita:", e);
    }

    return null;
}

/**
 * Recupera il nome reale dell'atleta loggato filtrando testi di abbonamenti o prezzi.
 */
/**
 * Recupera il nome reale dell'atleta analizzando l'oggetto utente Supabase (state.currentUser),
 * lo stato dell'app, il localStorage o l'header di navigazione.
 */
function getLoggedAthleteName(state) {
    // 1. Estrazione diretta dai metadati dell'utente Supabase (registrazione da form HTML)
    const userMeta = state?.currentUser?.user_metadata;
    if (userMeta) {
        if (userMeta.full_name && userMeta.full_name.trim()) {
            return userMeta.full_name.trim();
        }
        
        const firstName = userMeta.name || userMeta.first_name || userMeta.nome || '';
        const lastName = userMeta.surname || userMeta.last_name || userMeta.cognome || '';
        
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName) {
            return fullName;
        }
    }

    // 2. Fallback su proprietà dello stato globale
    const nameFromState = 
        state?.workoutData?.athleteName ||
        state?.athleteName ||
        state?.userName ||
        state?.userProfile?.name ||
        state?.userProfile?.fullName ||
        state?.profile?.name ||
        state?.profile?.full_name;

    if (nameFromState && nameFromState.toLowerCase() !== 'atleta') {
        return nameFromState;
    }

    // 3. Fallback da LocalStorage / SessionStorage
    const nameFromStorage = 
        localStorage.getItem('athleteName') || 
        localStorage.getItem('userName') || 
        localStorage.getItem('user_name');

    if (nameFromStorage) return nameFromStorage;

    // 4. Lettura mirata dall'header (#user-email-display in index.html)
    const emailDisplay = document.getElementById('user-email-display');
    if (emailDisplay && emailDisplay.textContent.trim()) {
        const text = emailDisplay.textContent.trim();
        if (text.includes('@')) {
            // Estrae il nome prima della chiocciola (es. mario.rossi da mario.rossi@email.com)
            const rawName = text.split('@')[0].replace(/[._-]/g, ' ');
            return rawName.replace(/\b\w/g, char => char.toUpperCase());
        }
        return text;
    }

    // 5. Fallback se l'utente è in sessione anonima/offline
    if (state?.currentUser?.email) {
        const rawName = state.currentUser.email.split('@')[0].replace(/[._-]/g, ' ');
        return rawName.replace(/\b\w/g, char => char.toUpperCase());
    }

    return 'Atleta';
}

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
    let cursorY = 14;
    const renderDataCell = (value, width, currentXInput, borderColorArray) => {
        const isCustom = borderColorArray !== colorGray;
        doc.setDrawColor(...borderColorArray);
        doc.setLineWidth(isCustom ? 0.5 : 0.2);
        doc.roundedRect(currentXInput + 3, cursorY + 1.5, width - 6, 7, 1, 1, 'D');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...primaryColor);
        doc.text(value ? String(value) : '-', currentXInput + (width / 2), cursorY + 6, { align: 'center' });
    };

    // Palette Colori
    const primaryColor = [15, 23, 42];    // Slate 900
    const grayBg = [248, 250, 252];       // Slate 50
    const borderColor = [226, 232, 240];  // Slate 200
    const colorRed = [239, 68, 68];       // Fuori Target (#ef4444)
    const colorGreen = [22, 163, 74];     // Spunta OK / Superato Target (#16a34a)
    const colorGray = [203, 213, 225];    // Standard (#cbd5e1)

    // Generazione QR Code Garantito
    const currentUrl = window.location.href;
    const qrDataUrl = await generateQRCodeDataUrl(currentUrl);

    // Estrazione Reale Nome Atleta
    const athleteName = getLoggedAthleteName(metadata?.state);

    // Intestazione Report
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...primaryColor);
    doc.text(`REPORT ALLENAMENTO: ${dayData.dayName || 'Giornata'}`, 14, cursorY);

    cursorY += 5.5;

    // Dati Atleta e Sessione
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`Atleta: ${athleteName}`, 14, cursorY);

    cursorY += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    
    let metaString = `Data: ${new Date().toLocaleDateString('it-IT')}`;
    if (metadata) {
        metaString = `${metadata.mesoName} | Settimana ${metadata.weekNumber} | Giorno ${metadata.dayNumber} — ${metaString}`;
    }
    doc.text(metaString, 14, cursorY);

    // Posizionamento QR Code in alto a destra
    if (qrDataUrl) {
    // Prima era (pageWidth - 32), ora (pageWidth - 47) per spostarlo a sinistra
    const qrX = pageWidth - 47; 
    const qrY = 10;
    const qrWidth = 18;

    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrWidth, 18);
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    
    // Il testo viene centrato rispetto alla nuova X del QR code (qrX + metà larghezza)
    doc.text("Scansiona per accedere a questa sessione di allenamento", qrX + (qrWidth / 2), 32, { align: 'center' });
}
    cursorY += 10;

    const exercises = dayData.exercises || [];
    if (exercises.length === 0) {
        doc.text("Nessun esercizio registrato in questa sessione.", 14, cursorY);
        doc.save(`Allenamento_${dayData.dayName || 'Sessione'}.pdf`);
        return;
    }

    exercises.forEach((ex, exIdx) => {
        if (cursorY > 245) {
            doc.addPage();
            cursorY = 14;
        }

        const isExExcluded = ex.isExcluded || false;
        const isDropset = ex.isDropset || false;

        // 1. Linea Blocco & Badge Stato
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        const blockText = `BLOCCO ${ex.block || (exIdx + 1)}`;
        doc.text(blockText, 14, cursorY);

        const badgeOffset = 14 + doc.getTextWidth(blockText) + 4;
        if (isDropset) {
            doc.setFillColor(255, 247, 237);
            doc.setDrawColor(255, 237, 213);
            doc.roundedRect(badgeOffset, cursorY - 3, 20, 4, 1, 1, 'FD');
            doc.setFontSize(6.5);
            doc.setTextColor(194, 65, 12);
            doc.text("🔥 DROP SET", badgeOffset + 10, cursorY, { align: 'center' });
        }

        if (isExExcluded) {
            doc.setFillColor(239, 68, 68);
            doc.roundedRect(pageWidth - 48, cursorY - 3, 34, 4, 1, 1, 'F');
            doc.setFontSize(6.5);
            doc.setTextColor(255, 255, 255);
            doc.text("ESCLUSO DAI MASSIMALI", pageWidth - 31, cursorY, { align: 'center' });
        }
        cursorY += 5;

        // 2. Titolo Esercizio
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...primaryColor);
        doc.text(`${exIdx + 1}. ${ex.name || 'Esercizio'}`, 14, cursorY);
        cursorY += 5;

        // 3. Stringa Target
        const rawTargetSummary = formatExerciseSummary(ex);
        const cleanTargetSummary = rawTargetSummary.replace(/<[^>]*>?/gm, '');
        const rpeTargetStr = (ex.targetRpe || ex.rpeTarget || ex.rpe) ? ` | ${ex.targetRpe || ex.rpeTarget || ex.rpe}` : '';
        const fullTargetText = `TARGET: ${cleanTargetSummary}${rpeTargetStr}`;

        doc.setFillColor(...grayBg);
        doc.setDrawColor(...borderColor);
        doc.roundedRect(14, cursorY, pageWidth - 28, 6, 1, 1, 'FD');
        
        doc.setFont("courier", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        doc.text(fullTargetText, 17, cursorY + 4);
        cursorY += 8;

        // 4. Storico Sessione Precedente
        const stateSource = metadata?.state || { workoutData: {} };
        const prevExercise = findPreviousExercise(
            stateSource.workoutData, 
            metadata?.mesoIndex ?? 0, 
            metadata?.weekNumber ?? 1, 
            (metadata?.dayNumber ?? 1) - 1, 
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
                    const repsStr = rangeStr 
                        ? ((s.reps && s.reps !== rangeStr) ? `${s.reps} reps (target ${rangeStr})` : `${rangeStr} reps`)
                        : `${s.reps || prevExercise.reps || '-'} reps`;
                    const rpeStr = s.rpe ? `, con ${s.rpe} rpe` : '';
                    prevSessionLines.push(`${sIdx + 1}° set: ${kgStr}, ${repsStr}${rpeStr}`);
                });
            }
        }

        // 5. Box Note Allenatore / Ultima Sessione Precedente
        // 5. Box Note Allenatore / Ultima Sessione Precedente
if (ex.notes || prevSessionLines.length > 0) {
    let boxHeight = 4;
    if (ex.notes) boxHeight += 8.5; // 3.5 (titolo) + 5 (spazio sotto)
    if (prevSessionLines.length > 0) {
        if (ex.notes) boxHeight += 1.5; // spazio per la linea separatrice
        boxHeight += 3.5 + (prevSessionLines.length * 4.5); // 3.5 titolo + altezza righe
    }

    if (cursorY + boxHeight > 270) {
        doc.addPage();
        cursorY = 14;
    }

    doc.setFillColor(240, 249, 255);
    doc.setDrawColor(224, 242, 254);
    doc.roundedRect(14, cursorY, pageWidth - 28, boxHeight, 1, 1, 'FD');

    let innerY = cursorY + 4;
    
    // NOTE ALLENATORE
    if (ex.notes) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(3, 105, 161);
        doc.text("NOTE ALLENATORE", 17, innerY);
        innerY += 3.5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(ex.notes, 17, innerY, { maxWidth: pageWidth - 36 });
        innerY += 5;
    }

    // ULTIMA SESSIONE PRECEDENTE (Identico a Note Allenatore)
    if (prevSessionLines.length > 0) {
        if (ex.notes) {
            doc.setDrawColor(186, 230, 253);
            doc.line(17, innerY - 2, pageWidth - 17, innerY - 2);
            innerY += 1.5;
        }
        
        // Titolo: FontSize 7, Colore (3, 105, 161)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(3, 105, 161);
        doc.text("ULTIMA SESSIONE PRECEDENTE", 17, innerY);
        innerY += 3.5;

        // Testo: FontSize 8
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        prevSessionLines.forEach(line => {
            doc.text(line, 17, innerY);
            innerY += 4.5;
        });
    }

    cursorY += boxHeight + 3;
}
        // 6. Tabella Set
        const loggedSets = ex.loggedSets || [];
        if (loggedSets.length > 0) {
            const tableHeaders = ["SET / VOL.", "KG", "REPS", "RPE", "✓"];
            const colWidths = [32, 38, 38, 38, 36];
            const startX = 14;
            let currentX = startX;

            // Intestazione Tabella
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
                if (cursorY > 270) {
                    doc.addPage();
                    cursorY = 14;
                }

                currentX = startX;
                const rowHeight = 10;

                // Sfondo Riga
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(...borderColor);
                doc.rect(startX, cursorY, pageWidth - 28, rowHeight, 'FD');

                const prevSet = prevExercise?.loggedSets?.[setIdx];
                const prevKg = prevSet ? parseFloat(prevSet.weight) || 0 : 0;
                
                const currentRepsCount = (setObj.reps && String(setObj.reps).includes('+'))
                ? String(setObj.reps).split('+').reduce((sum, r) => sum + (parseInt(r, 10) || 0), 0)
                : parseInt(setObj.reps, 10) || 0;

                const currentKg = parseFloat(setObj.weight) || 0;
                const currentVol = currentKg * currentRepsCount;
                
                let prevRepsCount = prevSet ? (String(prevSet.reps).includes('+') ? String(prevSet.reps).split('+').reduce((sum, r) => sum + (parseInt(r, 10) || 0), 0) : parseInt(prevSet.reps, 10) || 0) : 0;
                const prevVol = prevKg * prevRepsCount;
                const volDiff = (currentVol > 0 && prevVol > 0) ? (currentVol - prevVol) : 0;
                const trend = calculateSetVolumeTrend({ weight: currentKg, reps: currentRepsCount }, { weight: prevKg, reps: prevRepsCount });

                // Placeholder intelligente per la riga del PDF
                const isRangeTarget = (ex.minReps && ex.maxReps) || (typeof ex.reps === 'string' && ex.reps.includes('-'));
                const rawTargetReps = ex.reps || ex.targetReps || '';
                const defaultTargetReps = isRangeTarget ? (prevSet?.reps || '') : rawTargetReps.toString().trim();

                const displayWeight = setObj.weight !== undefined && setObj.weight !== '' ? setObj.weight : (prevSet?.weight || '');
                const displayReps = setObj.reps !== undefined && setObj.reps !== '' ? setObj.reps : defaultTargetReps;
                const displayRpe = setObj.rpe !== undefined && setObj.rpe !== '' ? setObj.rpe : (ex.targetRpe || ex.rpe || '');

                let currentKgMin = ex.kgMin;
                let currentKgMax = ex.kgMax;
                if ((setIdx === 0 || setObj.isTopset) && (ex.topsetKgMin || ex.topsetKgMax || ex.topsetKg)) {
                    currentKgMin = ex.topsetKgMin || ex.topsetKg;
                    currentKgMax = ex.topsetKgMax || ex.topsetKg;
                }

                const isKgOutOfRange = isValueOutOfRange(displayWeight, currentKgMin, currentKgMax);
                const isKgExceeding = isValueExceedingTarget(displayWeight, currentKgMin, currentKgMax);
                const kgColor = isKgOutOfRange ? colorRed : (isKgExceeding ? colorGreen : colorGray);

                const isRepsOutOfRange = isValueOutOfRange(displayReps, ex.minReps || ex.reps, ex.maxReps || ex.reps);
                const isRepsExceeding = isValueExceedingTarget(displayReps, ex.minReps || ex.reps, ex.maxReps || ex.reps);
                const repsColor = isRepsOutOfRange ? colorRed : (isRepsExceeding ? colorGreen : colorGray);

                const targetRpeStr = String(ex.targetRpe || ex.rpeTarget || ex.rpe || '').replace('@', '').trim();
                let minRpe = ex.minRpe;
                let maxRpe = ex.maxRpe;
                if (!minRpe && !maxRpe && targetRpeStr.includes('-')) {
                    const parts = targetRpeStr.split('-');
                    minRpe = parts[0];
                    maxRpe = parts[1];
                } else if (!minRpe && !maxRpe && targetRpeStr) {
                    minRpe = targetRpeStr;
                    maxRpe = targetRpeStr;
                }

                const cleanDisplayRpe = String(displayRpe).replace('@', '').trim();
                const isRpeOutOfRange = isValueOutOfRange(cleanDisplayRpe, minRpe, maxRpe);
                const isRpeExceeding = isValueExceedingTarget(cleanDisplayRpe, minRpe, maxRpe);
                const rpeColor = isRpeOutOfRange ? colorRed : (isRpeExceeding ? colorGreen : colorGray);

                // Colonna 1: Numero Set + Tab Evoluzione Volume o Badge Tecnica MyCoatch
                doc.setFont("helvetica", "bold");
                doc.setFontSize(8.5);
                doc.setTextColor(...primaryColor);
                
                // 🚀 INIEZIONE: Se il set conteneva una tecnica, stampiamo l'indicazione testuale direttamente sul PDF
                const labelText = setObj.intensityTechnique 
                    ? `SET ${setIdx + 1} (${setObj.intensityTechnique === 'DROP_SET' ? 'DROP' : 'R-PS'})` 
                    : `SET ${setIdx + 1}`;
                
                doc.text(labelText, currentX + (colWidths[0] / 2), cursorY + 4, { align: 'center' });
                if (currentVol > 0) {
                    let badgeBg = [241, 245, 249];       // Slate 100
                    let badgeTextCol = [71, 85, 105];    // Slate 600
                    let signStr = '';

                    if (volDiff > 0) {
                        badgeBg = [220, 252, 231];       // Green 100
                        badgeTextCol = [22, 101, 52];    // Green 800
                        signStr = '+';
                    } else if (volDiff < 0) {
                        badgeBg = [254, 226, 226];       // Red 100
                        badgeTextCol = [153, 27, 27];    // Red 800
                    }
                

                    const volLabel = volDiff !== 0 ? `${currentVol}kg (${signStr}${volDiff}kg)` : `${currentVol} kg`;
                    doc.setFillColor(...badgeBg);
                    doc.roundedRect(currentX + 2, cursorY + 5.2, colWidths[0] - 4, 3.8, 1, 1, 'F');
                    doc.setFontSize(5.5);
                    doc.setTextColor(...badgeTextCol);
                    doc.text(volLabel, currentX + (colWidths[0] / 2), cursorY + 7.8, { align: 'center' });
                }
                
                else if (trend) {
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(5.5);
                    doc.setTextColor(trend.isPositive ? 22 : 220, trend.isPositive ? 163 : 38, trend.isPositive ? 74 : 38);
                    doc.text(trend.text, currentX + (colWidths[0] / 2), cursorY + 7.8, { align: 'center' });
                }
                currentX += colWidths[0];

                renderDataCell(displayWeight, colWidths[1], currentX, kgColor);
                currentX += colWidths[1];

                renderDataCell(displayReps, colWidths[2], currentX, repsColor);
                currentX += colWidths[2];

                const formattedRpe = cleanDisplayRpe ? (cleanDisplayRpe.startsWith('@') ? cleanDisplayRpe : `@${cleanDisplayRpe}`) : '';
                renderDataCell(formattedRpe, colWidths[3], currentX, rpeColor);
                currentX += colWidths[3];

                // Colonna 5: Spunta Verde OK
                const isLocked = setObj.isLocked || false;
                if (isLocked) {
                    doc.setFillColor(...colorGreen);
                    doc.roundedRect(currentX + (colWidths[4] / 2) - 8, cursorY + 2.8, 16, 4.8, 1, 1, 'F');
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(6.5);
                    doc.setTextColor(255, 255, 255);
                    doc.text("✓ OK", currentX + (colWidths[4] / 2), cursorY + 6.2, { align: 'center' });
                } else {
                    doc.setDrawColor(...colorGray);
                    doc.setLineWidth(0.3);
                    doc.rect(currentX + (colWidths[4] / 2) - 2.5, cursorY + 2.5, 5, 5, 'D');
                }
                currentX += colWidths[4];

                cursorY += rowHeight;
            });
        }


        // 7. Box Note Atleta
        const athleteNotes = ex.userNotes || '';
        if (cursorY + 10 > 270) {
            doc.addPage();
            cursorY = 14;
        }

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(14, cursorY, pageWidth - 28, 8, 1, 1, 'FD');

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        if (athleteNotes) {
            doc.setTextColor(15, 23, 42);
            doc.text(athleteNotes, 17, cursorY + 5, { maxWidth: pageWidth - 34 });
        } else {
            doc.setTextColor(148, 163, 184);
            doc.text("Nessuna nota inserita...", 17, cursorY + 5);
        }

        cursorY += 12;
    });

    const safeDayName = (dayData.dayName || 'Allenamento').replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`${safeDayName}_Report.pdf`);
}