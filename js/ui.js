// ui.js
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { formatExerciseSummary, getPlateBreakdown, findPreviousExercise } from './helpers.js';
import { startTimer, stopTimer, adjustTimer, parseRecoveryTime } from './timer.js';
import { playBeep } from './audio.js';
import { updateMesocycleUI, updateMesocycleLockUI } from './mesocycle.js';

// --- GESTIONE TIMER DI RECUPERO FLOTTANTE (STATICO) ---
let beepedSeconds = new Set();

function formatTimerTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function handleTick(remainingSeconds) {
    const floatingTimerEl = document.getElementById('floating-timer');
    const timerDisplayEl = document.getElementById('timer-display') || document.getElementById('floating-timer-text');
    
    if (!floatingTimerEl) return;
    floatingTimerEl.classList.add('active'); 
    
    if (timerDisplayEl) {
        timerDisplayEl.textContent = formatTimerTime(remainingSeconds);
    }

    if (remainingSeconds > 5) beepedSeconds.clear();
    if (remainingSeconds <= 5 && remainingSeconds > 0) {
        if (!beepedSeconds.has(remainingSeconds)) {
            playBeep(800, 0.15, 'sine');
            beepedSeconds.add(remainingSeconds);
        }
    }
}

function handleComplete() {
    const floatingTimerEl = document.getElementById('floating-timer');
    const timerDisplayEl = document.getElementById('timer-display') || document.getElementById('floating-timer-text');
    
    if (!floatingTimerEl) return;
    if (timerDisplayEl) {
        timerDisplayEl.textContent = "Recupero Terminato!";
    }
    beepedSeconds.clear();
    playBeep(1700, 1.5, 'sine');
    setTimeout(() => {
        floatingTimerEl.classList.remove('active');
    }, 3000);
}

// Event delegation per i pulsanti del timer statico
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

// Funzione per estrarre solo la parte numerica (es. da "3 reps" a "3")
function cleanNumericReps(val) {
    if (!val) return '';
    const match = val.toString().match(/\d+/);
    return match ? match[0] : val;
}

export const DOM = {
    appContainer: document.getElementById('app-container'),
    workoutForm: document.getElementById('workout-form'),
    workoutListContainer: document.getElementById('workout-list-container'),
    timerDisplay: document.getElementById('timer-display')
};

