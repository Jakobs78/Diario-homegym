// ==========================================
// 1. IMPORT & CONFIGURAZIONE
// ==========================================
import { CONFIG, supabase } from './config.js';
import { state } from './state.js';
import { getFromLocalStorage, saveToLocalStorage, saveAndSync, hasPendingSync, processSyncQueue, clearLocalData, updateSyncStatusUI,  } from './storage.js';
import { pullDataFromSupabase, initBackgroundSync } from './sync.js';
import { renderWorkoutList } from './ui.js';
import { handlePdfExportFromState } from './pdfExport.js';
import { downloadExcelTemplate, parseExcelFile } from './importer.js';
import { importWorkoutPlan, readCsvFile, importProgressCSV, exportToCSV } from './csvHandler.js';
import { initTheme, toggleTheme } from './theme.js';
import { setupAuthListeners, logoutUser, checkSession } from './auth.js';
import { deleteCurrentMesocycle, changeMesocycle, toggleCurrentMesocycleLock, exportMesoToPDF, getActiveMesocycleObject } from './mesocycle.js';
import { renderManualView } from './manual.js';
import { initAudioUnlock } from './audio.js';
import { renderMacroKPIs, initAnalyticsEvents, renderMuscleVolumeChart, renderMesoComparisonChart, switchAnalyticsTab } from './analytics.js';
import { setupBottomSheet } from './bottomSheet.js';
import { initDevBanner } from './bannerSviluppo.js';
import { parseCoachPDF } from './pdfParser.js';
import { mapPdfTextToWorkoutData } from './pdfTextMapper.js';
import { applyUserToUI, checkSubscriptionStatus, deleteUserAccount } from './accountManager.js';

// Esposizione globale per eventi inline / retrocompatibilità
window.logoutUser = logoutUser;
window.state = state;
window.bottomSheet = setupBottomSheet;
window.switchAnalyticsTab = (tabId) => switchAnalyticsTab(
    tabId, 
    state, 
    renderMacroKPIs, 
    renderMuscleVolumeChart, 
    initAnalyticsEvents, 
    renderMesoComparisonChart
);

// ==========================================
// 2. GESTIONE AUTENTICAZIONE & STATO
// ==========================================
supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
        state.currentUser = session.user;
        applyUserToUI(session.user);

        try {
            const remoteData = await pullDataFromSupabase(session.user);
            if (remoteData) {
                state.workoutData = remoteData;
                saveToLocalStorage(remoteData);
                renderWorkoutList();
            }
        } catch (err) {
            console.warn("Errore caricamento dati da cloud all'auth change:", err);
        }
    } else {
        console.log("⚠️ Utente non autenticato: uso localStorage.");
    }
});

// ==========================================
// 3. INIZIALIZZAZIONE DELL'APP
// ==========================================
async function initApp() {
    console.log(`Avvio Advanced Workout Tracker v${CONFIG.APP_VERSION}`);
    applyUserToUI(null);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrato:', reg.scope))
            .catch(err => console.warn('Errore registrazione Service Worker:', err));
    }

    initTheme();
    initDevBanner();
    initBackgroundSync(state);
    
    const localData = getFromLocalStorage();
    state.workoutData = localData;
    updateSyncStatusUI();
    
    try {
        const user = await checkSession();

        if (user) {
            state.currentUser = user;
            const authOverlay = document.getElementById('auth-overlay');
            if (authOverlay) authOverlay.style.display = 'none';

            applyUserToUI(user);
            await checkSubscriptionStatus(user);

            if (navigator.onLine) {
                if (hasPendingSync()) {
                    await processSyncQueue();
                }

                const remoteData = await pullDataFromSupabase(user);
                
                if (remoteData && remoteData.history && Object.keys(remoteData.history.years || {}).length > 0) {
                    const localTime = new Date(localData.updatedAt || 0).getTime();
                    const remoteTime = new Date(remoteData.updatedAt || 0).getTime();

                    if (remoteTime > localTime && !hasPendingSync()) {
                        state.workoutData = remoteData;
                        saveToLocalStorage(remoteData); 
                    }
                } else {
                    console.log("⚠️ Cloud vuoto o non raggiungibile: mantengo i dati locali in sicurezza.");
                }
            }
        }
    } catch (err) {
        console.warn("Impossibile connettersi a Supabase, avvio in modalità offline:", err);
    }
    
    renderWorkoutList();
    setupEventListeners();
    setupAuthListeners();
    initAudioUnlock();
    updateSyncStatusUI();
}

