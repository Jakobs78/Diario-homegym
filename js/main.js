// main.js
import { CONFIG } from './config.js';
import { state } from './state.js';
import { getFromLocalStorage, saveAndSync, clearLocalData } from './storage.js';
import { pullDataFromSupabase } from './sync.js';
import { renderWorkoutList, showNotification } from './ui.js';
import { startTimer, stopTimer, adjustTimer } from './timer.js';
import { generatePDFReport } from './pdfExport.js';
import { exportToCSV, importWorkoutPlan, importProgressCSV } from './csvHandler.js';
import { initTheme, toggleTheme } from './theme.js';
import { renderStatsView, renderProgressView, renderMacroProgressView, renderManualView } from './dashboards.js';
import { setupAuthListeners, handleLogout, checkSession } from './auth.js';
import { changeMesocycle, resetCurrentMesocycle } from './mesocycle.js';

window.handleLogout = handleLogout;

// --- INIZIALIZZAZIONE APP ---
async function initApp() {
    console.log(`Avvio Advanced Workout Tracker v${CONFIG.APP_VERSION}`);
    
    initTheme();
    
    let data = getFromLocalStorage();
    state.workoutData = data;
    
    // Controlla se c'è un utente già autenticato
    const user = await checkSession();

    if (user && navigator.onLine) {
        const remoteData = await pullDataFromSupabase(user.email);
        if (remoteData && remoteData.history) {
            state.workoutData = remoteData;
            saveAndSync(remoteData);
        }
    }
    
    renderWorkoutList();
    setupEventListeners();
    setupAuthListeners();
}

// --- COLLEGAMENTO DI TUTTI GLI EVENTI DELL'HTML ---
function setupEventListeners() {
    // 1. Tema & Logout
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
    document.getElementById('user-info-bar')?.addEventListener('click', window.handleLogout);

    // 2. Cambio Mesociclo (- e +)
    document.getElementById('prev-meso-btn')?.addEventListener('click', () => changeMesocycle(-1));
    document.getElementById('next-meso-btn')?.addEventListener('click', () => changeMesocycle(1));
    
    // 3. Menu Analisi & Dashboard
    document.getElementById('analyticsMenu')?.addEventListener('change', (e) => {
        const viewId = e.target.value;
        
        // Nascondi il contenitore principale dei workout e tutte le day-view
        document.getElementById('workout-list-container').style.display = 'none';
        document.querySelectorAll('.day-view').forEach(el => el.style.display = 'none');

        // Mostra e renderizza la vista selezionata
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.style.display = 'block';
            if (viewId === 'stats') renderStatsView();
            if (viewId === 'progress') renderProgressView();
            if (viewId === 'macro-progress') renderMacroProgressView();
        }
    });

    // 4. Manuale d'uso
    document.getElementById('manual-btn')?.addEventListener('click', () => {
        document.getElementById('workout-list-container').style.display = 'none';
        document.querySelectorAll('.day-view').forEach(el => el.style.display = 'none');

        const manualView = document.getElementById('manual');
        if (manualView) {
            manualView.style.display = 'block';
            renderManualView();
        }
    });
    
    // 5. Utility, Import/Export & PDF
    document.getElementById('import-plan-input')?.addEventListener('change', (e) => importWorkoutPlan(e));
    document.getElementById('export-csv-btn')?.addEventListener('click', () => exportToCSV(state.workoutData));
    document.getElementById('import-history-input')?.addEventListener('change', (e) => importProgressCSV(e));
    document.getElementById('export-pdf-btn')?.addEventListener('click', () => generatePDFReport(state.workoutData));
    
    // 6. Zona Pericolosa (Reset)
    document.getElementById('reset-meso-btn')?.addEventListener('click', resetCurrentMesocycle);
    document.getElementById('clear-data-btn')?.addEventListener('click', clearLocalData);
    
    // 7. Controlli Timer
    document.getElementById('timer-minus-15')?.addEventListener('click', () => adjustTimer(-15));
    document.getElementById('timer-plus-30')?.addEventListener('click', () => adjustTimer(30));
    document.getElementById('stop-timer-btn')?.addEventListener('click', stopTimer);
    document.getElementById('timer-display')?.addEventListener('click', () => startTimer(90));
    
    // 8. Selettore Settimana
    document.getElementById('week-selector')?.addEventListener('change', (e) => {
        state.activeWeek = parseInt(e.target.value);
        renderWorkoutList();
    });
}

document.addEventListener('DOMContentLoaded', initApp);