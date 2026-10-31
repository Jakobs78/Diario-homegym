import {separateCoachArchives} from './coachArchive.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
// ==========================================
// MODULI: storage.js - Persistenza locale, gestione coda offline (Sync Queue), sincronizzazione cloud e UI badge
// ==========================================

// ==========================================
// 1. IMPORT & COSTANTI
// ==========================================
import { CONFIG } from './config.js';
import { state, resetState } from './state.js';
import { pushDataToSupabase, deleteCloudData, resolveSyncConflict } from './sync.js';
import { downloadFullBackup, buildFullBackup, readFullBackup } from './fullBackup.js';
import { journalStorage, initializeJournalStorage, flushJournalStorage, journalStorageFailed, journalStorageReady, stageJournalUpdates } from './journalStore.js';

const QUEUE_KEY = `${CONFIG.STORAGE_KEY}_sync_queue`;
const OWNER_KEY = `${CONFIG.STORAGE_KEY}_owner`;
// Preserve a diary created before account-scoped storage existed. Never infer
// its owner from whichever account later signs into this browser.
const LEGACY_UNOWNED_KEY = `${CONFIG.STORAGE_KEY}_legacy_unowned_recovery`;
const scopedKey = id => `${CONFIG.STORAGE_KEY}_user_${id}`;
const accountId=user=>String(user?.id||user?.email||'');
const revisionKey=user=>`${CONFIG.STORAGE_KEY}_revision_${accountId(user)}`;
const conflictKey=user=>`workoutApp_data_conflict_${accountId(user)}`;
export const getCloudRevision=user=>journalStorage.getItem(revisionKey(user));
export function setCloudRevision(user,revision){
    if(!user || !accountId(user))return;
    if(revision===null||revision===undefined)journalStorage.removeItem(revisionKey(user));
    else journalStorage.setItem(revisionKey(user),String(revision));
}
const attemptKey=user=>`${CONFIG.STORAGE_KEY}_attempt_${accountId(user)}`;
const ackKey=user=>`${CONFIG.STORAGE_KEY}_ack_${accountId(user)}`;
export function getSyncAttempt(user){try{return JSON.parse(journalStorage.getItem(attemptKey(user))||'null');}catch{return null;}}
export function setSyncAttempt(user,value){if(value)journalStorage.setItem(attemptKey(user),JSON.stringify(value));else journalStorage.removeItem(attemptKey(user));}
export function clearSyncConflict(user){journalStorage.removeItem(conflictKey(user));}
export function markCloudAcknowledged(user){journalStorage.setItem(ackKey(user),new Date().toISOString());}
export function getSyncConflict(user=state.currentUser){
    if(!user || !accountId(user))return null;
    try {return JSON.parse(journalStorage.getItem(conflictKey(user))||'null');}
    catch{return null;}
}
export function recordSyncConflict(user,details) {
    if(!user || !accountId(user))return;
    try {
        journalStorage.setItem(conflictKey(user),JSON.stringify(details));
    }catch(error){
        console.error('Impossibile memorizzare lo snapshot del conflitto:',error);
        // The queued local snapshot is still retained. Never upload it
        // without CAS even if the conflict snapshot cannot be cached.
    }
    updateSyncStatusUI();
}

export function getStoredLocalOwner(){return journalStorage.getItem(OWNER_KEY);}
export function getFromLocalStorageForUser(user){
    const id=user?.id ? String(user.id) : null;
    if(!id)return getFromLocalStorage();
    const scoped=journalStorage.getItem(scopedKey(id));
    if(scoped){
        try {return JSON.parse(scoped);}
        catch {return structuredClone(DEFAULT_WORKOUT_DATA);}
    }
    const owner=getStoredLocalOwner();
    // The generic snapshot can be used only when its owner ID is verified.
    // In particular, owner=null does NOT mean it belongs to this new user.
    return owner===id ? getFromLocalStorage() : structuredClone(DEFAULT_WORKOUT_DATA);
}

