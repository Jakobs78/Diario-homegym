// csvHandler.js
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList, showNotification } from './ui.js';

/**
 * Parser robusto per CSV con separatore ';' e gestione dei testi tra virgolette su più righe
 */
function parseCSV(text) {
    const lines = [];
    let row = [''];
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];
        
        if (c === '"') {
            if (inQuotes && next === '"') {
                row[row.length - 1] += '"';
                i++; // Salta la virgoletta scalata
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ';' && !inQuotes) {
            row.push('');
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') i++;
            if (row.length > 1 || row[0] !== '') {
                lines.push(row);
            }
            row = [''];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== '') {
        lines.push(row);
    }
    return lines;
}

/**
 * Esporta lo storico dati dell'atleta in formato CSV
 */
export function exportToCSV(workoutData) {
    if (!workoutData || !workoutData.history) {
        showNotification("Nessun dato da esportare.", "error");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Anno,Mesociclo,Settimana,Giorno,Esercizio,Reps,Weight,RPE\n";
    const years = workoutData.history.years || {};

    Object.keys(years).forEach(year => {
        (years[year].mesocycles || []).forEach(meso => {
            (meso.weeks || []).forEach(week => {
                (week.days || []).forEach(day => {
                    (day.exercises || []).forEach(ex => {
                        (ex.loggedSets || []).forEach(set => {
                            csvContent += `${year},"${meso.name}",${week.weekNumber},"${day.dayName}","${ex.name}",${set.reps},${set.weight},${set.rpe || ''}\n`;
                        });
                    });
                });
            });
        });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `backup_homegym_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Importa la scheda CSV del mesociclo e la inserisce nello stato dell'applicazione
 */
export function importWorkoutPlan(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const rows = parseCSV(text);

        if (rows.length < 2) {
            showNotification("Il file CSV appare vuoto o non valido.", "error");
            return;
        }

        // Verifica la presenza delle intestazioni chiave
        const header = rows[0].map(h => h.trim().toLowerCase());
        if (!header.includes('settimana') || !header.includes('esercizio')) {
            showNotification("Formato CSV non riconosciuto. Intestazioni mancanti.", "error");
            return;
        }

        const currentYear = new Date().getFullYear().toString();
        if (!state.workoutData.history) state.workoutData.history = { years: {} };
        if (!state.workoutData.history.years) state.workoutData.history.years = {};
        if (!state.workoutData.history.years[currentYear]) {
            state.workoutData.history.years[currentYear] = { mesocycles: [] };
        }

        const mesocycles = state.workoutData.history.years[currentYear].mesocycles;

        // Numerazione progressiva automatica
        const nextMesoNumber = mesocycles.length + 1;

        // Struttura del nuovo mesociclo importato
        const newMesocycle = {
            id: `meso_${Date.now()}`,
            number: nextMesoNumber,
            name: `Mesociclo ${nextMesoNumber}`,
            startDate: new Date().toISOString().split('T')[0],
            endDate: "",
            status: "active",
            weeks: []
        };

        const weekMap = new Map();

        // Cicla su tutte le righe del CSV (escludendo l'intestazione)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 4) continue;

            const weekNum = parseInt(row[0]?.trim()) || 1;
            const dayNum = parseInt(row[1]?.trim()) || 1;
            const exerciseName = row[3]?.trim() || 'Esercizio';
            const rawSets = row[4]?.trim() || '1';
            const rawReps = row[5]?.trim() || '-';
            const kgMin = row[6]?.trim() || '-';
            const kgMax = row[7]?.trim() || '-';
            const rpe = row[8]?.trim() || '-';
            const rest = row[9]?.trim() || '-';
            const notes = row[10]?.trim() || '';
            const topset = row[11]?.trim() || '-'; // Se presente nel CSV

            // 1. Gestione Settimana
            if (!weekMap.has(weekNum)) {
                weekMap.set(weekNum, new Map());
            }
            const dayMap = weekMap.get(weekNum);

            // 2. Gestione Giorno
            if (!dayMap.has(dayNum)) {
                dayMap.set(dayNum, {
                    dayId: `day_${weekNum}_${dayNum}`,
                    dayName: `Giorno ${dayNum}`,
                    date: new Date().toISOString().split('T')[0],
                    completed: false,
                    exercises: []
                });
            }
            const dayObj = dayMap.get(dayNum);

            // Estrazione del numero di set prescritti
            const numSets = parseInt(rawSets) || 1;

            // Inizializza i set da compilare durante l'allenamento COMPLETAMENTE VUOTI
            const loggedSets = [];
            for (let s = 1; s <= numSets; s++) {
                loggedSets.push({
                    set: s,
                    reps: '',
                    weight: '',
                    rpe: '',
                    isLocked: false
                });
            }

            // 3. Aggiunta dell'Esercizio con TUTTI i parametri del target e i log vuoti
            dayObj.exercises.push({
                signature: `ex_${Date.now()}_${i}`,
                name: exerciseName,
                kgMin: kgMin,
                kgMax: kgMax,
                sets: rawSets,
                reps: rawReps,
                rpe: rpe,
                restTime: rest,
                topset: topset,
                notes: (notes !== '0' && notes !== '-') ? notes : '',
                userNotes: '',
                isExcluded: false,
                loggedSets: loggedSets
            });
        }

        // Conversione delle mappe nella gerarchia dell'app
        weekMap.forEach((daysMap, weekNumber) => {
            const daysArray = Array.from(daysMap.values());
            newMesocycle.weeks.push({
                weekNumber: weekNumber,
                days: daysArray
            });
        });

        // Inserisce il nuovo mesociclo in cima e aggiorna lo stato
        mesocycles.unshift(newMesocycle);
        state.activeMesocycleIndex = 0;
        state.activeWeek = 1;

        saveAndSync(state.workoutData);
        renderWorkoutList();

        showNotification(`Mesociclo ${nextMesoNumber} importato e salvato con successo!`);
    };

    reader.readAsText(file);
}

/**
 * Importa uno storico completo da file CSV
 */
export function importProgressCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        showNotification("Storico importato con successo!");
        renderWorkoutList();
    };
    reader.readAsText(file);
}