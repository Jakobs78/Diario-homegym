// ==========================================
// 1. IMPORT & CONFIGURAZIONE
// ==========================================
import { CONFIG, supabase } from './config.js';
import { state } from './state.js';
import { 
    getFromLocalStorage, 
    saveToLocalStorage, 
    hasPendingSync, 
    processSyncQueue, 
    clearLocalData, 
    updateSyncStatusUI 
} from './storage.js';
import { pullDataFromSupabase } from './sync.js';
import { renderWorkoutList, setupBottomSheet } from './ui.js';
import { exportWorkoutPDF } from './pdfExport.js';
import { downloadExcelTemplate, parseExcelFile } from './importer.js';
import { importWorkoutPlan, readCsvFile, importProgressCSV, exportToCSV } from './csvHandler.js';
import { initTheme, toggleTheme } from './theme.js';
import { setupAuthListeners, logoutUser, checkSession } from './auth.js';
import { deleteCurrentMesocycle, changeMesocycle, toggleCurrentMesocycleLock } from './mesocycle.js';
import { renderManualView } from './manual.js';
import { initAudioUnlock } from './audio.js';
import { 
    renderMacroKPIs, 
    initAnalyticsEvents, 
    renderMuscleVolumeChart, 
    renderMesoComparisonChart 
} from './analytics.js';

// Esposizione globale per eventi inline / retrocompatibilità
window.logoutUser = logoutUser;
window.state = state;

// ==========================================
// 2. GESTIONE AUTENTICAZIONE & STATO
// ==========================================
supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
        const userInfoBar = document.getElementById('user-info-bar');
        const userEmailDisplay = document.getElementById('user-email-display');
        
        if (userInfoBar) userInfoBar.style.display = 'flex';
        if (userEmailDisplay) userEmailDisplay.textContent = session.user.email;

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
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrato:', reg.scope))
            .catch(err => console.warn('Errore registrazione Service Worker:', err));
    }

    initTheme();
    
    const localData = getFromLocalStorage();
    state.workoutData = localData;
    updateSyncStatusUI();
    
    try {
        const user = await checkSession();

        if (user) {
            state.currentUser = user;
            const userInfoBar = document.getElementById('user-info-bar');
            const userEmailDisplay = document.getElementById('user-email-display');
            const authOverlay = document.getElementById('auth-overlay');

            if (userInfoBar) userInfoBar.style.display = 'flex';
            if (userEmailDisplay && user.email) userEmailDisplay.textContent = user.email;
            if (authOverlay) authOverlay.style.display = 'none';

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

    // Scorrimento automatico al Focus su input mobile
    document.addEventListener('focusin', (e) => {
        if (e.target && e.target.matches('.set-table input[type="text"]')) {
            setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    });

    // Toggle Manuale d'Uso
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

    // Navigazione Mesociclo
    document.getElementById('prev-meso-btn')?.addEventListener('click', () => changeMesocycle(-1));
    document.getElementById('next-meso-btn')?.addEventListener('click', () => changeMesocycle(1));
    document.getElementById('toggle-lock-meso-btn')?.addEventListener('click', toggleCurrentMesocycleLock);

    // Bottom Sheet Analisi
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

    // Bottom Sheet Strumenti
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
                    handlePdfExportFromState();
                    break;
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
                case 'clear-data':
                    clearLocalData();
                    break;
            }
        }
    });

    // Gestione Modale Importazione
    document.getElementById('close-import-modal-btn')?.addEventListener('click', closeImportModal);
    document.getElementById('import-plan-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'import-plan-modal') closeImportModal();
    });

    document.getElementById('btn-download-template')?.addEventListener('click', () => {
        downloadExcelTemplate();
    });

    // Eventi File Input
    document.getElementById('import-file-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const statusMsg = document.getElementById('import-status-msg');
        if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.color = 'var(--primary, #007bff)';
            statusMsg.textContent = "⏳ Leggendo il file Excel...";
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

// ==========================================
// 5. SUB-TAB ANALISI & HELPER VISTE
// ==========================================
window.switchAnalyticsTab = function(tabId) {
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sub-tab-content').forEach(content => content.classList.remove('active'));

    const selectedContent = document.getElementById(tabId);
    if (selectedContent) selectedContent.classList.add('active');

    const activeBtn = Array.from(document.querySelectorAll('.sub-tab-btn'))
        .find(btn => btn.getAttribute('onclick')?.includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');

    if (state.workoutData) {
        if (tabId === 'subtab-macro') {
            renderMacroKPIs(state.workoutData);
            renderMuscleVolumeChart('chart-muscle-volume', state.workoutData);
        } else if (tabId === 'subtab-micro') {
            initAnalyticsEvents(state.workoutData);
        } else if (tabId === 'subtab-compare') {
            renderMesoComparisonChart('chart-compare-mesos', null, null);
        }
    }
};

function closeImportModal() {
    const importModal = document.getElementById('import-plan-modal');
    if (importModal) {
        importModal.classList.add('hidden');
        importModal.style.display = 'none';
    }
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

// ==========================================
// 6. SINCRONIZZAZIONE FOCUS / VISIBILITY
// ==========================================
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
        try {
            const user = await checkSession();
            if (!user) return;

            if (hasPendingSync()) {
                await processSyncQueue();
            }

            const remoteData = await pullDataFromSupabase(user);
            if (remoteData) {
                const localData = getFromLocalStorage();
                const localTime = new Date(localData.updatedAt || 0).getTime();
                const remoteTime = new Date(remoteData.updatedAt || 0).getTime();

                if (remoteTime > localTime) {
                    state.workoutData = remoteData;
                    saveToLocalStorage(remoteData);
                    renderWorkoutList();
                    updateSyncStatusUI();
                    showSyncToast("Dati aggiornati dal cloud ✨");
                }
            }
        } catch (err) {
            console.warn("Impossibile sincronizzare al risveglio da standby:", err);
        }
    }
});

