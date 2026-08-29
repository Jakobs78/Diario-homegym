// storage.js
import { CONFIG } from './config.js';
import { state } from './state.js';
import { pushDataToSupabase } from './sync.js';

const PENDING_SYNC_KEY = `${CONFIG.STORAGE_KEY}_pending_sync`;

const DEFAULT_WORKOUT_DATA = {
    athlete: { email: null },
    history: { years: {} },
    updatedAt: null
};

let syncDebounceTimer = null;
let isSyncing = false;

/**
 * Salvataggio immediato e sincrono in LocalStorage
 */
export function saveToLocalStorage(data) {
    try {
        data.updatedAt = new Date().toISOString();
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
        state.workoutData = data;
    } catch (e) {
        console.error('❌ Errore critico nel salvataggio in LocalStorage:', e);
    }
}

/**
 * Recupero dati da LocalStorage
 */
export function getFromLocalStorage() {
    try {
        const data = localStorage.getItem(CONFIG.STORAGE_KEY);
        return data ? JSON.parse(data) : DEFAULT_WORKOUT_DATA;
    } catch (e) {
        console.error('❌ Errore nel caricamento dei dati locali:', e);
        return DEFAULT_WORKOUT_DATA;
    }
}

/**
 * Salvataggio sicuro locale + Sincronizzazione remota ottimizzata
 */
export async function saveAndSync(data) {
    // 1. Salvataggio locale immediato (reattività UI istantanea)
    saveToLocalStorage(data);
    
    // 2. Imposta il flag di modifica pendente
    setPendingSyncFlag(true);

    // 3. Se l'utente non è autenticato o è offline, si ferma al salvataggio locale
    if (!state.currentUser || !navigator.onLine) {
        return;
    }

    // 4. Debounce della chiamata cloud (attende 1.5s di inattività per evitare spam durante la digitazione)
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);

    syncDebounceTimer = setTimeout(async () => {
        await processSyncQueue();
    }, 1500);
}

/**
 * Esegue il push su Supabase gestendo code e blocchi concorrenziali
 */
export async function processSyncQueue() {
    if (isSyncing || !state.currentUser || !navigator.onLine) return;

    try {
        isSyncing = true;
        const localData = getFromLocalStorage();
        
        const success = await pushDataToSupabase(state.currentUser, localData);
        
        if (success !== false) {
            setPendingSyncFlag(false);
        }
    } catch (error) {
        console.error("❌ Errore durante la sincronizzazione cloud:", error);
    } finally {
        isSyncing = false;
    }
}

/**
 * Gestione dello stato di sincronizzazione pendente
 */
function setPendingSyncFlag(isPending) {
    if (isPending) {
        localStorage.setItem(PENDING_SYNC_KEY, 'true');
    } else {
        localStorage.removeItem(PENDING_SYNC_KEY);
    }
}

export function hasPendingSync() {
    return localStorage.getItem(PENDING_SYNC_KEY) === 'true';
}

/**
 * Reset dei dati locali
 */
export function clearLocalData() {
    if (confirm("Sei sicuro di voler eliminare tutti i dati locali? L'operazione è irreversibile se non sincronizzata.")) {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        localStorage.removeItem(PENDING_SYNC_KEY);
        state.workoutData = DEFAULT_WORKOUT_DATA;
        alert("Dati locali eliminati.");
        window.location.reload();
    }
}

// --- LISTENER DI RETE AUTOMATICO ---
// Quando il dispositivo torna online, recupera ed invia i dati pendenti accumulati offline
window.addEventListener('online', () => {
    if (hasPendingSync()) {
        processSyncQueue();
    }
});