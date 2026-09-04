// js/csvHandler.js
import { state } from './state.js';
import { saveAndSync } from './storage.js';

/**
 * Parser universale per CSV e tabelle copiate (gestisce tabulazioni da PDF/Excel, virgolette e a capo)
 */
export function parseCSV(text) {
    if (!text) return [];

    const sampleLine = text.split(/\r\n|\n/).find(l => l.trim().length > 0) || '';
    let delimiter = ',';
    if (sampleLine.includes('\t')) {
        delimiter = '\t';
    } else if (sampleLine.includes(';')) {
        delimiter = ';';
    }

    const result = [];
    let row = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            const cleaned = currentField.replace(/[\r\n]+/g, ' ').trim().replace(/^"|"$/g, '');
            row.push(cleaned);
            currentField = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            const cleaned = currentField.replace(/[\r\n]+/g, ' ').trim().replace(/^"|"$/g, '');
            row.push(cleaned);
            if (row.some(field => field.length > 0)) {
                result.push(row);
            }
            row = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }

    if (currentField || row.length > 0) {
        const cleaned = currentField.replace(/[\r\n]+/g, ' ').trim().replace(/^"|"$/g, '');
        row.push(cleaned);
        if (row.some(field => field.length > 0)) {
            result.push(row);
        }
    }

    return result;
}

/**
 * Helper per trovare l'indice di una colonna evitando falsi positivi
 */
function findColumnIndex(headers, targets) {
    for (const target of targets) {
        let idx = headers.indexOf(target);
        if (idx !== -1) return idx;

        idx = headers.findIndex(h => {
            if (target === 'set' || target === 'serie') {
                if (h.includes('settimana')) return false;
            }
            return h.includes(target);
        });
        if (idx !== -1) return idx;
    }
    return -1;
}

/**
 * Verifica se tutti gli esercizi/set del mesociclo sono stati completati
 */
function isMesocycleCompleted(meso) {
    if (!meso || !meso.weeks || meso.weeks.length === 0) return true;

    for (const week of meso.weeks) {
        for (const day of week.days || []) {
            for (const ex of day.exercises || []) {
                const sets = ex.loggedSets || ex.sets || [];
                const isExIncomplete = sets.some(s => !s.isLocked && (!s.weight || !s.reps));
                if (isExIncomplete) return false;
            }
        }
    }
    return true;
}

/**
 * Assegna i tag visivi per Triset, Superset e Dropset SENZA alterare gli oggetti esercizio
 */
function applyTrisetDropsetGrouping(daysArray) {
    daysArray.forEach(day => {
        const exercises = day.exercises;
        if (!exercises || exercises.length === 0) return;

        let i = 0;
        while (i < exercises.length) {
            const ex = exercises[i];
            const notes = (ex.notes || '').toLowerCase();
            const name = (ex.name || '').toLowerCase();
            const combinedText = `${name} ${notes}`;
            
            const isTriset = combinedText.includes('triset') || combinedText.includes('tri-set') || combinedText.includes('tri set') || combinedText.includes('triserie') || combinedText.includes('tri serie') || combinedText.includes('tri-serie');
            const isDropset = combinedText.includes('dropset') || combinedText.includes('drop-set') || combinedText.includes('drop set') || combinedText.includes('dropserie') || combinedText.includes('drop serie') || combinedText.includes('drop-serie');
            const isSuperset = combinedText.includes('superset') || combinedText.includes('super-set') || combinedText.includes('super set') || combinedText.includes('superserie') || combinedText.includes('super serie') || combinedText.includes('super-serie');

            if (isDropset) {
                ex.isDropset = true;
                const baseBlock = String(ex.block || (i + 1)).replace(/[A-Za-z]/g, '');
                ex.block = baseBlock || String(i + 1);
                i++;
            } else if (isTriset || isSuperset) {
                let groupSize = isTriset ? 3 : 2;
                const baseBlock = String(ex.block || (i + 1)).replace(/[A-Za-z]/g, '');
                const letters = ['A', 'B', 'C', 'D', 'E'];
                const groupType = isTriset ? 'triset' : 'superset';
                
                for (let j = 0; j < groupSize && (i + j) < exercises.length; j++) {
                    const targetEx = exercises[i + j];
                    targetEx.block = `${baseBlock || (i + 1)}${letters[j] || (j + 1)}`;
                    targetEx.groupType = groupType;
                    targetEx.groupBase = baseBlock || String(i + 1);
                    // Flag per sapere se è l'ultimo esercizio del blocco (per attivare il timer)
                    targetEx.isGroupLast = (j === groupSize - 1) || ((i + j) === exercises.length - 1);
                }
                i += groupSize;
            } else {
                const baseBlock = String(ex.block || (i + 1)).replace(/[A-Za-z]/g, '');
                ex.block = baseBlock || String(i + 1);
                i++;
            }
        }
    });
}

