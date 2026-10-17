// ==========================================
// MODULI: storage.js - Persistenza locale, gestione coda offline (Sync Queue), sincronizzazione cloud e UI badge
// ==========================================

// ==========================================
// 1. IMPORT & COSTANTI
// ==========================================
import { CONFIG } from './config.js';
import { state, resetState } from './state.js';
import { pushDataToSupabase, deleteCloudData, resolveSyncConflict } from './sync.js';
import { downloadFullBackup } from './fullBackup.js';

const QUEUE_KEY = `${CONFIG.STORAGE_KEY}_sync_queue`;
const OWNER_KEY = `${CONFIG.STORAGE_KEY}_owner`;
const scopedKey = id => `${CONFIG.STORAGE_KEY}_user_${id}`;
const accountId=user=>String(user?.id||user?.email||'');
const revisionKey=user=>`${CONFIG.STORAGE_KEY}_revision_${accountId(user)}`;
const conflictKey=user=>`workoutApp_data_conflict_${accountId(user)}`;
export const getCloudRevision=user=>localStorage.getItem(revisionKey(user));
export function setCloudRevision(user,revision){
    if(!user || !accountId(user))return;
    if(revision===null||revision===undefined)localStorage.removeItem(revisionKey(user));
    else localStorage.setItem(revisionKey(user),String(revision));
}
export function getSyncConflict(user=state.currentUser){
    if(!user || !accountId(user))return null;
    try {return JSON.parse(localStorage.getItem(conflictKey(user))||'null');}
    catch{return null;}
}
export function recordSyncConflict(user,details) {
    if(!user || !accountId(user))return;
    try {
        localStorage.setItem(conflictKey(user),JSON.stringify(details));
    }catch(error){
        console.error('Impossibile memorizzare lo snapshot del conflitto:',error);
        // The queued local snapshot is still retained. Never upload it
        // without CAS even if the conflict snapshot cannot be cached.
    }
    updateSyncStatusUI();
}

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
let storageFailure = false;
let uploadingActionId=null;

// ==========================================
// 2. GESTIONE CODA OFFLINE (SYNC QUEUE)
// ==========================================
function getQueue() {
    const queue = localStorage.getItem(QUEUE_KEY);
    try{return queue ? JSON.parse(queue) : [];}
    catch(error){
        storageFailure=true;
        console.error('Coda sync illeggibile: dati non cancellati.',error);
        return [];
    }
}

