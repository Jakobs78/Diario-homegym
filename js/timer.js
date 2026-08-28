// timer.js
import { state } from './state.js';
import { playBeep } from './audio.js';

export function startTimer(seconds = 90) {
    stopTimer();

    state.timer.remainingSeconds = seconds;
    state.timer.isActive = true;

    updateTimerDisplay();

    const displayElem = document.getElementById('floating-timer');
    if (displayElem) displayElem.style.display = 'flex';

    state.timer.intervalId = setInterval(() => {
        state.timer.remainingSeconds--;

        if (state.timer.remainingSeconds <= 0) {
            stopTimer();
            
            // Beep finale: più lungo (1 sec) e acuto (1000 Hz)
            playBeep(1000, 1.0, 'sine');
            
            if ('vibrate' in navigator) navigator.vibrate([400, 100, 400]);
            
            // Un leggero ritardo sull'alert evita che blocchi l'audio del browser
            setTimeout(() => alert("Tempo di recupero terminato!"), 200);
            
        } else if (state.timer.remainingSeconds <= 5) {
            // Beep brevi di avviso: corti (0.15 sec) e tono medio (600 Hz)
            playBeep(600, 0.15, 'sine');
            updateTimerDisplay();
            
        } else {
            updateTimerDisplay();
        }
    }, 1000);
}

export function stopTimer() {
    if (state.timer.intervalId) {
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
    }
    state.timer.isActive = false;
    state.timer.remainingSeconds = 0;

    const displayElem = document.getElementById('floating-timer');
    if (displayElem) displayElem.style.display = 'none';
}

export function adjustTimer(amountInSeconds) {
    if (!state.timer.isActive) {
        startTimer(Math.max(30, 90 + amountInSeconds));
        return;
    }

    state.timer.remainingSeconds += amountInSeconds;
    if (state.timer.remainingSeconds <= 0) {
        stopTimer();
    } else {
        updateTimerDisplay();
    }
}

function updateTimerDisplay() {
    const timerDisplay = document.getElementById('timer-display');
    if (!timerDisplay) return;

    const mins = Math.floor(state.timer.remainingSeconds / 60);
    const secs = state.timer.remainingSeconds % 60;
    timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}