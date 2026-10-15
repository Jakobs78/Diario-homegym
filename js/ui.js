// ==========================================
// MODULI: ui.js - Gestione interfaccia utente, eventi DOM, rendering schede allenamento e upload universale
// ==========================================

// ==========================================
// 1. IMPORT & ELEMENTI DOM
// ==========================================
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { stopTimer, adjustTimer, handleTick, handleComplete } from './timer.js';
import { createSingleExerciseCard, updatePlatesBadgeUI } from './exerciseCard.js';
import { updateSessionHeaderUI } from './sessionTimer.js';
import { bindWorkoutTableEvents } from './workoutEvents.js';
import { parseCoachPDF } from './pdfParser.js';
import { mapPdfTextToWorkoutData } from './pdfTextMapper.js';
import { createLiveCoachPanel, updateLiveCoachPanel, refreshLiveCoachClock, dismissLiveCoachToast } from './liveCoachUI.js';
import { toggleCurrentMesocycleLock } from './mesocycle.js';

export const DOM = {
    appContainer: document.getElementById('app-container'),
    workoutForm: document.getElementById('workout-form'),
    workoutListContainer: document.getElementById('workout-list-container'),
    timerDisplay: document.getElementById('timer-display')
};

// ==========================================
// 2. NOTIFICHE E BOTTOM SHEET
// ==========================================
export function showNotification(message) {
    alert(message);
}

// ==========================================
// 2.5 MODULO DI UPLOAD UNIVERSALE (PDF / EXCEL / XML)
// ==========================================
export function renderUploadCard(onFileProcessed) {
    const uploadWrapper = document.createElement('div');
    uploadWrapper.className = 'upload-wrapper-card text-center mb-md';
    
    uploadWrapper.innerHTML = `
        <input type="file" id="universal-coach-file" accept=".xlsx, .xlsm, .xml, .csv, .pdf" class="d-none" />
        <label for="universal-coach-file" class="upload-card-label">
            <span class="upload-icon">📥</span>
            <span class="upload-title">Seleziona la scheda del coach (PDF, Excel o XML)</span>
            <span class="upload-desc">Trascina o carica il file per importare automaticamente i dati nella webapp.</span>
            <span class="upload-warning">⚠️ Nota: Per la lettura dei file PDF è richiesta una connessione a internet attiva.</span>
        </label>
    `;

    const fileInput = uploadWrapper.querySelector('#universal-coach-file');
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        if (['xlsx', 'xlsm', 'xml', 'csv'].includes(ext)) {
            console.log("Rilevato file nativo:", file.name);
            if (typeof onFileProcessed === 'function') onFileProcessed(file, 'native');
        } else if (ext === 'pdf') {
            console.log("Rilevato file PDF, avvio parsing...", file.name);
            
            const labelSpan = uploadWrapper.querySelector('.upload-title');
            const originalText = labelSpan.textContent;
            labelSpan.textContent = "⏳ Analisi e pulizia del PDF in corso...";

            try {
                const pdfData = await parseCoachPDF(file);
                
                const mappedData = mapPdfTextToWorkoutData(pdfData.cleanedText);
                state.workoutData = mappedData;
                state.activeMesocycleIndex = 0;
                state.activeWeek = 1;
                state.activeDay = 1;

                saveAndSync();
                renderWorkoutList();

                alert(`Scheda del coach importata con successo! Pagine totali: ${pdfData.pagesCount}.`);
                
                if (typeof onFileProcessed === 'function') {
                    onFileProcessed(pdfData, 'pdf');
                }
            } catch (err) {
                console.error("Errore durante il parsing del PDF:", err);
                alert("Errore nella lettura del PDF. Assicurati di avere una connessione attiva e che il file sia valido.");
            } finally {
                labelSpan.textContent = originalText;
            }

        } else {
            alert("Formato non supportato, bro! Usa Excel, XML o PDF.");
        }
    });

    return uploadWrapper;
}

// ==========================================
// FUNZIONE DI SUPPORTO: RECUPERO SICURO MESOCICLO ATTIVO
// ==========================================
function getActiveYearAndMeso() {
    const yearsObj = state.workoutData?.history?.years || {};
    const currentYear = new Date().getFullYear().toString();
    
    let yearData = yearsObj[currentYear];
    if (!yearData || !yearData.mesocycles || yearData.mesocycles.length === 0) {
        const yearKeys = Object.keys(yearsObj);
        if (yearKeys.length > 0) {
            yearData = yearsObj[yearKeys[0]];
        }
    }
    
    const mesoIndex = state.activeMesocycleIndex || 0;
    const meso = yearData?.mesocycles?.[mesoIndex] || yearData?.mesocycles?.[0];
    return { yearData, meso, mesoIndex };
}

