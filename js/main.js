// main.js
import { CONFIG } from './config.js';
import { state } from './state.js';
import { getFromLocalStorage, saveAndSync, clearLocalData } from './storage.js';
import { pullDataFromSupabase } from './sync.js';
import { DOM, renderWorkoutList, showNotification } from './ui.js';
import { startTimer, stopTimer } from './timer.js';
import { generatePDFReport } from './pdfExport.js';
import { exportToCSV } from './csvHandler.js';

async function initApp() {
    console.log(`Avvio Advanced Workout Tracker v${CONFIG.APP_VERSION}`);
    
    state.currentUser = CONFIG.WHITELIST[0];
    
    let data = getFromLocalStorage();
    
    if (state.currentUser && navigator.onLine) {
        const remoteData = await pullDataFromSupabase(state.currentUser);
        if (remoteData && remoteData.history && Object.keys(remoteData.history.years).length > 0) {
            data = remoteData;
            saveAndSync(data);
        }
    }
    state.workoutData = data;
    
    renderWorkoutList();
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('export-pdf-btn')?.addEventListener('click', () => generatePDFReport(state.workoutData));
    document.getElementById('export-csv-btn')?.addEventListener('click', () => exportToCSV(state.workoutData));
    document.getElementById('clear-data-btn')?.addEventListener('click', clearLocalData);
    
    document.getElementById('start-timer-btn')?.addEventListener('click', () => {
        startTimer(90, DOM.timerDisplay);
    });
    
    document.getElementById('stop-timer-btn')?.addEventListener('click', stopTimer);
    
    DOM.workoutForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const currentYear = new Date().getFullYear().toString();
        
        // Assicura che l'anno esista nella struttura
        if (!state.workoutData.history.years[currentYear]) {
            state.workoutData.history.years[currentYear] = { mesocycles: [] };
        }
        
        let mesocycles = state.workoutData.history.years[currentYear].mesocycles;
        
        // Se non esiste ancora un mesociclo, ne creiamo uno di default per iniziare a testare
        if (mesocycles.length === 0) {
            mesocycles.push({
                id: `meso_${currentYear}_default`,
                name: "Mesociclo Iniziale",
                startDate: new Date().toISOString().split('T')[0],
                endDate: "",
                status: "active",
                weeks: [
                    {
                        weekNumber: 1,
                        days: [
                            {
                                dayId: "day_default",
                                dayName: "Sessione Odierna",
                                date: new Date().toISOString().split('T')[0],
                                completed: false,
                                exercises: []
                            }
                        ]
                    }
                ]
            });
        }
        
        // Prendi l'ultimo mesociclo attivo e l'ultima settimana/giorno per comodità di test
        const activeMeso = mesocycles[mesocycles.length - 1];
        const activeWeek = activeMeso.weeks[activeMeso.weeks.length - 1];
        const activeDay = activeWeek.days[activeWeek.days.length - 1];
        
        const newExercise = {
            signature: `ex_${Date.now()}`,
            name: document.getElementById('input-exercise')?.value || 'Esercizio',
            targetSets: 3,
            loggedSets: [
                {
                    set: 1,
                    reps: parseInt(document.getElementById('input-reps')?.value || 0),
                    weight: parseFloat(document.getElementById('input-weight')?.value || 0),
                    rpe: 8
                }
            ]
        };
        
        activeDay.exercises.push(newExercise);
        
        saveAndSync(state.workoutData);
        renderWorkoutList();
        
        showNotification('Allenamento salvato con successo!');
        DOM.workoutForm.reset();
    });
}

document.addEventListener('DOMContentLoaded', initApp);