/**
 * Module: main.js
 * Summary: Coordina l'avvio dell'applicazione, la registrazione del Service Worker per la gestione offline, l'inizializzazione del tema, il banner di sviluppo, i listener di autenticazione di Supabase, la sincronizzazione iniziale dei dati cloud con fallback su localStorage, e l'associazione dei controlli globali per la navigazione tra mesocicli, il manuale d'uso e la gestione degli eventi dell'interfaccia.
 */
// ==========================================
// 1. IMPORT & CONFIGURAZIONE
// ==========================================
import { CONFIG, supabase } from './config.js';
import { state } from './state.js';
import { getFromLocalStorage, getFromLocalStorageForUser, getStoredLocalOwner,
    saveToLocalStorage, saveAndSync, hasPendingSync, processSyncQueue, clearLocalData, updateSyncStatusUI } from './storage.js';
import { pullDataFromSupabase, initBackgroundSync } from './sync.js';
import { renderWorkoutList } from './ui.js';
import { handlePdfExportFromState } from './pdfExport.js';
import { downloadExcelTemplate, handleUniversalImport } from './importer.js';
import { readCsvFile, importProgressCSV, exportToCSV } from './csvHandler.js';
import { initTheme, toggleTheme } from './theme.js';
import { setupAuthListeners, logoutUser } from './auth.js';
import { deleteCurrentMesocycle, changeMesocycle, exportMesoToPDF, getActiveMesocycleObject } from './mesocycle.js';
import { renderManualView } from './manual.js';
import { initAudioUnlock } from './audio.js';
import { switchAnalyticsTab } from './analytics.js';
import { setupBottomSheet } from './bottomSheet.js';
import { initDevBanner } from './bannerSviluppo.js';
import { applyUserToUI, checkSubscriptionStatus, deleteUserAccount } from './accountManager.js';
// Corretto il percorso dell'import relativo
import { startCoachChatAndGenerate, generateAndDownloadMesocycleCSV,
    createVisualCoachProposal, clearVisualCoachProposal, downloadVisualCoachProposal
} from '../mycoatch/mycoatch-adapter.js';
import { initCoachPreview } from './coachPreviewUI.js';
import { parseCoachPreferences } from '../mycoatch/userPreferences.js';
import { DEFAULT_HOME_GYM_ACCESSORIES } from '../mycoatch/exercisesDB.js';
import { downloadFullBackup, restoreFullBackupFile } from './fullBackup.js';

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
        const owner=getStoredLocalOwner();
        state.currentUser = session.user;
        if(owner && owner!==String(session.user.id)){
            state.workoutData=getFromLocalStorageForUser(session.user);
            renderWorkoutList();
        }
        applyUserToUI(session.user);

        try {
            const remoteData = await pullDataFromSupabase(session.user);
            if (remoteData && !hasPendingSync()) {
                const localStamp=Date.parse(state.workoutData?.updatedAt || '') || 0;
                const remoteStamp=Date.parse(remoteData.updatedAt || '') || 0;
                const hasLocalHistory=Object.values(state.workoutData?.history?.years || {})
                    .some(year=>year?.mesocycles?.length>0);
                if(remoteStamp>localStamp || !hasLocalHistory){
                    state.workoutData=remoteData;
                    saveToLocalStorage(remoteData,{preserveUpdatedAt:true});
                    renderWorkoutList();
                }
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

    initTheme();
    initDevBanner();
    initBackgroundSync(state);
    
    let localData = getFromLocalStorage();
    state.workoutData = localData;
    updateSyncStatusUI();
    
    try {
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            state.currentUser = user;
            localData=getFromLocalStorageForUser(user);
            state.workoutData=localData;
            const authOverlay = document.getElementById('auth-overlay');
            if (authOverlay) authOverlay.classList.add('d-none');

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
                        saveToLocalStorage(remoteData,{preserveUpdatedAt:true}); 
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
    const utilityMenu = document.getElementById('app-utility-menu');
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        toggleTheme();
        if (utilityMenu) utilityMenu.open = false;
    });
    // Chiudi il menu quando si torna alla scheda; Escape evita pannelli pendenti.
    document.addEventListener('click', event => {
        if (utilityMenu?.open && !utilityMenu.contains(event.target)) utilityMenu.open = false;
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && utilityMenu?.open) {
            utilityMenu.open = false;
            utilityMenu.querySelector('summary')?.focus();
        }
    });
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
        if (utilityMenu) utilityMenu.open = false;
        const btnManual = e.currentTarget;
        const manualView = document.getElementById('manual');
        const workoutContainer = document.getElementById('workout-list-container');
        const isOpen = manualView && !manualView.classList.contains('d-none');

        if (isOpen) {
            if (manualView) manualView.classList.add('d-none');
            if (workoutContainer) workoutContainer.classList.remove('d-none');
            btnManual.textContent = "📖 Manuale d'uso";
        } else {
            if (workoutContainer) workoutContainer.classList.add('d-none');
            document.querySelectorAll('.day-view').forEach(el => el.classList.add('d-none'));
            
            if (manualView) {
                manualView.classList.remove('d-none');
                renderManualView();
            }
            btnManual.textContent = "✖️ Chiudi Manuale";
        }
    });

    document.getElementById('prev-meso-btn')?.addEventListener('click', () => { 
        changeMesocycle(-1);
        localStorage.setItem('ui_active_meso', state.activeMesocycleIndex);
        localStorage.setItem('ui_active_week', state.activeWeek);
    }); 
    document.getElementById('next-meso-btn')?.addEventListener('click', () => { 
        changeMesocycle(1);
        localStorage.setItem('ui_active_meso', state.activeMesocycleIndex);
        localStorage.setItem('ui_active_week', state.activeWeek);
    });
    
    // Le vecchie scorciatoie aprono lo stesso modulo, senza default implicito.
    document.getElementById('btn-generate-mycoatch-csv')?.addEventListener('click', startCoachChatAndGenerate);

    const coachModal = document.getElementById('mycoatch-config-modal');
    const coachForm = document.getElementById('mycoatch-config-form');
    const timeSelect = document.getElementById('select-time');
    const customTime = document.getElementById('mycoatch-custom-time');
    const customTimeWrap = document.getElementById('mycoatch-custom-time-wrap');
    const coachFeedback = document.getElementById('mycoatch-form-feedback');
    const coachSubmit = document.getElementById('mycoatch-submit');

    function closeCoachModal() {
        coachModal?.classList.add('hidden');
    }
    document.getElementById('close-mycoatch-config')?.addEventListener('click', closeCoachModal);
    coachModal?.addEventListener('click', event => {
        if (event.target === coachModal) closeCoachModal();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && coachModal && !coachModal.classList.contains('hidden')) {
            closeCoachModal();
        }
    });

    timeSelect?.addEventListener('change', () => {
        const isCustom = timeSelect.value === 'custom';
        customTimeWrap?.classList.toggle('hidden', !isCustom);
        if (customTime) {
            customTime.disabled = !isCustom;
            customTime.required = isCustom;
            if (!isCustom) customTime.value = '';
            else customTime.focus();
        }
        if (coachFeedback) coachFeedback.textContent = '';
    });

    // La data non viene mai preimpostata: la deve dichiarare l'atleta.
    // Il vincolo max serve soltanto come aiuto nel browser: il dominio
    // rifiuta comunque date future e invalide.
    for (const input of document.querySelectorAll('[id^="mycoatch-load-"][id$="-date"]')) {
        input.max = new Date().toISOString().slice(0, 10);
    }

    function readCoachOptions() {
        return parseCoachPreferences({
                selectedTime: timeSelect?.value,
                customTime: customTime?.value,
                daysPerWeek: document.getElementById('select-days')?.value,
                userAge: document.getElementById('input-age')?.value,
                focus: document.getElementById('select-focus')?.value,
                preferredLifts: Object.fromEntries(['bench', 'squat', 'military', 'hinge']
                    .map(lift => [lift, document.getElementById('mycoatch-lift-' + lift)?.value || 'auto'])),
                availableAccessories: [...DEFAULT_HOME_GYM_ACCESSORIES,
                    ...Array.from(document.querySelectorAll('.mycoatch-accessory-check:checked'),
                        input => input.value)],
                athleteProfile: {
                    experience: document.getElementById('mycoatch-experience')?.value,
                    calibration: document.getElementById('mycoatch-calibration')?.value,
                    priorityMuscle: document.getElementById('mycoatch-priority-muscle')?.value || null,
                    excludedExercises: Array.from(
                        document.querySelectorAll('.mycoatch-avoid-check:checked'),
                        input => input.value
                    ),
                    referenceLoads: Object.fromEntries(['bench', 'squat', 'military', 'hinge']
                        .map(lift => [lift, {
                            kg: document.getElementById('mycoatch-load-' + lift + '-kg')?.value || '',
                            reps: document.getElementById('mycoatch-load-' + lift + '-reps')?.value || '',
                            rpe: document.getElementById('mycoatch-load-' + lift + '-rpe')?.value || '',
                            performedOn: document.getElementById('mycoatch-load-' + lift + '-date')?.value || ''
                        }]))
                }
            })
    }

    initCoachPreview(readCoachOptions,coachModal);

    coachForm?.addEventListener('submit', async event => {
        event.preventDefault();
        if (coachSubmit?.disabled) return;

        let options;
        try { options=readCoachOptions(); }
        catch(error) {
            if(coachFeedback)coachFeedback.textContent=error.message;
            return;
        }

        if (coachFeedback) coachFeedback.textContent = '';
        if (coachSubmit) {
            coachSubmit.disabled = true;
            coachSubmit.textContent = 'Generazione in corso…';
        }

        try {
            const result = await generateAndDownloadMesocycleCSV(options);
            if (result.cancelled) {
                if (coachFeedback) coachFeedback.textContent = result.message;
                return;
            }
            if (!result.success) throw new Error(result.message || 'Generazione non riuscita.');
            closeCoachModal();
            alert(result.message);
        } catch (error) {
            if (coachFeedback) coachFeedback.textContent = error.message;
        } finally {
            if (coachSubmit) {
                coachSubmit.disabled = false;
                coachSubmit.textContent = 'Genera e scarica CSV';
            }
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

            if (workoutContainer) workoutContainer.classList.add('d-none');
            document.querySelectorAll('.day-view').forEach(el => el.classList.add('d-none'));

            if (targetId === 'workout') {
                state.activeView = 'workout';
                if (workoutContainer) workoutContainer.classList.remove('d-none');
                renderWorkoutList();
            } else {
                state.activeView = 'analytics';
                if (analyticsView) {
                    analyticsView.classList.remove('d-none');
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
                        importModal.classList.remove('hidden', 'd-none');
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
                case 'backup-json':
                    downloadFullBackup(state.workoutData);
                    break;
                case 'restore-json':
                    document.getElementById('restore-full-backup-input')?.click();
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

    document.getElementById('restore-full-backup-input')?.addEventListener('change', async (e)=>{
        const file=e.target.files?.[0];
        if(!file)return;
        try {
            await restoreFullBackupFile(file,{state,saveAndSync,renderWorkoutList});
        } catch(err) {
            alert('Ripristino non eseguito: '+err.message);
        } finally {
            e.target.value='';
        }
    });
    document.getElementById('week-selector')?.addEventListener('change', (e) => {
        state.activeWeek = parseInt(e.target.value, 10);
        localStorage.setItem('ui_active_week', state.activeWeek);
        renderWorkoutList();
    });
}

function closeImportModal() {
    const importModal = document.getElementById('import-plan-modal');
    if (importModal) {
        importModal.classList.add('hidden', 'd-none');
    }
}