/**
 * Importa il piano di allenamento da CSV strutturato o testo copiato (PDF/Excel)
 */
export function importWorkoutPlan(csvText) {
    try {
        const currentYear = state.currentYear || new Date().getFullYear();
        if (!state.workoutData.history) state.workoutData.history = {};
        if (!state.workoutData.history.years) state.workoutData.history.years = {};
        if (!state.workoutData.history.years[currentYear]) {
            state.workoutData.history.years[currentYear] = { mesocycles: [] };
        }

        const currentMesos = state.workoutData.history.years[currentYear].mesocycles;
        const activeMeso = currentMesos[state.activeMesocycleIndex];

        // --- CONTROLLO MESOCICLO IN CORSO ---
        if (activeMeso && !isMesocycleCompleted(activeMeso)) {
            const proceed = confirm(
                `⚠️ Attenzione: Il mesociclo attuale (${activeMeso.name}) non risulta ancora completato!\n\n` +
                `Vuoi comunque caricare il nuovo mesociclo ed impostarlo come attivo?`
            );
            
            if (!proceed) {
                return { 
                    success: false, 
                    error: "Importazione annullata. Completa prima il mesociclo in corso." 
                };
            }
        }

        const rows = parseCSV(csvText);
        if (rows.length < 2) throw new Error("Il file o il testo incollato è vuoto o non contiene intestazioni valide.");

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);
        const nextMesoNumber = currentMesos.length + 1;

        const newMesocycle = {
            id: `meso_${nextMesoNumber}`,
            name: `Mesociclo ${nextMesoNumber}`,
            importedAt: new Date().toISOString(),
            weeks: []
        };

        const weeksMap = {};

        dataRows.forEach(row => {
            const getVal = (colNames) => {
                const idx = findColumnIndex(headers, colNames);
                return (idx !== -1 && row[idx] !== undefined) ? row[idx].trim() : '';
            };

            const weekNum = parseInt(getVal(['settimana', 'week'])) || 1;
            const dayNum = parseInt(getVal(['giorno', 'day'])) || 1;
            const blockNum = parseInt(getVal(['blocco', 'block'])) || 1;
            const exName = getVal(['esercizio', 'exercise', 'name']) || 'Esercizio';
            const setsCount = parseInt(getVal(['set', 'serie'])) || 3;
            const repsVal = getVal(['reps', 'ripetizioni']) || '8';
            
            // Sanitizzazione unità 'kg' da kgMin e kgMax
            const rawKgMin = getVal(['kgmin', 'min']);
            const rawKgMax = getVal(['kgmax', 'max']);
            const kgMin = rawKgMin.replace(/kg/gi, '').trim();
            const kgMax = rawKgMax.replace(/kg/gi, '').trim();

            const topset = getVal(['topset']);
            const rpeVal = getVal(['rpe']) || '';
            const restVal = getVal(['recupero', 'rest']) || '90';
            const notesVal = getVal(['note', 'noteallenatore']) || '';

            if (!weeksMap[weekNum]) {
                weeksMap[weekNum] = { weekNumber: weekNum, coachNotes: '', daysMap: {} };
            }
            if (!weeksMap[weekNum].daysMap[dayNum]) {
                weeksMap[weekNum].daysMap[dayNum] = { dayNumber: dayNum, dayName: `Giorno ${dayNum}`, exercises: [] };
            }

            const sets = [];
            for (let s = 1; s <= setsCount; s++) {
                sets.push({
                    setNumber: s,
                    weight: '',
                    reps: '',
                    rpe: rpeVal,
                    isLocked: false
                });
            }

            weeksMap[weekNum].daysMap[dayNum].exercises.push({
                block: blockNum,
                name: exName,
                set: `${setsCount} set`,
                reps: repsVal,
                kgMin: kgMin,
                kgMax: kgMax,
                topset: topset,
                rpe: rpeVal,
                recupero: restVal,
                targetRpe: rpeVal,
                rest: restVal,
                notes: notesVal,
                sets: sets,
                loggedSets: JSON.parse(JSON.stringify(sets))
            });
        });

        Object.values(weeksMap).forEach(w => {
            const daysArray = Object.values(w.daysMap);
            applyTrisetDropsetGrouping(daysArray);

            newMesocycle.weeks.push({
                weekNumber: w.weekNumber,
                coachNotes: w.coachNotes,
                days: daysArray
            });
        });

        currentMesos.push(newMesocycle);

        state.activeMesocycleIndex = currentMesos.length - 1;
        state.activeWeek = 1;
        state.activeDay = 1;

        saveAndSync(state.workoutData);
        return { 
            success: true, 
            message: `Mesociclo ${nextMesoNumber} importato con successo!` 
        };
    } catch (err) {
        console.error("Errore importazione piano:", err);
        return { success: false, error: err.message };
    }
}

