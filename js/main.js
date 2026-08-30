// main.js
import { CONFIG } from './config.js';
import { state } from './state.js';
// Importiamo le nuove funzioni di gestione coda
import { getFromLocalStorage, saveToLocalStorage, hasPendingSync, processSyncQueue, clearLocalData } from './storage.js';
import { pullDataFromSupabase } from './sync.js';
import { renderWorkoutList } from './ui.js';
import { exportWorkoutPDF } from './pdfExport.js';
import { exportToCSV, importWorkoutPlan, importProgressCSV } from './csvHandler.js';
import { initTheme, toggleTheme } from './theme.js';
import { renderStatsView, renderProgressView, renderMacroProgressView } from './dashboards.js';
import { setupAuthListeners, logoutUser, checkSession } from './auth.js';
import { deleteCurrentMesocycle, changeMesocycle } from './mesocycle.js';
import { setupBottomSheet } from './helpers.js';
import { renderManualView } from './manual.js';
import { initAudioUnlock } from './audio.js';

window.logoutUser = logoutUser;
window.state = state;
// --- INIZIALIZZAZIONE APP E RISOLUZIONE CONFLITTI ---
async function initApp() {
    console.log(`Avvio Advanced Workout Tracker v${CONFIG.APP_VERSION}`);
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrato:', reg.scope))
            .catch(err => console.warn('Errore registrazione Service Worker:', err));
    }

    initTheme();
    
    const localData = getFromLocalStorage();
    state.workoutData = localData;
    
    try {
        const user = await checkSession();

        if (user && navigator.onLine) {
            if (hasPendingSync()) {
                await processSyncQueue();
            }

            const remoteData = await pullDataFromSupabase(user);
            
            if (remoteData && remoteData.history) {
                const localTime = new Date(localData.updatedAt || 0).getTime();
                const remoteTime = new Date(remoteData.updatedAt || 0).getTime();

                if (remoteTime > localTime) {
                    state.workoutData = remoteData;
                    saveToLocalStorage(remoteData); 
                }
            }
        }
    } catch (err) {
        console.warn("Impossibile connettersi a Supabase, avvio in modalità offline:", err);
    }
    
    // QUESTI DEVONO ESSERE SEMPRE ESEGUITI, ANCHE SE IL CLOUD FALLISCE
    renderWorkoutList();
    setupEventListeners();
    setupAuthListeners();
    initAudioUnlock();
}

// --- COLLEGAMENTO EVENTI GLOBALI ---
function setupEventListeners() {
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
    document.getElementById('user-info-bar')?.addEventListener('click', window.logoutUser);

    document.getElementById('prev-meso-btn')?.addEventListener('click', () => changeMesocycle(-1));
    document.getElementById('next-meso-btn')?.addEventListener('click', () => changeMesocycle(1));

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
                    handlePdfExportFromState();
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

    document.getElementById('manual-btn')?.addEventListener('click', () => {
        document.getElementById('workout-list-container').style.display = 'none';
        document.querySelectorAll('.day-view').forEach(el => el.style.display = 'none');

        const manualView = document.getElementById('manual');
        if (manualView) {
            manualView.style.display = 'block';
            renderManualView();
        }
    });

    // Gestione corretta della lettura file CSV per il Piano di Allenamento
    document.getElementById('import-plan-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = importWorkoutPlan(event.target.result);
            if (result.success) renderWorkoutList(); // Aggiorna la UI dopo l'import
            alert(result.message || result.error);
        };
        reader.readAsText(file);
        e.target.value = ''; // Resetta l'input
    });

    // Gestione corretta della lettura file CSV per lo Storico
    document.getElementById('import-history-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = importProgressCSV(event.target.result);
            alert(result.message || result.error);
        };
        reader.readAsText(file);
        e.target.value = ''; // Resetta l'input
    });

    document.getElementById('week-selector')?.addEventListener('change', (e) => {
        state.activeWeek = parseInt(e.target.value, 10);
        renderWorkoutList();
    });
}

function handlePdfExportFromState() {
    const years = state.workoutData?.history?.years || {};
    const yearKeys = Object.keys(years);
    
    if (yearKeys.length === 0) {
        alert("Nessun dato storico presente per l'esportazione.");
        return;
    }

    const activeYearKey = state.currentYear || yearKeys.sort().pop();
    const yearObj = years[activeYearKey];
    const activeMesoKey = state.currentMesocycle !== undefined ? state.currentMesocycle : (state.activeMesocycleIndex + 1);
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
        dayName: selectedDay.dayName || selectedDay.name || `Giorno ${activeDayNum}`,
        dayDate: selectedDay.date || '',
        coachNotes: selectedWeek.coachNotes || ''
    };

    exportWorkoutPDF(selectedDay, metadata);
}

document.addEventListener('DOMContentLoaded', initApp);