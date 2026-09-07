// ui_2.js - Gestione interfaccia utente, eventi DOM e componenti visivi

// ==========================================
// 1. IMPORT & ELEMENTI DOM
// ==========================================
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { isValueOutOfRange } from './helpers.js';
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

    updateSessionHeaderUI(currentDay);

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

    bindWorkoutTableEvents(currentDay, isPastMeso);
}

// ==========================================
// 6. GESTIONE TEMPI SESSIONE & EVENTI TABELLA
// ==========================================
function updateSessionAndCompletionState(currentDay) {
    const exercises = currentDay.exercises || [];
    if (exercises.length === 0) return;

    let totalSets = 0;
    let completedSets = 0;

    exercises.forEach(ex => {
        if (ex.isExcluded) return;
        (ex.loggedSets || []).forEach(set => {
            totalSets++;
            if (set.isLocked) completedSets++;
        });
    });

    if (completedSets > 0 && !currentDay.sessionStart && !currentDay.completed && !currentDay.isPaused) {
        currentDay.sessionStart = Date.now();
        currentDay.accumulatedSeconds = currentDay.accumulatedSeconds || 0;
    }

    if (totalSets > 0 && completedSets === totalSets) {
        if (currentDay.completed) return;

        const activeSegmentSecs = currentDay.sessionStart ? Math.floor((Date.now() - currentDay.sessionStart) / 1000) : 0;
        const totalSecs = (currentDay.accumulatedSeconds || 0) + activeSegmentSecs;
        const durationMinutes = Math.round(totalSecs / 60);

        currentDay.date = new Date().toISOString().split('T')[0];
        currentDay.totalDurationMinutes = Math.max(1, durationMinutes);
        currentDay.completed = true;

        currentDay.sessionStart = null; 
        currentDay.isPaused = false;
    } else if (completedSets < totalSets && currentDay.completed) {
        currentDay.completed = false;
        currentDay.totalDurationMinutes = undefined;
    }
}

function updateSessionHeaderUI(currentDay) {
    const timerEl = document.getElementById('live-session-timer');
    if (!timerEl) return;

    let timerWrapper = timerEl.parentElement;
    if (!timerWrapper.classList.contains('session-timer-wrapper')) {
        timerWrapper.style.display = 'flex';
        timerWrapper.style.alignItems = 'center';
        timerWrapper.style.gap = '6px';
        timerWrapper.classList.add('session-timer-wrapper');
        
        const pauseSessionBtn = document.createElement('button');
        pauseSessionBtn.id = 'pause-session-timer-btn';
        pauseSessionBtn.className = 'btn btn-secondary';
        pauseSessionBtn.style.cssText = 'padding: 4px 8px; font-size: 0.75rem; display: none;';

        const actionSessionBtn = document.createElement('button');
        actionSessionBtn.id = 'reset-session-timer-btn'; 
        actionSessionBtn.style.cssText = 'padding: 4px 8px; font-size: 0.75rem; font-weight: 700; display: none;';
        
        timerEl.after(actionSessionBtn);
        actionSessionBtn.after(pauseSessionBtn);
    }

    const actionBtn = document.getElementById('reset-session-timer-btn');
    const pauseBtn = document.getElementById('pause-session-timer-btn');

    if (pauseBtn) {
        pauseBtn.onclick = () => {
            if (currentDay.completed) return;
            if (currentDay.isPaused) {
                currentDay.isPaused = false;
                currentDay.sessionStart = Date.now();
            } else {
                if (currentDay.sessionStart) {
                    const activeSegmentSecs = Math.floor((Date.now() - currentDay.sessionStart) / 1000);
                    currentDay.accumulatedSeconds = (currentDay.accumulatedSeconds || 0) + activeSegmentSecs;
                    currentDay.sessionStart = null;
                }
                currentDay.isPaused = true;
            }
            saveAndSync(state.workoutData);
            updateSessionHeaderUI(currentDay);
        };
    }

    const exercises = currentDay.exercises || [];
    let totalSets = 0;
    let completedSets = 0;
    exercises.forEach(ex => {
        if (ex.isExcluded) return;
        (ex.loggedSets || []).forEach(set => {
            totalSets++;
            if (set.isLocked) completedSets++;
        });
    });

    const isAllChecked = totalSets > 0 && completedSets === totalSets;

    if (actionBtn) {
        if (isAllChecked) {
            actionBtn.innerHTML = '🔄 Reset time';
            actionBtn.className = 'btn-reset-time';
            actionBtn.title = 'Resetta il timer per ripetere la sessione';
            actionBtn.style.display = 'inline-block';
            
            actionBtn.onclick = () => {
                if (confirm("Vuoi azzerare il timer per ripetere la sessione?")) {
                    currentDay.sessionStart = Date.now();
                    currentDay.accumulatedSeconds = 0;
                    currentDay.isPaused = false;
                    currentDay.completed = false;
                    currentDay.totalDurationMinutes = undefined;
                    
                    exercises.forEach(ex => (ex.loggedSets || []).forEach(s => s.isLocked = false));
                    
                    saveAndSync(state.workoutData);
                    renderWorkoutList();
                }
            };
        } else {
            actionBtn.innerHTML = '⏹️ Termina';
            actionBtn.className = 'btn btn-danger';
            actionBtn.style.cssText = 'padding: 4px 8px; font-size: 0.75rem;';
            actionBtn.title = 'Resetta o interrompi sessione';
            
            if (currentDay.sessionStart || currentDay.accumulatedSeconds > 0) {
                actionBtn.style.display = 'inline-block';
            } else {
                actionBtn.style.display = 'none';
            }

            actionBtn.onclick = () => {
                if (confirm("Vuoi azzerare il timer e sbloccare la sessione per questo giorno?")) {
                    currentDay.sessionStart = null;
                    currentDay.accumulatedSeconds = 0;
                    currentDay.isPaused = false;
                    currentDay.completed = false;
                    currentDay.totalDurationMinutes = undefined;
                    saveAndSync(state.workoutData);
                    renderWorkoutList();
                }
            };
        }
    }

    if (currentDay.completed && currentDay.totalDurationMinutes !== undefined) {
        timerEl.style.background = 'var(--block-bg)';
        timerEl.style.color = 'var(--success-color)';
        timerEl.textContent = `✅ ${currentDay.totalDurationMinutes} min`;
        if (pauseBtn) pauseBtn.style.display = 'none';
    } else {
        const totalSecs = (currentDay.accumulatedSeconds || 0) + (currentDay.sessionStart ? Math.floor((Date.now() - currentDay.sessionStart) / 1000) : 0);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;

        if (!currentDay.sessionStart && !currentDay.accumulatedSeconds && !currentDay.isPaused) {
            timerEl.textContent = `0:00`;
            if (pauseBtn) pauseBtn.style.display = 'none';
        } else {
            timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            if (pauseBtn) {
                pauseBtn.style.display = 'inline-block';
                pauseBtn.innerHTML = currentDay.isPaused ? '▶️ Riprendi' : '⏸️ Pausa';
            }
        }
    }
}

