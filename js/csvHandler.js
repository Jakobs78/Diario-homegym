// ==========================================
// 1. IMPORT & DIPENDENZE
// ==========================================
import { state } from './state.js';
import { saveAndSync } from './storage.js';

// ==========================================
// 2. UTILITY DI PARSING E RICONOSCIMENTO COLONNE
// ==========================================
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

// ==========================================
// 3. HELPER DI VALIDAZIONE & RAGGRUPPAMENTO
// ==========================================
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
 * Assegna i tag visivi per Triset, Superset e Dropset
 */
export function applyTrisetDropsetGrouping(daysArray) {
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
            const isJumpset = combinedText.includes('jumpset') || combinedText.includes('jump-set') || combinedText.includes('jump set') || combinedText.includes('jumpserie') || combinedText.includes('jump serie') || combinedText.includes('jump-serie');

            if (isDropset) {
                ex.isDropset = true;
                const baseBlock = String(ex.block || (i + 1)).replace(/[A-Za-z]/g, '');
                ex.block = baseBlock || String(i + 1);
                i++;
            } else if (isTriset || isSuperset || isJumpset) {
                let groupSize = isTriset ? 3 : 2;
                const baseBlock = String(ex.block || (i + 1)).replace(/[A-Za-z]/g, '');
                const letters = ['A', 'B', 'C', 'D', 'E'];
                const groupType = isTriset ? 'triset' : (isSuperset ? 'superset' : 'jumpset');
                
                for (let j = 0; j < groupSize && (i + j) < exercises.length; j++) {
                    const targetEx = exercises[i + j];
                    targetEx.block = `${baseBlock || (i + 1)}${letters[j] || (j + 1)}`;
                    targetEx.groupType = groupType;
                    targetEx.groupBase = baseBlock || String(i + 1);
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

// ==========================================
// 4. IMPORTAZIONE PIANO DI ALLENAMENTO
// ==========================================
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
                loggedSets: structuredClone(sets)
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

// ==========================================
// 5. IMPORTAZIONE STORICO & ESPORTAZIONE CSV
// ==========================================
export function importProgressCSV(csvText) {
    try {
        const rows = parseCSV(csvText);
        if (!rows || rows.length < 2) {
            throw new Error("Il file CSV dei progressi è vuoto o non valido.");
        }

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        // Mappatura flessibile delle colonne per supportare sia il vecchio formato che il nuovo backup completo
        const idxMeso = findColumnIndex(headers, ['mesociclo', 'meso']);
        const idxWeek = findColumnIndex(headers, ['settimana', 'week']);
        const idxDay = findColumnIndex(headers, ['giorno', 'day']);
        const idxDate = findColumnIndex(headers, ['data', 'date']);
        const idxBlock = findColumnIndex(headers, ['blocco', 'block']);
        const idxEx = findColumnIndex(headers, ['esercizio', 'exercise', 'name']);
        const idxSet = findColumnIndex(headers, ['set', 'serie']);
        const idxWeight = findColumnIndex(headers, ['kg_reali', 'kg', 'peso', 'weight']);
        const idxReps = findColumnIndex(headers, ['reps_reali', 'rep', 'ripetizioni']);
        const idxCompleted = findColumnIndex(headers, ['completato', 'completed']);
        const idxRpe = findColumnIndex(headers, ['rpe', 'sforzo']);
        const idxNotes = findColumnIndex(headers, ['note_esercizio', 'note']);

        if (!state.workoutData.history) state.workoutData.history = {};
        if (!state.workoutData.history.years) state.workoutData.history.years = {};

        const currentYear = state.currentYear || new Date().getFullYear();
        if (!state.workoutData.history.years[currentYear]) {
            state.workoutData.history.years[currentYear] = { mesocycles: [] };
        }

        const mesocyclesList = state.workoutData.history.years[currentYear].mesocycles;
        const importedMesosMap = {};

        dataRows.forEach(row => {
            if (row.length < 2) return;

            const mesoName = idxMeso !== -1 && row[idxMeso] ? row[idxMeso].trim() : "Storico Importato";
            const weekNum = idxWeek !== -1 && row[idxWeek] ? parseInt(row[idxWeek]) || 1 : 1;
            const dayNum = idxDay !== -1 && row[idxDay] ? parseInt(row[idxDay]) || 1 : 1;
            const dateVal = idxDate !== -1 && row[idxDate] ? row[idxDate].trim() : new Date().toISOString().split('T')[0];
            const blockNum = idxBlock !== -1 && row[idxBlock] ? row[idxBlock].trim() : "1";
            const exNameVal = idxEx !== -1 && row[idxEx] ? row[idxEx].trim() : 'Esercizio';
            const setNum = idxSet !== -1 && row[idxSet] ? parseInt(row[idxSet]) || 1 : 1;
            
            const rawWeight = idxWeight !== -1 ? row[idxWeight] : '';
            const normalizedWeight = String(rawWeight || '').replace(',', '.').replace(/[^0-9.]/g, '');
            const weightVal = normalizedWeight !== '' ? parseFloat(normalizedWeight) : '';

            const rawReps = idxReps !== -1 ? row[idxReps] : '';
            const repsVal = rawReps !== '' ? rawReps.trim() : '';

            const completedVal = idxCompleted !== -1 && row[idxCompleted] ? row[idxCompleted].trim().toUpperCase() : 'SI';
            const isLocked = completedVal === 'SI' || completedVal === 'TRUE' || completedVal === '1';

            const rpeVal = idxRpe !== -1 && row[idxRpe] ? row[idxRpe].trim() : '';
            const notesVal = idxNotes !== -1 && row[idxNotes] ? row[idxNotes].trim() : '';

            // Organizzazione gerarchica: Mesociclo -> Settimana -> Giorno -> Esercizio -> Serie
            if (!importedMesosMap[mesoName]) {
                let existingMeso = mesocyclesList.find(m => m.name === mesoName);
                if (!existingMeso) {
                    existingMeso = {
                        id: `meso_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        name: mesoName,
                        importedAt: new Date().toISOString(),
                        weeks: []
                    };
                    mesocyclesList.push(existingMeso);
                }
                importedMesosMap[mesoName] = existingMeso;
            }

            const currentMesoObj = importedMesosMap[mesoName];

            let weekObj = currentMesoObj.weeks.find(w => w.weekNumber === weekNum);
            if (!weekObj) {
                weekObj = { weekNumber: weekNum, coachNotes: '', days: [] };
                currentMesoObj.weeks.push(weekObj);
            }

            let dayObj = weekObj.days.find(d => d.dayNumber === dayNum || d.date === dateVal);
            if (!dayObj) {
                dayObj = {
                    dayNumber: dayNum,
                    dayName: `Giorno ${dayNum}`,
                    date: dateVal,
                    exercises: []
                };
                weekObj.days.push(dayObj);
            }

            let exObj = dayObj.exercises.find(e => e.name === exNameVal);
            if (!exObj) {
                exObj = {
                    block: blockNum,
                    name: exNameVal,
                    notes: notesVal,
                    loggedSets: [],
                    sets: []
                };
                dayObj.exercises.push(exObj);
            }

            // Inserisce o aggiorna la serie effettiva
            exObj.loggedSets.push({
                setNumber: setNum,
                weight: weightVal,
                reps: repsVal,
                rpe: rpeVal,
                isLocked: isLocked
            });
        });

        // Sincronizza lo stato aggiornato su localStorage e di conseguenza su Supabase
        saveAndSync(state.workoutData);

        return {
            success: true,
            message: "Storico completo importato e sincronizzato con successo su Supabase!"
        };
    } catch (err) {
        console.error("Errore nell'importazione del CSV di progresso:", err);
        return { success: false, error: err.message };
    }
}

export function exportToCSV(workoutData) {
    try {
        const currentYear = state.currentYear || new Date().getFullYear();
        const mesocycles = workoutData?.history?.years?.[currentYear]?.mesocycles || [];

        if (mesocycles.length === 0) {
            alert("Nessun dato di mesociclo disponibile per l'esportazione CSV.");
            return;
        }

        // Intestazione arricchita con i campi reali compilati dall'utente
        let csvContent = "Mesociclo,Settimana,Giorno,Data,Blocco,Esercizio,Serie,Kg_Reali,Reps_Reali,Completato,Rpe,Recupero,Note_Esercizio\n";

        mesocycles.forEach(meso => {
            meso.weeks?.forEach(week => {
                week.days?.forEach(day => {
                    day.exercises?.forEach(ex => {
                        // Dà priorità a loggedSets (i dati reali inseriti dall'utente), con fallback su sets
                        const setsToExport = ex.loggedSets && ex.loggedSets.length > 0 ? ex.loggedSets : (ex.sets || []);
                        
                        setsToExport.forEach(set => {
                            const weightVal = set.weight !== undefined && set.weight !== '' ? set.weight : '';
                            const repsVal = set.reps !== undefined && set.reps !== '' ? set.reps : '';
                            const isCompleted = set.isLocked ? 'SI' : 'NO';

                            const row = [
                                `"${(meso.name || '').replace(/"/g, '""')}"`,
                                week.weekNumber || 1,
                                day.dayNumber || 1,
                                `"${(day.date || '').replace(/"/g, '""')}"`,
                                ex.block || 1,
                                `"${(ex.name || '').replace(/"/g, '""')}"`,
                                set.setNumber || 1,
                                `"${weightVal}"`,
                                `"${repsVal}"`,
                                isCompleted,
                                `"${(set.rpe || ex.rpe || '').toString().replace(/"/g, '""')}"`,
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
        link.setAttribute('download', `storico_completo_workout_${currentYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Errore durante l'esportazione dello storico CSV:", err);
        alert("Errore durante l'esportazione del file CSV.");
    }
}

// ==========================================
// 6. LETTURA FILE CON GESTIONE ENCODING
// ==========================================
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