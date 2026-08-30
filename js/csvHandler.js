// js/csvHandler.js
import { state } from './state.js';
import { saveAndSync } from './storage.js';

/**
 * Parser CSV universale (gestisce virgole, punti e virgola e virgolette)
 */
export function parseCSV(text) {
    const lines = text.split(/\r\n|\n/);
    const result = [];
    
    // Rileva automaticamente il separatore (, o ;)
    const sampleLine = lines.find(l => l.trim().length > 0) || '';
    const delimiter = sampleLine.includes(';') ? ';' : ',';

    lines.forEach(line => {
        if (!line.trim()) return;
        const row = [];
        let inQuotes = false;
        let currentField = '';

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
                row.push(currentField.trim().replace(/^"|"$/g, ''));
                currentField = '';
            } else {
                currentField += char;
            }
        }
        row.push(currentField.trim().replace(/^"|"$/g, ''));
        result.push(row);
    });

    return result;
}

/**
 * Importa il piano di allenamento da CSV strutturato (Settimana, Giorno, Blocco, Esercizio, Set, Reps, ecc.)
 */
export function importWorkoutPlan(csvText) {
    try {
        const rows = parseCSV(csvText);
        if (rows.length < 2) throw new Error("Il file CSV è vuoto o non contiene intestazioni valide.");

        const headers = rows[0].map(h => h.toLowerCase());
        const dataRows = rows.slice(1);

        const currentYear = state.currentYear || new Date().getFullYear();
        if (!state.workoutData.history) state.workoutData.history = { years: {} };
        if (!state.workoutData.history.years[currentYear]) {
            state.workoutData.history.years[currentYear] = { mesocycles: [] };
        }

        const currentMesos = state.workoutData.history.years[currentYear].mesocycles;
        
        // Assegnazione rigorosamente sequenziale in base all'ordine di caricamento
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
                for (const name of colNames) {
                    const idx = headers.findIndex(h => h.includes(name));
                    if (idx !== -1 && row[idx] !== undefined) return row[idx].trim();
                }
                return '';
            };

            const weekNum = parseInt(getVal(['settimana', 'week'])) || 1;
            const dayNum = parseInt(getVal(['giorno', 'day'])) || 1;
            const blockNum = parseInt(getVal(['blocco', 'block'])) || 1;
            const exName = getVal(['esercizio', 'exercise', 'name']) || 'Esercizio';
            const setsCount = parseInt(getVal(['set', 'serie'])) || 3;
            const repsVal = getVal(['reps', 'ripetizioni']) || '8';
            const kgMin = getVal(['kgmin', 'min']);
            const kgMax = getVal(['kgmax', 'max']);
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

            // Costruisce i set teorici previsti dal piano
            const sets = [];
            for (let s = 1; s <= setsCount; s++) {
                sets.push({
                    setNumber: s,
                    weight: topset || kgMax || kgMin || 0,
                    reps: repsVal,
                    rpe: rpeVal,
                    isLocked: false
                });
            }

            weeksMap[weekNum].daysMap[dayNum].exercises.push({
                block: blockNum,
                name: exName,
                targetRpe: rpeVal,
                rest: restVal,
                notes: notesVal,
                sets: sets,
                loggedSets: JSON.parse(JSON.stringify(sets))
            });
        });

        // Converte la mappa in strutture array standard per lo stato
        Object.values(weeksMap).forEach(w => {
            const daysArray = Object.values(w.daysMap);
            newMesocycle.weeks.push({
                weekNumber: w.weekNumber,
                coachNotes: w.coachNotes,
                days: daysArray
            });
        });

        // Aggiunge il nuovo mesociclo in coda all'array
        currentMesos.push(newMesocycle);

        // Imposta l'indice attivo sul mesociclo appena caricato
        state.activeMesocycleIndex = currentMesos.length - 1;
        state.activeWeek = 1;
        state.activeDay = 1;

        saveAndSync(state.workoutData);
        return { 
            success: true, 
            message: `Mesociclo ${nextMesoNumber} importato con successo!` 
        };
    } catch (err) {
        console.error("Errore importazione piano CSV:", err);
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

        const idxDate = headers.findIndex(h => h.includes('data') || h.includes('date'));
        const idxEx = headers.findIndex(h => h.includes('esercizio') || h.includes('exercise') || h.includes('name'));
        const idxSet = headers.findIndex(h => h.includes('set') || h.includes('serie'));
        const idxWeight = headers.findIndex(h => h.includes('kg') || h.includes('peso') || h.includes('weight'));
        const idxReps = headers.findIndex(h => h.includes('rep') || h.includes('ripetizioni'));
        const idxRpe = headers.findIndex(h => h.includes('rpe') || h.includes('sforzo'));

        if (!state.workoutData.history) {
            state.workoutData.history = { years: {} };
        }

        const currentYear = state.currentYear || new Date().getFullYear();
        if (!state.workoutData.history.years) {
            state.workoutData.history.years = {};
        }
        if (!state.workoutData.history.years[currentYear]) {
            state.workoutData.history.years[currentYear] = { mesocycles: [] };
        }

        // Trova o crea un mesociclo dedicato allo storico importato
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
            const weightVal = parseFloat(String(idxWeight !== -1 ? row[idxWeight] : row[3]).replace(/[^0-9.]/g, '')) || 0;
            const repsVal = parseFloat(String(idxReps !== -1 ? row[idxReps] : row[4]).replace(/[^0-9.]/g, '')) || 0;
            const rpeVal = idxRpe !== -1 ? row[idxRpe] : row[5] || '';
            const setNum = idxSet !== -1 ? parseInt(row[idxSet]) : 1;

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
            message: `Storico importato con successo: aggiunti ${Object.keys(recordsByDateAndEx).length} record di allenamento utilizzabili nei grafici 1RM.`
        };
    } catch (err) {
        console.error("Errore nell'importazione del CSV di progresso:", err);
        return { success: false, error: err.message };
    }
}
/**
 * Esporta lo stato attuale o lo storico dei mesocicli in un formato CSV
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
                            const row = [
                                week.weekNumber || 1,
                                day.dayNumber || 1,
                                ex.block || 1,
                                `"${(ex.name || '').replace(/"/g, '""')}"`,
                                set.setNumber || 1,
                                `"${(set.reps || '').toString().replace(/"/g, '""')}"`,
                                set.weight || 0,
                                set.weight || 0,
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

        // Crea un blob e avvia il download automatico del file CSV
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