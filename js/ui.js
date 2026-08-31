// ui.js
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { formatExerciseSummary, getPlateBreakdown } from './helpers.js';
import { startTimer, stopTimer, adjustTimer, parseRecoveryTime } from './timer.js';
import { playBeep } from './audio.js';
import { updateMesocycleUI } from './mesocycle.js';

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
    const isPastMeso = mesoIndex > 0;
    const activeWeekNum = state.activeWeek || 1;
    const targetWeek = (meso.weeks || []).find(w => w.weekNumber === activeWeekNum) || meso.weeks?.[0];

    if (!targetWeek) return;

    updateMesocycleUI();

    // 2. BANNER STORICO CONGELATO
    if (isPastMeso) {
        const archiveBadge = document.createElement('div');
        archiveBadge.style.cssText = 'background: #fffbebf1; border: 1px solid #fcd34d; color: #b45309; padding: 8px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; margin-bottom: 15px; display: flex; align-items: center; gap: 6px;';
        archiveBadge.innerHTML = '🔒 <span><strong>Mesociclo Concluso:</strong> I dati storici sono congelati in sola lettura per evitare modifiche accidentali.</span>';
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

    // INTESTAZIONE GIORNO
    const dayHeader = document.createElement('div');
    dayHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;';
    dayHeader.innerHTML = `
        <h2 style="margin: 0; color: #0284c7; font-size: 1.4rem;">${currentDay.dayName || 'Giorno ' + activeDayNum}</h2>
        <span style="font-size: 0.85rem; color: #64748b; font-weight: 500;">Mesociclo ${mesoIndex + 1} - Settimana ${targetWeek.weekNumber}</span>
    `;
    DOM.workoutListContainer.appendChild(dayHeader);

    // RENDER ESERCIZI
    (currentDay.exercises || []).forEach((ex, exIdx) => {
        const isExExcluded = ex.isExcluded || false;
        
        const exCard = document.createElement('div');
        exCard.className = 'exercise-card';
        exCard.dataset.ex = exIdx;
        exCard.style.cssText = `background: #ffffff; border: 1px solid ${isExExcluded ? '#fca5a5' : '#e2e8f0'}; border-radius: 12px; padding: 16px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); opacity: ${isExExcluded ? '0.55' : '1'}; transition: all 0.25s ease; user-select: none; position: relative;`;

        let cardHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; letter-spacing: 0.5px;">BLOCCO ${exIdx + 1}</div>
                ${isExExcluded ? '<span style="font-size: 0.7rem; background: #ef4444; color: #ffffff; padding: 2px 8px; border-radius: 12px; font-weight: 800;">ESCLUSO DAI MASSIMALI</span>' : ''}
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                <h3 style="margin: 0; font-size: 1.1rem; color: #0f172a;">${exIdx + 1}. ${ex.name}</h3>
                
                <div style="display: flex; gap: 6px; align-items: center;">
                    <select class="bar-select" data-ex="${exIdx}" style="font-size: 0.75rem; padding: 4px 6px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc;" ${isPastMeso ? 'disabled' : ''}>
                        <option value="20">Bil 20kg</option>
                        <option value="15">Bil 15kg</option>
                        <option value="12">Bil 12kg</option>
                        <option value="10">Bil 10kg</option>
                        <option value="9">Bil 9kg</option>
                        <option value="6">Bil 6kg</option>
                        <option value="0">Manubri / Macchina</option>
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

        (ex.loggedSets || []).forEach((setObj, setIdx) => {
            const isLocked = setObj.isLocked || false;
            const isDisabled = isLocked || isPastMeso;
            // Se si clicca su una cella col device, apre immediatamente la tastiera con i numeri
            cardHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 6px; text-align: center; border-right: 1px solid #e2e8f0;">
                        <span style="font-weight: 600; color: #334155;">${setIdx + 1}</span>
                    </td>
                    <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                        <input type="text" inputmode="decimal" autocomplete="off" autocorrect="off" class="set-input set-kg" data-ex="${exIdx}" data-set="${setIdx}" value="${setObj.weight || ''}" placeholder="Kg" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-weight: 800; background: ${isDisabled ? '#f1f5f9' : '#ffffff'};">
                    </td>
                    <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                        <input type="text" inputmode="numeric" autocomplete="off" autocorrect="off" class="set-input set-reps" data-ex="${exIdx}" data-set="${setIdx}" value="${setObj.reps || ''}" placeholder="reps" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-weight: 800; background: ${isDisabled ? '#f1f5f9' : '#ffffff'};">
                    </td>
                    <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                        <input type="text" inputmode="decimal" autocomplete="off" autocorrect="off" class="set-input set-rpe" data-ex="${exIdx}" data-set="${setIdx}" value="${setObj.rpe || ex.targetRpe || ex.rpe || ''}" placeholder="RPE" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-weight: 800; background: ${isDisabled ? '#f1f5f9' : '#ffffff'};">
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

// --- ASSOCIAZIONE EVENTI TABELLA ---
function bindWorkoutTableEvents(currentDay, isPastMeso) {
    if (!DOM.workoutListContainer) return;

    DOM.workoutListContainer.querySelectorAll('.set-input, .ex-user-notes').forEach(input => {
        // 'focus' serve per cliccare e attivare subito la tastiera del device
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

                let timerDisplay = document.getElementById('floating-timer-display');
                if (!timerDisplay) {
                    timerDisplay = document.createElement('div');
                    timerDisplay.id = 'floating-timer-display';
                    timerDisplay.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #ffffff; padding: 10px 18px; border-radius: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); z-index: 9999; display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 0.95rem; border: 2px solid #0284c7; flex-wrap: wrap; justify-content: center;';
                    
                    timerDisplay.innerHTML = `
                        <span id="timer-text-content">⏱️ Recupero: <span style="color: #38bdf8; font-family: monospace;">0:00</span></span>
                        <div style="display: flex; gap: 5px; align-items: center;">
                            <button id="timer-minus-15" style="background: #0284c7; color: white; border: none; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: bold;">-15s</button>
                            <button id="timer-plus-30" style="background: #0284c7; color: white; border: none; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: bold;">+30s</button>
                            <button id="timer-close" style="background: #ef4444; color: white; border: none; padding: 4px 7px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: bold;">✕</button>
                        </div>
                    `;
                    document.body.appendChild(timerDisplay);
                }

                const beepedSeconds = new Set();

                const updateTick = (remainingSeconds) => {
                    const mins = Math.floor(remainingSeconds / 60);
                    const secs = remainingSeconds % 60;
                    const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                    
                    const textSpan = timerDisplay.querySelector('#timer-text-content');
                    if (textSpan) {
                        textSpan.innerHTML = `⏱️ Recupero: <span style="color: #38bdf8; font-family: monospace;">${timeStr}</span>`;
                    }
                    timerDisplay.style.display = 'flex';

                    if (remainingSeconds > 5) beepedSeconds.clear();

                    if (remainingSeconds <= 5 && remainingSeconds > 0) {
                        if (!beepedSeconds.has(remainingSeconds)) {
                            playBeep(800, 0.15, 'sine');
                            beepedSeconds.add(remainingSeconds);
                        }
                    }
                };

                const updateComplete = () => {
                    const textSpan = timerDisplay.querySelector('#timer-text-content');
                    if (textSpan) {
                        textSpan.innerHTML = `✅ Recupero Terminato!`;
                    }
                    beepedSeconds.clear();
                    playBeep(1700, 1.5, 'sine');

                    setTimeout(() => {
                        timerDisplay.style.display = 'none';
                    }, 3000);
                };

                timerDisplay.querySelector('#timer-minus-15').onclick = () => adjustTimer(-15, updateTick, updateComplete);
                timerDisplay.querySelector('#timer-plus-30').onclick = () => adjustTimer(30, updateTick, updateComplete);
                timerDisplay.querySelector('#timer-close').onclick = () => {
                    stopTimer();
                    timerDisplay.style.display = 'none';
                };

                startTimer(recoveryTime, updateTick, updateComplete);
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

    // OTTIMIZZAZIONE: Forza il browser a gestire solo lo scroll verticale nativo.
    // Blocca le gesture orizzontali di sistema (fondamentale per Safari iOS) per permettere lo swipe fluido delle card.
    cardElement.style.touchAction = 'pan-y';

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isSwiping = false;

    const MIN_SWIPE_DISTANCE = 50; 

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