// ==========================================
// 3. EVENT DELEGATION UNIFICATO (TIMER & MESOCICLO)
// ==========================================
document.addEventListener('click', (e) => {
    if (!e.target) return;
    
    // Controlli Timer Flottante
    if (e.target.id === 'timer-minus-15') {
        adjustTimer(-15, handleTick, handleComplete);
        return;
    } else if (e.target.id === 'timer-plus-30') {
        adjustTimer(30, handleTick, handleComplete);
        return;
    } else if (e.target.id === 'stop-timer-btn' || e.target.id === 'timer-close') {
        stopTimer();
        const floatingTimerEl = document.getElementById('floating-timer');
        if (floatingTimerEl) floatingTimerEl.classList.remove('active');
        return;
    }

    const clickedBtn = e.target.closest('button');
    if (!clickedBtn) return;

    const { yearData } = getActiveYearAndMeso();

    if (clickedBtn.id === 'prev-meso-btn') {
        if (state.activeMesocycleIndex > 0) {
            state.activeMesocycleIndex--;
            localStorage.setItem('ui_active_meso', state.activeMesocycleIndex);
            renderWorkoutList();
        }
    } else if (clickedBtn.id === 'next-meso-btn') {
        if (yearData && yearData.mesocycles && state.activeMesocycleIndex < yearData.mesocycles.length - 1) {
            state.activeMesocycleIndex++;
            localStorage.setItem('ui_active_meso', state.activeMesocycleIndex);
            renderWorkoutList();
        }
    } else if (clickedBtn.id === 'toggle-lock-meso-btn') {
        e.preventDefault();
        toggleCurrentMesocycleLock();
    }
});

