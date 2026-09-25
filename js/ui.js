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
import { MyCoatch } from '../mycoatch/index.js';

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
// Spostato o richiamabile dal sottomenu "Strumenti e gestione" -> "Importa scheda"
// ==========================================
export function renderUploadCard(onFileProcessed) {
    const uploadWrapper = document.createElement('div');
    uploadWrapper.style.cssText = 'background: var(--bg-card, #18181b); border: 2px dashed #3f3f46; border-radius: 12px; padding: 20px; margin: 10px 0; text-align: center; transition: all 0.2s ease;';
    
    uploadWrapper.innerHTML = `
        <input type="file" id="universal-coach-file" accept=".xlsx, .xlsm, .xml, .csv, .pdf" style="display: none;" />
        <label for="universal-coach-file" style="cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <span style="font-size: 2rem;">📥</span>
            <span style="font-weight: 600; color: #f4f4f5; font-size: 1rem;">Seleziona la scheda del coach (PDF, Excel o XML)</span>
            <span style="font-size: 0.8rem; color: #a1a1aa;">Trascina o carica il file per importare automaticamente i dati nella webapp.</span>
            <span style="font-size: 0.75rem; color: #f59e0b; margin-top: 6px; font-weight: 500;">⚠️ Nota: Per la lettura dei file PDF è richiesta una connessione a internet attiva.</span>
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
            
            const labelSpan = uploadWrapper.querySelector('span:nth-child(2)');
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
// 3. EVENT DELEGATION TIMER STATICO
// ==========================================

// ==========================================
// FUNZIONE DI SUPPORTO: RECUPERO SICURO MESOCICLO ATTIVO
// ==========================================
function getActiveYearAndMeso() {
    const yearsObj = state.workoutData?.history?.years || {};
    const currentYear = new Date().getFullYear().toString();
    
    // Cerca prima l'anno corrente, altrimenti prende il primo anno disponibile nello storico
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
// 3. EVENT DELEGATION TIMER E CONTROLLI MESOCICLO
// ==========================================
document.addEventListener('click', (e) => {
    if (!e.target) return;
    
    // Gestione timer di recupero
    if (e.target.id === 'timer-minus-15') {
        adjustTimer(-15, handleTick, handleComplete);
    } else if (e.target.id === 'timer-plus-30') {
        adjustTimer(30, handleTick, handleComplete);
    } else if (e.target.id === 'stop-timer-btn' || e.target.id === 'timer-close') {
        stopTimer();
        const floatingTimerEl = document.getElementById('floating-timer');
        if (floatingTimerEl) floatingTimerEl.classList.remove('active');
    }

    // Gestione Pulsanti Mesociclo (Precedente, Successivo, Blocca/Sblocca)
    const target = e.target.closest('button');
    if (!target) return;

    const { yearData, meso, mesoIndex } = getActiveYearAndMeso();

    if (target.id === 'prev-meso-btn') {
        if (state.activeMesocycleIndex > 0) {
            state.activeMesocycleIndex--;
            localStorage.setItem('ui_active_meso', state.activeMesocycleIndex);
            renderWorkoutList();
        }
    } else if (target.id === 'next-meso-btn') {
        if (yearData && yearData.mesocycles && state.activeMesocycleIndex < yearData.mesocycles.length - 1) {
            state.activeMesocycleIndex++;
            localStorage.setItem('ui_active_meso', state.activeMesocycleIndex);
            renderWorkoutList();
        }
    } else if (target.id === 'toggle-lock-meso-btn') {
        if (meso) {
            meso.locked = !meso.locked;
            saveAndSync(state.workoutData);
            renderWorkoutList(); // Ricarica la vista aggiornando immediatamente lo stato del lucchetto
        } else {
            console.warn("Impossibile trovare il mesociclo attivo per il cambio stato.");
        }
    }
});


// ==========================================
// 4. RENDERING SCHEDA ALLENAMENTO
// ==========================================
export function renderWorkoutList() {
    if (!DOM.workoutListContainer) return;
    DOM.workoutListContainer.innerHTML = '';

    if (!state.activeView) state.activeView = 'workout';
    if (state.activeView !== 'workout') {
        DOM.workoutListContainer.style.display = 'none';
        return;
    }
    
    DOM.workoutListContainer.style.display = 'block';

    const { yearData, meso, mesoIndex } = getActiveYearAndMeso();

    if (!yearData || !yearData.mesocycles || yearData.mesocycles.length === 0) {
        const emptyNotice = document.createElement('div');
        emptyNotice.className = 'day-card';
        emptyNotice.style.cssText = 'text-align: center; padding: 30px;';
        emptyNotice.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">Nessuna scheda di allenamento trovata. Vai su <strong>Strumenti e gestione -> Importa scheda</strong> per caricarne una.</p>`;
        DOM.workoutListContainer.appendChild(emptyNotice);
        return;
    }

    const isPastMeso = meso.locked || false;
    const activeWeekNum = state.activeWeek || 1;
    const targetWeek = (meso.weeks || []).find(w => w.weekNumber === activeWeekNum) || meso.weeks?.[0];

    if (!targetWeek) return;

    // ❌ RIMOSSE LE CHIAMATE A updateMesocycleUI() e updateMesocycleLockUI() CHE CAUSAVANO IL CONFLITTO

    // BANNER MESOCICLO BLOCCATO
    if (isPastMeso) {
        const archiveBadge = document.createElement('div');
        archiveBadge.style.cssText = 'background: #fffbebf1; border: 1px solid #fcd34d; color: #b45309; padding: 8px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; margin-bottom: 15px; display: flex; align-items: center; gap: 6px;';
        archiveBadge.innerHTML = '🔒 <span><strong>Mesociclo Bloccato:</strong> I dati sono congelati in sola lettura. Clicca sul tasto Sblocca per modificarli.</span>';
        DOM.workoutListContainer.appendChild(archiveBadge);
    }