// --- RENDERING SCHEDA ALLENAMENTO ---
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

   // 2. BANNER MESOCICLO BLOCCATO
    if (isPastMeso) {
        const archiveBadge = document.createElement('div');
        archiveBadge.style.cssText = 'background: #fffbebf1; border: 1px solid #fcd34d; color: #b45309; padding: 8px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; margin-bottom: 15px; display: flex; align-items: center; gap: 6px;';
        archiveBadge.innerHTML = '🔒 <span><strong>Mesociclo Bloccato:</strong> I dati sono congelati in sola lettura. Clicca sul lucchetto in alto per sbloccarlo.</span>';
        DOM.workoutListContainer.appendChild(archiveBadge);
    }

    // 3. BARRA NAVIGAZIONE GIORNI
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

    // CONTEGGIO TEMPO TOTALE DELLA SESSIONE
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

    // RENDER ESERCIZI
    (currentDay.exercises || []).forEach((ex, exIdx) => {
        const isExExcluded = ex.isExcluded || false;
        
        const exCard = document.createElement('div');
        exCard.className = 'exercise-card';
        exCard.dataset.ex = exIdx;
        exCard.style.cssText = `background: #ffffff; border: 1px solid ${isExExcluded ? '#fca5a5' : '#e2e8f0'}; border-radius: 12px; padding: 16px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); opacity: ${isExExcluded ? '0.55' : '1'}; transition: all 0.25s ease; user-select: none; position: relative;`;

        let cardHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; letter-spacing: 0.5px;">BLOCCO ${exIdx + 1}</div>
                    ${!isExExcluded ? '<span style="font-size: 0.7rem; color: #94a3b8; font-style: italic;">(Doppio click o swipe per escludere dai massimali / warmup)</span>' : ''}
                </div>
                ${isExExcluded ? '<span style="font-size: 0.7rem; background: #ef4444; color: #ffffff; padding: 2px 8px; border-radius: 12px; font-weight: 800;">ESCLUSO DAI MASSIMALI</span>' : ''}
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                <h3 style="margin: 0; font-size: 1.1rem; color: #0f172a;">${exIdx + 1}. ${ex.name}</h3>
                
                <div style="display: flex; gap: 6px; align-items: center;">
                    <select class="bar-select" data-ex="${exIdx}" style="font-size: 0.75rem; padding: 4px 6px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc;; color: #0f172a;" ${isPastMeso ? 'disabled' : ''}>
                        <option value="20">Bil 20kg</option>
                        <option value="15">Bil 15kg</option>
                        <option value="12">Bil 12kg</option>
                        <option value="10">Bil 10kg</option>
                        <option value="9">Bil 9kg</option>
                        <option value="6">Bil 6kg</option>
                    </select>
            
                    <div class="plates-badge" data-ex="${exIdx}" style="font-size: 0.75rem; padding: 4px 10px; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b; font-weight: 700; font-family: monospace;">
                        🏋️ 0 kg/lato
                    </div>
                </div>
            </div>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; font-size: 0.8rem; color: #334155; font-family: monospace;">
                <strong>TARGET:</strong> ${formatExerciseSummary(ex)}
            </div>
        `;

        if (ex.notes) {
            cardHtml += `
                <div style="background: #f0f9ff; border: 1px solid #e0f2fe; border-radius: 8px; padding: 10px; margin-bottom: 12px;">
                    <div style="font-size: 0.75rem; font-weight: 800; color: #0369a1; margin-bottom: 2px;">NOTE ALLENATORE</div>
                    <div style="font-size: 0.85rem; color: #0f172a; line-height: 1.3;">${ex.notes}</div>
                </div>
            `;
        }

        cardHtml += `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 10px;">
                <thead>
                    <tr style="background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; font-size: 0.75rem;">
                        <th style="padding: 6px; text-align: center; width: 22%;">SET</th>
                        <th style="padding: 6px; text-align: center; width: 25%;">KG</th>
                        <th style="padding: 6px; text-align: center; width: 25%;">REPS</th>
                        <th style="padding: 6px; text-align: center; width: 18%;">RPE</th>
                        <th style="padding: 6px; text-align: center; width: 10%;">✓</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const prevExercise = findPreviousExercise(state.workoutData, mesoIndex, targetWeek.weekNumber, activeDayNum - 1, ex.name);

        (ex.loggedSets || []).forEach((setObj, setIdx) => {
            const isLocked = setObj.isLocked || false;
            const isDisabled = isLocked || isPastMeso;

            const prevSet = prevExercise?.loggedSets?.[setIdx];
            const prevKg = prevSet ? parseFloat(prevSet.weight) || 0 : 0;
            const prevReps = prevSet ? parseInt(prevSet.reps) || 0 : 0;
            
            const currentKg = parseFloat(setObj.weight) || 0;
            const currentReps = parseInt(setObj.reps) || 0;

            let trendHtml = '';
            if (prevSet && (currentKg > 0 || currentReps > 0)) {
                const currentVolume = currentKg * currentReps;
                const prevVolume = prevKg * prevReps;
                
                if (currentVolume > prevVolume || (currentKg === prevKg && currentReps > prevReps)) {
                    trendHtml = `<span style="color: #16a34a; font-size: 0.75rem; font-weight: 800;" title="Migliorato rispetto all'ultima volta">🔼</span>`;
                } else if (currentVolume < prevVolume || (currentKg === prevKg && currentReps < prevReps)) {
                    trendHtml = `<span style="color: #dc2626; font-size: 0.75rem; font-weight: 800;" title="In calo rispetto all'ultima volta">🔻</span>`;
                }
            }

            const isRangeTarget = (ex.minReps && ex.maxReps) || (ex.reps && typeof ex.reps === 'string' && ex.reps.includes('-'));
            let rawTargetReps = ex.reps || ex.targetReps || '';
            let defaultTargetReps = isRangeTarget ? (prevSet?.reps || '') : cleanNumericReps(rawTargetReps);

            const displayWeight = setObj.weight !== undefined && setObj.weight !== '' ? setObj.weight : (prevSet?.weight || '');
            const displayReps = setObj.reps !== undefined && setObj.reps !== '' ? setObj.reps : defaultTargetReps;
            const displayRpe = setObj.rpe !== undefined && setObj.rpe !== '' ? setObj.rpe : (ex.targetRpe || ex.rpe || '');

            cardHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 6px; text-align: center; border-right: 1px solid #e2e8f0;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <span style="font-weight: 600; color: #334155;">${setIdx + 1}</span>
                            ${trendHtml}
                        </div>
                    </td>
                    <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                        <input type="text" inputmode="decimal" autocomplete="off" autocorrect="off" class="set-input set-kg" data-ex="${exIdx}" data-set="${setIdx}" value="${displayWeight}" placeholder="${prevSet?.weight || 'Kg'}" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-weight: 800; background: ${isDisabled ? '#f1f5f9' : '#ffffff'}; color: ${!setObj.weight && prevSet?.weight && !isLocked ? '#94a3b8' : '#0f172a'};">
                    </td>
                    <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                        <input type="text" inputmode="numeric" autocomplete="off" autocorrect="off" class="set-input set-reps" data-ex="${exIdx}" data-set="${setIdx}" value="${displayReps}" placeholder="${prevSet?.reps || 'reps'}" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-weight: 800; background: ${isDisabled ? '#f1f5f9' : '#ffffff'}; color: ${!setObj.reps && prevSet?.reps && !isLocked ? '#94a3b8' : '#0f172a'};">
                    </td>
                    <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                        <input type="text" inputmode="decimal" autocomplete="off" autocorrect="off" class="set-input set-rpe" data-ex="${exIdx}" data-set="${setIdx}" value="${displayRpe}" placeholder="RPE" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-weight: 800; background: ${isDisabled ? '#f1f5f9' : '#ffffff'};">
                    </td>
                    <td style="padding: 4px; text-align: center;">
                        <input type="checkbox" class="set-lock-check" data-ex="${exIdx}" data-set="${setIdx}" ${isLocked ? 'checked' : ''} ${isPastMeso ? 'disabled' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                    </td>
                </tr>
            `;
        });
        cardHtml += `
                </tbody>
            </table>
            <input type="text" placeholder="Note esercizio..." value="${ex.userNotes || ''}" class="ex-user-notes" data-ex="${exIdx}" ${isPastMeso ? 'disabled' : ''} style="width: 100%; font-size: 0.8rem; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: ${isPastMeso ? '#f1f5f9' : '#f8fafc'};">
        `;

        exCard.innerHTML = cardHtml;
        DOM.workoutListContainer.appendChild(exCard);

        updatePlatesBadgeUI(exIdx);
    });

    bindWorkoutTableEvents(currentDay, isPastMeso);
}

// --- GESTIONE BADGE DISCHI ---
export function updatePlatesBadgeUI(exIdx) {
    const container = DOM.workoutListContainer;
    if (!container) return;

    const barSelect = container.querySelector(`.bar-select[data-ex="${exIdx}"]`);
    const set1Input = container.querySelector(`.set-kg[data-ex="${exIdx}"][data-set="0"]`);
    const badge = container.querySelector(`.plates-badge[data-ex="${exIdx}"]`);

    if (!badge) return;

    const barWeight = parseFloat(barSelect?.value || 20);
    const totalKg = parseFloat(set1Input?.value.replace(',', '.')) || 0;

    if (barWeight === 0) {
        badge.innerHTML = `🏋️ Manubri / Macchina`;
        badge.style.background = '#f1f5f9';
        badge.style.color = '#475569';
        badge.style.borderColor = '#cbd5e1';
        return;
    }

    const breakdown = getPlateBreakdown(totalKg, barWeight);

    if (!breakdown) {
        badge.innerHTML = `🏋️ 0 kg/lato`;
        badge.style.background = '#f8fafc';
        badge.style.color = '#64748b';
        badge.style.borderColor = '#e2e8f0';
    } else {
        badge.innerHTML = `🏋️ <strong>${breakdown.sideWeight}kg</strong>/lato <span style="color: #166534; font-weight: normal;">[${breakdown.str}]</span>`;
        badge.style.background = '#f0fdf4';
        badge.style.color = '#15803d';
        badge.style.borderColor = '#bbf7d0';
    }
}

// Gestisce l'avvio del timer alla prima spunta e la chiusura all'ultima
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
        console.log("⏱️ Prima serie spuntata: cronometro di sessione avviato e salvato!");
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
        console.log(`🎉 Allenamento completato in ${durationMinutes} minuti.`);
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
        pauseSessionBtn.style.cssText = 'background: #fefce8; border: 1px solid #fef08a; color: #ca8a04; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem; font-weight: 700; display: none;';
        
        pauseSessionBtn.onclick = () => {
            if (currentDay.completed) return;
            if (currentDay.isPaused) {
                // Riprendi
                currentDay.isPaused = false;
                currentDay.sessionStart = Date.now();
            } else {
                // Metti in pausa
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

        const resetSessionBtn = document.createElement('button');
        resetSessionBtn.id = 'reset-session-timer-btn';
        resetSessionBtn.innerHTML = '⏹️ Termina';
        resetSessionBtn.title = 'Resetta o interrompi sessione';
        resetSessionBtn.style.cssText = 'background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem; font-weight: 700; display: none;';
        
        resetSessionBtn.onclick = () => {
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
        
        timerEl.after(resetSessionBtn);
        resetSessionBtn.after(pauseSessionBtn);
    }

    const resetBtn = document.getElementById('reset-session-timer-btn');
    const pauseBtn = document.getElementById('pause-session-timer-btn');

    if (currentDay.completed && currentDay.totalDurationMinutes !== undefined) {
        timerEl.style.background = '#dcfce7';
        timerEl.style.color = '#166534';
        timerEl.textContent = `✅ ${currentDay.totalDurationMinutes} min`;
        if (resetBtn) resetBtn.style.display = 'inline-block';
        if (pauseBtn) pauseBtn.style.display = 'none';
    } else {
        timerEl.style.background = currentDay.isPaused ? '#fefce8' : '#e0f2fe';
        timerEl.style.color = currentDay.isPaused ? '#ca8a04' : '#0369a1';
        
        const totalSecs = (currentDay.accumulatedSeconds || 0) + (currentDay.sessionStart ? Math.floor((Date.now() - currentDay.sessionStart) / 1000) : 0);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;

        if (!currentDay.sessionStart && !currentDay.accumulatedSeconds && !currentDay.isPaused) {
            timerEl.textContent = `0:00`;
            if (resetBtn) resetBtn.style.display = 'none';
            if (pauseBtn) pauseBtn.style.display = 'none';
        } else {
            timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            if (resetBtn) resetBtn.style.display = 'inline-block';
            if (pauseBtn) {
                pauseBtn.style.display = 'inline-block';
                pauseBtn.innerHTML = currentDay.isPaused ? '▶️ Riprendi' : '⏸️ Pausa';
            }
        }
    }
}

// --- ASSOCIAZIONE EVENTI TABELLA ---
function bindWorkoutTableEvents(currentDay, isPastMeso) {
    if (!DOM.workoutListContainer) return;

    DOM.workoutListContainer.querySelectorAll('.set-input, .ex-user-notes').forEach(input => {
        input.addEventListener('focus', (e) => {
            e.target.select();
        });
        
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

            if (isKg) setObj.weight = parseFloat(val.replace(',', '.')) || 0;
            if (isReps) setObj.reps = val;
            if (isRpe) setObj.rpe = val;

            if (setIdx === 0 && isKg) {
                updatePlatesBadgeUI(exIdx);
            }

            if (isKg) {
                const numVal = parseFloat(val.replace(',', '.')) || 0;
                const kgMin = parseFloat(ex.kgMin) || 0;
                const kgMax = parseFloat(ex.kgMax) || Infinity;

                if (numVal > 0 && (numVal < kgMin || numVal > kgMax)) {
                    e.target.style.backgroundColor = '#fef2f2';
                    e.target.style.borderColor = '#ef4444';
                    e.target.style.color = '#dc2626';
                } else {
                    e.target.style.backgroundColor = '#ffffff';
                    e.target.style.borderColor = '#cbd5e1';
                    e.target.style.color = '#000000';
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
                if (!setObj.weight && kgInput && kgInput.value) {
                    setObj.weight = parseFloat(kgInput.value.replace(',', '.')) || 0;
                }
                if (!setObj.reps && repsInput && repsInput.value) {
                    setObj.reps = repsInput.value;
                }
                if (!setObj.rpe && rpeInput && rpeInput.value) {
                    setObj.rpe = rpeInput.value;
                }
            }

            if (isChecked && setIdx === 0) {
                ['weight', 'reps', 'rpe'].forEach(prop => {
                    const val = setObj[prop];
                    if (val !== undefined && val !== null && val !== '') {
                        const targetClass = prop === 'weight' ? '.set-kg' : (prop === 'reps' ? '.set-reps' : '.set-rpe');
                        const setRows = DOM.workoutListContainer.querySelectorAll(`${targetClass}[data-ex="${exIdx}"]`);

                        setRows.forEach((rowInput, idx) => {
                            if (idx > 0 && (!rowInput.value || rowInput.value.trim() === '')) {
                                rowInput.value = val;
                                if (ex.loggedSets[idx]) {
                                    ex.loggedSets[idx][prop] = val;
                                }
                            }
                        });
                    }
                });
            }

            updateSessionAndCompletionState(currentDay);
            updateSessionHeaderUI(currentDay);
            saveAndSync(state.workoutData);

            const card = DOM.workoutListContainer.querySelector(`.exercise-card[data-ex="${exIdx}"]`);
            if (card) {
                card.querySelectorAll('.set-input').forEach(inp => {
                    const sIdx = parseInt(inp.dataset.set, 10);
                    const isRowLocked = ex.loggedSets[sIdx]?.isLocked || false;
                    inp.disabled = isRowLocked;
                    inp.style.background = isRowLocked ? '#f1f5f9' : '#ffffff';
                });
            }

            if (isChecked) {
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

// --- GESTIONE SWIPE ---
export function enableCardSwipeGesture(cardElement, onSwipeLeft, onSwipeRight) {
    if (!cardElement) return;

    cardElement.style.touchAction = 'pan-y';

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isSwiping = false;

    const MIN_SWIPE_DISTANCE = 120; 

    cardElement.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        currentX = startX;
        currentY = startY;
        isSwiping = false;
        
        cardElement.style.transition = 'none';
    }, { passive: true });

    cardElement.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        currentX = touch.clientX;
        currentY = touch.clientY;

        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (!isSwiping && absY > absX) return;

        if (absX > 15 && absX > absY * 1.5) {
            isSwiping = true;
            cardElement.style.transform = `translateX(${deltaX}px)`;
            cardElement.style.opacity = `${1 - Math.min(absX / 300, 0.5)}`;
        }
    }, { passive: true });

    cardElement.addEventListener('touchend', () => {
        cardElement.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (isSwiping && absX >= MIN_SWIPE_DISTANCE && absX > absY * 1.5) {
            if (deltaX < 0 && typeof onSwipeLeft === 'function') {
                cardElement.style.transform = 'translateX(-100%)';
                cardElement.style.opacity = '0';
                setTimeout(() => onSwipeLeft(cardElement), 250);
                return;
            } else if (deltaX > 0 && typeof onSwipeRight === 'function') {
                cardElement.style.transform = 'translateX(100%)';
                cardElement.style.opacity = '0';
                setTimeout(() => onSwipeRight(cardElement), 250);
                return;
            }
        }

        cardElement.style.transform = 'translateX(0px)';
        cardElement.style.opacity = '1';
    });
}