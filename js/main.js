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

// --- INIZIALIZZAZIONE ALL'AVVIO ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    console.log(">>> Tutti i 9 moduli caricati con successo! Diario Home Gym pronto. <<<");
});