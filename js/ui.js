// ui_2.js - Gestione interfaccia utente, eventi DOM e componenti visivi

// ==========================================
// 1. IMPORT & ELEMENTI DOM
// ==========================================
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { 
    startTimer, 
    stopTimer, 
    adjustTimer, 
    parseRecoveryTime,
    handleTick,
    handleComplete 
} from './timer.js';
import { updateMesocycleUI, updateMesocycleLockUI } from './mesocycle.js';
import { enableCardSwipeGesture } from './gestures.js';
import { createSingleExerciseCard, updatePlatesBadgeUI } from './exerciseCard.js';
import { updateSessionAndCompletionState, updateSessionHeaderUI } from './sessionTimer.js';
import { bindWorkoutTableEvents } from './workoutEvents.js';

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

    const yearsObj = state.workoutData?.history?.years || {};
    const currentYear = new Date().getFullYear().toString();
    const yearData = yearsObj[currentYear];

    if (!yearData || !yearData.mesocycles || yearData.mesocycles.length === 0) {
        DOM.workoutListContainer.innerHTML = `
            <div class="day-card" style="text-align: center; padding: 30px;">
                <p style="color: var(--text-muted); font-size: 0.9rem;">Nessuna scheda di allenamento trovata per il ${currentYear}.</p>
            </div>`;
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
}