/* Sotto c'è il codice originale
document.addEventListener('click', (e) => {
    if (!e.target) return;
    // Gestione timer di recupero
    if (e.target.id === 'timer-minus-15') {
        adjustTimer(-15, handleTick, handleComplete);
    } else if (e.target.id === 'timer-plus-30') {
        adjustTimer(30, handleTick, handleComplete);
    } else if (e.target.id === 'stop-timer-btn' || e.target.id === 'timer-close') {
        stopTimer();
        const floatingTimerEl = document.getElementById('floating-timer');
        if (floatingTimerEl) floatingTimerEl.classList.remove('active');
    }
    // Gestione Pulsanti Mesociclo (Precedente, Successivo, Blocca/Sblocca)
    const target = e.target.closest('button');
    if (!target) return;

    // 🧠 Ricerca sicura del mesociclo attivo indipendentemente dalla chiave dell'anno
    const yearsObj = state.workoutData?.history?.years || {};
    const yearKeys = Object.keys(yearsObj);
    const yearData = yearKeys.length > 0 ? yearsObj[yearKeys[0]] : null;
    const mesoIndex = state.activeMesocycleIndex || 0;
    const meso = yearData?.mesocycles?.[mesoIndex];

    if (target.id === 'prev-meso-btn') {
        if (state.activeMesocycleIndex > 0) {
            state.activeMesocycleIndex--;
            localStorage.setItem('ui_active_meso', state.activeMesocycleIndex);
            renderWorkoutList();
        }
    } else if (target.id === 'next-meso-btn') {
        if (yearData && yearData.mesocycles && state.activeMesocycleIndex < yearData.mesocycles.length - 1) {
            state.activeMesocycleIndex++;
            localStorage.setItem('ui_active_meso', state.activeMesocycleIndex);
            renderWorkoutList();
        }
    } else if (target.id === 'toggle-lock-meso-btn') {
        if (meso) {
            meso.locked = !meso.locked;
            saveAndSync(state.workoutData);
            renderWorkoutList();
        } else {
            console.warn("Impossibile trovare il mesociclo attivo per il cambio stato.");
        }
    }
});


// ==========================================
// 4. RENDERING SCHEDA ALLENAMENTO
// ==========================================
export function renderWorkoutList() {
    if (!DOM.workoutListContainer) return;
    DOM.workoutListContainer.innerHTML = '';

    if (!state.activeView) state.activeView = 'workout';
    if (state.activeView !== 'workout') {
        DOM.workoutListContainer.style.display = 'none';
        return;
    }
    
    DOM.workoutListContainer.style.display = 'block';

    // NOTA: Il box di upload è stato rimosso da qui ed è ora integrato nel sottomenu Strumenti e gestione.

    const yearsObj = state.workoutData?.history?.years || {};
    const currentYear = new Date().getFullYear().toString();
    const yearData = yearsObj[currentYear];

    if (!yearData || !yearData.mesocycles || yearData.mesocycles.length === 0) {
        const emptyNotice = document.createElement('div');
        emptyNotice.className = 'day-card';
        emptyNotice.style.cssText = 'text-align: center; padding: 30px;';
        emptyNotice.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">Nessuna scheda di allenamento trovata per il ${currentYear}. Vai su <strong>Strumenti e gestione -> Importa scheda</strong> per caricarne una.</p>`;
        DOM.workoutListContainer.appendChild(emptyNotice);
        return;
    }

    const mesoIndex = state.activeMesocycleIndex || 0;
    const meso = yearData.mesocycles[mesoIndex] || yearData.mesocycles[0];
    const isPastMeso = meso.locked || false;
    const activeWeekNum = state.activeWeek || 1;
    const targetWeek = (meso.weeks || []).find(w => w.weekNumber === activeWeekNum) || meso.weeks?.[0];

    if (!targetWeek) return;

    updateMesocycleUI();
    updateMesocycleLockUI();

    // BANNER MESOCICLO BLOCCATO
    if (isPastMeso) {
        const archiveBadge = document.createElement('div');
        archiveBadge.style.cssText = 'background: #fffbebf1; border: 1px solid #fcd34d; color: #b45309; padding: 8px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; margin-bottom: 15px; display: flex; align-items: center; gap: 6px;';
        archiveBadge.innerHTML = '🔒 <span><strong>Mesociclo Bloccato:</strong> I dati sono congelati in sola lettura. Clicca sul lucchetto in alto per sbloccarlo.</span>';
        DOM.workoutListContainer.appendChild(archiveBadge);
    }
    
     Fine codice originale */
    
    // BARRA NAVIGAZIONE GIORNI
    // --- BOX UNIFICATO IN SEQUENZA ---
    const unifiedHeaderBox = document.createElement('div');
    unifiedHeaderBox.className = 'unified-header-box';

    // 1. Tab di selezione mesociclo con etichetta dinamica per il blocco/sblocco
    const mesoRow = document.createElement('div');
    mesoRow.style.cssText = 'display: flex; gap: 6px; align-items: center;';
    mesoRow.innerHTML = `
        <label style="font-size: 0.8rem; font-weight: 600;">Mesociclo:</label>
        <button class="btn btn-secondary" id="prev-meso-btn" style="padding: 2px 6px;">-</button>
        <span id="meso-display" style="font-weight: 700; font-size: 0.9rem;">${mesoIndex + 1}</span>
        <button class="btn btn-secondary" id="next-meso-btn" style="padding: 2px 6px;">+</button>
        <button class="btn btn-secondary" id="toggle-lock-meso-btn" style="padding: 2px 8px; font-size: 0.75rem;" title="Blocca/Sblocca Mesociclo">${meso.locked ? '🔒 Sblocca' : '🔓 Blocca'}</button>
    `;
    unifiedHeaderBox.appendChild(mesoRow);

    // 2. Tab di selezione settimana
    const weekRow = document.createElement('div');
    weekRow.style.cssText = 'display: flex; gap: 6px; align-items: center; background: var(--card-bg); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-color); width: fit-content; color: var(--text-color);';
    const weeksOptions = (meso.weeks || []).map(w => `<option value="${w.weekNumber}" ${w.weekNumber === targetWeek.weekNumber ? 'selected' : ''}>${w.weekNumber}</option>`).join('');
    weekRow.innerHTML = `
        <label for="week-selector" style="font-size: 0.85rem; font-weight: 700;">Settimana:</label>
        <select id="week-selector" style="font-size: 0.85rem; padding: 2px 4px; background: var(--block-bg); color: var(--text-color); border: 1px solid var(--border-color); border-radius: 4px;">
            ${weeksOptions}
        </select>
    `;
    const weekSelectEl = weekRow.querySelector('#week-selector');
    weekSelectEl.onchange = (e) => {
        state.activeWeek = parseInt(e.target.value);
        localStorage.setItem('ui_active_week', state.activeWeek);
        renderWorkoutList();
    };
    unifiedHeaderBox.appendChild(weekRow);

    // 3. Tab di selezione giorno
    const dayTabsContainer = document.createElement('div');
    dayTabsContainer.className = 'day-tabs';
    dayTabsContainer.style.cssText = 'display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px;';
    const activeDayNum = state.activeDay || 1;
    (targetWeek.days || []).forEach((day, idx) => {
        const dayBtn = document.createElement('button');
        const dayIndex = idx + 1;
        dayBtn.className = `btn ${dayIndex === activeDayNum ? 'btn-primary' : 'btn-secondary'}`;
        dayBtn.style.cssText = `padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; white-space: nowrap; ${dayIndex === activeDayNum ? 'background: #0284c7; color: #fff;' : 'background: #f1f5f9; color: #475569;'}`;
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

    // 4. Riassunto (es: Giorno 4, Mesociclo 1 - Settimana 1)
    const summaryRow = document.createElement('div');
    summaryRow.style.cssText = 'font-size: 1.1rem; font-weight: 800; color: #0284c7; margin-top: 4px;';
    summaryRow.textContent = `${currentDay.dayName || 'Giorno ' + activeDayNum}, Mesociclo ${mesoIndex + 1} - Settimana ${targetWeek.weekNumber}`;
    unifiedHeaderBox.appendChild(summaryRow);

    // 5. Timer di sessione
    const timerRow = document.createElement('div');
    timerRow.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; background: var(--block-bg); color: var(--text-color); padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-color); width: fit-content; font-size: 0.85rem;';
    timerRow.innerHTML = `
        <span class="timer-dot" style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%;"></span>
        <span class="timer-icon">⏱️</span>
        <span id="live-session-timer" style="font-weight: 700; font-family: monospace; color: var(--text-color);">0:00</span>
    `;
    unifiedHeaderBox.appendChild(timerRow);

    DOM.workoutListContainer.appendChild(unifiedHeaderBox);

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
            groupWrapper.style.cssText = `border: 2px solid #0284c7; background: rgba(2, 132, 199, 0.02); border-radius: 12px; padding: 12px; margin-bottom: 20px; position: relative;`;

            groupWrapper.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px dashed #bae6fd; padding-bottom: 6px;">
                    <span style="font-size: 0.75rem; font-weight: 800; color: #0284c7; background: #e0f2fe; padding: 3px 10px; border-radius: 6px; text-transform: uppercase;">
                        🔗 ${groupType.toUpperCase()} (BLOCCO ${currentGroupBase}) - NO PAUSA INTERMEDIA
                    </span>
                    <span style="font-size: 0.7rem; color: #64748b; font-style: italic;">Recupero al termine del blocco</span>
                </div>
            `;

            while (i < exercises.length && exercises[i].groupBase === currentGroupBase && exercises[i].groupType === groupType) {
                const currentEx = exercises[i];
                const card = createSingleExerciseCard(currentEx, i, currentDay, mesoIndex, targetWeek, activeDayNum, isPastMeso);
                appendCoachingFeedbackCard(card, currentEx.name);
                groupWrapper.appendChild(card);
                updatePlatesBadgeUI(i);
                i++;
            }

            DOM.workoutListContainer.appendChild(groupWrapper);
        } else {
            const card = createSingleExerciseCard(ex, i, currentDay, mesoIndex, targetWeek, activeDayNum, isPastMeso);
            appendCoachingFeedbackCard(card, ex.name);
            DOM.workoutListContainer.appendChild(card);
            updatePlatesBadgeUI(i);
            i++;
        }
    }

    bindWorkoutTableEvents(currentDay, isPastMeso, renderWorkoutList);
}
function appendCoachingFeedbackCard(exerciseContainer, exerciseName) {
    const historyYears = state.workoutData?.history?.years || {};
    let exerciseHistory = [];

    // 🛠️ RISOLTO: Raccoglie i blocchi di sessione passati estraendo l'array reale 'loggedSets'
    Object.values(historyYears).forEach(yearObj => {
        (yearObj.mesocycles || []).forEach(meso => {
            (meso.weeks || []).forEach(week => {
                (week.days || []).forEach(day => {
                    (day.exercises || []).forEach(ex => {
                        const currentName = ex.name || ex.nome;
                        const sets = ex.loggedSets || ex.sets || [];
                        if (currentName === exerciseName && sets.length > 0) {
                            // Salva l'intera sessione con i suoi set compilati per l'analisi longitudinale
                            exerciseHistory.push(ex);
                        }
                    });
                });
            });
        });
    });

    if (exerciseHistory.length === 0) return;

    // Interroga MyCoatch per ottenere il feedback di progressione
    const advice = MyCoatch.evaluateProgress(exerciseHistory);
    if (!advice) return;

    // Crea il contenitore grafico per il consiglio sotto la scheda dell'esercizio
    const coachingBox = document.createElement('div');
        coachingBox.style.cssText = "margin-top: 8px; padding: 8px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 500; border-left: 4px solid;";

        // Mostriamo i feedback importanti (incrementi, stalli o regolazioni), ma eliminiamo il blocco "Target" neutro
        if (advice.action === "INCREMENT_LOAD") {
            coachingBox.style.background = "rgba(16, 185, 129, 0.1)";
            coachingBox.style.borderColor = "#10b981";
            coachingBox.style.color = "#065f46";
            coachingBox.innerHTML = `🔥 <strong>MyCoatch Progression:</strong> ${advice.message}`;
        } else if (advice.action === "TRIGGER_DELOAD_OR_VARIATION") {
            coachingBox.style.background = "rgba(239, 68, 68, 0.1)";
            coachingBox.style.borderColor = "#ef4444";
            coachingBox.style.color = "#991b1b";
            coachingBox.innerHTML = `⚠️ <strong>MyCoatch Stallo:</strong> ${advice.message}`;
        } else if (advice.action === "REDUCE_LOAD") {
            coachingBox.style.background = "rgba(245, 158, 11, 0.1)";
            coachingBox.style.borderColor = "#f59e0b";
            coachingBox.style.color = "#92400e";
            coachingBox.innerHTML = `⚠️ <strong>MyCoatch Regolazione:</strong> ${advice.message}`;
        } else {
            return; // Esce senza mostrare alcun banner se si tratta di un semplice "Target"
        }

        exerciseContainer.appendChild(coachingBox);
    }
