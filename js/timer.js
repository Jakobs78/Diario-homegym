// js/timer.js
import { playBeep } from './audio.js';

let timerInterval = null;
let endTime = null;

/**
 * Converte varie notazioni di tempo di recupero in un valore numerico in secondi.
 * Supporta: 90, "90s", "1:30", "1.30", "1.5", "2min", "2m", "2'"
 */
export function parseRecoveryTime(input) {
    if (input === null || input === undefined) return 90;

    if (typeof input === 'number' && !isNaN(input)) {
        // Se il numero è piccolo (es. 2, 1.5, 3), nel contesto bodybuilding sono minuti -> convertiamo in secondi
        if (input <= 10) return Math.round(input * 60);
        return input > 0 ? Math.round(input) : 90;
    }

    let str = String(input).trim().toLowerCase().replace(',', '.');
    if (!str) return 90;

    if (str.includes(':')) {
        const parts = str.split(':');
        return Math.round((parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0));
    }

    if (str.includes('min') || str.endsWith('m') || str.endsWith("'")) {
        const num = parseFloat(str.replace(/[^0-9.]/g, ''));
        return !isNaN(num) ? Math.round(num * 60) : 60;
    }

    if (str.endsWith('s') || str.includes('sec') || str.endsWith('"')) {
        const num = parseFloat(str.replace(/[^0-9.]/g, ''));
        return !isNaN(num) ? Math.round(num) : 60;
    }

    const val = parseFloat(str);
    if (!isNaN(val)) {
        if (str.includes('.') && val <= 10) {
            const parts = str.split('.');
            const min = parseInt(parts[0], 10) || 0;
            const decStr = parts[1] || '0';
            if (decStr.length === 2 && parseInt(decStr, 10) < 60) {
                return Math.round(min * 60 + parseInt(decStr, 10));
            }
            return Math.round(val * 60);
        }
        return Math.round(val);
    }

    return 60;
}

/**
 * Avvia il timer di recupero basato su timestamp
 */
export function startTimer(durationInput, onTick, onComplete) {
    stopTimer();

    const seconds = parseRecoveryTime(durationInput);
    if (!seconds || seconds <= 0) return;

    endTime = Date.now() + seconds * 1000;

    updateTimerUI(onTick, onComplete);

    timerInterval = setInterval(() => {
        updateTimerUI(onTick, onComplete);
    }, 250);

    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("visibilitychange", () => handleVisibilityChange(onTick, onComplete));
}

/**
 * Regola il timer in corso aggiungendo o sottraendo secondi (es. +30s / -30s)
 */
export function adjustTimer(secondsToAdd, onTick, onComplete) {
    if (!endTime) return;

    endTime += secondsToAdd * 1000;

    if (endTime <= Date.now()) {
        stopTimer();
        if (typeof onTick === "function") onTick(0);
        if (typeof onComplete === "function") onComplete();
        triggerTimerAlert();
    } else {
        updateTimerUI(onTick, onComplete);
    }
}

/**
 * Ferma il timer in corso
 */
export function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    endTime = null;
}

function updateTimerUI(onTick, onComplete) {
    if (!endTime) return;

    const remainingMs = endTime - Date.now();
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    if (remainingSeconds <= 0) {
        stopTimer();
        if (typeof onTick === "function") onTick(0);
        if (typeof onComplete === "function") onComplete();
        triggerTimerAlert();
    } else {
        if (typeof onTick === "function") onTick(remainingSeconds);
    }
}

function handleVisibilityChange(onTick, onComplete) {
    if (document.visibilityState === "visible" && endTime) {
        updateTimerUI(onTick, onComplete);
    }
}

function triggerTimerAlert() {
    if ("vibrate" in navigator) {
        try {
            navigator.vibrate([200, 100, 200, 100, 400]);
        } catch (e) {
            console.warn("Vibrazione non supportata o bloccata:", e);
        }
    }
}