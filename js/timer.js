// timer.js
import { state } from './state.js';
import { playBeep } from './audio.js';

export function startTimer(durationInSeconds, displayElement) {
    // Pulisce eventuali timer precedenti
    if (state.timer.intervalId) {
        clearInterval(state.timer.intervalId);
    }

    state.timer.remainingSeconds = durationInSeconds;
    state.timer.isActive = true;

    // Aggiornamento immediato UI
    updateTimerDisplay(displayElement);

    state.timer.intervalId = setInterval(() => {
        state.timer.remainingSeconds--;
        
        updateTimerDisplay(displayElement);

        // Controllo scadenza
        if (state.timer.remainingSeconds <= 0) {
            stopTimer();
            playBeep(440, 500); // Beep di 500ms
        }
    }, 1000);
}

export function stopTimer() {
    if (state.timer.intervalId) {
        clearInterval(state.timer.intervalId);
    }
    state.timer.isActive = false;
    state.timer.remainingSeconds = 0;
}

export function updateTimerDisplay(displayElement) {
    if (!displayElement) return;
    const minutes = Math.floor(state.timer.remainingSeconds / 60);
    const seconds = state.timer.remainingSeconds % 60;
    // Formattazione 00:00
    displayElement.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}