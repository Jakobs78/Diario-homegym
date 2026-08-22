// importa tutti i moduli. Nel file principale HTML questo script deve essere incluso.
// js/main.js
import { initTheme, toggleTheme } from './theme.js';
import { startTimer, adjustTimer, stopTimer } from './timer.js';
import { 
    saveInputToStorage,
    toggleAuthMode,
    exportProgressCSV,
    importProgressCSV, 
    importWorkoutPlan, 
    resetDiaryData, 
    handleAuthSubmit, 
    handleLogout 
} from './storage.js';
import { renderMacroProgress, renderMuscleVolumeDashboard } from './analytics.js';
import { esportaWorkoutPDF } from './pdf.js';
import { supabase } from './supabaseClient.js';
import { state } from './state.js';

// --- GESTIONE DEI TAB DELL'INTERFACCIA ---
function switchTab(tabId, btnElement) {
    document.querySelectorAll('.day-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    if (btnElement) btnElement.classList.add('active');

    if (tabId === 'macro-progress') {
        renderMacroProgress();
    } else if (tabId === 'stats') {
        renderMuscleVolumeDashboard();
    }
}

function renderCurrentView() {
    console.log("Rendering vista corrente aggiornato.");
}

// --- UNICO BLOCCO DI INIZIALIZZAZIONE ALL'AVVIO ---
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    console.log("DOM completamente caricato.");

    // 1. Recupero sessione Supabase
    const { data: { session } } = await supabase.auth.getSession();
    
    const authOverlay = document.getElementById('auth-overlay');
    const userInfo = document.getElementById('user-info-bar');
    const userEmail = document.getElementById('user-email-display');

    if (session) {
        state.currentUser = session.user;
        if (authOverlay) authOverlay.style.display = 'none';
        if (userInfo) userInfo.style.display = 'flex';
        if (userEmail) userEmail.innerText = session.user.email;
        console.log("Sessione ripristinata per:", session.user.email);
    } else {
        if (authOverlay) authOverlay.style.display = 'flex';
        if (userInfo) userInfo.style.display = 'none';
        console.log("Nessuna sessione attiva, login richiesto.");
    }

    // 2. Ascoltatore per il cambio tra Login e Registrazione
    const toggleTextEl = document.getElementById('auth-toggle-text');
    console.log("Controllo elemento auth-toggle-text:", toggleTextEl);

    if (toggleTextEl) {
        toggleTextEl.addEventListener('click', () => {
            console.log("Click sul testo di toggle rilevato!");
            toggleAuthMode();
        });
    } else {
        console.error("ATTENZIONE: L'elemento ID 'auth-toggle-text' non è stato trovato nel file HTML!");
    }

    // 3. Esposizione globale per gli onclick dell'HTML
    window.toggleTheme = toggleTheme;
    window.startTimer = startTimer;
    window.adjustTimer = adjustTimer;
    window.stopTimer = stopTimer;
    window.saveInputToStorage = saveInputToStorage;
    window.exportProgressCSV = exportProgressCSV;
    window.importProgressCSV = importProgressCSV;
    window.importWorkoutPlan = importWorkoutPlan;
    window.resetDiaryData = resetDiaryData;
    window.handleAuthSubmit = handleAuthSubmit;
    window.handleLogout = handleLogout;
    window.toggleAuthMode = toggleAuthMode;
    window.renderMacroProgress = renderMacroProgress;
    window.renderMuscleVolumeDashboard = renderMuscleVolumeDashboard;
    window.esportaWorkoutPDF = esportaWorkoutPDF;
    window.switchTab = switchTab;
    window.renderCurrentView = renderCurrentView;
    
    console.log(">>> Tutti i moduli caricati con successo e funzioni globali registrate! <<<");
});