// ==========================================
// 4. RENDERING SCHEDA ALLENAMENTO
// ==========================================
export function renderWorkoutList() {
    // Cambiare esercizio, settimana o seduta non deve lasciare consigli obsoleti.
    dismissLiveCoachToast();
    if (!DOM.workoutListContainer) return;
    DOM.workoutListContainer.innerHTML = '';

    if (!state.activeView) state.activeView = 'workout';
    if (state.activeView !== 'workout') {
        DOM.workoutListContainer.classList.add('d-none');
        return;
    }
    
    DOM.workoutListContainer.classList.remove('d-none');

    const { yearData, meso, mesoIndex } = getActiveYearAndMeso();

    if (!yearData || !yearData.mesocycles || yearData.mesocycles.length === 0) {
        const emptyNotice = document.createElement('div');
        emptyNotice.className = 'day-card text-center padding-lg';
        emptyNotice.innerHTML = `<p class="text-muted text-sm m-0">Nessuna scheda di allenamento trovata. Vai su <strong>Strumenti e gestione -> Importa scheda</strong> per caricarne una.</p>`;
        DOM.workoutListContainer.appendChild(emptyNotice);
        return;
    }

    const isPastMeso = Boolean(meso.locked);
    const activeWeekNum = state.activeWeek || 1;
    const targetWeek = (meso.weeks || []).find(w => w.weekNumber === activeWeekNum) || meso.weeks?.[0];

    if (!targetWeek) return;

    // BANNER MESOCICLO BLOCCATO
    if (isPastMeso) {
        const archiveBadge = document.createElement('div');
        archiveBadge.className = 'meso-locked-badge mb-md flex-center gap-md';
        archiveBadge.innerHTML = '🔒 <span><strong>Mesociclo Bloccato:</strong> I dati sono congelati in sola lettura. Clicca sul tasto Sblocca per modificarli.</span>';
        DOM.workoutListContainer.appendChild(archiveBadge);
    }
    
    // BARRA NAVIGAZIONE GIORNI - BOX UNIFICATO
    const unifiedHeaderBox = document.createElement('div');
    unifiedHeaderBox.className = 'unified-header-box';

   // 1. Tab di selezione mesociclo
    const isLocked = Boolean(meso.locked);
    const mesoRow = document.createElement('div');
    mesoRow.className = 'flex-center gap-sm';
    mesoRow.innerHTML = `
        <label class="text-sm font-semibold">Mesociclo:</label>
        <button class="btn btn-secondary btn-mini" id="prev-meso-btn">-</button>
        <span id="meso-display" class="font-bold text-sm">${mesoIndex + 1}</span>
        <button class="btn btn-secondary btn-mini" id="next-meso-btn">+</button>
        <button class="btn btn-secondary btn-sm ${isLocked ? 'is-locked' : ''}" id="toggle-lock-meso-btn" title="Blocca/Sblocca Mesociclo">
            ${isLocked ? '🔒 Sblocca' : '🔓 Blocca'}
        </button>
    `;
    unifiedHeaderBox.appendChild(mesoRow);
    
    
    // 2. Tab di selezione settimana
    const weekRow = document.createElement('div');
    weekRow.className = 'week-selector-container flex-center gap-sm';
    const weeksOptions = (meso.weeks || []).map(w => `<option value="${w.weekNumber}" ${w.weekNumber === targetWeek.weekNumber ? 'selected' : ''}>${w.weekNumber}</option>`).join('');
    weekRow.innerHTML = `
        <label for="week-selector" class="text-sm font-bold">Settimana:</label>
        <select id="week-selector" class="week-select-input">
            ${weeksOptions}
        </select>
    `;
    const weekSelectEl = weekRow.querySelector('#week-selector');
    weekSelectEl.onchange = (e) => {
        state.activeWeek = parseInt(e.target.value, 10);
        localStorage.setItem('ui_active_week', state.activeWeek);
        renderWorkoutList();
    };
    unifiedHeaderBox.appendChild(weekRow);

    // 3. Tab di selezione giorno
    const dayTabsContainer = document.createElement('div');
    dayTabsContainer.className = 'day-tabs flex-row gap-md';
    const activeDayNum = state.activeDay || 1;
    (targetWeek.days || []).forEach((day, idx) => {
        const dayBtn = document.createElement('button');
        const dayIndex = idx + 1;
        dayBtn.className = `btn ${dayIndex === activeDayNum ? 'btn-primary active-day-btn' : 'btn-secondary inactive-day-btn'}`;
        dayBtn.textContent = day.dayName || `Giorno ${dayIndex}`;
        dayBtn.onclick = () => {
            state.activeDay = dayIndex;
            localStorage.setItem('ui_active_day', state.activeDay);
            renderWorkoutList();
        };
        dayTabsContainer.appendChild(dayBtn);
    });
    unifiedHeaderBox.appendChild(dayTabsContainer);

    const currentDay = targetWeek.days?.[activeDayNum - 1] || targetWeek.days?.[0];
    if (!currentDay) return;

    // 4. Riassunto
    const summaryRow = document.createElement('div');
    summaryRow.className = 'workout-summary-title mt-sm';
    summaryRow.textContent = `${currentDay.dayName || 'Giorno ' + activeDayNum}, Mesociclo ${mesoIndex + 1} - Settimana ${targetWeek.weekNumber}`;
    unifiedHeaderBox.appendChild(summaryRow);

    // 5. Timer di sessione
    const timerRow = document.createElement('div');
    timerRow.className = 'session-timer-box flex-center gap-sm';
    timerRow.innerHTML = `
        <span class="timer-dot"></span>
        <span class="timer-icon">⏱️</span>
        <span id="live-session-timer" class="session-timer-text">0:00</span>
    `;
    unifiedHeaderBox.appendChild(timerRow);

    DOM.workoutListContainer.appendChild(unifiedHeaderBox);
    DOM.workoutListContainer.appendChild(createLiveCoachPanel(currentDay, { readOnly: isPastMeso }));

    if (currentDay.sessionStart) {
        const startDate = new Date(currentDay.sessionStart).toDateString();
        const todayDate = new Date().toDateString();
        if (startDate !== todayDate && !currentDay.completed) {
            currentDay.sessionStart = null;
            currentDay.accumulatedSeconds = 0;
            currentDay.isPaused = false;
        }
    }

    if (window._sessionTimerInterval) {
        clearInterval(window._sessionTimerInterval);
    }

    window._sessionTimerInterval = setInterval(() => {
        const timerEl = document.getElementById('live-session-timer');
        if (!timerEl || currentDay.completed || currentDay.isPaused || !currentDay.sessionStart) return;
        
        const activeSegmentSecs = Math.floor((Date.now() - currentDay.sessionStart) / 1000);
        const totalSecs = (currentDay.accumulatedSeconds || 0) + activeSegmentSecs;
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        // Il coach segue l'avanzamento senza ricaricare le schede a ogni secondo.
        if (totalSecs % 10 === 0) refreshLiveCoachClock(currentDay);
    }, 1000);

    updateSessionHeaderUI(currentDay, renderWorkoutList);

    // RENDER CARDS ESERCIZI
    const exercises = currentDay.exercises || [];
    let i = 0;

    while (i < exercises.length) {
        const ex = exercises[i];

        if (ex.groupType && ex.groupBase) {
            const currentGroupBase = ex.groupBase;
            const groupType = ex.groupType;

            const groupWrapper = document.createElement('div');
            groupWrapper.className = 'exercise-group-wrapper mb-lg';

            groupWrapper.innerHTML = `
                <div class="group-header flex-between mb-md">
                    <span class="group-title-badge">
                        🔗 ${groupType.toUpperCase()} (BLOCCO ${currentGroupBase}) - NO PAUSA INTERMEDIA
                    </span>
                    <span class="group-subtitle">Recupero al termine del blocco</span>
                </div>
            `;

            while (i < exercises.length && exercises[i].groupBase === currentGroupBase && exercises[i].groupType === groupType) {
                const currentEx = exercises[i];
                const card = createSingleExerciseCard(currentEx, i, currentDay, mesoIndex, targetWeek, activeDayNum, isPastMeso);
                groupWrapper.appendChild(card);
                updatePlatesBadgeUI(i);
                i++;
            }

            DOM.workoutListContainer.appendChild(groupWrapper);
        } else {
            const card = createSingleExerciseCard(ex, i, currentDay, mesoIndex, targetWeek, activeDayNum, isPastMeso);
            DOM.workoutListContainer.appendChild(card);
            updatePlatesBadgeUI(i);
            i++;
        }
    }

    bindWorkoutTableEvents(currentDay, isPastMeso, renderWorkoutList);
    // Ora le input delle schede esistono: eventuali pulsanti di suggerimento
    // possono riferirsi solo a set futuri realmente modificabili.
    updateLiveCoachPanel(currentDay, { readOnly: isPastMeso });
}

