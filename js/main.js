// Entry point ed Events Listener
import { supabaseClient, STORAGE_KEY_DATA, STORAGE_KEY_PLAN } from './config.js';
import { state } from './state.js';
import { parseRestTime } from './helpers.js';
import { loadUserDataFromSupabase, saveMetaToStorage, importWorkoutPlan, exportProgressCSV, importProgressCSV, resetDiaryData, loadWorkoutPlanForCurrentMeso } from './storage.js';
import { switchTab, generateDynamicDays, renderCurrentView, startTimer, stopTimer, adjustTimer, esportaWorkoutPDF, toggleTheme, initTeme, calcPlates } from './ui.js';

window.switchTab = switchTab;
window.changeMeso = changeMeso;
window.importWorkoutPlan = importWorkoutPlan;
window.toggleTheme = toggleTheme;
window.exportProgressCSV = exportProgressCSV;
window.importProgressCSV = importProgressCSV;
window.resetDiaryData = resetDiaryData;
window.esportaWorkoutPDF = esportaWorkoutPDF;
window.adjustTimer = adjustTimer;
window.stopTimer = stopTimer;
window.handleAuthSubmit = handleAuthSubmit;
window.handleLogout = handleLogout;
window.calcPlates = calcPlates;
window.renderCurrentView = renderCurrentView;
// --- CONFIGURAZIONE WHITELIST PROPRIETARIO ---
const OWNER_EMAILS = [
    'h725-25@hotmail.it', // <-- INSERISCI QUI LA TUA REALE EMAIL DI SUPABASE
];

function isUserAllowed(user) {
    if (!user) return false;

    // Se l'email rientra nella whitelist, accesso illimitato a vita (salta il trial)
    if (OWNER_EMAILS.includes(user.email)) {
        return true;
    }

    // Controllo standard dei 15 giorni di prova per tutti gli altri utenti
    const createdAtString = user?.created_at || user?.user_metadata?.created_at;
    if (createdAtString) {
        const createdAt = new Date(createdAtString);
        const now = new Date();
        const diffDays = Math.ceil(Math.abs(now - createdAt) / (1000 * 60 * 60 * 24));
        const TRIAL_DAYS = 15;

        if (diffDays > TRIAL_DAYS) {
            return false; // Prova scaduta
        }
    }
    return true;
}

document.addEventListener('DOMContentLoaded', async () => {
    initTeme();

    document.getElementById('auth-toggle-text').addEventListener('click', () => {
        state.isSignUpMode = !state.isSignUpMode;
        document.getElementById('auth-title').innerText = state.isSignUpMode ? "Crea un Account" : "Accedi al Diario";
        document.getElementById('auth-submit-btn').innerText = state.isSignUpMode ? "Registrati" : "Accedi";
        document.getElementById('auth-toggle-text').innerText = state.isSignUpMode ? "Hai già un account? Accedi" : "Non hai un account? Registrati";
        document.getElementById('auth-error').style.display = 'none';
    });
    document.getElementById('auth-submit-btn').addEventListener('click', handleAuthSubmit);
    await checkUserSession();

    const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
    const dateInput = document.querySelector('[data-id="meta-date"]');
    const weekSelector = document.getElementById('week-selector');

    if (savedData['meta-date']) dateInput.value = savedData['meta-date'];
    else dateInput.value = new Date().toISOString().split('T')[0];
    
    if (savedData['meta-meso-num']) {
        state.currentMesoNumber = parseInt(savedData['meta-meso-num']) || 1;
    }
    document.getElementById('meso-display').innerText = state.currentMesoNumber;

    if (savedData['meta-week']) weekSelector.value = savedData['meta-week'];

    dateInput.addEventListener('change', saveMetaToStorage);
    weekSelector.addEventListener('change', () => {
        saveMetaToStorage();
        renderCurrentView();
    });
// Richiamo della funzione dinamica per il mesociclo:
    loadWorkoutPlanForCurrentMeso();
    generateDynamicDays();
    renderCurrentView();

    // Richiamo della funzione dinamica per il mesociclo:
    loadWorkoutPlanForCurrentMeso();
});

