// main.js
import { CONFIG } from './config.js';
import { state } from './state.js';
import { getFromLocalStorage, saveAndSync, clearLocalData } from './storage.js';
import { pullDataFromSupabase } from './sync.js';
import { DOM, renderWorkoutList, showNotification } from './ui.js';
import { render1RMChart, renderVolumeChart } from './charts.js';
import { startTimer, stopTimer } from './timer.js';
import { generatePDFReport } from './pdfExport.js';
import { exportToCSV } from './csvHandler.js';

async function initApp() {
    console.log(`Avvio Advanced Workout Tracker v${CONFIG.APP_VERSION}`);
    
    // 1. Autenticazione / Impostazione Utente (adatta alla tua logica di login)
    state.currentUser = CONFIG.WHITELIST[0]; // Usa la prima email per ora
    
    // 2. Caricamento Dati
    let data = getFromLocalStorage();
    
    // Prova a sincronizzare dal cloud se c'è connessione
    if (state.currentUser && navigator.onLine) {
        const remoteData = await pullDataFromSupabase(state.currentUser);
        if (remoteData && remoteData.length > 0) {
            data = remoteData;
            saveAndSync(data); // Allinea il localStorage ai dati freschi del database
        }
    }
    state.workoutData = data;
    
    // 3. Rendering Iniziale
    renderWorkoutList();
    
    // Se hai canvas per i grafici nell'HTML, puoi inizializzarli così:
    // const labels = state.workoutData.map(w => w.date);
    // const weights = state.workoutData.map(w => w.weight);
    // render1RMChart('chart-1rm', labels, weights);
    
    // 4. Collega gli Event Listener
    setupEventListeners();
}

function setupEventListeners() {
    // Esportazioni e Reset
    document.getElementById('export-pdf-btn')?.addEventListener('click', generatePDFReport);
    document.getElementById('export-csv-btn')?.addEventListener('click', () => exportToCSV(state.workoutData));
    document.getElementById('clear-data-btn')?.addEventListener('click', clearLocalData);
    
    // Timer di recupero (Esempio: avvia 90 secondi)
    document.getElementById('start-timer-btn')?.addEventListener('click', () => {
        startTimer(90, DOM.timerDisplay);
    });
    
    document.getElementById('stop-timer-btn')?.addEventListener('click', stopTimer);
    
    // Inserimento nuovo allenamento dal Form
    DOM.workoutForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Raccogli i valori dai campi input (adatta gli ID ai tuoi)
        const newEntry = {
            date: new Date().toISOString().split('T')[0],
            exercise: document.getElementById('input-exercise')?.value || 'Esercizio',
            sets: parseInt(document.getElementById('input-sets')?.value || 0),
            reps: parseInt(document.getElementById('input-reps')?.value || 0),
            weight: parseFloat(document.getElementById('input-weight')?.value || 0)
        };
        
        // Aggiorna lo stato, salva e renderizza
        state.workoutData.push(newEntry);
        saveAndSync(state.workoutData);
        renderWorkoutList();
        
        showNotification('Allenamento salvato con successo!');
        DOM.workoutForm.reset();
    });
}

// Avvia l'applicazione non appena il DOM è completamente caricato
document.addEventListener('DOMContentLoaded', initApp);