window.addEventListener('online', () => document.dispatchEvent(new Event('visibilitychange')));
window.addEventListener('focus', () => document.dispatchEvent(new Event('visibilitychange')));

// ==========================================
// 7. NOTIFICHE TOAST & CONTROLLO ABBONAMENTO
// ==========================================
let syncToastTimer = null;
function showSyncToast(message) {
    let toast = document.getElementById('sync-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sync-toast';
        toast.style.cssText = "position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.85); color: #fff; padding: 10px 20px; border-radius: 20px; font-size: 13px; font-weight: 500; z-index: 9999; transition: opacity 0.3s ease; opacity: 0; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2);";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    
    if (syncToastTimer) clearTimeout(syncToastTimer);
    syncToastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

function showTrialToast(message) {
    const toast = document.getElementById('trial-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.style.display = 'block';

    setTimeout(() => { toast.style.opacity = '1'; }, 50);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 500);
    }, 3500);
}

function showExpiredOverlay(title, message) {
    const overlay = document.getElementById('trial-expired-overlay');
    const titleEl = document.getElementById('trial-expired-title');
    const msgEl = document.getElementById('trial-expired-msg');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.innerHTML = message;
    if (overlay) overlay.style.display = 'flex';
}

async function checkSubscriptionStatus(user) {
    if (!user || !user.id) return;

    try {
        const { data, error } = await supabase
            .from('user_subscriptions')
            .select('status, trial_ends_at, expires_at')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            console.warn("⚠️ Errore lettura abbonamento:", error.message);
            return;
        }

        if (!data) {
            console.warn("⚠️ Nessun abbonamento trovato per questo utente.");
            return;
        }

        if (data.status === 'lifetime') {
            console.log("✅ Utente Lifetime riconosciuto: nessun limite applicato.");
            return;
        }

        const now = new Date();

        if (data.status === 'active') {
            if (!data.expires_at) return;
            const endDate = new Date(data.expires_at);
            const diffDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 0) {
                showExpiredOverlay("Abbonamento Scaduto", "Il tuo abbonamento annuale è scaduto.");
            } else if (diffDays <= 7) {
                showTrialToast(`⚠️ Il tuo abbonamento scade tra ${diffDays} giorni!`);
            }
            return;
        }

        if (data.status === 'trial') {
            if (!data.trial_ends_at) return;
            const endDate = new Date(data.trial_ends_at);
            const diffDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 0) {
                showExpiredOverlay("Periodo di Prova Terminato", "I tuoi 45 giorni di prova gratuita sono terminati.");
            } else {
                showTrialToast(`⏳ Periodo di prova attivo: restano ${diffDays} giorni`);
            }
            return;
        }
    } catch (err) {
        console.warn("Eccezione durante il controllo abbonamento:", err);
    }
}