async function handleAuthSubmit() {
    console.log("1. Pulsante premuto, avvio autenticazione..."); // <-- Aggiungi questo
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const errorBox = document.getElementById('auth-error');

    errorBox.style.display = 'none';

    if (!email || !password) {
        errorBox.innerText = "Inserisci email e password.";
        errorBox.style.display = 'block';
        return;
    }

    try {
        let result;
        if (state.isSignUpMode) {
            console.log("2. Avvio registrazione utente...");
            result = await supabaseClient.auth.signUp({ email, password });
        } else {
            console.log("2. Avvio accesso utente...");
            result = await supabaseClient.auth.signInWithPassword({ email, password });
        }
        console.log("Risultato ricevuto da Supabase:", result);
        if (result.error) {
            errorBox.innerText = result.error.message;
            errorBox.style.display = 'block';
        } else {
            const user = result.data.user;
        // --- CONTROLLO ACCESSO (Trial + Whitelist) ---
            if (!isUserAllowed(user)) {
                await supabaseClient.auth.signOut();
                document.getElementById('auth-title').innerText = "Periodo di Prova Scaduto";
                errorBox.innerText = "I tuoi 15 giorni di prova gratuita sono terminati. Abbonati per continuare.";
                errorBox.style.display = 'block';
                return;
            }
            // ---------------------------------------------
            state.currentUser = user;
            await checkUserSession();
        }
    } catch (err) {
        console.error("Errore critico catturato:", err);
        errorBox.innerText = "Errore durante la connessione.";
        errorBox.style.display = 'block';
    }
}

async function checkUserSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    console.log("Sessione ricevuta da Supabase:", session);
    if (session) {
        const user = session.user;
    // --- CONTROLLO ACCESSO (Trial + Whitelist) ---
        if (!isUserAllowed(user)) {
            await supabaseClient.auth.signOut();
            document.getElementById('auth-title').innerText = "Periodo di Prova Scaduto";
            const errorBox = document.getElementById('auth-error');
            if (errorBox) {
                errorBox.innerText = "I tuoi 15 giorni di prova gratuita sono terminati. Abbonati per continuare.";
                errorBox.style.display = 'block';
            }
            state.currentUser = null;
            document.getElementById('auth-overlay').style.display = 'flex';
            document.getElementById('user-info-bar').style.display = 'none';
            return;
        }
        // ---------------------------------------------
        
        state.currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('user-info-bar').style.display = 'flex';
        document.getElementById('user-email-display').innerText = state.currentUser.email;
        await loadUserDataFromSupabase();
        if (state.workoutPlan.length > 0) renderCurrentView();
    } else {
        state.currentUser = null;
        document.getElementById('auth-overlay').style.display = 'flex';
        document.getElementById('user-info-bar').style.display = 'none';
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    location.reload();
}

async function changeMeso(delta) {
    state.currentMesoNumber += delta;
    if (state.currentMesoNumber < 1) state.currentMesoNumber = 1;
    document.getElementById('meso-display').innerText = state.currentMesoNumber;
    saveMetaToStorage();
    loadWorkoutPlanForCurrentMeso();
    generateDynamicDays();
    renderCurrentView();
}

document.addEventListener('change', async (e) => {
    if (e.target.classList.contains('check-input') || e.target.classList.contains('warmup-checkbox')) {
        const id = e.target.getAttribute('data-id');
        const isChecked = e.target.checked;
        const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
        savedData[id] = isChecked;

        if (e.target.classList.contains('check-input')) {
            if (isChecked) {
                const restValue = e.target.getAttribute('data-rest');
                const seconds = parseRestTime(restValue);
                startTimer(seconds);
            } else {
                stopTimer();
            }

            const baseId = id.substring(0, id.lastIndexOf('-'));
            const kgInput = document.querySelector(`input[data-id="${baseId}-kg"]`);
            const repInput = document.querySelector(`input[data-id="${baseId}-r"]`);
            const rpeInput = document.querySelector(`input[data-id="${baseId}-rpe"]`);

            [kgInput, repInput, rpeInput].forEach(input => {
                if (input) {
                    input.readOnly = isChecked;
                    input.style.backgroundColor = isChecked ? 'var(--block-bg)' : '';
                    input.style.opacity = isChecked ? '0.7' : '1';
                }
            });

            if (isChecked) {
                if (kgInput && kgInput.value) savedData[`${baseId}-kg`] = kgInput.value;
                if (repInput && repInput.value) savedData[`${baseId}-r`] = repInput.value;
                if (rpeInput && rpeInput.value) savedData[`${baseId}-rpe`] = rpeInput.value;
            }
        }

        localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(savedData));

        if (state.currentUser) {  
            await supabaseClient
                .from('workout_data')
                .upsert({
                    user_id: state.currentUser.id,
                    data_key: id,
                    valore: String(isChecked),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,data_key' });
        }
    }
});

