/**
 * Module: sync.js
 * Summary: Gestisce la sincronizzazione dei dati tra il client e Supabase, inclusa la pull e push di informazioni sull'allenamento[cite: 6].
 */

// ==========================================
// 1. IMPORT & CONFIGURAZIONE
// ==========================================
import { supabase } from './config.js';
import { getFromLocalStorage, saveToLocalStorage, hasPendingSync, processSyncQueue, updateSyncStatusUI } from './storage.js';
import { renderWorkoutList } from './ui.js';

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
export async function pullDataFromSupabase(userOrEmail) {
    if (!supabase) return null;

    const email = extractEmail(userOrEmail);
    if (!email) {
        console.warn("⚠️ [Sync] Ttentativo di Pull annullato: email non valida o booleana.");
        return null;
    }

    try {
        const { data, error } = await supabase
            .from('workouts')
            .select('payload')
            .eq('email', email)
            .maybeSingle();

        if (error) throw error;
        return data ? data.payload : null;
    } catch (err) {
        console.error("❌ Errore nel recupero dati da Supabase:", err.message);
        return null;
    }
}

// ==========================================
// 3. PERSISTENZA (PUSH) DATI
// ==========================================
export async function pushDataToSupabase(userOrEmail, payload, actionTimestamp = null) {
    if (!supabase) return false;

    const email = extractEmail(userOrEmail);
    if (!email) {
        console.warn("⚠️ [Sync] Tentativo di Push annullato: email non valida.");
        return false;
    }

    try {
        const recordData = {
            email: email,
            payload: payload
        };

        if (actionTimestamp) {
            recordData.updated_at = new Date(actionTimestamp).toISOString();
        }

        const { error } = await supabase
            .from('workouts')
            .upsert(recordData, { onConflict: 'email' });

        if (error) throw error;
        return true;
    } catch (err) {
        console.error("❌ Errore nel salvataggio su Supabase:", err.message);
        
        if (err.code === '42501' || err.message?.includes('row-level security')) {
            alert("⚠️ Licenza o periodo di prova scaduto! Attiva o rinnova l'abbonamento per continuare a salvare i tuoi allenamenti sul Cloud.");
        } else {
            alert(`Impossibile salvare sul Cloud: ${err.message}`);
        }
        return false;
    }
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
            if (!user) return;

            if (hasPendingSync()) {
                await processSyncQueue();
            }

            const remoteData = await pullDataFromSupabase(user);
                if (remoteData) {
                    const localData = getFromLocalStorage();
                    const localTime = new Date(localData.updatedAt || 0).getTime();
                    const remoteTime = new Date(remoteData.updatedAt || 0).getTime();

                    if (remoteTime > localTime) {
                        state.workoutData = remoteData;
                        saveToLocalStorage(remoteData,{preserveUpdatedAt:true});
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