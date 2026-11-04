// ==========================================
// MODULI: timer.js - Gestione del timer di recupero, parsing formati temporali, audio beep e visibilità pagina
// ==========================================

import {state} from './state.js';
import { playBeep } from './audio.js';

let timerInterval = null;
let endTime = null;
let activeContext=null;
let boundVisibilityHandler = null;
let lastBeepSecond = null;
const REST_TIMER_KEY='homegym_rest_timer_deadline_v1';
const PERSISTENT_REST_KEY='homegym_rest_timer_v2';
export function getRestTimerSnapshot(){
 return {deadline:endTime,remainingSeconds:endTime?Math.max(0,Math.ceil((endTime-Date.now())/1000)):0};
}
function publishRestTick(){document.dispatchEvent(new CustomEvent('homegym-rest-tick'));}
function restContext(){
 const year=state.workoutData?.history?.years?.[state.currentYear],meso=year?.mesocycles?.[state.activeMesocycleIndex||0];
 const day=meso?.weeks?.find(w=>Number(w.weekNumber)===Number(state.activeWeek||1))?.days?.[(state.activeDay||1)-1];
 return {owner:state.currentUser?.id||'local',year:state.currentYear,mesoId:meso?.id||null,mesoIndex:state.activeMesocycleIndex||0,week:state.activeWeek||1,day:state.activeDay||1,attempt:day?.sessionArchives?.length||0};
}
function validRestOrigin(context){
 if(!context||context.owner!==(state.currentUser?.id||'local'))return false;
 const mesos=state.workoutData?.history?.years?.[context.year]?.mesocycles||[];
 const meso=context.mesoId?mesos.find(m=>m.id===context.mesoId):mesos[context.mesoIndex];
 const day=meso?.weeks?.find(w=>Number(w.weekNumber)===Number(context.week))?.days?.[context.day-1];
 return Boolean(day&&!day.completed&&!meso.locked&&(day.sessionArchives?.length||0)===context.attempt);
}
function persistRest(){
 try{sessionStorage.setItem(REST_TIMER_KEY,String(endTime));}catch{}
 try{localStorage.setItem(PERSISTENT_REST_KEY,JSON.stringify({deadline:endTime,context:activeContext}));}catch{}
}
/**
 * Format un valore in secondi in formato MM:SS
 */
