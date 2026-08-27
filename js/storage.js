// storage.js
import { CONFIG } from './config.js';
import { state } from './state.js';
import { pushDataToSupabase } from './sync.js';

export function saveToLocalStorage(data) {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
        state.workoutData = data; // Mantieni sincronizzato lo stato in RAM
    } catch (e) {
        console.error('Errore nel salvataggio in locale:', e);
    }
}

export function getFromLocalStorage() {
    try {
        const data = localStorage.getItem(CONFIG.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Errore nel caricamento locale:', e);
        return [];
    }
}

export async function saveAndSync(data) {
    // 1. Salvataggio immediato in locale (garantisce il salvataggio offline)
    saveToLocalStorage(data);
    
    // 2. Sincronizzazione in cloud se l'utente è loggato ed è online
    if (state.currentUser && navigator.onLine) {
        await pushDataToSupabase(state.currentUser, data);
    }
}

export function clearLocalData() {
    if (confirm("Sei sicuro di voler eliminare tutti i dati locali? L'operazione è irreversibile se non sincronizzata.")) {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        state.workoutData = [];
        alert("Dati locali eliminati.");
        // Ricarica la pagina per azzerare l'interfaccia
        window.location.reload(); 
    }
}