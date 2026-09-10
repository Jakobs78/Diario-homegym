// ==========================================
// MODULI: sessionTimer.js - Gestione del timer di sessione, calcolo durata e stati di completamento allenamento
// ==========================================

import { saveAndSync } from './storage.js';
import { state } from './state.js';

/**
 * Aggiorna lo stato di completamento e i tempi della sessione corrente in base ai set bloccati.
 * @param {Object} currentDay - L'oggetto del giorno di allenamento corrente
 */
export function updateSessionAndCompletionState(currentDay) {
    if (!currentDay || !currentDay.exercises) return;
    const exercises = currentDay.exercises;
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

/**
 * Gestisce l'interfaccia e i listener dei pulsanti del timer di sessione (Pausa, Termina, Reset).
 * @param {Object} currentDay - L'oggetto del giorno di allenamento corrente
 * @param {Function} renderCallback - Funzione di callback per rirenderizzare la vista quando cambia lo stato
 */
export function updateSessionHeaderUI(currentDay, renderCallback) {
    const timerEl = document.getElementById('live-session-timer');
    if (!timerEl) return;

    let timerWrapper = timerEl.parentElement;
    if (timerWrapper && !timerWrapper.classList.contains('session-timer-wrapper')) {
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
            updateSessionHeaderUI(currentDay, renderCallback);
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
                    if (typeof renderCallback === 'function') renderCallback();
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
                    if (typeof renderCallback === 'function') renderCallback();
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