document.addEventListener('DOMContentLoaded', initApp);

// ==========================================
// 4. LISTENER EVENTI GLOBALI & INTERFACCIA
// ==========================================
function setupEventListeners() {
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
    document.getElementById('user-info-bar')?.addEventListener('click', window.logoutUser);
    document.getElementById('trial-logout-btn')?.addEventListener('click', () => window.logoutUser());

    document.addEventListener('focusin', (e) => {
        if (e.target && e.target.matches('.set-table input[type="text"]')) {
            setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    });

    document.getElementById('btn-user-manual')?.addEventListener('click', (e) => {
        const btnManual = e.currentTarget;
        const manualView = document.getElementById('manual');
        const workoutContainer = document.getElementById('workout-list-container');
        const isOpen = manualView && manualView.style.display === 'block';

        if (isOpen) {
            if (manualView) manualView.style.display = 'none';
            if (workoutContainer) workoutContainer.style.display = 'block';
            btnManual.textContent = "📖 Manuale d'uso";
        } else {
            if (workoutContainer) workoutContainer.style.display = 'none';
            document.querySelectorAll('.day-view').forEach(el => el.style.display = 'none');
            
            if (manualView) {
                manualView.style.display = 'block';
                renderManualView();
            }
            btnManual.textContent = "✖️ Chiudi Manuale";
        }
    });

    document.getElementById('prev-meso-btn')?.addEventListener('click', () => changeMesocycle(-1));
    document.getElementById('next-meso-btn')?.addEventListener('click', () => changeMesocycle(1));
    document.getElementById('toggle-lock-meso-btn')?.addEventListener('click', toggleCurrentMesocycleLock);

    setupBottomSheet({
        modalId: 'analytics-modal',
        openBtnId: 'open-analytics-btn',
        closeBtnId: 'close-analytics-btn',
        timeoutMs: 6000,
        onSelect: (targetId) => {
            const btnManual = document.getElementById('btn-user-manual');
            if (btnManual) btnManual.textContent = "📖 Manuale d'uso";
            const workoutContainer = document.getElementById('workout-list-container');
            if (workoutContainer) workoutContainer.style.display = 'none';
            document.querySelectorAll('.day-view').forEach(el => el.style.display = 'none');

            if (targetId === 'workout') {
                state.activeView = 'workout';
                if (workoutContainer) workoutContainer.style.display = 'block';
                renderWorkoutList();
            } else {
                state.activeView = 'analytics';
                const analyticsView = document.getElementById('analytics');
                if (analyticsView) {
                    analyticsView.style.display = 'block';
                    window.switchAnalyticsTab(targetId || 'subtab-macro');
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
            const btnManual = document.getElementById('btn-user-manual');
            if (btnManual) btnManual.textContent = "📖 Manuale d'uso";
            switch (action) {
                case 'export-pdf':
                    handlePdfExportFromState(state);
                    break;
                case 'export-meso-pdf': {
                    const activeMeso = getActiveMesocycleObject();
                    if (activeMeso) {
                        exportMesoToPDF(activeMeso);
                    } else {
                        alert("Nessun mesociclo attivo trovato per l'esportazione.");
                    }
                    break;
                }
                case 'import-plan': {
                    const importModal = document.getElementById('import-plan-modal');
                    if (importModal) {
                        importModal.classList.remove('hidden');
                        importModal.style.display = 'flex';
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        const modalContent = importModal.querySelector('.modal-content');
                        if (modalContent) modalContent.scrollTop = 0;
                    }
                    break;
                }
                case 'export-csv':
                    exportToCSV(state.workoutData);
                    break;
                case 'import-history':
                    document.getElementById('import-history-input')?.click();
                    break;
                case 'reset-meso':
                    deleteCurrentMesocycle();
                    break;
                case 'delete-account':
                    deleteUserAccount();
                    break;
                case 'clear-data':
                    clearLocalData();
                    break;
            }
        }
    });

    document.getElementById('close-import-modal-btn')?.addEventListener('click', closeImportModal);
    document.getElementById('import-plan-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'import-plan-modal') closeImportModal();
    });

    document.getElementById('btn-download-template')?.addEventListener('click', (e) => {
        e.preventDefault();
        downloadExcelTemplate();
    });

    document.getElementById('import-file-input')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        const statusMsg = document.getElementById('import-status-msg');
        if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.color = 'var(--primary, #007bff)';
        }

        if (ext === 'pdf') {
            if (statusMsg) {
                statusMsg.style.color = '#d97706';
                statusMsg.textContent = "⏳ Analisi e pulizia del PDF del coach in corso...";
            }

            try {
                const pdfData = await parseCoachPDF(file);
                const mappedData = mapPdfTextToWorkoutData(pdfData.cleanedText);
                
                const currentYear = new Date().getFullYear().toString();
                if (!state.workoutData.history) state.workoutData.history = {};
                if (!state.workoutData.history.years) state.workoutData.history.years = {};
                if (!state.workoutData.history.years[currentYear]) {
                    state.workoutData.history.years[currentYear] = { mesocycles: [] };
                }

                const currentMesos = state.workoutData.history.years[currentYear].mesocycles;
                const extractedMeso = mappedData;

                if (extractedMeso && extractedMeso.weeks && extractedMeso.weeks.length > 0) {
                    const nextMesoNumber = currentMesos.length + 1;
                    extractedMeso.id = `meso_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                    extractedMeso.name = `Mesociclo ${nextMesoNumber}`;
                    extractedMeso.importedAt = new Date().toISOString();
                    extractedMeso.locked = false;

                    currentMesos.push(extractedMeso);
                    state.activeMesocycleIndex = currentMesos.length - 1;
                    state.activeWeek = 1;
                    state.activeDay = 1;

                    saveAndSync(state.workoutData);
                    renderWorkoutList();

                    if (statusMsg) {
                        statusMsg.style.color = '#16a34a';
                        statusMsg.textContent = `✅ Mesociclo ${nextMesoNumber} importato con successo!`;
                    }
                } else {
                    throw new Error("Impossibile strutturare il mesociclo dal file PDF.");
                }

                setTimeout(() => {
                    closeImportModal();
                    if (statusMsg) statusMsg.style.display = 'none';
                    e.target.value = '';
                }, 2000);

            } catch (err) {
                console.error("Errore parsing PDF:", err);
                if (statusMsg) {
                    statusMsg.style.color = '#dc2626';
                    statusMsg.textContent = "❌ Errore nella lettura del PDF. Verifica che la connessione sia attiva e che il file sia valido.";
                }
            }
        } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
            if (statusMsg) {
                statusMsg.style.color = 'var(--primary, #007bff)';
                statusMsg.textContent = "⏳ Leggendo il file Tabellare...";
            }

            parseExcelFile(file, (res) => {
                if (!res.success) {
                    alert(res.error);
                    if (statusMsg) statusMsg.style.display = 'none';
                    e.target.value = '';
                    return;
                }

                const result = importWorkoutPlan(res.csvData);

                if (result.success) {
                    closeImportModal();
                    renderWorkoutList();
                    alert(result.message || "Scheda importata con successo!");
                } else {
                    alert(result.error || "Errore durante l'importazione dei dati.");
                }

                if (statusMsg) statusMsg.style.display = 'none';
                e.target.value = '';
            });
        } else {
            if (statusMsg) {
                statusMsg.style.color = '#dc2626';
                statusMsg.textContent = "❌ Formato non supportato. Usa .xlsx, .xls, .csv o .pdf";
            }
        }
    });

    document.getElementById('import-history-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        readCsvFile(file, (text) => {
            const result = importProgressCSV(text);
            alert(result.message || result.error);
        });
        e.target.value = '';
    });

    document.getElementById('week-selector')?.addEventListener('change', (e) => {
        state.activeWeek = parseInt(e.target.value, 10);
        renderWorkoutList();
    });
}

function closeImportModal() {
    const importModal = document.getElementById('import-plan-modal');
    if (importModal) {
        importModal.classList.add('hidden');
        importModal.style.display = 'none';
    }
}