// mycoatch/index.js
import { coachState } from './state.js';
import { generateSmartMesocycle } from './engine.js';
import { analyzeTrainingHistory } from './historyInsights.js';
import { planAdaptiveDecisions } from './adaptiveDecisions.js';
import { compareMesocyclePlans } from './mesocycleComparison.js';
import { analyzeUserHistory, evaluateRealTimePerformance, calculateE1RM } from './autoregulation.js';
import { EXERCISE_DATABASE } from './exercisesDB.js';

export const MyCoatch = {
    /**
     * Analizza lo storico reale e genera il nuovo mesociclo in formato JSON pronto per la webapp.
     */
    generateNextFromHistory(userHistory, goalSettings = {}) {
        // Analisi longitudinale: tutti gli anni e i mesocicli, soltanto serie confermate.
        const report = analyzeTrainingHistory(userHistory);
        const decisions = planAdaptiveDecisions(report);
        const analysis = { ...report, decisions };

        if (Object.keys(goalSettings).length > 0) {
            coachState.updateConfig(goalSettings);
        }
        const config = coachState.getConfig();

        // I dati storici non vengono modificati: proponiamo un mesociclo separato.
        const newMesocycle = generateSmartMesocycle(config, analysis, report.lastMesocycle);
        const comparison = compareMesocyclePlans(report.lastMesocycle, newMesocycle, analysis);
        newMesocycle.coachReport = {
            inspectedYears: report.inspectedYears,
            inspectedMesocycles: report.inspectedMesocycles,
            sessionsAnalyzed: report.sessionsAnalyzed,
            exerciseSignals: Object.values(report.byExercise).map(item => ({
                name: item.name, status: item.status,
                e1rmChangePct: item.e1rmChangePct,
                lastKg: item.lastKg, avgRpe: item.avgRpe,
                exposuresCount: item.exposuresCount
            })),
            muscleSignals: report.byMuscle,
            decisions,
            comparison,
            notice: 'Stima di prestazione e stimolo allenante, non misura diretta della crescita muscolare.'
        };
        coachState.setActiveMesocycle(newMesocycle);

        return newMesocycle;
    },

    /**
     * Valutazione in tempo reale dopo il completamento di una singola serie in palestra.
     */
    evaluateSet(exerciseLog, dailyReadiness) {
        return evaluateRealTimePerformance(exerciseLog, dailyReadiness);
    },

       /**
     * Valuta l'andamento di un singolo esercizio calcolando l'e1RM e la varianza RPE.
     */
        evaluateProgress(exerciseHistory) {
            if (!Array.isArray(exerciseHistory)) return null;
            // analyzeUserHistory consuma direttamente loggedSets confermati.
            return analyzeUserHistory(exerciseHistory);
        },


    /**
     * Calcola l'1RM stimato per qualsiasi serie.
     */
    getE1RM(weight, reps, rpe) {
        return calculateE1RM(weight, reps, rpe);
    },

    /**
     * Restituisce il mesociclo attivo pronto da salvare in Supabase/localStorage.
     */
    getActiveMesocycleJSON() {
        return coachState.getActiveMesocycle();
    },

    /**
     * Libreria esercizi.
     */
    getExerciseDatabase() {
        return EXERCISE_DATABASE;
    },

    /**
     * Esporta il mesociclo attivo nel formato CSV standard unificato della webapp:
     * Genera un'unica riga per esercizio con il numero totale dei set specificato nella colonna 'Set'.
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
                    const kgMinStr = ex.kgMin ?? "";
                    const kgMaxStr = ex.kgMax ?? "";
                    const rpeStr = ex.rpe || "@8";
                    const topsetVal = (ex.topset || "").replace(/"/g, '""');

                    // Conteggio totale dei set (es. 3, 4) da inserire nella colonna 'Set'
                    const totalSets = ex.setsCount || (Array.isArray(ex.sets) ? ex.sets.length : 3);
                    const repsForExercise = ex.reps || "8";
                    const recuperoStr = ex.restTime || "120s";

                    // ESTRAZIONE E CODIFICA DELLE TECNICHE DI INTENSITÀ NEL CSV
                    // Se l'ultimo set dell'esercizio contiene una tecnica di intensità, iniettiamo il tag a inizio nota
                    let noteFinalStr = ex.notes || "";
                    const lastSetObj = Array.isArray(ex.sets) ? ex.sets[ex.sets.length - 1] : null;

                    if (lastSetObj && lastSetObj.intensityTechnique) {
                        const techniqueTag = `[${lastSetObj.intensityTechnique}]`;
                        if (!noteFinalStr.includes(techniqueTag)) {
                            noteFinalStr = `${techniqueTag} ${noteFinalStr}`;
                        }
                    }

                    const noteStr = noteFinalStr.replace(/"/g, '""');

                    // Una riga unica per esercizio conforme con il parser della webapp
                    csvRows.push(`${week.weekNumber};${dayNum};${blockNum};${ex.name};${totalSets};${repsForExercise};${kgMinStr};${kgMaxStr};${rpeStr};${recuperoStr};"${noteStr}";"${topsetVal}"`);
                });
            });
        });

        return csvRows.join("\n");
    }
};

/**
 * Utility per scaricare il file CSV generato da MyCoatch.
 */
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
