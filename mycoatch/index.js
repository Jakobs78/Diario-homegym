// mycoatch/index.js
import { coachState } from './state.js';
import { generateSmartMesocycle, analyzePreviousMesocycle } from './engine.js';
import { analyzeUserHistory } from './autoregulation.js';
import { EXERCISE_DATABASE } from './exercisesDB.js';

export const MyCoatch = {
    /**
     * Punti di contatto con la webapp: Analizza lo storico reale dei dati salvati 
     * e genera il nuovo mesociclo ottimizzato sotto forma di oggetto strutturato.
     */
    generateNextFromHistory(userHistory, goalSettings) {
        // Estrae in sicurezza lo storico salvato dalla webapp (localStorage / Supabase)
        const historyObj = userHistory?.history || userHistory || {};
        const yearsObj = historyObj.years || {};
        const years = Object.keys(yearsObj);
        
        const currentYear = years[years.length - 1] || new Date().getFullYear();
        const mesocycles = yearsObj[currentYear]?.mesocycles || [];
        const lastMesocycle = mesocycles[mesocycles.length - 1] || null;

        // Analisi di stalli e performance reali passate
        const analysis = analyzePreviousMesocycle(lastMesocycle);
        
        // Aggiorna la configurazione del coach (età, frequenza, minuti max, focus)
        if (goalSettings && Object.keys(goalSettings).length > 0) {
            coachState.updateConfig(goalSettings);
        }
        const config = coachState.getConfig();
        
        // Genera il blocco intelligente passando l'analisi e lo storico dei carichi
        const newMesocycle = generateSmartMesocycle(config, analysis, userHistory);
        coachState.setActiveMesocycle(newMesocycle);
        
        return newMesocycle;
    },

    /**
     * Valuta lo storico dell'utente per un singolo esercizio.
     */
    evaluateProgress(exerciseHistory) {
        const config = coachState.getConfig();
        return analyzeUserHistory(exerciseHistory, config);
    },

    /**
     * Restituisce la libreria degli esercizi del coach.
     */
    getExerciseDatabase() {
        return EXERCISE_DATABASE;
    },

   /**
     * Esporta il mesociclo attivo nel formato CSV standard unificato 
     * compatibile al 100% con l'importatore della webapp (Settimana, Giorno, Blocco, Esercizio, Set, Reps, KgMin, KgMax, RPE, Recupero, Note, Topset).
     */
    exportAsCSV() {
        const meso = coachState.getActiveMesocycle();
        if (!meso) throw new Error("Nessun mesociclo attivo generato da MyCoatch.");

        let csvRows = ["Settimana;Giorno;Blocco;Esercizio;Set;Reps;KgMin;KgMax;RPE;Recupero;Note;Topset"];

        meso.weeks.forEach(week => {
            week.days.forEach((day, dayIndex) => {
                const dayNum = day.dayNumber || (dayIndex + 1);
                
                day.exercises.forEach((ex, exIndex) => {
                    const blockNum = ex.block || (exIndex + 1);
                    const kgMinStr = ex.kgMin || "0";
                    const kgMaxStr = ex.kgMax || "0";
                    const rpeStr = ex.rpe || "@8";
                    const noteStr = (ex.notes || "").replace(/"/g, '""');
                    const topsetVal = ex.topset ? ex.topset : "";

                    // Recupera l'array dei set o crea una riga di fallback
                    const setsArray = Array.isArray(ex.sets) && ex.sets.length > 0 ? ex.sets : [{ setNumber: 1, targetReps: ex.reps }];

                    setsArray.forEach((setObj, sIdx) => {
                        const setNumberLabel = `Set ${setObj.setNumber || (sIdx + 1)}`;
                        const repsForThisSet = setObj.targetReps || ex.reps || "8";
                        
                        const currentKgMin = setObj.targetKg || kgMinStr;
                        const currentKgMax = setObj.targetKgMax || kgMaxStr;
                        const recuperoStr = setObj.restTime || "2min";

                        csvRows.push(`${week.weekNumber};${dayNum};${blockNum};${ex.name};${setNumberLabel};${repsForThisSet};${currentKgMin};${currentKgMax};${rpeStr};${recuperoStr};"${noteStr}";"${topsetVal}"`);
                    });
                });
            });
        }); // 👈 Chiusura corretta del ciclo meso.weeks.forEach

        return csvRows.join("\n"); // 👈 Ora restituisce correttamente le righe CSV
    }
}; 
 //Funzione di utilità per scaricare direttamente il CSV generato da MyCoatch 
 //pronto per essere importato nella webapp.
 
export function downloadMesocycleCSV() {
    try {
        const csvContent = MyCoatch.exportAsCSV();
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        
        const timestamp = new Date().toISOString().slice(0, 10);
        link.setAttribute("download", `mesociclo_mycoatch_${timestamp}.csv`);
        
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        return { success: true, message: "File CSV del mesociclo scaricato con successo." };
    } catch (error) {
        return { success: false, message: error.message };
    }
}