// main.js
import { CONFIG } from './config.js';
import { state } from './state.js';
import { getFromLocalStorage, saveAndSync, clearLocalData } from './storage.js';
import { pullDataFromSupabase } from './sync.js';
import { renderWorkoutList } from './ui.js';
import { startTimer, stopTimer, adjustTimer } from './timer.js';
import { exportWorkoutPDF } from './pdfExport.js';
import { exportToCSV, importWorkoutPlan, importProgressCSV } from './csvHandler.js';
import { initTheme, toggleTheme } from './theme.js';
import { renderStatsView, renderProgressView, renderMacroProgressView } from './dashboards.js';
import { setupAuthListeners, handleLogout, checkSession } from './auth.js';
import { deleteCurrentMesocycle, changeMesocycle} from './mesocycle.js';
import { setupBottomSheet } from './helpers.js';
import { renderManualView } from './manual.js';

window.handleLogout = handleLogout;

// --- INIZIALIZZAZIONE APP ---
async function initApp() {
    console.log(`Avvio Advanced Workout Tracker v${CONFIG.APP_VERSION}`);
    
    initTheme();
    
    // Carica i dati locali immediati per un avvio istantaneo
    state.workoutData = getFromLocalStorage();
    
    // Controlla se c'è un utente autenticato
    const user = await checkSession();

    if (user && navigator.onLine) {
        const remoteData = await pullDataFromSupabase(user);
        if (remoteData && remoteData.history) {
            state.workoutData = remoteData;
            saveAndSync(remoteData);
        }
    }
    
    renderWorkoutList();
    setupEventListeners();
    setupAuthListeners();
}

// --- COLLEGAMENTO EVENTI GLOBALI ---
function setupEventListeners() {
    // 1. Tema & Logout
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
    document.getElementById('user-info-bar')?.addEventListener('click', window.handleLogout);

    // 2. Navigazione Mesociclo (Header fisso se presente)
    document.getElementById('prev-meso-btn')?.addEventListener('click', () => changeMesocycle(-1));
    document.getElementById('next-meso-btn')?.addEventListener('click', () => changeMesocycle(1));

    // 3. Menu Analisi & Dashboard (Bottom Sheet)
    setupBottomSheet({
    modalId: 'analytics-modal',
    openBtnId: 'open-analytics-btn',
    closeBtnId: 'close-analytics-btn',
    timeoutMs: 6000,
    onSelect: (viewId) => {
        const workoutContainer = document.getElementById('workout-list-container');
        if (workoutContainer) workoutContainer.style.display = 'none';
        document.querySelectorAll('.day-view').forEach(el => el.style.display = 'none');

        if (viewId === 'workout') {
            state.activeView = 'workout';
            renderWorkoutList();
        } else {
            state.activeView = viewId;
            const targetView = document.getElementById(viewId);
            if (targetView) {
                targetView.style.display = 'block';
                if (viewId === 'stats') renderStatsView();
                if (viewId === 'progress') renderProgressView();
                if (viewId === 'macro-progress') renderMacroProgressView();
            }
        }
        }
    });

    // --- Bottom Sheet Strumenti & Gestione ---
    setupBottomSheet({
        modalId: 'tools-modal',
        openBtnId: 'open-tools-btn',
        closeBtnId: 'close-tools-btn',
        timeoutMs: 6000,
        onSelect: (action) => {
            switch (action) {
                case 'manual': {
                    document.getElementById('workout-list-container').style.display = 'none';
                    document.querySelectorAll('.day-view').forEach(el => el.style.display = 'none');
                    const manualView = document.getElementById('manual');
                    if (manualView) {
                        manualView.style.display = 'block';
                        renderManualView();
                    }
                    break;
                }
                case 'export-pdf':
                    // Chiama direttamente il modulo PDF
                    exportWorkoutPDF(); 
                    break;
                case 'import-plan':
                    document.getElementById('import-plan-input')?.click();
                    break;
                case 'export-csv':
                    exportToCSV(state.workoutData);
                    break;
                case 'import-history':
                    document.getElementById('import-history-input')?.click();
                    break;
                case 'reset-meso':
                    deleteCurrentMesocycle();
                    break;
                case 'clear-data':
                    clearLocalData();
                    break;
            }
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
    
    document.getElementById('export-pdf-btn')?.addEventListener('click', () => {
        const years = state.workoutData?.history?.years || {};
        const yearKeys = Object.keys(years);
        
        if (yearKeys.length === 0) {
            alert("Nessun dato storico presente per l'esportazione.");
            return;
        }

        const activeYearKey = state.currentYear || yearKeys.sort().pop();
        const yearObj = years[activeYearKey];
        const activeMesoKey = state.currentMesocycle !== undefined ? state.currentMesocycle : 1;
        const activeWeekNum = state.activeWeek || 1;
        const activeDayNum = state.activeDay || 1;

        let selectedWeek = null;
        if (yearObj && yearObj.mesocycles) {
            const mesos = yearObj.mesocycles;
            let meso = Array.isArray(mesos)
                ? (mesos[activeMesoKey - 1] || mesos[activeMesoKey] || mesos[0])
                : (mesos[activeMesoKey] || mesos[String(activeMesoKey)] || mesos[Object.keys(mesos)[0]]);

            if (meso && meso.weeks) {
                const weeks = meso.weeks;
                if (Array.isArray(weeks)) {
                    selectedWeek = weeks[activeWeekNum - 1] || weeks[activeWeekNum];
                } else if (typeof weeks === 'object') {
                    selectedWeek = weeks[activeWeekNum] || weeks[String(activeWeekNum)] || weeks[Object.keys(weeks)[activeWeekNum - 1]];
                }
            }
        }

        if (!selectedWeek || !selectedWeek.days) {
            alert("Nessun dato trovato per la settimana selezionata.");
            return;
        }

        const days = selectedWeek.days;
        let selectedDay = null;

        if (Array.isArray(days)) {
            selectedDay = days[activeDayNum - 1] || days[activeDayNum] || days[0];
        } else if (typeof days === 'object') {
            const dayKeys = Object.keys(days);
            selectedDay = days[activeDayNum] || days[String(activeDayNum)] || days[dayKeys[activeDayNum - 1]] || days[dayKeys[0]];
        }

        if (!selectedDay) {
            alert("Nessun giorno selezionato trovato.");
            return;
        }

        const metadata = {
            mesocycleName: `Mesociclo ${activeMesoKey}`,
            weekNumber: activeWeekNum,
            dayName: selectedDay.name || `Giorno ${activeDayNum}`,
            dayDate: selectedDay.date || '',
            coachNotes: selectedWeek.coachNotes || ''
        };

        exportWorkoutPDF(selectedDay, metadata);
    });

    // 6. Zona Pericolosa & Timer
    document.getElementById('reset-meso-btn')?.addEventListener('click', deleteCurrentMesocycle);
    document.getElementById('clear-data-btn')?.addEventListener('click', clearLocalData);
    document.getElementById('timer-minus-15')?.addEventListener('click', () => adjustTimer(-15));
    document.getElementById('timer-plus-30')?.addEventListener('click', () => adjustTimer(30));
    document.getElementById('stop-timer-btn')?.addEventListener('click', stopTimer);
    document.getElementById('timer-display')?.addEventListener('click', () => startTimer(90));

    // 7. Selettore Settimana
    document.getElementById('week-selector')?.addEventListener('change', (e) => {
        state.activeWeek = parseInt(e.target.value, 10);
        renderWorkoutList();
    });
}

document.addEventListener('DOMContentLoaded', initApp);