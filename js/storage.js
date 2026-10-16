// ==========================================
// MODULI: storage.js - Persistenza locale, gestione coda offline (Sync Queue), sincronizzazione cloud e UI badge
// ==========================================

// ==========================================
// 1. IMPORT & COSTANTI
// ==========================================
import { CONFIG } from './config.js';
import { state, resetState } from './state.js';
import { pushDataToSupabase, deleteCloudData } from './sync.js';
import { exportToCSV } from './csvHandler.js';

const QUEUE_KEY = `${CONFIG.STORAGE_KEY}_sync_queue`;
const OWNER_KEY = `${CONFIG.STORAGE_KEY}_owner`;
const scopedKey = id => `${CONFIG.STORAGE_KEY}_user_${id}`;
export function getStoredLocalOwner(){return localStorage.getItem(OWNER_KEY);}
export function getFromLocalStorageForUser(user){
    const id=user?.id ? String(user.id) : null;
    if(!id)return getFromLocalStorage();
    const scoped=localStorage.getItem(scopedKey(id));
    if(scoped){
        try {return JSON.parse(scoped);}
        catch {return structuredClone(DEFAULT_WORKOUT_DATA);}
    }
    const owner=getStoredLocalOwner();
    // Never show a different signed-in athlete's cached diary.
    return owner && owner!==id ? structuredClone(DEFAULT_WORKOUT_DATA)
        : getFromLocalStorage(); // legacy installs without an owner marker
}

const DEFAULT_WORKOUT_DATA = {
    athlete: { email: null },
    history: { years: {} },
    updatedAt: null
};

let syncDebounceTimer = null;
let isSyncing = false;

// ==========================================
// 2. GESTIONE CODA OFFLINE (SYNC QUEUE)
// ==========================================
function getQueue() {
    const queue = localStorage.getItem(QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
}

function enqueueAction(action) {
    const queue = getQueue();
    queue.push(action);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function clearQueue() {
    localStorage.removeItem(QUEUE_KEY);
}

export function hasPendingSync() {
    const currentId=state.currentUser?.id ? String(state.currentUser.id) : null;
    const owner=getStoredLocalOwner();
    return getQueue().some(action=>
        !currentId || (action.ownerId
            ? String(action.ownerId)===currentId
            : !owner || owner===currentId));
}

// ==========================================
// 3. OPERAZIONI LOCALSTORAGE
// ==========================================
export function saveToLocalStorage(data, {preserveUpdatedAt = false} = {}) {
    try {
        // Cloud hydration MUST NOT change the original modification timestamp.
        if (!preserveUpdatedAt) data.updatedAt = new Date().toISOString();
        const encoded=JSON.stringify(data);
        localStorage.setItem(CONFIG.STORAGE_KEY, encoded);
        const id=state.currentUser?.id;
        if(id){
            localStorage.setItem(scopedKey(id),encoded);
            localStorage.setItem(OWNER_KEY,String(id));
        }
        state.workoutData = data;
    } catch (e) {
        console.error('❌ Errore critico nel salvataggio in LocalStorage:', e);
    }
}

export function getFromLocalStorage() {
    try {
        const data = localStorage.getItem(CONFIG.STORAGE_KEY);
        return data ? JSON.parse(data) : DEFAULT_WORKOUT_DATA;
    } catch (e) {
        console.error('❌ Errore nel caricamento dei dati locali:', e);
        return DEFAULT_WORKOUT_DATA;
    }
}

// ==========================================
// 4. SINCRONIZZAZIONE CLOUD & CODA
// ==========================================
export async function saveAndSync(data, actionType = 'UPDATE_WORKOUT') {
    saveToLocalStorage(data);
    
    enqueueAction({
        id: crypto.randomUUID(),
        type: actionType,
        payload: data, 
        timestamp: Date.now(),
        ownerId:state.currentUser?.id || getStoredLocalOwner() || null
    });

    updateSyncStatusUI(); 

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

    const queue = getQueue();
    if (queue.length === 0) {
        updateSyncStatusUI();
        return;
    }

    try {
        isSyncing = true;
        updateSyncStatusUI();
        
        queue.sort((a, b) => a.timestamp - b.timestamp);

        for (const action of queue) {
            // A local journal snapshot belongs only to its original account.
            // Leave another account's pending edits in the queue for later.
            const currentId=String(state.currentUser?.id || '');
            const expectedId=String(action.ownerId || getStoredLocalOwner() || '');
            if(expectedId && currentId!==expectedId)continue;
            const success = await pushDataToSupabase(state.currentUser, action.payload, action.timestamp);
            if (!success) {
                throw new Error(`Sincronizzazione fallita per l'azione ${action.id}`);
            }
            // Keep edits enqueued during the network request; only delete
            // entries that were actually acknowledged by the cloud.
            const remaining=getQueue().filter(item=>item.id!==action.id);
            if(remaining.length)localStorage.setItem(QUEUE_KEY,JSON.stringify(remaining));
            else clearQueue();
        }
    } catch (error) {
        console.error("❌ Errore durante la sincronizzazione cloud (i dati restano in coda):", error);
    } finally {
        isSyncing = false;
        updateSyncStatusUI(); 
    }
}

// ==========================================
// 5. UI & BADGE STATO SINCRONIZZAZIONE
// ==========================================
export function updateSyncStatusUI() {
    const syncBadge = document.getElementById('sync-status');
    if (!syncBadge) return;

    const offline = !navigator.onLine;
    const pending = !offline && hasPendingSync();
    // Stato sempre leggibile nel layout compatto: messaggio esteso come
    // tooltip e nome accessibile, senza nascondere gli avvisi di rischio.
    const detail = offline
        ? 'Offline: dati salvati sul dispositivo in attesa di rete.'
        : pending
            ? 'Modifiche non sincronizzate: non cambiare dispositivo prima della sincronizzazione.'
            : 'Sincronizzato: tutti i dati sono allineati con il cloud.';
    syncBadge.textContent = offline ? '● Offline' : pending ? '⚠ In coda' : '✓ Cloud';
    syncBadge.title = detail;
    syncBadge.setAttribute('aria-label', detail);
    syncBadge.classList.toggle('is-offline', offline);
    syncBadge.classList.toggle('is-pending', pending);
    syncBadge.style.cursor = pending ? 'pointer' : 'default';
    syncBadge.style.background = '';
    syncBadge.style.color = '';
    syncBadge.style.padding = '';
    syncBadge.style.borderRadius = '';
    syncBadge.style.fontWeight = '';
}

// Listener per forzatura manuale sincronizzazione via badge UI
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'sync-status' && hasPendingSync() && navigator.onLine) {
        console.log("Forzatura sincronizzazione manuale richiesta dall'utente...");
        processSyncQueue();
    }
});

