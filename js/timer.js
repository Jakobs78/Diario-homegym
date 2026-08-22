// Logica del timer e audio di allarme
// js/timer.js
let restInterval = null;
let currentTimerSeconds = 0; 

export function playBeep(frequency = 800, duration = 0.3, volume = 0.2) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

export function parseRestTime(restStr) {
    if (!restStr) return 90; 
    restStr = String(restStr).toLowerCase().trim();
    
    if (restStr.includes('m')) {
        let mins = 0;
        let secs = 0;
        const minMatch = restStr.match(/(\d+(?:\.\d+)?)\s*(?:m|min)/);
        if (minMatch) mins = parseFloat(minMatch[1]) || 0;
        const secMatch = restStr.match(/(\d+)\s*(?:s|sec)/);
        if (secMatch) secs = parseInt(secMatch[1]) || 0;
        return Math.round((mins * 60) + secs);
    }
    
    if (restStr.includes(':') || restStr.includes("'") || restStr.includes('.')) {
        const parts = restStr.split(/[:'.]/);
        const mins = parseInt(parts[0]) || 0;
        const secs = parseInt(parts[1]) || 0;
        return (mins * 60) + secs;
    }
    
    const cleanNum = parseInt(restStr.replace(/\D/g, ''));
    return !isNaN(cleanNum) ? cleanNum : 90; 
}

export function startTimer(seconds) {
    stopTimer();
    
    const timerUI = document.getElementById('floating-timer');
    const display = document.getElementById('timer-display');
    currentTimerSeconds = seconds;
    
    timerUI.classList.add('active');
    
    const updateDisplay = () => {
        const m = Math.floor(currentTimerSeconds / 60).toString().padStart(2, '0');
        const s = (currentTimerSeconds % 60).toString().padStart(2, '0');
        display.innerText = `${m}:${s}`;
    };
    
    updateDisplay();
    
    restInterval = setInterval(() => {
        currentTimerSeconds--;
        updateDisplay();
        
        if (currentTimerSeconds > 0 && currentTimerSeconds <= 3) {
            playBeep(800, 0.15, 0.2);
        }

        if (currentTimerSeconds <= 0) {
            playBeep(1700, 1, 0.7);
            stopTimer();
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
    }, 1000);
}

export function adjustTimer(amount) {
    currentTimerSeconds += amount;
    if (currentTimerSeconds < 0) currentTimerSeconds = 0;
    
    const m = Math.floor(currentTimerSeconds / 60).toString().padStart(2, '0');
    const s = (currentTimerSeconds % 60).toString().padStart(2, '0');
    document.getElementById('timer-display').innerText = `${m}:${s}`;
    
    if (currentTimerSeconds === 0) {
        stopTimer();
    }
}

export function stopTimer() {
    clearInterval(restInterval);
    const timerUI = document.getElementById('floating-timer');
    if (timerUI) timerUI.classList.remove('active');
}