/**
 * Importa i dati storici di progressione / log da CSV ed effettua il parsing nello stato
 */
export function importProgressCSV(csvText) {
    try {
        const rows = parseCSV(csvText);
        if (!rows || rows.length < 2) {
            throw new Error("Il file CSV dei progressi è vuoto o non valido.");
        }

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        const idxDate = findColumnIndex(headers, ['data', 'date']);
        const idxEx = findColumnIndex(headers, ['esercizio', 'exercise', 'name']);
        const idxSet = findColumnIndex(headers, ['set', 'serie']);
        const idxWeight = findColumnIndex(headers, ['kg', 'peso', 'weight']);
        const idxReps = findColumnIndex(headers, ['rep', 'ripetizioni']);
        const idxRpe = findColumnIndex(headers, ['rpe', 'sforzo']);

        if (!state.workoutData.history) state.workoutData.history = {};
        if (!state.workoutData.history.years) state.workoutData.history.years = {};

        const currentYear = state.currentYear || new Date().getFullYear();
        if (!state.workoutData.history.years[currentYear]) {
            state.workoutData.history.years[currentYear] = { mesocycles: [] };
        }

        let historyMeso = state.workoutData.history.years[currentYear].mesocycles.find(m => m.name === "Storico Importato");
        if (!historyMeso) {
            historyMeso = { name: "Storico Importato", weeks: [] };
            state.workoutData.history.years[currentYear].mesocycles.push(historyMeso);
        }

        const recordsByDateAndEx = {};

        dataRows.forEach(row => {
            if (row.length < 2) return;
            const dateVal = idxDate !== -1 ? row[idxDate]?.trim() : (row[0]?.trim() || new Date().toISOString().split('T')[0]);
            const exNameVal = idxEx !== -1 ? row[idxEx]?.trim() : (row[1]?.trim() || 'Esercizio Storico');
            const rawWeight = idxWeight !== -1 ? row[idxWeight] : row[3];
            const normalizedWeight = String(rawWeight || '').replace(',', '.');
            const weightVal = parseFloat(normalizedWeight.replace(/[^0-9.]/g, '')) || 0;
            const repsVal = parseFloat(String(idxReps !== -1 ? row[idxReps] : row[4]).replace(/[^0-9.]/g, '')) || 0;
            const rpeVal = idxRpe !== -1 ? row[idxRpe] : row[5] || '';
            const setNum = idxSet !== -1 ? parseInt(row[idxSet]) : 0;

            if (!exNameVal) return;

            const key = `${dateVal}_${exNameVal}`;
            if (!recordsByDateAndEx[key]) {
                recordsByDateAndEx[key] = {
                    date: dateVal,
                    name: exNameVal,
                    loggedSets: []
                };
            }

            recordsByDateAndEx[key].loggedSets.push({
                setNumber: setNum || recordsByDateAndEx[key].loggedSets.length + 1,
                weight: weightVal,
                reps: repsVal,
                rpe: rpeVal,
                isLocked: true
            });
        });

        const weekObj = {
            weekNumber: historyMeso.weeks.length + 1,
            days: []
        };

        Object.values(recordsByDateAndEx).forEach(record => {
            weekObj.days.push({
                date: record.date,
                dayName: `Sessione ${record.date}`,
                exercises: [{
                    name: record.name,
                    loggedSets: record.loggedSets
                }]
            });
        });

        historyMeso.weeks.push(weekObj);
        saveAndSync(state.workoutData);

        return {
            success: true,
            message: `Storico importato con successo: aggiunti ${Object.keys(recordsByDateAndEx).length} record.`
        };
    } catch (err) {
        console.error("Errore nell'importazione del CSV di progresso:", err);
        return { success: false, error: err.message };
    }
}