// Listener di rete
window.addEventListener('online', () => {
    updateSyncStatusUI();
    if (hasPendingSync()) processSyncQueue();
});

window.addEventListener('offline', updateSyncStatusUI);
document.addEventListener('DOMContentLoaded', updateSyncStatusUI);

// ==========================================
// 6. PROCEDURA ELIMINAZIONE TOTALE DATI
// ==========================================
export function clearAllData() {
    document.querySelector('.danger-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'danger-overlay';

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

    overlay.querySelector('#danger-backup-btn')?.addEventListener('click', () => {
        if (state.workoutData && typeof exportToCSV === 'function') {
            exportToCSV(state.workoutData);
        } else {
            alert("Nessun dato storico da salvare.");
        }
    });

    overlay.querySelector('#danger-cancel-btn')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#danger-step2-btn')?.addEventListener('click', () => showFinalConfirmationStep(overlay));
}

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

    input?.addEventListener('input', (e) => {
        const value = e.target.value.trim().toUpperCase();
        deleteBtn.disabled = value !== 'ELIMINA';
    });

    cancelBtn?.addEventListener('click', () => overlay.remove());

    deleteBtn?.addEventListener('click', async () => {
        deleteBtn.disabled = true;
        deleteBtn.innerText = "Eliminazione in corso...";

        try {
            if (typeof deleteCloudData === 'function') {
                await deleteCloudData(state.currentUser);
            }

            localStorage.clear();
            sessionStorage.clear();
            clearQueue();
            
            if (typeof resetState === 'function') {
                resetState();
            } else {
                state.workoutData = DEFAULT_WORKOUT_DATA;
            }

            window.location.reload();
        } catch (err) {
            console.error("❌ Errore durante l'eliminazione:", err);
            alert("Errore durante l'eliminazione dei dati nel cloud: " + err.message);
            deleteBtn.disabled = false;
            deleteBtn.innerText = "Riprova";
        }
    });
}

export function clearLocalData() {
    clearAllData();
}