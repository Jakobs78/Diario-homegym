/**
 * Module: main.js
 * Summary: Coordina l'avvio dell'applicazione, la registrazione del Service Worker per la gestione offline, l'inizializzazione del tema, il banner di sviluppo, i listener di autenticazione di Supabase, la sincronizzazione iniziale dei dati cloud con fallback su localStorage, e l'associazione dei controlli globali per la navigazione tra mesocicli, il manuale d'uso e la gestione degli eventi dell'interfaccia.
 */
// ==========================================
// 1. IMPORT & CONFIGURAZIONE
// ==========================================
import { CONFIG, supabase } from './config.js';
import { state } from './state.js';
import { getFromLocalStorage, saveToLocalStorage, hasPendingSync, processSyncQueue, clearLocalData, updateSyncStatusUI } from './storage.js';
import { pullDataFromSupabase, initBackgroundSync } from './sync.js';
import { renderWorkoutList } from './ui.js';
import { handlePdfExportFromState } from './pdfExport.js';
import { downloadExcelTemplate, handleUniversalImport } from './importer.js';
import { readCsvFile, importProgressCSV, exportToCSV } from './csvHandler.js';
import { initTheme, toggleTheme } from './theme.js';
import { setupAuthListeners, logoutUser } from './auth.js';
import { deleteCurrentMesocycle, changeMesocycle, toggleCurrentMesocycleLock, exportMesoToPDF, getActiveMesocycleObject } from './mesocycle.js';
import { renderManualView } from './manual.js';
import { initAudioUnlock } from './audio.js';
import { switchAnalyticsTab } from './analytics.js';
import { setupBottomSheet } from './bottomSheet.js';
import { initDevBanner } from './bannerSviluppo.js';
import { applyUserToUI, checkSubscriptionStatus, deleteUserAccount } from './accountManager.js';
// Corretto il percorso dell'import relativo
import { startCoachChatAndGenerate } from '../mycoatch/mycoatch-adapter.js';
import { generateAndDownloadMesocycleCSV } from '../mycoatch/mycoatch-adapter.js';

// Esposizione globale per eventi inline / retrocompatibilità
window.logoutUser = logoutUser;
window.state = state;
window.bottomSheet = setupBottomSheet;
window.switchAnalyticsTab = switchAnalyticsTab;

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
        const { data: { user } } = await supabase.auth.getUser();

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
    document.getElementById('btn-generate-mycoatch-csv')?.addEventListener('click', async () => {
        const userGoalSettings = {
            userAge: parseInt(document.getElementById('input-age')?.value, 10) || 30,
            daysPerWeek: parseInt(document.getElementById('select-days')?.value, 10) || 3,
            maxSessionMinutes: parseInt(document.getElementById('select-time')?.value, 10) || 60,
            focus: document.getElementById('select-focus')?.value || 'hybrid',
            focusMuscleGroup: document.getElementById('select-focus-muscle')?.value || null
        };

        const response = await generateAndDownloadMesocycleCSV(userGoalSettings);
        
        if (response.success) {
            alert(response.message);
        } else {
            alert(`Attenzione: ${response.message}`);
        }
    });

    // BOTTOM SHEET ANALYTICS
    setupBottomSheet({
        modalId: 'analytics-modal',
        openBtnId: 'open-analytics-btn',
        closeBtnId: 'close-analytics-btn',
        timeoutMs: 6000,
        onSelect: (targetId) => {
            const btnManual = document.getElementById('btn-user-manual');
            if (btnManual) btnManual.textContent = "📖 Manuale d'uso";
            const workoutContainer = document.getElementById('workout-list-container');
            const analyticsView = document.getElementById('analytics');

            if (workoutContainer) workoutContainer.style.display = 'none';
            document.querySelectorAll('.day-view').forEach(el => el.style.display = 'none');

            if (targetId === 'workout') {
                state.activeView = 'workout';
                if (workoutContainer) workoutContainer.style.display = 'block';
                renderWorkoutList();
            } else {
                state.activeView = 'analytics';
                if (analyticsView) {
                    analyticsView.style.display = 'block';
                }
                const activeTab = (targetId && targetId !== 'analytics') ? targetId : 'subtab-macro';
                window.switchAnalyticsTab(activeTab);
            }
        }
    });

    // BOTTOM SHEET STRUMENTI & GESTIONE
    setupBottomSheet({
        modalId: 'tools-modal',
        openBtnId: 'open-tools-btn',
        closeBtnId: 'close-tools-btn',
        timeoutMs: 6000,
        onSelect: (action) => {
            const btnManual = document.getElementById('btn-user-manual');
            if (btnManual) btnManual.textContent = "📖 Manuale d'uso";
            
            switch (action) {
                case 'generate-mycoatch-csv': {
                    startCoachChatAndGenerate();
                    break;
                }
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

    // LISTENER PER MODALE IMPORTAZIONE ED EVENTI FILE
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

        const statusMsg = document.getElementById('import-status-msg');
        await handleUniversalImport(file, statusMsg, closeImportModal);
        e.target.value = '';
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