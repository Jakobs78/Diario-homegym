// main.js
import { CONFIG } from './config.js';
import { state } from './state.js';
import { getFromLocalStorage, saveAndSync, clearLocalData } from './storage.js';
import { pullDataFromSupabase, loginUser, logoutUser, signupUser } from './sync.js';
import { renderWorkoutList, showNotification, switchView } from './ui.js';
import { startTimer, stopTimer, adjustTimer } from './timer.js';
import { generatePDFReport } from './pdfExport.js';
import { exportToCSV, importWorkoutPlan, importProgressCSV } from './csvHandler.js';
import { initTheme, toggleTheme } from './theme.js';

// --- LOGOUT GLOBALE ---
window.handleLogout = async function() {
    const success = await logoutUser();
    if (success) {
        state.currentUser = null;
        state.workoutData.athlete.email = "";
        
        const userInfoBar = document.getElementById('user-info-bar');
        if (userInfoBar) userInfoBar.style.display = 'none';
        
        const emailDisplay = document.getElementById('user-email-display');
        if (emailDisplay) emailDisplay.textContent = '';
        
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay) authOverlay.style.display = 'flex';
        
        showNotification('Sei uscito dall\'account.');
    }
};

// --- INIZIALIZZAZIONE APP ---
async function initApp() {
    console.log(`Avvio Advanced Workout Tracker v${CONFIG.APP_VERSION}`);
    
    initTheme();
    
    let data = getFromLocalStorage();
    state.workoutData = data;
    
    if (state.currentUser && navigator.onLine) {
        const remoteData = await pullDataFromSupabase(state.currentUser);
        if (remoteData && remoteData.history) {
            state.workoutData = remoteData;
            saveAndSync(remoteData);
        }
    }
    
    renderWorkoutList();
    setupEventListeners();
    setupAuthListeners();
}

// --- COLLEGAMENTO DI TUTTI GLI EVENTI DELL'HTML ---
function setupEventListeners() {
    // 1. Tema & Logout
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
    document.getElementById('user-info-bar')?.addEventListener('click', window.handleLogout);
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);

    // 2. Cambio Mesociclo (- e +)
    document.getElementById('prev-meso-btn')?.addEventListener('click', () => changeMesocycle(-1));
    document.getElementById('next-meso-btn')?.addEventListener('click', () => changeMesocycle(1));
    
    // 3. Menu Analisi & Manuale
    document.getElementById('analyticsMenu')?.addEventListener('change', (e) => switchView(e.target.value));
    document.getElementById('manual-btn')?.addEventListener('click', () => switchView('manual'));
    
    // 4. Utility, Import/Export & PDF
    document.getElementById('import-plan-input')?.addEventListener('change', (e) => importWorkoutPlan(e));
    document.getElementById('export-csv-btn')?.addEventListener('click', () => exportToCSV(state.workoutData));
    document.getElementById('import-history-input')?.addEventListener('change', (e) => importProgressCSV(e));
    document.getElementById('export-pdf-btn')?.addEventListener('click', () => generatePDFReport(state.workoutData));
    
    // 5. Zona Pericolosa (Reset)
    document.getElementById('reset-meso-btn')?.addEventListener('click', resetCurrentMesocycle);
    document.getElementById('clear-data-btn')?.addEventListener('click', clearLocalData);
    
    // 6. Controlli Timer
    document.getElementById('timer-minus-15')?.addEventListener('click', () => adjustTimer(-15));
    document.getElementById('timer-plus-30')?.addEventListener('click', () => adjustTimer(30));
    document.getElementById('stop-timer-btn')?.addEventListener('click', stopTimer);
    document.getElementById('timer-display')?.addEventListener('click', () => startTimer(90));
    
    // 7. Selettore Settimana
    document.getElementById('week-selector')?.addEventListener('change', (e) => {
        state.activeWeek = parseInt(e.target.value);
        renderWorkoutList();
    });
}

// --- LOGICA DI CAMBIO MESOCICLO ---
function changeMesocycle(direction) {
    if (!state.activeMesocycleIndex) state.activeMesocycleIndex = 0;
    
    const newIndex = state.activeMesocycleIndex + direction;
    if (newIndex >= 0) {
        state.activeMesocycleIndex = newIndex;
        const display = document.getElementById('meso-display');
        if (display) display.textContent = newIndex + 1;
        renderWorkoutList();
    }
}

// --- LOGICA DI RESET MESOCICLO SINGOLO ---
function resetCurrentMesocycle() {
    if (confirm("Sei sicuro di voler eliminare la scheda e i dati del mesociclo selezionato?")) {
        const currentYear = new Date().getFullYear().toString();
        const yearData = state.workoutData.history?.years?.[currentYear];
        
        if (yearData && yearData.mesocycles) {
            yearData.mesocycles.splice(state.activeMesocycleIndex || 0, 1);
            saveAndSync(state.workoutData);
            renderWorkoutList();
            showNotification("Mesociclo eliminato con successo.");
        }
    }
}

function setupAuthListeners() {
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    const authTitle = document.getElementById('auth-title');
    const authOverlay = document.getElementById('auth-overlay');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const errorDiv = document.getElementById('auth-error');

    let isSignUpMode = false;

    toggleText?.addEventListener('click', () => {
        isSignUpMode = !isSignUpMode;
        if (isSignUpMode) {
            authTitle.textContent = "Crea un Account";
            submitBtn.textContent = "Registrati";
            toggleText.textContent = "Hai già un account? Accedi";
        } else {
            authTitle.textContent = "Accedi al Diario";
            submitBtn.textContent = "Accedi";
            toggleText.textContent = "Non hai un account? Registrati";
        }
        if (errorDiv) errorDiv.style.display = 'none';
    });

    submitBtn?.addEventListener('click', async () => {
        const email = emailInput?.value.trim();
        const password = passwordInput?.value.trim();

        if (!email || !password) {
            if (errorDiv) {
                errorDiv.textContent = "Inserisci email e password.";
                errorDiv.style.display = 'block';
            }
            return;
        }

        if (errorDiv) errorDiv.style.display = 'none';

        if (isSignUpMode) {
            const user = await signupUser(email, password);
            if (user) {
                isSignUpMode = false;
                authTitle.textContent = "Accedi al Diario";
                submitBtn.textContent = "Accedi";
                toggleText.textContent = "Non hai un account? Registrati";
            }
        } else {
            const user = await loginUser(email, password);
            if (user) {
                state.currentUser = user.email;
                state.workoutData.athlete.email = user.email;
                
                if (authOverlay) authOverlay.style.display = 'none';

                const userInfoBar = document.getElementById('user-info-bar');
                if (userInfoBar) userInfoBar.style.display = 'flex';

                const emailDisplay = document.getElementById('user-email-display');
                if (emailDisplay) emailDisplay.textContent = user.email;

                const remoteData = await pullDataFromSupabase(user.email);
                if (remoteData && remoteData.history) {
                    saveAndSync(remoteData);
                } else {
                    saveAndSync(state.workoutData);
                }
                renderWorkoutList();
                showNotification(`Bentornato ${user.email}!`);
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', initApp);