// Exportable but never automatically attributed to the signed-in user.
// Keep the original raw bytes even if subsequent cloud hydration replaces
// the generic snapshot. The old account's diary stays recoverable.
export function getUnownedLegacySnapshot(){
    const archived=journalStorage.getItem(LEGACY_UNOWNED_KEY);
    if(archived!==null)return archived;
    return getStoredLocalOwner() ? null : journalStorage.getItem(CONFIG.STORAGE_KEY);
}
function downloadUnownedLegacySnapshot(){
    const raw=getUnownedLegacySnapshot();
    if(raw===null)return;
    if(!confirm('Questo diario precedente non ha un proprietario verificabile. Scaricalo solo se è tuo; il file contiene dati personali. Nessun dato sarà caricato nel cloud. Continuare?'))return;
    let parsed,valid=false;
    try{
        parsed=JSON.parse(raw);
        // An invalid nested diary must be exported in its raw form rather
        // than wrapped in a misleading archive that cannot be restored.
        readFullBackup(JSON.stringify(buildFullBackup(parsed)));
        valid=true;
    }catch{}
    if(valid){
        downloadFullBackup(parsed,{suffix:'legacy-non-attribuito'});
    }else{
        // A damaged snapshot must remain exportable without silently
        // reparsing, changing, or discarding any of its content.
        const url=URL.createObjectURL(new Blob([raw],{type:'application/octet-stream'}));
        const a=document.createElement('a');
        a.href=url;a.download='homegym-legacy-non-attribuito-originale.txt';
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),2000);
    }
}
function renderLegacyRecoveryNotice(){
    const id='legacy-unowned-recovery';
    const existing=document.getElementById(id);
    if(!state.currentUser?.id || getUnownedLegacySnapshot()===null){
        existing?.remove();return;
    }
    if(existing)return;
    const holder=document.getElementById('workout-list-container');
    if(!holder?.parentElement)return;
    const panel=document.createElement('section');
    panel.id=id;
    panel.setAttribute('role','status');
    panel.style.cssText='padding:12px;margin:10px 0;border:1px solid currentColor;border-radius:8px;';
    const description=document.createElement('p');
    description.textContent='È stata trovata una copia del diario locale precedente, senza un account verificabile. Per sicurezza non è mostrata e non viene sincronizzata. Se è tua, esportala, conservala e ripristinala manualmente tramite Strumenti → Ripristina backup JSON dopo aver verificato l’account corretto.';
    const button=document.createElement('button');
    button.type='button';button.className='btn btn-secondary';
    button.textContent='Scarica copia legacy non attribuita';
    button.addEventListener('click',downloadUnownedLegacySnapshot);
    panel.append(description,button);
    holder.parentElement.insertBefore(panel,holder);
}

const DEFAULT_WORKOUT_DATA = {
    athlete: { email: null },
    history: { years: {} },
    updatedAt: null
};

// Anonymous snapshots created in this document can safely compact one
// another. Never merge them with anonymous snapshots from earlier sessions.
const anonymousQueueSession = crypto.randomUUID();
let syncDebounceTimer = null;
let isSyncing = false;
let retryTimer=null,retryDelay=2000,lastSyncError=null;
let storageFailure = false;
let queueUnreadable = false;
let uploadingActionId=null;
let deletingAccount=false;

export function pauseSyncForAccountDeletion(){
    if(isSyncing || deletingAccount)throw Error('Attendi la fine della sincronizzazione e riprova.');
    deletingAccount=true;
    clearTimeout(syncDebounceTimer);
    return ()=>{deletingAccount=false;};
}

export async function removeAccountLocalData(user){
    if(!user?.id)throw Error('Account da eliminare non identificato.');
    const id=String(user.id), owner=getStoredLocalOwner();
    // An ownerless legacy action must survive deletion of ANY account.
    // The global marker may have changed since the offline action was made.
    const queue=getQueue({forWrite:true}).filter(action=>
        !action.ownerId || String(action.ownerId)!==id);
    for(const key of journalStorage.keys())if(key.startsWith(`${CONFIG.STORAGE_KEY}_coach_archive_${id}_`))journalStorage.removeItem(key);
    journalStorage.removeItem(scopedKey(id));
    journalStorage.removeItem(revisionKey(user));
    journalStorage.removeItem(conflictKey(user));
    journalStorage.removeItem(attemptKey(user));
    journalStorage.removeItem(ackKey(user));
    if(queue.length)journalStorage.setItem(QUEUE_KEY,JSON.stringify(queue));else clearQueue();
    if(owner===id){
        journalStorage.removeItem(CONFIG.STORAGE_KEY);
        journalStorage.removeItem(OWNER_KEY);
    }
    await flushJournalStorage();
    if(owner===id){
        localStorage.removeItem('cached_athlete_name');
        localStorage.removeItem('user_email');
    }
}