function bindWorkoutTableEvents(currentDay, isPastMeso) {
    if (!DOM.workoutListContainer) return;

    DOM.workoutListContainer.querySelectorAll('.set-input, .ex-user-notes').forEach(input => {
        input.addEventListener('focus', (e) => e.target.select());

        input.addEventListener('input', (e) => {
            const exIdx = e.target.dataset.ex;
            const ex = currentDay.exercises[exIdx];
            if (!ex) return;

            if (e.target.classList.contains('ex-user-notes')) {
                ex.userNotes = e.target.value;
                saveAndSync(state.workoutData);
                return;
            }

            const setIdx = parseInt(e.target.dataset.set, 10);
            const setObj = ex.loggedSets?.[setIdx];
            if (!setObj) return;

            const val = e.target.value;
            const isKg = e.target.classList.contains('set-kg');
            const isReps = e.target.classList.contains('set-reps');
            const isRpe = e.target.classList.contains('set-rpe');

            if (isKg) {
                const raw = val.trim();
                setObj.weight = raw === '' ? '' : (parseFloat(raw.replace(',', '.')) || 0);
            }
            if (isReps) setObj.reps = val;
            if (isRpe) setObj.rpe = val;

            if (setIdx === 0 && isKg) {
                updatePlatesBadgeUI(exIdx);
            }

            if (isKg || isReps) {
                const minVal = isKg ? ex.kgMin : ex.minReps;
                const maxVal = isKg ? ex.kgMax : ex.maxReps;
                const parsedVal = isKg ? val.replace(',', '.') : val;

                if (isValueOutOfRange(parsedVal, minVal, maxVal)) {
                    e.target.style.setProperty('border', '2px solid #ef4444', 'important');
                    e.target.style.setProperty('background-color', '#fef2f2', 'important');
                    e.target.style.setProperty('color', '#dc2626', 'important');
                } else {
                    e.target.style.background = '#ffffff';
                    e.target.style.borderColor = '#cbd5e1';
                    e.target.style.color = '#0f172a';
                }
            }

            saveAndSync(state.workoutData);
        });
    });

    DOM.workoutListContainer.querySelectorAll('.bar-select').forEach(select => {
        select.addEventListener('change', (e) => {
            updatePlatesBadgeUI(e.target.dataset.ex);
        });
    });

    DOM.workoutListContainer.querySelectorAll('.set-lock-check').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const exIdx = parseInt(e.target.dataset.ex, 10);
            const setIdx = parseInt(e.target.dataset.set, 10);
            
            const ex = currentDay.exercises[exIdx];
            const setObj = ex?.loggedSets?.[setIdx];
            if (!setObj) return;

            const isChecked = e.target.checked;
            setObj.isLocked = isChecked;

            const rowCard = DOM.workoutListContainer.querySelector(`.exercise-card[data-ex="${exIdx}"]`);
            const kgInput = rowCard?.querySelector(`.set-kg[data-set="${setIdx}"]`);
            const repsInput = rowCard?.querySelector(`.set-reps[data-set="${setIdx}"]`);
            const rpeInput = rowCard?.querySelector(`.set-rpe[data-set="${setIdx}"]`);

            if (isChecked) {
                if (setObj.weight === undefined || setObj.weight === '') {
                    const val = kgInput?.value || kgInput?.placeholder;
                    if (val && val !== 'Kg') {
                        setObj.weight = parseFloat(val.replace(',', '.')) || 0;
                        if (kgInput) kgInput.value = setObj.weight;
                    }
                }
                if (!setObj.reps) {
                    const val = repsInput?.value || repsInput?.placeholder;
                    if (val && val !== 'reps') {
                        setObj.reps = val;
                        if (repsInput) repsInput.value = setObj.reps;
                    }
                }
                if (!setObj.rpe) {
                    const val = rpeInput?.value || rpeInput?.placeholder;
                    if (val && val !== 'RPE') {
                        setObj.rpe = val;
                        if (rpeInput) rpeInput.value = setObj.rpe;
                    }
                }
            }

            if (isChecked && setIdx === 0) {
                ['weight', 'reps', 'rpe'].forEach(prop => {
                    const val = setObj[prop];
                    if (val !== undefined && val !== null && val !== '') {
                        const targetClass = prop === 'weight' ? '.set-kg' : (prop === 'reps' ? '.set-reps' : '.set-rpe');
                        const setRows = DOM.workoutListContainer.querySelectorAll(`${targetClass}[data-ex="${exIdx}"]`);

                        setRows.forEach((rowInput, idx) => {
                            if (idx > 0 && (!ex.loggedSets[idx][prop])) {
                                rowInput.value = val;
                                ex.loggedSets[idx][prop] = val;
                            }
                        });
                    }
                });
            }

            if (rowCard) {
                rowCard.querySelectorAll('.set-input').forEach(inp => {
                    const sIdx = parseInt(inp.dataset.set, 10);
                    const isRowLocked = ex.loggedSets[sIdx]?.isLocked || false;
                    inp.disabled = isRowLocked;

                    const isKgField = inp.classList.contains('set-kg');
                    const isRepsField = inp.classList.contains('set-reps');
                    let isOut = false;

                    if (isKgField) isOut = isValueOutOfRange(inp.value, ex.kgMin, ex.kgMax);
                    if (isRepsField) isOut = isValueOutOfRange(inp.value, ex.minReps, ex.maxReps);

                    if (isOut) {
                        inp.style.setProperty('border', '2px solid #ef4444', 'important');
                        inp.style.setProperty('background-color', '#fef2f2', 'important');
                        inp.style.setProperty('color', '#dc2626', 'important');
                    } else {
                        inp.style.background = isRowLocked ? '#f1f5f9' : '#ffffff';
                        inp.style.borderColor = '#cbd5e1';
                        inp.style.color = '#0f172a';
                    }
                });
            }

            if (isChecked) {
                const isMiddleOfGroup = ex.groupType && !ex.isGroupLast;

                if (!isMiddleOfGroup) {
                    let rawRecovery = 90;
                    for (const key of Object.keys(ex)) {
                        const lKey = key.toLowerCase();
                        if ((lKey.includes('rest') || lKey.includes('rec') || lKey.includes('tempo') || lKey.includes('pause') || lKey.includes('recupero')) && ex[key]) {
                            rawRecovery = ex[key];
                            break;
                        }
                    }
                    const recoveryTime = parseRecoveryTime(rawRecovery);
                    startTimer(recoveryTime, handleTick, handleComplete);
                }
            }

            updateSessionAndCompletionState(currentDay);
            updateSessionHeaderUI(currentDay);
            saveAndSync(state.workoutData);
            renderWorkoutList();
        });
    });

    DOM.workoutListContainer.querySelectorAll('.exercise-card').forEach(card => {
        const exIdx = card.dataset.ex;

        const toggleExclusion = () => {
            if (isPastMeso) return;
            currentDay.exercises[exIdx].isExcluded = !currentDay.exercises[exIdx].isExcluded;
            saveAndSync(state.workoutData);
            renderWorkoutList();
        };

        card.addEventListener('dblclick', (e) => {
            if (['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;
            toggleExclusion();
        });

        enableCardSwipeGesture(
            card,
            () => toggleExclusion(), 
            () => toggleExclusion()  
        );
    });
}