function enqueueAction(action) {
    const queue = getQueue();
    // Each queued action is a FULL journal snapshot. Only the latest
    // snapshot for a given account is needed. Never discard other accounts'
    // records, or the snapshot currently being uploaded on the network.
    const owner=String(action.ownerId??'');
    const compact=queue.filter(item=>String(item.ownerId??'')!==owner ||
        (isSyncing && item.id===uploadingActionId));
    compact.push(action);
    localStorage.setItem(QUEUE_KEY,JSON.stringify(compact));
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
        storageFailure=false;
        return true;
    } catch (e) {
        storageFailure=true;
        console.error('❌ Errore critico nel salvataggio in LocalStorage:', e);
        updateSyncStatusUI();
        return false;
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
    if(!saveToLocalStorage(data)){
        updateSyncStatusUI();
        return false; // Do not pretend a diary is saved when storage is full.
    }
    try{enqueueAction({
        id: crypto.randomUUID(),
        type: actionType,
        payload: data, 
        timestamp: Date.now(),
        ownerId:state.currentUser?.id || getStoredLocalOwner() || null
    });}catch(error){
        storageFailure=true;
        console.error('Impossibile mettere in coda il diario:',error);
        updateSyncStatusUI();
        return false;
    }

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
    if (getSyncConflict() || isSyncing || !state.currentUser || !navigator.onLine) {
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
            uploadingActionId=action.id;
            const result = await pushDataToSupabase(state.currentUser, action.payload, action.timestamp);
            if (!result?.ok) {
                if(result?.conflict){
                    updateSyncStatusUI();
                    break; // keep all unacknowledged snapshots for the athlete
                }
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
        uploadingActionId=null;
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
    const conflict=getSyncConflict();
    const pending = !offline && hasPendingSync();
    // Stato sempre leggibile nel layout compatto: messaggio esteso come
    // tooltip e nome accessibile, senza nascondere gli avvisi di rischio.
    const detail = storageFailure
        ? 'ATTENZIONE: impossibile conservare tutti i dati locali. Scarica subito un backup JSON e verifica lo spazio disponibile.'
        : conflict
        ? 'Conflitto tra dispositivi: i dati locali sono protetti. Scegli la versione da conservare.'
        : offline
        ? 'Offline: dati salvati sul dispositivo in attesa di rete.'
        : pending
            ? 'Modifiche non sincronizzate: non cambiare dispositivo prima della sincronizzazione.'
            : 'Sincronizzato: tutti i dati sono allineati con il cloud.';
    const unverified=!state.currentUser || !getCloudRevision(state.currentUser);
    syncBadge.textContent = storageFailure ? '⚠ Salvataggio'
        : conflict ? '⚠ Conflitto' : offline ? '● Offline'
        : pending ? '⚠ In coda' : unverified ? '○ Cloud?' : '✓ Cloud';
    syncBadge.title = detail;
    syncBadge.setAttribute('aria-label', detail);
    syncBadge.classList.toggle('is-offline', offline);
    syncBadge.classList.toggle('is-pending', pending || Boolean(conflict) || storageFailure);
    renderSyncConflictControls(conflict);
    syncBadge.style.cursor = pending || conflict || storageFailure ? 'pointer' : 'default';
    syncBadge.style.background = '';
    syncBadge.style.color = '';
    syncBadge.style.padding = '';
    syncBadge.style.borderRadius = '';
    syncBadge.style.fontWeight = '';
}


/**
 * A visible, recoverable merge conflict. Both JSON archives can be downloaded
 * before any decision. Resolving never combines unconfirmed sets with another
 * device's history or marks them as performed.
 */
function renderSyncConflictControls(conflict) {
    const existing=document.getElementById('sync-conflict-panel');
    if(!conflict){existing?.remove();return;}
    if(existing)return;
    const panel=document.createElement('section');
    panel.id='sync-conflict-panel';
    panel.className='sync-conflict-panel';
    panel.setAttribute('role','alert');
    panel.setAttribute('aria-label','Conflitto di sincronizzazione tra dispositivi');
    const heading=document.createElement('h3');
    heading.textContent='⚠️ Diario diverso su due dispositivi';
    const warning=document.createElement('p');
    warning.textContent='La sincronizzazione è sospesa per evitare perdite. Scarica un backup JSON di entrambe le versioni, poi scegli quale conservare. Nessun dato viene unito automaticamente.';
    const actions=document.createElement('div');
    actions.className='sync-conflict-actions';
    const button=(caption,handler)=>{
        const btn=document.createElement('button');btn.type='button';
        btn.className='btn btn-secondary btn-sm';btn.textContent=caption;
        btn.addEventListener('click',handler);actions.append(btn);return btn;
    };
    button('💾 Backup di questo dispositivo',()=>{
        downloadFullBackup(getFromLocalStorageForUser(state.currentUser),{suffix:'locale'});
    });
    const remoteDownload=button('☁️ Backup della versione cloud',()=>{
        const record=getSyncConflict();
        if(record?.remote)downloadFullBackup(record.remote,{suffix:'cloud'});
    });
    remoteDownload.disabled=!conflict.remote;
    const status=document.createElement('p');
    status.className='sync-conflict-status';
    status.setAttribute('aria-live','polite');
    const choose=async choice=>{
        const user=state.currentUser;
        const record=getSyncConflict(user);
        if(!user || !record)return;
        const message=choice==='local'
            ? 'Mantenere questo dispositivo sostituendo la versione cloud? Scarica prima entrambi i backup JSON.'
            : 'Usare i dati del cloud sostituendo quelli locali? Prima di continuare verrà scaricato il backup JSON locale.';
        if(!confirm(message))return;
        if(choice==='cloud')downloadFullBackup(getFromLocalStorageForUser(user),{suffix:'locale'});
        for(const btn of actions.querySelectorAll('button'))btn.disabled=true;
        status.textContent='Verifica versione cloud e sincronizzazione…';
        try{
            const selected=structuredClone(state.workoutData);
            const selectedStamp=selected.updatedAt;
            const result=await resolveSyncConflict(user,choice,selected);
            if(!result.ok){
                status.textContent='Il cloud è cambiato: verifica nuovamente il conflitto. I dati locali restano intatti.';
                updateSyncStatusUI();
                return;
            }
            const currentSame=state.workoutData.updatedAt===selectedStamp;
            if(choice==='cloud'){
                // The entire local version was downloaded BEFORE replacement.
                saveToLocalStorage(result.payload,{preserveUpdatedAt:true});
                state.workoutData=result.payload;
            }
            // Drop only acknowledged actions: later edits made while the
            // network request ran must remain queued for the next sync.
            const queue=getQueue().filter(action=>{
                if(String(action.ownerId||'')!==String(user.id))return true;
                if(choice==='cloud')return false;
                return !currentSame && action.timestamp>Date.parse(selectedStamp||0);
            });
            if(queue.length)localStorage.setItem(QUEUE_KEY,JSON.stringify(queue));
            else clearQueue();
            localStorage.removeItem(conflictKey(user));
            renderWorkoutListAfterConflict();
            updateSyncStatusUI();
            if(hasPendingSync())processSyncQueue();
        }catch(err){
            status.textContent='Impossibile risolvere il conflitto: '+(err.message||'errore di rete')+'. Nessun dato cancellato.';
        }finally{
            for(const btn of actions.querySelectorAll('button'))btn.disabled=false;
        }
    };
    button('Usa i dati di questo dispositivo',()=>choose('local'));
    button('Usa la versione cloud',()=>choose('cloud')).disabled=!conflict.remote;
    panel.append(heading,warning,actions,status);
    (document.getElementById('workout-list-container')?.parentElement || document.body)
        .prepend(panel);
}
function renderWorkoutListAfterConflict(){
    // Avoid a static circular dependency with ui.js during module init.
    window.dispatchEvent(new CustomEvent('homegym-sync-conflict-resolved'));
}

// Listener per forzatura manuale sincronizzazione via badge UI
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'sync-status' && getSyncConflict()) {
        document.getElementById('sync-conflict-panel')?.scrollIntoView({block:'center',behavior:'smooth'});
        return;
    }
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
                Ti consigliamo fortemente di scaricare prima il backup integrale JSON del diario (esercizi, serie, RPE, note e storico).
            </div>

            <div class="danger-actions">
                <button id="danger-backup-btn" class="btn-danger-backup">
                    💾 Scarica Backup JSON integrale
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
        if (state.workoutData?.history?.years) {
            downloadFullBackup(state.workoutData);
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
            // Never claim cloud deletion if the remote operation was not
            // confirmed. No local loss when offline or unauthenticated.
            const id=state.currentUser?.id ? String(state.currentUser.id) : null;
            if(!id || typeof deleteCloudData!=='function' ||
                await deleteCloudData(state.currentUser)!==true){
                throw Error('Eliminazione cloud non confermata: nessun dato cancellato. Accedi online e riprova.');
            }
            localStorage.removeItem(scopedKey(id));
            localStorage.removeItem(revisionKey(state.currentUser));
            localStorage.removeItem(conflictKey(state.currentUser));
            if(getStoredLocalOwner()===id){
                localStorage.removeItem(CONFIG.STORAGE_KEY);
                localStorage.removeItem(OWNER_KEY);
                localStorage.removeItem('cached_athlete_name');
            }
            // Keep OTHER accounts' pending offline edits intact.
            const otherActions=getQueue().filter(a=>a.ownerId && String(a.ownerId)!==id);
            if(otherActions.length)localStorage.setItem(QUEUE_KEY,JSON.stringify(otherActions));
            else clearQueue();
            sessionStorage.clear();
            
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