// ==========================================
// 2. GESTIONE CODA OFFLINE (SYNC QUEUE)
// ==========================================
function getQueue({forWrite=false} = {}) {
    const queue = journalStorage.getItem(QUEUE_KEY);
    try {
        const parsed=queue ? JSON.parse(queue) : [];
        if(!Array.isArray(parsed))throw Error('La coda non contiene una lista di operazioni.');
        // A syntactically valid array can still be corrupted, e.g. [null],
        // [{}], or entries missing their journal payload. Do not allow an
        // enqueue/compact operation to throw AFTER changing the diary or to
        // silently discard entries whose identity cannot be compared.
        for(const action of parsed){
            if(!action || typeof action!=='object' || Array.isArray(action) ||
               !['string','number'].includes(typeof action.id) ||
               String(action.id).trim()==='' ||
               !Number.isFinite(action.timestamp) ||
               !action.payload || typeof action.payload!=='object' ||
               Array.isArray(action.payload) ||
               !action.payload.history?.years ||
               typeof action.payload.history.years!=='object' ||
               Array.isArray(action.payload.history.years))
                throw Error('Voce della coda offline non valida: conservata senza modificarla.');
        }
        queueUnreadable=false;
        return parsed;
    } catch(error) {
        queueUnreadable=true;
        storageFailure=true;
        console.error('Coda sync illeggibile: dati non cancellati.',error);
        // A display-only check may show the storage warning, but no mutation
        // may replace or discard an unreadable queue belonging to any account.
        if(forWrite)throw Error('Coda sync illeggibile: operazioni precedenti conservate. Esporta un backup e non cambiare dispositivo.');
        return [];
    }
}

function enqueueAction(action) {
    const queue = getQueue({forWrite:true});
    // Each queued action is a FULL journal snapshot. Only the latest
    // snapshot for a given account is needed. Never discard other accounts'
    // records, or the snapshot currently being uploaded on the network.
    const owner=String(action.ownerId??'');
    const compact=queue.filter(item=>{
        if(isSyncing && item.id===uploadingActionId)return true;
        if(owner)return String(item.ownerId??'')!==owner;
        // Preserve all legacy ownerless entries without a matching verified
        // session tag; they may belong to a different athlete.
        return item.anonymousSession!==anonymousQueueSession;
    });
    compact.push(action);
    journalStorage.setItem(QUEUE_KEY,JSON.stringify(compact));
}

function clearQueue() {
    journalStorage.removeItem(QUEUE_KEY);
}

export function hasPendingSync() {
    const currentId=state.currentUser?.id ? String(state.currentUser.id) : null;
    const queue=getQueue();
    // A corrupt queue or a legacy entry without an authenticated owner must
    // NEVER make cloud hydration decide that local changes are safely synced.
    // It remains pending until explicitly recovered, even if the current user
    // is different from the unowned diary's eventual rightful owner.
    if(queueUnreadable)return true;
    return queue.some(action=>
        !action.ownerId || !currentId || String(action.ownerId)===currentId);
}

