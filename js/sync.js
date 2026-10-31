import {sameJSON,payloadHash,timedQuery} from './syncPrimitives.js';
import {syncCoachArchives} from './coachArchive.js';
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
    getCloudRevision, setCloudRevision, recordSyncConflict, getSyncConflict, clearSyncConflict, getSyncAttempt, setSyncAttempt, markCloudAcknowledged } from './storage.js';
import { renderWorkoutList } from './ui.js';
import { state as appState } from './state.js';

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
    const {data,error}=await timedQuery(supabase.from('workouts')
        .select('payload,updated_at').eq('email',email).maybeSingle());
    if(error)throw error;
    return data ? {payload:data.payload,revision:data.updated_at||null} : null;
}

const activePulls=new Map();
export function pullDataFromSupabase(userOrEmail){
    const id=String(userOrEmail?.id||extractEmail(userOrEmail));
    if(activePulls.has(id))return activePulls.get(id);
    const work=pullCurrentData(userOrEmail).finally(()=>activePulls.delete(id));
    activePulls.set(id,work);return work;
}
async function pullCurrentData(userOrEmail) {
    try {
        const snapshot=JSON.stringify(appState.workoutData);
        if(hasPendingSync() || getSyncConflict())return null;
        const expected=getCloudRevision(userOrEmail);
        if(expected){
            const {data,error}=await timedQuery(supabase.from('workouts').select('updated_at')
                .eq('email',extractEmail(userOrEmail)).maybeSingle());
            if(error)throw error;
            if(data?.updated_at===expected){if(String(appState.currentUser?.id)===String(userOrEmail?.id)&&!hasPendingSync())markCloudAcknowledged(userOrEmail);return null;}
        }
        const record=await pullWorkoutRecord(userOrEmail);
        if(String(appState.currentUser?.id)!==String(userOrEmail?.id) ||
            JSON.stringify(appState.workoutData)!==snapshot)return null;
        // Only an account with no pending offline changes may accept the
        // latest remote row as its optimistic concurrency baseline.
        if(record?.revision && !hasPendingSync())setCloudRevision(userOrEmail,record.revision);
        return record?.payload || null;
    }catch(err){
        console.error('❌ Errore lettura cloud:',err.message);
        return null;
    }
}

const samePayload=sameJSON;
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
        let expected=getCloudRevision(userOrEmail);
        const previousAttempt=getSyncAttempt(userOrEmail);
        // Read the full row only for first contact, uncertain outcomes or an explicit conflict.
        let remote=null;
        const cachedConflict=getSyncConflict(userOrEmail);
        if(expected===null || previousAttempt || cachedConflict){
            remote=await pullWorkoutRecord(userOrEmail);
            if(remote && samePayload(remote.payload,payload)){
                setCloudRevision(userOrEmail,remote.revision);
                setSyncAttempt(userOrEmail,null);clearSyncConflict(userOrEmail);
                markCloudAcknowledged(userOrEmail);return {ok:true};
            }
            if(remote?.revision!==expected && !(expected===null&&!remote)){
                const applied=remote && previousAttempt && [previousAttempt.hash,...(previousAttempt.priorHashes||[])].includes(await payloadHash(remote.payload));
                if(!applied)return conflict(userOrEmail,payload,remote);
                // The old in-flight snapshot reached the server. A newer local edit can now follow it.
                expected=remote.revision;setCloudRevision(userOrEmail,expected);
            }
            // Existing conflicts without proof of our own accepted write require a human choice.
            if(cachedConflict && !previousAttempt)return conflict(userOrEmail,payload,remote);
            clearSyncConflict(userOrEmail);
        }
        await syncCoachArchives(payload,userOrEmail);
        const hash=await payloadHash(payload);
        setSyncAttempt(userOrEmail,{hash,priorHashes:[...new Set(previousAttempt?[previousAttempt.hash,...(previousAttempt.priorHashes||[])]:[])],baseRevision:expected,at:new Date().toISOString()});
        // Persist the receipt proof BEFORE the request can reach the server.
        await flushJournalStorage();
        const recordData={email,payload,updated_at:new Date(Math.max(Date.now(),
            (Date.parse(expected||'')||0)+1)).toISOString()};
        const result=expected!==null
            ? await timedQuery(supabase.from('workouts').update(recordData)
                .eq('email',email).eq('updated_at',expected).select('updated_at').maybeSingle())
            : await timedQuery(supabase.from('workouts').insert(recordData).select('updated_at').maybeSingle());
        if(result.error && result.error.code!=='23505')throw result.error;
        if(result.error || !result.data?.updated_at){
            const latest=await pullWorkoutRecord(userOrEmail);
            if(latest && samePayload(latest.payload,payload)){
                setCloudRevision(userOrEmail,latest.revision);
            }else if(latest && previousAttempt && [previousAttempt.hash,...(previousAttempt.priorHashes||[])].includes(await payloadHash(latest.payload))){
                setCloudRevision(userOrEmail,latest.revision);return {ok:false,error:Error('Invio precedente confermato; nuova modifica in attesa.')};
            }else return conflict(userOrEmail,payload,latest);
        }else setCloudRevision(userOrEmail,result.data.updated_at);
        setSyncAttempt(userOrEmail,null);clearSyncConflict(userOrEmail);
        markCloudAcknowledged(userOrEmail);
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
        setCloudRevision(userOrEmail,remote.revision);
        return {ok:true,payload:remote.payload,revision:remote.revision};
    }
    const currentPayload=payload||getFromLocalStorageForUser(userOrEmail);
    await syncCoachArchives(currentPayload,userOrEmail);
    const writtenAt=new Date(Math.max(Date.now(),
        (Date.parse(remote?.revision||'')||0)+1)).toISOString();
    let result;
    if(remote){
        result=await timedQuery(supabase.from('workouts')
            .update({email,payload:currentPayload,updated_at:writtenAt})
            .eq('email',email).eq('updated_at',observed.remoteRevision)
            .select('updated_at').maybeSingle());
    }else{
        result=await timedQuery(supabase.from('workouts')
            .insert({email,payload:currentPayload,updated_at:writtenAt})
            .select('updated_at').maybeSingle());
    }
    if(result.error || !result.data?.updated_at)
        return conflict(userOrEmail,currentPayload,await pullWorkoutRecord(userOrEmail));
    setCloudRevision(userOrEmail,result.data.updated_at);
    setSyncAttempt(userOrEmail,null);markCloudAcknowledged(userOrEmail);
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
    let userId=userOrEmail?.id;

    if (!email || !userId) {
        const { data } = await supabase.auth.getUser();
        email = extractEmail(data?.user);userId=data?.user?.id;
    }

    if (!email) return false;

    try {
        const { error } = await supabase
            .from('workouts')
            .delete()
            .eq('email', email);

        if (error) throw error;
        if(userId){const archive=await timedQuery(supabase.from('workout_coach_archives').delete().eq('user_id',userId));if(archive.error)throw archive.error;}
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
let resumeInFlight=null;

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
    const resume = async () => {
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
                    const localTime = new Date(localData.updatedAt || 0).getTime();
                    const remoteTime = new Date(remoteData.updatedAt || 0).getTime();

                    if (remoteTime > localTime) {
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

    const handleSyncTrigger=()=>{
        if(resumeInFlight)return resumeInFlight;
        resumeInFlight=resume().finally(()=>{resumeInFlight=null;});return resumeInFlight;
    };
    document.addEventListener('visibilitychange', handleSyncTrigger);
    window.addEventListener('online', handleSyncTrigger);
    window.addEventListener('focus', handleSyncTrigger);
}
