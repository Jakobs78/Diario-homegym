// ==========================================
// MODULI: sessionTimer.js - Gestione del timer di sessione, calcolo durata e stati di completamento allenamento
// ==========================================

import { saveAndSync } from './storage.js';
import { state } from './state.js';
import { refreshLiveCoachClock } from './liveCoachUI.js';
import { repeatCompletedSessionPreservingHistory, safeArchiveCount } from './historySafety.js';

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
        currentDay.accumulatedSeconds = totalSecs; // Mantieni l'effettivo anche se una serie viene riaperta.
        currentDay.completed = true;
        currentDay.sessionCompletedAt = new Date().toISOString();

        currentDay.sessionStart = null; 
        currentDay.isPaused = false;
    } else if (completedSets < totalSets && currentDay.completed) {
        // Correzione di una serie spuntata: riapri davvero la sessione.
        currentDay.completed = false;
        currentDay.totalDurationMinutes = undefined;
        delete currentDay.sessionCompletedAt;
        if (completedSets > 0 && !currentDay.isPaused) currentDay.sessionStart = Date.now();
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
        timerWrapper.classList.add('session-timer-wrapper');

        let timerLabel = timerWrapper.querySelector('.session-timer-label');
        if (!timerLabel) {
            timerLabel = document.createElement('span');
            timerLabel.className = 'session-timer-label';
            timerLabel.textContent = 'DURATA SESSIONE:';
            timerEl.before(timerLabel);
        }
        
        const pauseSessionBtn = document.createElement('button');
        pauseSessionBtn.id = 'pause-session-timer-btn';
        pauseSessionBtn.className = 'btn btn-secondary btn-timer-action is-hidden';

        const actionSessionBtn = document.createElement('button');
        actionSessionBtn.id = 'reset-session-timer-btn'; 
        actionSessionBtn.className = 'btn-timer-action font-bold is-hidden';
        
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
            refreshLiveCoachClock(currentDay);
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
            actionBtn.textContent = '🔄 Ripeti (salva storico)';
            actionBtn.className = 'btn-reset-time btn-timer-action font-bold';
            actionBtn.title = 'Archivia la sessione completata prima di ripeterla';
            actionBtn.classList.remove('is-hidden');

            actionBtn.onclick = () => {
                const agreed = confirm(
                    'Vuoi ripetere questa seduta?\\n\\n' +
                    'I kg, le ripetizioni, gli RPE e la data della seduta completata ' +
                    'verranno PRIMA conservati nello storico delle ripetizioni. ' +
                    'Le nuove serie partiranno vuote.\\n\\n' +
                    'La seduta originale resterà consultabile qui sotto.'
                );
                if (!agreed) return;
                try {
                    repeatCompletedSessionPreservingHistory(currentDay);
                    saveAndSync(state.workoutData);
                    if (typeof renderCallback === 'function') renderCallback();
                } catch (error) {
                    alert(error.message || 'Impossibile archiviare la seduta: nessun dato modificato.');
                }
            };
        } else {
            actionBtn.innerHTML = '⏹️ Termina';
            actionBtn.className = 'btn btn-danger btn-timer-action';
            actionBtn.title = 'Resetta o interrompi sessione';
            
            if (currentDay.sessionStart || currentDay.accumulatedSeconds > 0) {
                actionBtn.classList.remove('is-hidden');
            } else {
                actionBtn.classList.add('is-hidden');
            }

            actionBtn.onclick = () => {
                if (confirm("Vuoi azzerare il timer e sbloccare la sessione per questo giorno?")) {
                    currentDay.sessionStart = null;
                    currentDay.accumulatedSeconds = 0;
                    currentDay.isPaused = false;
                    currentDay.completed = false;
                    currentDay.totalDurationMinutes = undefined;
                    delete currentDay.sessionCompletedAt;
                    saveAndSync(state.workoutData);
                    if (typeof renderCallback === 'function') renderCallback();
                }
            };
        }
    }

    // Cronologia persistita nel giorno, visibile anche dopo il reset.
    // Rendiamo solo testo, senza interpolare note/esercizi in HTML.
    timerWrapper?.querySelector('.session-archive-details')?.remove();
    const archives = Array.isArray(currentDay.sessionArchives) ?
        currentDay.sessionArchives : [];
    if (archives.length && timerWrapper) {
        const historyDetails = document.createElement('details');
        historyDetails.className = 'session-archive-details';
        const summary = document.createElement('summary');
        summary.textContent = '📚 Sedute precedenti salvate (' + safeArchiveCount(currentDay) + ')';
        historyDetails.appendChild(summary);
        const list = document.createElement('ol');
        for (const item of archives.slice().reverse()) {
            const entry = document.createElement('li');
            const title = document.createElement('strong');
            title.textContent = item.sessionDate ||
                (item.capturedAt ? String(item.capturedAt).slice(0, 10) : 'Data non disponibile');
            entry.append(title);
            const exercises = document.createElement('ul');
            for (const ex of item.exercises || []) {
                const performed = (ex.loggedSets || []).filter(set =>
                    set.isLocked === true || set.completed === true);
                if (!performed.length) continue;
                const line = document.createElement('li');
                line.textContent = ex.name + ': ' + performed.map(set =>
                    String(set.weight) + ' kg × ' + String(set.reps) +
                    (set.rpe === '' || set.rpe === null || set.rpe === undefined
                        ? '' : ' · RPE ' + String(set.rpe))).join(' / ');
                exercises.appendChild(line);
            }
            entry.appendChild(exercises);
            list.appendChild(entry);
        }
        historyDetails.appendChild(list);
        timerWrapper.appendChild(historyDetails);
    }

    if (currentDay.completed && currentDay.totalDurationMinutes !== undefined) {
        timerEl.classList.add('timer-completed');
        timerEl.textContent = `${currentDay.totalDurationMinutes} min`;
        if (pauseBtn) pauseBtn.classList.add('is-hidden');
    } else {
        timerEl.classList.remove('timer-completed');
        const totalSecs = (currentDay.accumulatedSeconds || 0) + (currentDay.sessionStart ? Math.floor((Date.now() - currentDay.sessionStart) / 1000) : 0);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;

        if (!currentDay.sessionStart && !currentDay.accumulatedSeconds && !currentDay.isPaused) {
            timerEl.textContent = `0:00`;
            if (pauseBtn) pauseBtn.classList.add('is-hidden');
        } else {
            timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            if (pauseBtn) {
                pauseBtn.classList.remove('is-hidden');
                pauseBtn.innerHTML = currentDay.isPaused ? '▶️ Riprendi' : '⏸️ Pausa';
            }
        }
    }
}