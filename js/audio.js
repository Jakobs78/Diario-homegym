// Modulo per la gestione dell'audio e sblocco Web Audio API (compatibile iOS/Safari)

/*let audioCtx = null;

function initAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Sblocca l'audio al primo tocco o click dell'utente sulla pagina
document.addEventListener('click', initAudioContext, { once: true });
document.addEventListener('touchstart', initAudioContext, { once: true });

/**
 * Genera un segnale acustico (beep) sintetico compatibile con iPhone e Safari.
 
export function playBeep(frequency = 800, duration = 0.15, volume = 0.2) {
    initAudioContext();
    if (!audioCtx) return;

    try {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);

        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.warn("Audio non supportato o bloccato dal browser:", e);
    }
}
    */


    // audio.js
// Inizializzazione sicura per Safari/iOS e altri browser
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

export function playBeep(frequency = 440, duration = 200) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    
    // Stop fluido per evitare "click" audio
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + (duration / 1000));
    
    setTimeout(() => {
        oscillator.stop();
    }, duration + 50);
}