/**
 * Esporta lo stato attuale o lo storico dei mesocicli in formato CSV
 */
export function exportToCSV(workoutData) {
    try {
        const currentYear = state.currentYear || new Date().getFullYear();
        const mesocycles = workoutData?.history?.years?.[currentYear]?.mesocycles || [];

        if (mesocycles.length === 0) {
            alert("Nessun dato di mesociclo disponibile per l'esportazione CSV.");
            return;
        }

        let csvContent = "Settimana,Giorno,Blocco,Esercizio,Serie,Reps,KgMin,KgMax,Rpe,Recupero,Note\n";

        mesocycles.forEach(meso => {
            meso.weeks?.forEach(week => {
                week.days?.forEach(day => {
                    day.exercises?.forEach(ex => {
                        ex.sets?.forEach(set => {
                            const weightStr = `"${(set.weight ?? 0).toString().replace(/"/g, '""')}"`;
                            const row = [
                                week.weekNumber || 1,
                                day.dayNumber || 1,
                                ex.block || 1,
                                `"${(ex.name || '').replace(/"/g, '""')}"`,
                                set.setNumber || 1,
                                `"${(set.reps || '').toString().replace(/"/g, '""')}"`,
                                weightStr,
                                weightStr,
                                `"${(set.rpe || '').toString().replace(/"/g, '""')}"`,
                                `"${(ex.rest || '').replace(/"/g, '""')}"`,
                                `"${(ex.notes || '').replace(/"/g, '""')}"`
                            ];
                            csvContent += row.join(",") + "\n";
                        });
                    });
                });
            });
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `workout_plan_${currentYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Errore durante l'esportazione CSV:", err);
        alert("Errore durante l'esportazione del file CSV.");
    }
}

/**
 * Legge un file CSV gestendo automaticamente la codifica (UTF-8 / UTF-16 di Numbers)
 */
export function readCsvFile(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const buffer = e.target.result;
        let text = '';
        
        try {
            const decoderUtf8 = new TextDecoder('utf-8', { fatal: true });
            text = decoderUtf8.decode(buffer);
        } catch (err) {
            const decoderUtf16 = new TextDecoder('utf-16le');
            text = decoderUtf16.decode(buffer);
        }
        
        callback(text);
    };
    reader.readAsArrayBuffer(file);
}