export function formatTimerTime(totalSeconds) {
    const sec = Math.max(0, parseInt(totalSeconds, 10) || 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Converte varie notazioni di tempo di recupero in un valore numerico in secondi.
 * Supporta: 90, "90s", "1:30", "1.30", "1.5", "2min", "2m", "2'"
 */
export function parseRecoveryTime(input) {
    if (input === null || input === undefined) return 120;

    if (typeof input === 'number' && !isNaN(input)) {
        if (input <= 10) return Math.round(input * 60);
        return input > 0 ? Math.round(input) : 120;
    }

    let str = String(input).trim().toLowerCase().replace(',', '.');
    if (!str) return 120;

    if (str.includes(':')) {
        const parts = str.split(':');
        return Math.round((parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0));
    }

    if (str.includes('min') || str.endsWith('m') || str.endsWith("'")) {
        const cleanNumStr = str.replace(/min|m|'/g, '').trim();
        const val = parseFloat(cleanNumStr);
        if (!isNaN(val)) {
            if (cleanNumStr.includes('.')) {
                const parts = cleanNumStr.split('.');
                const min = parseInt(parts[0], 10) || 0;
                const decStr = parts[1] || '0';
                if (decStr.length === 2 && parseInt(decStr, 10) < 60) {
                    return Math.round(min * 60 + parseInt(decStr, 10));
                }
                return Math.round(val * 60);
            }
            return Math.round(val * 60);
        }
        return 120;
    }

    if (str.endsWith('s') || str.includes('sec') || str.endsWith('"')) {
        const num = parseFloat(str.replace(/[^0-9.]/g, ''));
        return !isNaN(num) ? Math.round(num) : 120;
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

    return 120;
}

/**
 * Avvia il timer di recupero basato su timestamp
 */
// timer.js (estratto)

export function startTimer(durationInput, onTick, onComplete) {
    stopTimer();

    const seconds = parseRecoveryTime(durationInput);
    if (!seconds || seconds <= 0) return;

    activeContext=restContext();
    endTime = Date.now() + seconds * 1000;
    persistRest();

    const tickCallback = onTick || handleTick;
    const completeCallback = onComplete || handleComplete;

    updateTimerUI(tickCallback, completeCallback);

    // Portato a 500ms per ridurre il carico CPU/Batteria sui dispositivi mobile
    timerInterval = setInterval(() => {
        updateTimerUI(tickCallback, completeCallback);
    }, 500);

    if (boundVisibilityHandler) {
        document.removeEventListener("visibilitychange", boundVisibilityHandler);
    }

    boundVisibilityHandler = () => {
        if (document.visibilityState === "visible" && endTime) {
            updateTimerUI(tickCallback, completeCallback);
        }
    };

    document.addEventListener("visibilitychange", boundVisibilityHandler);
}

/**
 * Regola il timer in corso aggiungendo o sottraendo secondi (es. +30s / -15s)
 */
export function adjustTimer(secondsToAdd, onTick, onComplete) {
    if (!endTime) return;

    const tickCallback = onTick || handleTick;
    const completeCallback = onComplete || handleComplete;

    endTime += secondsToAdd * 1000;
    persistRest();

    if (endTime <= Date.now()) {
        stopTimer();
        if (typeof tickCallback === "function") tickCallback(0);
        if (typeof completeCallback === "function") completeCallback();
        triggerTimerAlert();
    } else {
        updateTimerUI(tickCallback, completeCallback);
    }
}

/**
 * Aggiorna il testo dell'interfaccia utente ad ogni tick del timer
 */
export function handleTick(remainingSeconds) {
    publishRestTick();
    const timerContainer = document.getElementById('floating-timer');
    const timerDisplay = document.getElementById('timer-display');

    if (timerContainer) {
        timerContainer.style.display = 'flex';
        timerContainer.classList.add('active');
    }
    if (timerDisplay) timerDisplay.textContent = formatTimerTime(remainingSeconds);
}

/**
 * Gestisce l'azzeramento del timer nell'interfaccia
 */
export function handleComplete() {
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) timerDisplay.textContent = "00:00";
    setTimeout(() => stopTimer(), 1500);
}

/**
 * Inizializza i listener degli eventi per i controlli del timer floating (+30s, -15s, chiudi)
 */
export function initTimerEvents() {
    const addBtn = document.getElementById('timer-add-btn');
    const subBtn = document.getElementById('timer-sub-btn');
    const closeBtn = document.getElementById('timer-close-btn');

    if (addBtn) {
        addBtn.addEventListener('click', () => adjustTimer(30));
    }
    if (subBtn) {
        subBtn.addEventListener('click', () => adjustTimer(-15));
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', () => stopTimer());
    }
}

/**
 * Restore the original rest deadline after closing the PWA, for the same
 * account and session only; never extend the original rest duration.
 */
export function restoreActiveRestTimer({allowRestore=true,legacyAllowed=allowRestore}={}) {
    if(!allowRestore) {
        stopTimer();
        return false;
    }
    if(endTime)return false;
    let saved=null,restoredContext=null;
    try{
        const persistent=JSON.parse(localStorage.getItem(PERSISTENT_REST_KEY)||'null');
        if(persistent){if(!validRestOrigin(persistent.context))return false;saved=Number(persistent.deadline);restoredContext=persistent.context;}
        else {if(!legacyAllowed)return false;saved=Number(sessionStorage.getItem(REST_TIMER_KEY));}
    }catch{}
    if(!Number.isFinite(saved)||!saved || saved<=Date.now() ||
        saved-Date.now()>60*60*1000){
        try{sessionStorage.removeItem(REST_TIMER_KEY);localStorage.removeItem(PERSISTENT_REST_KEY);}catch{}
        if(saved>0&&saved<=Date.now()&&Date.now()-saved<60*60*1000){
            handleTick(0);const display=document.getElementById('timer-display');if(display)display.textContent='Recupero concluso';handleCompleteTimerNotice();
        }
        return false;
    }
    const remaining=Math.ceil((saved-Date.now())/1000);
    startTimer(String(remaining)+'s');
    endTime=saved; // keep exact original deadline, not rounded new start
    activeContext=restoredContext||restContext();
    persistRest();
    return true;
}

export function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    endTime = null;activeContext=null;
    publishRestTick();
    try{sessionStorage.removeItem(REST_TIMER_KEY);localStorage.removeItem(PERSISTENT_REST_KEY);}catch{}
    lastBeepSecond = null; // Reset dello stato del beep

    if (boundVisibilityHandler) {
        document.removeEventListener("visibilitychange", boundVisibilityHandler);
        boundVisibilityHandler = null;
    }

    const timerContainer = document.getElementById('floating-timer');
    if (timerContainer) {
        timerContainer.style.display = 'none';
        timerContainer.classList.remove('active');
    }
}

function updateTimerUI(onTick, onComplete) {
    if (!endTime) return;

    const remainingMs = endTime - Date.now();
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    if (remainingSeconds <= 0) {
        stopTimer();
        if (typeof onTick === "function") onTick(0);
        if (typeof onComplete === "function") onComplete();
        triggerTimerAlert(); // Beep finale (più lungo/diverso se vuoi, o lo stesso)
    } else {
        if (typeof onTick === "function") onTick(remainingSeconds);

        // Se siamo negli ultimi 5 secondi (da 5 a 1) e non abbiamo ancora suonato per questo secondo
        if (remainingSeconds <= 5 && remainingSeconds !== lastBeepSecond) {
            lastBeepSecond = remainingSeconds;
            playBeep(880, 0.1, 'sine'); // Beep breve e acuto per il countdown
        }
    }
}

function triggerTimerAlert() {
    playBeep(1700, 1.2, 'sine');

    if ("vibrate" in navigator) {
        try {
            navigator.vibrate([200, 100, 200, 100, 400]);
        } catch (e) {
            console.warn("Vibrazione non supportata o bloccata:", e);
        }
    }
}
function handleCompleteTimerNotice(){setTimeout(()=>{if(!endTime)stopTimer();},4000);}
