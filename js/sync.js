import { journalStorage, flushJournalStorage } from './journalStore.js';
/**
 * Module: sync.js
 * Summary: Gestisce la sincronizzazione dei dati tra il client e Supabase, inclusa la pull e push di informazioni sull'allenamento[cite: 6].
 */

// ==========================================
// 1. IMPORT & CONFIGURAZIONE
// ==========================================
import { supabase } from './config.js';
import { getFromLocalStorageForUser, saveToLocalStorage, hasPendingSync, processSyncQueue, updateSyncStatusUI,
    getCloudRevision, setCloudRevision, getCloudAcceptedHash, setCloudAcceptedHash,
    recordSyncConflict } from './storage.js';
import { renderWorkoutList } from './ui.js';
import { state as appState } from './state.js';
import { sameJournal, cloudRecoveryDecision, journalFingerprint, safeRemoteRefresh } from './cloudSafety.js';

/**
 * Utility interna per estrarre l'email da un oggetto utente o da una stringa.
 * Valida rigorosamente che il valore restituito sia una stringa non vuota.
 */
function extractEmail(userOrEmail) {
    if (!userOrEmail) return null;
    
    if (typeof userOrEmail === 'string') {
        const trimmed = userOrEmail.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    
    if (typeof userOrEmail === 'object' && userOrEmail !== null && userOrEmail.email) {
        return typeof userOrEmail.email === 'string' ? userOrEmail.email.trim() : null;
    }

    return null;
}

// ==========================================
// 2. RETRIEVAL (PULL) DATI
// ==========================================
/**
 * Remote snapshot + row version. updated_at already exists in the deployed
 * workouts schema. CAS compares it atomically in the UPDATE WHERE clause:
 * no additional database migrations and no silent last-write-wins overwrites.
 */
export async function pullWorkoutRecord(userOrEmail) {
    const email=extractEmail(userOrEmail);
    if(!supabase || !email)throw Error('Utente non disponibile per la sincronizzazione.');
    const {data,error}=await supabase.from('workouts')
        .select('payload,updated_at').eq('email',email).maybeSingle();
    if(error)throw error;
    return data ? {payload:data.payload,revision:data.updated_at||null} : null;
}

export async function pullDataFromSupabase(userOrEmail) {
    try {
        const snapshot=JSON.stringify(appState.workoutData);
        const record=await pullWorkoutRecord(userOrEmail);
        if(String(appState.currentUser?.id)!==String(userOrEmail?.id) ||
            JSON.stringify(appState.workoutData)!==snapshot)return null;
        const local = getFromLocalStorageForUser(userOrEmail);
        // A form may have edited in-memory values that have not yet reached
        // IndexedDB (debounced input). Do not hydrate over those edits.
        if (!sameJournal(appState.workoutData, local)) return null;
        const decision = cloudRecoveryDecision(local, record?.payload, {
            pending: hasPendingSync()
        });
        const acceptedHash = getCloudAcceptedHash(userOrEmail);
        const oldRevision = getCloudRevision(userOrEmail);
        const safeRefresh = decision === 'conflict' && acceptedHash &&
            safeRemoteRefresh({
                oldRevision, remoteRevision: record?.revision,
                localFingerprint: await journalFingerprint(local),
                acknowledgedFingerprint: acceptedHash
            });
        if ((decision === 'conflict' && !safeRefresh) ||
            decision === 'missing_cloud') {
            // A missing/corrupted queue must NOT allow a timestamp comparison
            // to silently choose a winner or certify cloud synchronization.
            recordSyncConflict(userOrEmail, {
                local, remote: record?.payload ?? null,
                remoteRevision: record?.revision ?? null,
                detectedAt: new Date().toISOString()
            });
            return null;
        }
        if (record?.revision && (decision === 'identical' ||
            decision === 'restore_cloud' || safeRefresh)) {
            // Persist the fingerprint of the accepted cloud content. A later
            // local-only edit (or lost queue) will no longer be mistaken for
            // an unchanged device with a newer remote revision.
            setCloudAcceptedHash(userOrEmail,
                await journalFingerprint(record.payload));
            setCloudRevision(userOrEmail, record.revision);
        }
        return record?.payload || null;
    }catch(err){
        console.error('❌ Errore lettura cloud:',err.message);
        return null;
    }
}

const samePayload=sameJournal;
const conflict=(user,local,remote)=>{
    recordSyncConflict(user,{
        local,remote:remote?.payload||null,remoteRevision:remote?.revision||null,
        detectedAt:new Date().toISOString()
    });
    return {ok:false,conflict:true};
};

/**
 * Save an immutable queued snapshot, not a merged guess.
 * On initial use never overwrite an existing foreign/stale snapshot. Later
 * writes only succeed when the server version still matches the last
 * acknowledged version for this account.
 */
export async function pushDataToSupabase(userOrEmail,payload,actionTimestamp=null) {
    const email=extractEmail(userOrEmail);
    if(!supabase || !email)return {ok:false};
    try{
        const remote=await pullWorkoutRecord(userOrEmail);
        const expected=getCloudRevision(userOrEmail);
        if(expected!==null && (!remote || remote.revision!==expected))
            return conflict(userOrEmail,payload,remote);
        if(expected===null && remote){
            if(!samePayload(remote.payload,payload))
                return conflict(userOrEmail,payload,remote);
            setCloudAcceptedHash(userOrEmail,await journalFingerprint(payload));
            setCloudRevision(userOrEmail,remote.revision);
            return {ok:true};
        }

        const recordData={
            email,payload,
            updated_at:new Date(Math.max(Date.now(),
                (Date.parse(remote?.revision||'')||0)+1)).toISOString()
        };
        let result;
        if(remote){
            // PostgreSQL UPDATE ... WHERE updated_at=expected is atomic.
            result=await supabase.from('workouts').update(recordData)
                .eq('email',email).eq('updated_at',expected)
                .select('updated_at').maybeSingle();
        }else{
            // Unique key prevents a concurrent first upload from replacing
            // the other device's new journal.
            result=await supabase.from('workouts').insert(recordData)
                .select('updated_at').maybeSingle();
        }
        if(result.error){
            if(result.error.code==='23505'){
                return conflict(userOrEmail,payload,await pullWorkoutRecord(userOrEmail));
            }
            throw result.error;
        }
        if(!result.data?.updated_at)
            return conflict(userOrEmail,payload,await pullWorkoutRecord(userOrEmail));
        setCloudAcceptedHash(userOrEmail,await journalFingerprint(payload));
        setCloudRevision(userOrEmail,result.data.updated_at);
        return {ok:true};
    }catch(err){
        console.error('❌ Cloud non sincronizzato: i dati restano in coda.',err);
        return {ok:false,error:err};
    }
}

/**
 * The athlete must explicitly pick a winner and preserve a JSON backup.
 * No automatic two-way merge of complete journals (could invent performance).
 */
export async function resolveSyncConflict(userOrEmail,choice,payload=null) {
    const email=extractEmail(userOrEmail);
    if(!email || !['local','cloud'].includes(choice))return {ok:false};
    const remote=await pullWorkoutRecord(userOrEmail);
    const expected=getCloudRevision(userOrEmail);
    // A newer third-party edit must be reviewed as a NEW conflict.
    const cached=journalStorage.getItem('workoutApp_data_conflict_'+
        String(userOrEmail?.id||email));
    let observed=null;
    try{observed=cached?JSON.parse(cached):null;}catch{}
    if(!observed || (remote?.revision||null)!==observed.remoteRevision){
        return conflict(userOrEmail,payload||getFromLocalStorageForUser(userOrEmail),remote);
    }
    if(choice==='cloud'){
        if(!remote?.payload)return {ok:false,error:new Error('Versione cloud non disponibile.')};
        setCloudAcceptedHash(userOrEmail,await journalFingerprint(remote.payload));
        setCloudRevision(userOrEmail,remote.revision);
        return {ok:true,payload:remote.payload,revision:remote.revision};
    }
    const currentPayload=payload||getFromLocalStorageForUser(userOrEmail);
    const writtenAt=new Date(Math.max(Date.now(),
        (Date.parse(remote?.revision||'')||0)+1)).toISOString();
    let result;
    if(remote){
        result=await supabase.from('workouts')
            .update({email,payload:currentPayload,updated_at:writtenAt})
            .eq('email',email).eq('updated_at',observed.remoteRevision)
            .select('updated_at').maybeSingle();
    }else{
        result=await supabase.from('workouts')
            .insert({email,payload:currentPayload,updated_at:writtenAt})
            .select('updated_at').maybeSingle();
    }
    if(result.error || !result.data?.updated_at)
        return conflict(userOrEmail,currentPayload,await pullWorkoutRecord(userOrEmail));
    setCloudAcceptedHash(userOrEmail,await journalFingerprint(currentPayload));
    setCloudRevision(userOrEmail,result.data.updated_at);
    return {ok:true,payload:currentPayload,revision:result.data.updated_at};
}

// ==========================================
// 4. VERIFICA STATO ABBONAMENTO
// ==========================================
export async function getUserSubscriptionStatus(userOrEmail) {
    if (!supabase) return null;

    const email = extractEmail(userOrEmail);
    const userId = (typeof userOrEmail === 'object' && userOrEmail !== null) ? userOrEmail?.id : null;

    try {
        let query = supabase.from('user_subscriptions').select('status, trial_ends_at, expires_at');
        
        if (userId) {
            query = query.eq('user_id', userId);
        } else if (email) {
            query = query.eq('email', email);
        } else {
            return null;
        }

        const { data, error } = await query.maybeSingle();

        if (error) throw error;
        return data;
    } catch (err) {
        console.error("❌ Errore recupero abbonamento:", err.message);
        return null;
    }
}

// ==========================================
// 5. ELIMINAZIONE DATI CLOUD
// ==========================================
export async function deleteCloudData(userOrEmail = null) {
    if (!supabase) return false;

    let email = extractEmail(userOrEmail);

    if (!email) {
        const { data } = await supabase.auth.getUser();
        email = extractEmail(data?.user);
    }

    if (!email) return false;

    try {
        const { error } = await supabase
            .from('workouts')
            .delete()
            .eq('email', email);

        if (error) throw error;
        return true;
    } catch (err) {
        console.error("❌ Errore durante l'eliminazione da Supabase:", err.message);
        throw err;
    }
}

// ==========================================
// 6. SINCRONIZZAZIONE IN BACKGROUND
// ==========================================
let syncToastTimer = null;

function showSyncToast(message) {
    let toast = document.getElementById('sync-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sync-toast';
        toast.style.cssText = "position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.85); color: #fff; padding: 10px 20px; border-radius: 20px; font-size: 13px; font-weight: 500; z-index: 9999; transition: opacity 0.3s ease; opacity: 0; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2);";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    
    if (syncToastTimer) clearTimeout(syncToastTimer);
    syncToastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

export function initBackgroundSync(state) {
    const handleSyncTrigger = async () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
        try {
            // ✅ Usa getUser() direttamente anche qui
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || String(state.currentUser?.id)!==String(user.id)) return;

            if (hasPendingSync()) {
                await processSyncQueue();
            }

            const remoteData = await pullDataFromSupabase(user);
                if (remoteData && String(state.currentUser?.id)===String(user.id) && !hasPendingSync()) {
                    const localData = getFromLocalStorageForUser(user);
                    if (!sameJournal(localData,remoteData)) {
                        state.workoutData = remoteData;
                        saveToLocalStorage(remoteData,{preserveUpdatedAt:true});
                        await flushJournalStorage();
                        renderWorkoutList();
                        updateSyncStatusUI();
                        showSyncToast("Dati aggiornati dal cloud ✨");
                    }
                }
            } catch (err) {
                console.warn("Impossibile sincronizzare al risveglio da standby:", err);
            }
        }
    };

    document.addEventListener('visibilitychange', handleSyncTrigger);
    window.addEventListener('online', handleSyncTrigger);
    window.addEventListener('focus', handleSyncTrigger);
}
