// storage.js
import { CONFIG } from './config.js';
import { state } from './state.js';
import { pushDataToSupabase } from './sync.js';

const DEFAULT_WORKOUT_DATA = {
    athlete: { email: null },
    history: { years: {} }
};

export function saveToLocalStorage(data) {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
        state.workoutData = data; 
    } catch (e) {
        console.error('Errore nel salvataggio in locale:', e);
    }
}

export function getFromLocalStorage() {
    try {
        const data = localStorage.getItem(CONFIG.STORAGE_KEY);
        // Se non esiste nulla in locale, restituisce la struttura gerarchica vuota di default
        return data ? JSON.parse(data) : DEFAULT_WORKOUT_DATA;
    } catch (e) {
        console.error('Errore nel caricamento locale:', e);
        return DEFAULT_WORKOUT_DATA;
    }
}

export async function saveAndSync(data) {
    saveToLocalStorage(data);
    
    if (state.currentUser && navigator.onLine) {
        await pushDataToSupabase(state.currentUser, data);
    }
}

export function clearLocalData() {
    if (confirm("Sei sicuro di voler eliminare tutti i dati locali? L'operazione è irreversibile se non sincronizzata.")) {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        state.workoutData = DEFAULT_WORKOUT_DATA;
        alert("Dati locali eliminati.");
        window.location.reload(); 
    }
}