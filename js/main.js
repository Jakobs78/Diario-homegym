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

// Funzione per parsare e renderizzare la scheda CSV dell'allenamento
async function loadAndRenderWorkoutPlan() {
    const rawCsv = localStorage.getItem('workout_plan_csv_raw');
    if (!rawCsv) return;

    try {
        const lines = rawCsv.split(/\r\n|\n/);
        if (lines.length < 2) return;

        // Rileva separatore (virgola o punto e virgola)
        const header = lines[0];
        const delimiter = header.includes(';') ? ';' : ',';
        const headers = header.split(delimiter).map(h => h.replace(/^"|"$/g, '').trim());

        state.workoutPlan = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Gestione base dei campi divisi da separatore
            const currentLine = line.split(delimiter);
            if (currentLine.length >= headers.length) {
                let obj = {};
                headers.forEach((h, index) => {
                    let val = currentLine[index] ? currentLine[index].replace(/^"|"$/g, '').trim() : '';
                    obj[h] = val;
                });
                state.workoutPlan.push(obj);
            }
        }
        console.log(`Scheda caricata con successo: ${state.workoutPlan.length} esercizi trovati.`);
        // Qui potrai aggiungere la chiamata alla funzione grafica che popola i giorni se esiste, oppure la pagina userà lo stato
    } catch (err) {
        console.error("Errore nel parsing del CSV della scheda:", err);
    }
}

function renderCurrentView() {
    console.log("Rendering vista corrente aggiornato.");
    loadAndRenderWorkoutPlan();
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

        // SCARICA I DATI DA SUPABASE AL LOCALSTORAGE
        try {
            const { data: cloudData, error } = await supabase
                .from('workout_data')
                .select('data_key, valore')
                .eq('user_id', session.user.id);

            if (!error && cloudData && cloudData.length > 0) {
                let localData = JSON.parse(localStorage.getItem(state.STORAGE_KEY_DATA)) || {};
                cloudData.forEach(row => {
                    localData[row.data_key] = row.valore === 'true' ? true : (row.valore === 'false' ? false : row.valore);
                });
                localStorage.setItem(state.STORAGE_KEY_DATA, JSON.stringify(localData));
                console.log("Dati sincronizzati da Supabase al browser.");
            }
        } catch (err) {
            console.error("Errore durante il recupero dei dati da Supabase:", err);
        }

    } else {
        if (authOverlay) authOverlay.style.display = 'flex';
        if (userInfo) userInfo.style.display = 'none';
        console.log("Nessuna sessione attiva, login richiesto.");
    }

    // 2. Ascoltatore per il cambio tra Login e Registrazione
    const toggleTextEl = document.getElementById('auth-toggle-text');
    if (toggleTextEl) {
        toggleTextEl.addEventListener('click', () => {
            toggleAuthMode();
        });
    }

    // 3. Caricamento iniziale scheda e vista
    await loadAndRenderWorkoutPlan();
    renderCurrentView();

    // 4. Esposizione globale per gli onclick dell'HTML
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