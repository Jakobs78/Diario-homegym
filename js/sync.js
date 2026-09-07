// ==========================================
// 1. IMPORT & CONFIGURAZIONE
// ==========================================
import { supabase } from './config.js';

/**
 * Utility interna per estrarre l'email da un oggetto utente o da una stringa
 */
function extractEmail(userOrEmail) {
    if (!userOrEmail) return null;
    return typeof userOrEmail === 'object' ? userOrEmail.email : userOrEmail;
}

// ==========================================
// 2. RETRIEVAL (PULL) DATI
// ==========================================
export async function pullDataFromSupabase(userOrEmail) {
    if (!supabase) return null;

    const email = extractEmail(userOrEmail);
    if (!email) return null;

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
/**
 * Salva il payload dell'allenamento su Supabase.
 * Gestisce l'errore di RLS in caso di licenza o prova scaduta.
 */
export async function pushDataToSupabase(userOrEmail, payload, actionTimestamp = null) {
    if (!supabase) return false;

    const email = extractEmail(userOrEmail);
    if (!email) return false;

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
    const userId = typeof userOrEmail === 'object' ? userOrEmail?.id : null;

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
        email = data?.user?.email;
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