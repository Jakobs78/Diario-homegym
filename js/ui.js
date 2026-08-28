// ui.js
import { state } from './state.js';
import { saveAndSync } from './storage.js';

export const DOM = {
    appContainer: document.getElementById('app-container'),
    workoutForm: document.getElementById('workout-form'),
    workoutListContainer: document.getElementById('workout-list-container'),
    timerDisplay: document.getElementById('timer-display')
};

// --- GESTIONE VISTE E DASHBOARD ---
export function switchView(viewId) {
    state.activeView = viewId;
    
    const views = document.querySelectorAll('.day-view');
    views.forEach(v => v.style.display = 'none');

    const workoutContainer = DOM.workoutListContainer;

    if (viewId === 'workout' || !viewId) {
        if (workoutContainer) workoutContainer.style.display = 'block';
    } else {
        if (workoutContainer) workoutContainer.style.display = 'none';
        const targetView = document.getElementById(viewId);
        if (targetView) targetView.style.display = 'block';
    }
}

// --- RENDERING SCHEDA ALLENAMENTO ---
export function renderWorkoutList() {
    if (!DOM.workoutListContainer) return;
    DOM.workoutListContainer.innerHTML = '';

    if (state.activeView && state.activeView !== 'workout') {
        DOM.workoutListContainer.style.display = 'none';
        return;
    }
    DOM.workoutListContainer.style.display = 'block';

    const yearsObj = state.workoutData.history?.years || {};
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
    const isPastMeso = mesoIndex > 0; // Se indice > 0, è un mesociclo passato/concluso
    const activeWeekNum = state.activeWeek || 1;
    const targetWeek = (meso.weeks || []).find(w => w.weekNumber === activeWeekNum) || meso.weeks?.[0];

    if (!targetWeek) return;

    // 1. BARRA CONTROLLI MESOCICLO (- / + / Elimina)
    const mesoSelectorDiv = document.createElement('div');
    mesoSelectorDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: #ffffff; padding: 10px 14px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 15px;';
    mesoSelectorDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.9rem; font-weight: 600; color: #334155;">Mesociclo:</span>
            <button id="meso-prev-btn" style="padding: 2px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; font-weight: bold; cursor: pointer;">-</button>
            <span style="font-size: 1rem; font-weight: 700; color: #0284c7; min-width: 20px; text-align: center;">${mesoIndex + 1}</span>
            <button id="meso-next-btn" style="padding: 2px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; font-weight: bold; cursor: pointer;">+</button>
        </div>
        <button id="delete-meso-btn" style="font-size: 0.8rem; padding: 4px 10px; border-radius: 6px; border: 1px solid #fca5a5; background: #fef2f2; color: #dc2626; cursor: pointer; font-weight: 600;">🗑️ Elimina Mesociclo</button>
    `;
    DOM.workoutListContainer.appendChild(mesoSelectorDiv);

    // Eventi Selettore Mesociclo
    mesoSelectorDiv.querySelector('#meso-prev-btn').onclick = () => changeMesocycle(-1);
    mesoSelectorDiv.querySelector('#meso-next-btn').onclick = () => changeMesocycle(1);
    mesoSelectorDiv.querySelector('#delete-meso-btn').onclick = () => deleteCurrentMesocycle();

    // 2. BANNER STORICO CONGELATO (Se mesociclo passato)
    if (isPastMeso) {
        const archiveBadge = document.createElement('div');
        archiveBadge.style.cssText = 'background: #fffbebf1; border: 1px solid #fcd34d; color: #b45309; padding: 8px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; margin-bottom: 15px; display: flex; align-items: center; gap: 6px;';
        archiveBadge.innerHTML = '🔒 <span><strong>Mesociclo Concluso:</strong> I dati storici sono congelati in sola lettura per evitare modifiche accidentali.</span>';
        DOM.workoutListContainer.appendChild(archiveBadge);
    }

    // 3. Barra Navigazione Giorni (Giorno 1, Giorno 2, ...)
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

    // Intestazione Giorno
    const dayHeader = document.createElement('div');
    dayHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;';
    dayHeader.innerHTML = `
        <h2 style="margin: 0; color: #0284c7; font-size: 1.4rem;">${currentDay.dayName || 'Giorno ' + activeDayNum}</h2>
        <span style="font-size: 0.85rem; color: #64748b; font-weight: 500;">Mesociclo ${mesoIndex + 1} - Settimana ${targetWeek.weekNumber}</span>
    `;
    DOM.workoutListContainer.appendChild(dayHeader);

    // Render Esercizi
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
            
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <h3 style="margin: 0; font-size: 1.1rem; color: #0f172a;">${exIdx + 1}. ${ex.name}</h3>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <select style="font-size: 0.75rem; padding: 2px 6px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc;" ${isPastMeso ? 'disabled' : ''}>
                        <option>Bil. 20kg</option>
                        <option>Bil. 15kg</option>
                        <option>Manubri</option>
                        <option>Cavo / Macchina</option>
                    </select>
                    <button style="font-size: 0.75rem; padding: 3px 8px; border-radius: 6px; border: 1px solid #bae6fd; background: #f0f9ff; color: #0284c7; cursor: pointer;" ${isPastMeso ? 'disabled' : ''}>Inserisci un peso nel set 1</button>
                </div>
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
            const isDisabled = isLocked || isPastMeso; // Disabilita se bloccato O se mesociclo passato

            cardHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 6px; text-align: center; border-right: 1px solid #e2e8f0;">
                        <span style="font-weight: 600; color: #334155;">${setIdx + 1}</span>
                    </td>
                    <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                        <input type="text" class="set-input set-kg" data-ex="${exIdx}" data-set="${setIdx}" value="${setObj.weight || ''}" placeholder="---" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-weight: 600; background: ${isDisabled ? '#f1f5f9' : '#ffffff'};">
                    </td>
                    <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                        <input type="text" class="set-input set-reps" data-ex="${exIdx}" data-set="${setIdx}" value="${setObj.reps || ''}" placeholder="reps" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; color: #475569; background: ${isDisabled ? '#f1f5f9' : '#ffffff'};">
                    </td>
                    <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                        <input type="text" class="set-input set-rpe" data-ex="${exIdx}" data-set="${setIdx}" value="${setObj.rpe || ''}" placeholder="RPE" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-weight: 700; background: ${isDisabled ? '#f1f5f9' : '#ffffff'};">
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
    });

    bindWorkoutTableEvents(currentDay, isPastMeso);
}

/**
 * Gestisce l'interattività e il salvataggio automatico (LocalStorage + Supabase)
 */
function bindWorkoutTableEvents(currentDay, isPastMeso) {
    if (!DOM.workoutListContainer) return;

    // 1. Modifica KG, REPS, RPE e Note Esercizio
    DOM.workoutListContainer.querySelectorAll('.set-input, .ex-user-notes').forEach(input => {
        input.addEventListener('change', (e) => {
            const exIdx = e.target.dataset.ex;
            
            if (e.target.classList.contains('ex-user-notes')) {
                currentDay.exercises[exIdx].userNotes = e.target.value;
            } else {
                const setIdx = e.target.dataset.set;
                const setObj = currentDay.exercises[exIdx].loggedSets[setIdx];

                if (e.target.classList.contains('set-kg')) setObj.weight = parseFloat(e.target.value.replace(',', '.')) || 0;
                if (e.target.classList.contains('set-reps')) setObj.reps = e.target.value;
                if (e.target.classList.contains('set-rpe')) setObj.rpe = e.target.value;
            }

            saveAndSync(state.workoutData);
            renderWorkoutList();
        });
    });

    // 2. Spunta di blocco riga (Check)
    DOM.workoutListContainer.querySelectorAll('.set-lock-check').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const exIdx = e.target.dataset.ex;
            const setIdx = e.target.dataset.set;
            currentDay.exercises[exIdx].loggedSets[setIdx].isLocked = e.target.checked;
            
            saveAndSync(state.workoutData);
            renderWorkoutList();
        });
    });

    // 3. Gestione Doppio Click (Desktop) e Swipe (Mobile) per esclusione esercizio
    DOM.workoutListContainer.querySelectorAll('.exercise-card').forEach(card => {
        const exIdx = card.dataset.ex;

        const toggleExclusion = (e) => {
            if (isPastMeso) return; // Non permette modifiche nei mesocicli conclusi
            if (['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;
            
            currentDay.exercises[exIdx].isExcluded = !currentDay.exercises[exIdx].isExcluded;
            
            saveAndSync(state.workoutData);
            renderWorkoutList();
        };

        // Desktop
        card.addEventListener('dblclick', toggleExclusion);

        // Mobile Swipe
        let touchStartX = 0;
        card.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
        card.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].screenX;
            if (Math.abs(touchEndX - touchStartX) > 60) {
                toggleExclusion(e);
            }
        }, { passive: true });
    });
}

// --- CAMBIO E CANCELLAZIONE MESOCICLO ---
export function changeMesocycle(delta) {
    const currentYear = new Date().getFullYear().toString();
    const mesocycles = state.workoutData.history?.years?.[currentYear]?.mesocycles || [];
    const currentIndex = state.activeMesocycleIndex || 0;
    const targetIndex = currentIndex + delta;

    if (delta > 0 && targetIndex >= mesocycles.length) {
        showNotification(`Il Mesociclo ${targetIndex + 1} non è ancora stato caricato. Importa un file CSV per proseguire.`, 'warning');
        return;
    }

    if (delta < 0 && targetIndex < 0) {
        return;
    }

    state.activeMesocycleIndex = targetIndex;
    state.activeWeek = 1;
    state.activeDay = 1;
    renderWorkoutList();
}

export function deleteCurrentMesocycle() {
    const currentYear = new Date().getFullYear().toString();
    const mesocycles = state.workoutData.history?.years?.[currentYear]?.mesocycles || [];

    if (mesocycles.length === 0) {
        showNotification("Nessun mesociclo da eliminare.", "error");
        return;
    }

    const activeIdx = state.activeMesocycleIndex || 0;
    const mesoToDelete = mesocycles[activeIdx];

    if (!confirm(`Sei sicuro di voler eliminare definitivamente il "${mesoToDelete?.name || 'Mesociclo'}"?`)) {
        return;
    }

    mesocycles.splice(activeIdx, 1);

    mesocycles.forEach((meso, idx) => {
        meso.number = idx + 1;
        meso.name = `Mesociclo ${idx + 1}`;
    });

    if (activeIdx >= mesocycles.length) {
        state.activeMesocycleIndex = Math.max(0, mesocycles.length - 1);
    }

    saveAndSync(state.workoutData);
    renderWorkoutList();
    showNotification("Mesociclo eliminato e numerazione riallineata!");
}

// --- NOTIFICHE E TEMA ---
export function showNotification(message, type = 'info') {
    alert(`${type.toUpperCase()}: ${message}`);
}