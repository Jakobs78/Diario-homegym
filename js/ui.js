// ==========================================
// MODULI: ui.js - Gestione interfaccia utente, eventi DOM, rendering schede allenamento e upload universale
// ==========================================

// ==========================================
// 1. IMPORT & ELEMENTI DOM
// ==========================================
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { stopTimer, adjustTimer, handleTick, handleComplete } from './timer.js';
import { updateMesocycleUI, updateMesocycleLockUI } from './mesocycle.js';
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
document.addEventListener('click', (e) => {
    if (!e.target) return;
    if (e.target.id === 'timer-minus-15') {
        adjustTimer(-15, handleTick, handleComplete);
    } else if (e.target.id === 'timer-plus-30') {
        adjustTimer(30, handleTick, handleComplete);
    } else if (e.target.id === 'stop-timer-btn' || e.target.id === 'timer-close') {
        stopTimer();
        const floatingTimerEl = document.getElementById('floating-timer');
        if (floatingTimerEl) floatingTimerEl.classList.remove('active');
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
    
    // BARRA NAVIGAZIONE GIORNI
    const dayTabsContainer = document.createElement('div');
    dayTabsContainer.className = 'day-tabs';
    dayTabsContainer.style.cssText = 'display: flex; gap: 8px; margin-bottom: 15px; overflow-x: auto; padding-bottom: 5px;';

    const activeDayNum = state.activeDay || 1;
    (targetWeek.days || []).forEach((day, idx) => {
        const dayBtn = document.createElement('button');
        const dayIndex = idx + 1;
        dayBtn.className = `btn ${dayIndex === activeDayNum ? 'btn-primary' : 'btn-secondary'}`;
        dayBtn.style.cssText = `padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; ${dayIndex === activeDayNum ? 'background: #0284c7; color: #fff;' : 'background: #f1f5f9; color: #475569;'}`;
        dayBtn.textContent = day.dayName || `Giorno ${dayIndex}`;
        dayBtn.onclick = () => {
            state.activeDay = dayIndex;
            renderWorkoutList();
        };
        dayTabsContainer.appendChild(dayBtn);
    });
    DOM.workoutListContainer.appendChild(dayTabsContainer);

    const currentDay = targetWeek.days?.[activeDayNum - 1] || targetWeek.days?.[0];
    if (!currentDay) return;

    // HEADER SESSIONE E TIMER
    const dayHeader = document.createElement('div');
    dayHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 8px;';
    dayHeader.innerHTML = `
        <h2 style="margin: 0; color: #0284c7; font-size: 1.4rem;">${currentDay.dayName || 'Giorno ' + activeDayNum}</h2>
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span style="font-size: 0.85rem; color: #64748b; font-weight: 500;">Mesociclo ${mesoIndex + 1} - Settimana ${targetWeek.weekNumber}</span>
        </div>
    `;
    DOM.workoutListContainer.appendChild(dayHeader);

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

    // Raccoglie i log passati dell'esercizio da tutto lo storico dello state
    Object.values(historyYears).forEach(yearObj => {
        (yearObj.mesocycles || []).forEach(meso => {
            (meso.weeks || []).forEach(week => {
                (week.days || []).forEach(day => {
                    (day.exercises || []).forEach(ex => {
                        if (ex.name === exerciseName && ex.completedLogs) {
                            exerciseHistory.push(...ex.completedLogs);
                        }
                    });
                });
            });
        });
    });

    // Interroga MyCoatch per ottenere il feedback di autoregolazione
    const advice = MyCoatch.evaluateProgress(exerciseHistory);
    if (!advice) return;

    // Crea il contenitore grafico per il consiglio
    const coachingBox = document.createElement('div');
    coachingBox.style.cssText = "margin-top: 8px; padding: 6px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 500;";

    if (advice.action === "INCREMENT_LOAD") {
        coachingBox.style.background = "rgba(16, 185, 129, 0.15)";
        coachingBox.style.color = "#10b981";
        coachingBox.innerHTML = `💡 <strong>MyCoatch:</strong> ${advice.message} (+${advice.suggestedKgIncrement} kg)`;
    } else if (advice.action === "TRIGGER_DELOAD_OR_VARIATION") {
        coachingBox.style.background = "rgba(239, 68, 68, 0.15)";
        coachingBox.style.color = "#ef4444";
        coachingBox.innerHTML = `⚠️ <strong>Stallo Rilevato:</strong> ${advice.message}`;
    } else {
        coachingBox.style.background = "rgba(59, 130, 246, 0.1)";
        coachingBox.style.color = "#3b82f6";
        coachingBox.innerHTML = `🎯 <strong>Mantenimento:</strong> ${advice.message}`;
    }

    exerciseContainer.appendChild(coachingBox);
}