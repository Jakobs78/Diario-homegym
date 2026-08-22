// importa tutti i moduli. Nel file principale HTML questo script deve essere incluso.
// js/main.js
window.handleAuthSubmit = () => console.log("Caricamento moduli in corso...");
window.handleLogout = () => console.log("Caricamento moduli in corso...");
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

    // Aggiorna i grafici se l'utente apre le viste dedicate
    if (tabId === 'macro-progress') {
        renderMacroProgress();
    } else if (tabId === 'stats') {
        renderMuscleVolumeDashboard();
    }
}

function renderCurrentView() {
    console.log("Rendering vista corrente aggiornato.");
}
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    
    // Recupero sessione
    const { data: { session } } = await supabase.auth.getSession();
    
    const authOverlay = document.getElementById('auth-overlay');
    const userInfo = document.getElementById('user-info-bar');
    const userEmail = document.getElementById('user-email-display');

    if (session) {
        state.currentUser = session.user;
        
        // Utente loggato: nascondi login e mostra barra utente
        if (authOverlay) authOverlay.style.display = 'none';
        if (userInfo) userInfo.style.display = 'flex';
        if (userEmail) userEmail.innerText = session.user.email;
        console.log("Sessione ripristinata per:", session.user.email);
    } else {
        // Utente NON loggato: assicurati che il login sia ben visibile
        if (authOverlay) authOverlay.style.display = 'flex';
        if (userInfo) userInfo.style.display = 'none';
        console.log("Nessuna sessione attiva, login richiesto.");
    }
    document.addEventListener('DOMContentLoaded', async () => {
    initTheme();

    // AGGIUNGI QUESTO ASCOLTATORE PER IL TOGGLE
    const toggleTextEl = document.getElementById('auth-toggle-text');
// TEST DA ELIMINARE
        console.log("Elemento trovato:", toggleTextEl); // da rimuovere

    if (toggleTextEl) {
        toggleTextEl.addEventListener('click', () => {
        // TEST DA ELIMINARE     
        console.log("Click rilevato!"); // da rimuovere

            toggleAuthMode();
        });
    }
});

    // --- ESPOSIZIONE GLOBALE PER GLI ONCLICK / ONCHANGE DELL'HTML ---
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
    
    console.log(">>> Tutti i 9 moduli caricati con successo! <<<");
});