// ==========================================
// 3. OPERAZIONI LOCALSTORAGE
// ==========================================
export function saveToLocalStorage(data, {preserveUpdatedAt = false} = {}) {
    try {
        // Cloud hydration MUST NOT change the original modification timestamp.
        if (!preserveUpdatedAt) data.updatedAt = new Date().toISOString();
        const encoded=JSON.stringify(data);
        const id=state.currentUser?.id;
        if(id && !getStoredLocalOwner()){
            const previous=journalStorage.getItem(CONFIG.STORAGE_KEY);
            // The archive and the new snapshot are staged in the same
            // IndexedDB transaction. On storage failure neither commits.
            if(previous!==null){
                const archived=journalStorage.getItem(LEGACY_UNOWNED_KEY);
                // If two distinct unattributed diaries exist, one backup key
                // cannot preserve both. Fail closed instead of replacing
                // somebody's newest unowned journal with cloud hydration.
                if(archived!==null && archived!==previous)
                    throw Error('Esistono copie legacy non attribuite diverse: nessuna sovrascrittura consentita. Esporta il backup prima di continuare.');
                if(archived===null)journalStorage.setItem(LEGACY_UNOWNED_KEY,previous);
            }
        }
        journalStorage.setItem(CONFIG.STORAGE_KEY, encoded);
        if(id){
            journalStorage.setItem(scopedKey(id),encoded);
            journalStorage.setItem(OWNER_KEY,String(id));
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
        const data = journalStorage.getItem(CONFIG.STORAGE_KEY);
        return data ? JSON.parse(data) : DEFAULT_WORKOUT_DATA;
    } catch (e) {
        console.error('❌ Errore nel caricamento dei dati locali:', e);
        return DEFAULT_WORKOUT_DATA;
    }
}

// ==========================================
// 4. SINCRONIZZAZIONE CLOUD & CODA
// ==========================================
export async function saveAndSync(data = state.workoutData, actionType = 'UPDATE_WORKOUT') {
    // Journal and queued JSON are serialized synchronously before yielding.
    // The generic last-owner marker is not authentication evidence. Never
    // enqueue unauthenticated edits on behalf of a previous signed-in user.
    const ownerId=state.currentUser?.isOffline ? null : (state.currentUser?.id || null);
    if(!journalStorageReady()){storageFailure=true;updateSyncStatusUI();return false;}
    if(!ownerId && getStoredLocalOwner()){
        storageFailure=true;
        console.warn('Salvataggio non attribuibile: verifica la sessione dell’account prima di modificare dati locali.');
        updateSyncStatusUI();
        return false;
    }
    // Fail before updating a persistent snapshot if earlier offline edits
    // cannot be read. Otherwise a rejected save changes the stored diary
    // without creating a matching cloud-sync action.
    try {getQueue({forWrite:true});}
    catch(error) {
        storageFailure=true;
        console.error('Salvataggio sospeso: la coda offline è illeggibile.',error);
        updateSyncStatusUI();
        return false;
    }
    reconcileTrainingPlan(data,{year:state.currentYear,mesoIndex:state.activeMesocycleIndex||0});
    const before=state.workoutData;
    let undoArchive;
    try{stageJournalUpdates(()=>{
        undoArchive=separateCoachArchives(data,state.currentUser);
        if(!saveToLocalStorage(data))throw Error('Scrittura del diario non completata.');
        enqueueAction({id:crypto.randomUUID(),type:actionType,payload:data,timestamp:Date.now(),ownerId,
            ...(ownerId?{}:{anonymousSession:anonymousQueueSession})});
    });}catch(error){
        undoArchive?.();
        state.workoutData=before;storageFailure=true;
        console.error('Salvataggio locale non confermato:',error);updateSyncStatusUI();return false;
    }
    state.workoutData=before;

    try { await flushJournalStorage(); } catch(error) {
        storageFailure=true;updateSyncStatusUI();return false;
    }
    state.workoutData=data;
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
    try {await initializeJournalStorage();await flushJournalStorage();}
    catch {storageFailure=true;updateSyncStatusUI();return;}
    if(deletingAccount || isSyncing || !state.currentUser || !navigator.onLine){updateSyncStatusUI();return;}
    const user=state.currentUser;
    clearTimeout(retryTimer);retryTimer=null;
    isSyncing=true;lastSyncError=null;updateSyncStatusUI();
    let failed=false;
    try{
        while(navigator.onLine && String(state.currentUser?.id)===String(user.id)){
            const queue=getQueue({forWrite:true}).sort((a,b)=>a.timestamp-b.timestamp);
            if(queue.some(a=>!a.ownerId))storageFailure=true;
            const action=queue.find(a=>String(a.ownerId||'')===String(user.id));
            if(!action)break;
            uploadingActionId=action.id;
            const result=await pushDataToSupabase(user,action.payload,action.timestamp);
            if(!result?.ok){
                if(result?.conflict)break;
                lastSyncError=result?.error||Error('Invio non confermato.');failed=true;break;
            }
            const remaining=getQueue({forWrite:true}).filter(item=>item.id!==action.id);
            if(remaining.length)journalStorage.setItem(QUEUE_KEY,JSON.stringify(remaining));else clearQueue();
            // Acknowledge before starting another request. A crash always leaves a retryable snapshot.
            await flushJournalStorage();
            retryDelay=2000;
        }
    }catch(error){lastSyncError=error;failed=true;}
    finally{
        try{await flushJournalStorage();}catch{storageFailure=true;}
        uploadingActionId=null;isSyncing=false;updateSyncStatusUI();
        if(failed && !storageFailure && !getSyncConflict() && navigator.onLine && String(state.currentUser?.id)===String(user.id)){
            retryTimer=setTimeout(()=>{
                if(String(state.currentUser?.id)===String(user.id))processSyncQueue();
            },retryDelay);
            retryDelay=Math.min(60000,retryDelay*2);
        }
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
    storageFailure ||= journalStorageFailed();
    const detail = storageFailure
        ? 'ATTENZIONE: impossibile conservare tutti i dati locali. Scarica subito un backup JSON e verifica lo spazio disponibile.'
        : conflict
        ? 'Versioni del diario da verificare: dati locali conservati, invio sospeso.'
        : offline
        ? 'Offline: dati salvati sul dispositivo in attesa di rete.'
        : pending
            ? 'Modifiche non sincronizzate: non cambiare dispositivo prima della sincronizzazione.'
            : 'Sincronizzato: tutti i dati sono allineati con il cloud.';
    const unverified=!state.currentUser || !getCloudRevision(state.currentUser);
    const authError=lastSyncError && (lastSyncError.status===401 || /JWT|token.*expir|PGRST30/i.test(lastSyncError.message||lastSyncError.code||''));
    const ack=state.currentUser && journalStorage.getItem(ackKey(state.currentUser));
    const statusDetail=authError?'Accesso da verificare: modifiche conservate sul dispositivo. Accedi di nuovo per sincronizzare.':
        isSyncing?'Dati salvati sul dispositivo. Invio al cloud in corso.':
        lastSyncError?'Dati salvati sul dispositivo. Invio non confermato: nuovo tentativo automatico.':
        unverified&&!pending&&!offline?'Dati locali disponibili; conferma cloud non ancora verificata.':detail;
    const fullDetail=statusDetail+(ack?' Ultima conferma cloud: '+new Date(ack).toLocaleString('it-IT')+'.':'');
    syncBadge.textContent = storageFailure ? '⚠ Salvataggio'
        : conflict ? '⚠ Conflitto' : offline ? '● Offline' : authError ? '⚠ Accesso' : isSyncing ? '↻ Invio'
        : pending ? '⚠ In coda' : unverified ? '○ Cloud?' : '✓ Cloud';
    syncBadge.title = fullDetail;
    syncBadge.setAttribute('aria-label', fullDetail);
    let syncDetail=document.getElementById('sync-status-detail');
    if(!syncDetail){syncDetail=document.createElement('p');syncDetail.id='sync-status-detail';syncDetail.className='sync-status-detail';syncDetail.setAttribute('role','status');document.querySelector('.app-header-container')?.append(syncDetail);}
    syncDetail.textContent=fullDetail;
    syncDetail.hidden=syncBadge.dataset.expanded!=='true'&&!authError&&!lastSyncError;
    syncBadge.setAttribute('aria-expanded',String(!syncDetail.hidden));
    syncBadge.setAttribute('aria-controls','sync-status-detail');
    syncBadge.tabIndex=0;syncBadge.setAttribute('role','button');
    syncBadge.classList.toggle('is-offline', offline);
    syncBadge.classList.toggle('is-pending', pending || Boolean(conflict) || storageFailure);
    renderSyncConflictControls(conflict);
    renderLegacyRecoveryNotice();
    syncBadge.style.cursor = 'pointer';
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
    panel.setAttribute('aria-label','Versioni del diario da verificare');
    const heading=document.createElement('h3');
    heading.textContent='⚠️ Versioni del diario da verificare';
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
    const remoteDownload=button('☁️ Backup della versione cloud (al rilevamento)',()=>{
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
        if(choice==='cloud' && await downloadFullBackup(getFromLocalStorageForUser(user),{suffix:'locale'})===false)return;
        for(const btn of actions.querySelectorAll('button'))btn.disabled=true;
        status.textContent='Verifica versione cloud e sincronizzazione…';
        try{
            const selected=structuredClone(state.workoutData);
            const selectedSnapshot=JSON.stringify(selected);
            const selectedActions=new Set(getQueue({forWrite:true}).filter(a=>String(a.ownerId||'')===String(user.id)).map(a=>a.id));
            const result=await resolveSyncConflict(user,choice,selected);
            if(!result.ok){
                status.textContent='Il cloud è cambiato: verifica nuovamente il conflitto. I dati locali restano intatti.';
                updateSyncStatusUI();
                return;
            }
            const currentSame=JSON.stringify(state.workoutData)===selectedSnapshot;
            if(String(state.currentUser?.id)!==String(user.id) || !currentSame){
                status.textContent='Il diario o l’utente è cambiato durante la richiesta. Nessuna modifica locale sostituita: verifica e ripeti la scelta.';
                return;
            }
            if(choice==='cloud'){
                // The entire local version was downloaded BEFORE replacement.
                if(!saveToLocalStorage(result.payload,{preserveUpdatedAt:true}))
                    throw Error('Salvataggio della versione cloud non riuscito.');
                state.workoutData=result.payload;
            }
            // Drop only acknowledged actions: later edits made while the
            // network request ran must remain queued for the next sync.
            const queue=getQueue({forWrite:true}).filter(action=>{
                if(String(action.ownerId||'')!==String(user.id))return true;
                return !selectedActions.has(action.id);
            });
            if(queue.length)journalStorage.setItem(QUEUE_KEY,JSON.stringify(queue));
            else clearQueue();
            journalStorage.removeItem(conflictKey(user));
            await flushJournalStorage();
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
    if(e.target?.id==='sync-status'){e.target.dataset.expanded=String(e.target.dataset.expanded!=='true');updateSyncStatusUI();}
    if (e.target && e.target.id === 'sync-status' && getSyncConflict()) {
        document.getElementById('sync-conflict-panel')?.scrollIntoView({block:'center',behavior:'smooth'});
        return;
    }
    if (e.target && e.target.id === 'sync-status' && hasPendingSync() && navigator.onLine) {
        console.log("Forzatura sincronizzazione manuale richiesta dall'utente...");
        processSyncQueue();
    }
});

document.addEventListener('keydown',event=>{if(event.target?.id==='sync-status'&&['Enter',' '].includes(event.key)){event.preventDefault();event.target.click();}});

// Listener di rete
window.addEventListener('online', () => {
    updateSyncStatusUI();
    if (hasPendingSync()) processSyncQueue();
});

window.addEventListener('offline',()=>{clearTimeout(retryTimer);retryTimer=null;updateSyncStatusUI();});
window.addEventListener('homegym-storage-error',()=>{storageFailure=true;updateSyncStatusUI();});
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

        let resume;
        const user=state.currentUser;
        try {
            resume=pauseSyncForAccountDeletion();
            // Never claim cloud deletion if the remote operation was not
            // confirmed. No local loss when offline or unauthenticated.
            const id=state.currentUser?.id ? String(state.currentUser.id) : null;
            if(!id || typeof deleteCloudData!=='function' ||
                await deleteCloudData(user)!==true){
                throw Error('Eliminazione cloud non confermata: nessun dato cancellato. Accedi online e riprova.');
            }
            await removeAccountLocalData(user);
            if(String(state.currentUser?.id)!==String(user.id))return;
            
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
        } finally {resume?.();}
    });
}

export function clearLocalData() {
    clearAllData();
}
