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
// Funzione per generare i tab dei giorni e le tabelle degli esercizi
function renderExercisesIntoUI(exercises) {
    const dayTabsContainer = document.getElementById('dynamic-day-tabs');
    const viewsContainer = document.getElementById('dynamic-views-container');
    const emptyState = document.getElementById('empty-state');
    const weekSelector = document.getElementById('week-selector');

    if (!exercises || exercises.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Recupera la settimana selezionata (default 1)
    const selectedWeek = weekSelector ? weekSelector.value : "1";

    // Filtra gli esercizi per la settimana selezionata
    const filteredExercises = exercises.filter(ex => String(ex.Settimana).trim() === String(selectedWeek));

    // Trova i giorni unici presenti in questa settimana
    const days = [...new Set(filteredExercises.map(ex => ex.Giorno))].sort((a, b) => a - b);

    if (dayTabsContainer) dayTabsContainer.innerHTML = '';
    if (viewsContainer) viewsContainer.innerHTML = '';

    if (days.length === 0) {
        viewsContainer.innerHTML = `<p style="text-align:center; padding: 20px; color: var(--text-muted);">Nessun esercizio trovato per la Settimana ${selectedWeek}</p>`;
        return;
    }

    days.forEach((day, index) => {
        const dayId = `day-${day}`;
        const isActive = index === 0 ? 'active' : '';

        // 1. Crea il pulsante del tab del giorno
        const tabBtn = document.createElement('button');
        tabBtn.className = `tab-btn ${isActive}`;
        tabBtn.innerText = `Giorno ${day}`;
        tabBtn.onclick = (e) => switchTab(dayId, e.currentTarget);
        if (dayTabsContainer) dayTabsContainer.appendChild(tabBtn);

        // 2. Crea la vista/contenitore del giorno
        const dayView = document.createElement('div');
        dayView.className = `day-view ${isActive}`;
        dayView.id = dayId;

        let exercisesHtml = `
            <div class="day-card">
                <div class="day-title">
                    <span>Giorno ${day} - Settimana ${selectedWeek}</span>
                </div>
                <div class="table-responsive">
                    <table class="workout-table" style="width:100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border-color); text-align: left;">
                                <th style="padding: 8px;">Esercizio</th>
                                <th style="padding: 8px;">Set</th>
                                <th style="padding: 8px;">Reps</th>
                                <th style="padding: 8px;">Carico</th>
                                <th style="padding: 8px;">RPE</th>
                                <th style="padding: 8px;">Note</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        // Filtra gli esercizi per questo specifico giorno e settimana
        const dayExercises = filteredExercises.filter(ex => String(ex.Giorno) === String(day));

        dayExercises.forEach(ex => {
            const carico = ex.KgMax && ex.KgMax !== '-' ? `${ex.KgMin} - ${ex.KgMax}` : (ex.KgMin || '-');
            exercisesHtml += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 8px; font-weight: 600;">${ex.Esercizio || ''}</td>
                    <td style="padding: 8px;">${ex.Set || ''}</td>
                    <td style="padding: 8px;">${ex.Reps || ''}</td>
                    <td style="padding: 8px; color: var(--accent-color);">${carico}</td>
                    <td style="padding: 8px;">${ex.RPE || ''}</td>
                    <td style="padding: 8px; font-size: 0.85rem; color: var(--text-muted);">${ex.Note || ''}</td>
                </tr>
            `;
        });

        exercisesHtml += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        dayView.innerHTML = exercisesHtml;
        if (viewsContainer) viewsContainer.appendChild(viewsContainer.appendChild ? dayView : null);
    });
}
// Funzione per parsare e renderizzare la scheda CSV dell'allenamento
async function loadAndRenderWorkoutPlan() {
    const rawCsv = localStorage.getItem('workout_plan_csv_raw');
    if (!rawCsv) {
        renderExercisesIntoUI([]);
        return;
    }

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
                // Inserisci solo se c'è un esercizio valido
                if (obj['Esercizio']) {
                    state.workoutPlan.push(obj);
                }
            }
        }
        console.log(`Scheda caricata con successo: ${state.workoutPlan.length} esercizi trovati.`);
        
        // CHIAMA LA FUNZIONE CHE DISEGNA I TAB E LE TABELLE NELLA PAGINA
        renderExercisesIntoUI(state.workoutPlan);

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