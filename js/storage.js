// storage.js
import { CONFIG } from './config.js';
import { state, resetState } from './state.js';
import { pushDataToSupabase, deleteCloudData } from './sync.js';
import { exportToCSV } from './csvHandler.js';

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

// Aggiorna in tempo reale se online o offline
export async function saveAndSync(data) {
    saveToLocalStorage(data);
    setPendingSyncFlag(true);
    updateSyncStatusUI(); // <-- Aggiorna subito il badge in 🟠 Offline o 🟠 Sincronizzazione...

    if (!state.currentUser || !navigator.onLine) {
        return;
    }

    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);

    syncDebounceTimer = setTimeout(async () => {
        await processSyncQueue();
    }, 1500);
}

export async function processSyncQueue() {
    if (isSyncing || !state.currentUser || !navigator.onLine) {
        updateSyncStatusUI();
        return;
    }

    try {
        isSyncing = true;
        updateSyncStatusUI();
        
        const localData = getFromLocalStorage();
        const success = await pushDataToSupabase(state.currentUser, localData);
        
        if (success !== false) {
            setPendingSyncFlag(false);
        }
    } catch (error) {
        console.error("❌ Errore durante la sincronizzazione cloud:", error);
    } finally {
        isSyncing = false;
        updateSyncStatusUI(); // <-- Torna a 🟢 Sincronizzato al termine
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
 * PROCEDURA DI ELIMINAZIONE TOTALE:
 * Genera l'overlay a schermo intero con doppio avviso e backup CSV
 */
export function clearAllData() {
    // Rimuove eventuali overlay già aperti per sicurezza
    document.querySelector('.danger-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'danger-overlay';

    // Step 1: Avviso forte + Opzione Backup CSV
    overlay.innerHTML = `
        <div class="danger-modal-card animate-pop">
            <div class="danger-icon-wrapper">
                <div class="danger-pulse"></div>
                <span class="danger-icon">⚠️</span>
            </div>
            
            <h2 class="danger-title">ATTENZIONE: ELIMINAZIONE TOTALE</h2>
            
            <p class="danger-text">
                Stai per cancellare <strong>definitivamente</strong> tutti i mesocicli, gli esercizi e lo storico salvato sia su questo dispositivo che su <strong>Supabase</strong>.
            </p>

            <div class="danger-recommendation">
                💡 <strong>Raccomandazione importante:</strong><br>
                Ti consigliamo fortemente di scaricare prima una copia di sicurezza del tuo storico in formato CSV.
            </div>

            <div class="danger-actions">
                <button id="danger-backup-btn" class="btn-danger-backup">
                    💾 Scarica Backup CSV Ora
                </button>
                <button id="danger-step2-btn" class="btn-danger-proceed">
                    Ho già un backup / Procedi ➔
                </button>
                <button id="danger-cancel-btn" class="btn-danger-cancel">
                    Annulla e Torna Indietro
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Event Listeners Step 1
    overlay.querySelector('#danger-backup-btn')?.addEventListener('click', () => {
        if (state.workoutData && typeof exportToCSV === 'function') {
            exportToCSV(state.workoutData);
        } else {
            alert("Nessun dato storico da salvare.");
        }
    });

    overlay.querySelector('#danger-cancel-btn')?.addEventListener('click', () => {
        overlay.remove();
    });

    overlay.querySelector('#danger-step2-btn')?.addEventListener('click', () => {
        showFinalConfirmationStep(overlay);
    });
}

/**
 * Step 2: Modal di conferma irreversibile (richiede digitazione "ELIMINA")
 */
function showFinalConfirmationStep(overlay) {
    const card = overlay.querySelector('.danger-modal-card');
    if (!card) return;

    card.classList.add('danger-card-critical');
    card.innerHTML = `
        <div class="danger-icon-wrapper">
            <span class="danger-icon">☠️</span>
        </div>
        
        <h2 class="danger-title" style="color: #ef4444;">ULTIMO AVVISO - CONFERMA FINALE</h2>
        
        <p class="danger-text">
            Questa operazione è <strong>IRREVERSIBILE</strong>.<br>
            Tutti i dati in locale e sul Cloud verranno distrutti.
        </p>

        <div class="danger-confirm-box">
            <label for="danger-confirm-input">Scrivi <strong>ELIMINA</strong> per confermare:</label>
            <input type="text" id="danger-confirm-input" placeholder="ELIMINA" autocomplete="off" />
        </div>

        <div class="danger-actions">
            <button id="danger-final-delete-btn" class="btn-danger-destroy" disabled>
                🔥 ELIMINA TUTTI I DATI
            </button>
            <button id="danger-final-cancel-btn" class="btn-danger-cancel">
                Annulla
            </button>
        </div>
    `;

    const input = card.querySelector('#danger-confirm-input');
    const deleteBtn = card.querySelector('#danger-final-delete-btn');
    const cancelBtn = card.querySelector('#danger-final-cancel-btn');

    // Abilita il pulsante solo quando la parola chiave è corretta
    input?.addEventListener('input', (e) => {
        const value = e.target.value.trim().toUpperCase();
        deleteBtn.disabled = value !== 'ELIMINA';
    });

    cancelBtn?.addEventListener('click', () => overlay.remove());

    deleteBtn?.addEventListener('click', async () => {
        deleteBtn.disabled = true;
        deleteBtn.innerText = "Eliminazione in corso...";

        try {
            // 1. Eliminazione dati remoti su Supabase
            if (typeof deleteCloudData === 'function') {
                await deleteCloudData(state.currentUser);
            }

            // 2. Pulizia storage di sistema
            localStorage.clear();
            sessionStorage.clear();
            
            // 3. Reset dello stato in memoria
            if (typeof resetState === 'function') {
                resetState();
            } else {
                state.workoutData = DEFAULT_WORKOUT_DATA;
            }

            // 4. Ricarica pulita della webapp
            window.location.reload();
        } catch (err) {
            console.error("❌ Errore durante l'eliminazione:", err);
            alert("Errore durante l'eliminazione dei dati nel cloud: " + err.message);
            deleteBtn.disabled = false;
            deleteBtn.innerText = "Riprova";
        }
    });
}
/**
 * Mantenuto per retrocompatibilità
 */
export function clearLocalData() {
    clearAllData();
}

/**
 * Aggiorna il badge di stato nell'header (#sync-status)
 */
export function updateSyncStatusUI() {
    const syncBadge = document.getElementById('sync-status');
    if (!syncBadge) return;

    if (!navigator.onLine) {
        syncBadge.textContent = '🔴 Offline';
        syncBadge.title = 'Nessuna connessione internet. I dati sono salvati sul dispositivo.';
    } else if (hasPendingSync()) {
        syncBadge.textContent = '🟠 Sincronizzazione...';
        syncBadge.title = 'Sincronizzazione dei dati locali con Supabase in corso...';
    } else {
        syncBadge.textContent = '🟢 Sincronizzato';
        syncBadge.title = 'Dati aggiornati nel cloud';
    }
}

// --- LISTENER AUTOMATICI DI RETE ---

window.addEventListener('online', () => {
    updateSyncStatusUI();
    if (hasPendingSync()) {
        processSyncQueue();
    }
});

window.addEventListener('offline', () => {
    updateSyncStatusUI();
});

// Esegue un controllo dello stato immediato all'avvio della pagina
document.addEventListener('DOMContentLoaded', updateSyncStatusUI);