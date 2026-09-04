// js/sync.js
import { supabase } from './config.js';

export async function pullDataFromSupabase(userOrEmail) {
    if (!supabase) return null;

    const email = typeof userOrEmail === 'object' ? userOrEmail?.email : userOrEmail;
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
        console.error("Errore nel recupero dati da Supabase:", err.message);
        return null;
    }
}

/**
 * Salva il payload su Supabase.
 * Se la prova dei 15 giorni è scaduta, la policy RLS del DB blocca la richiesta e mostra un alert.
 */
export async function pushDataToSupabase(userOrEmail, payload) {
    if (!supabase) return false;

    const email = typeof userOrEmail === 'object' ? userOrEmail?.email : userOrEmail;
    if (!email) return false;

    try {
        // updated_at viene aggiornato automaticamente dal trigger PostgreSQL del server
        const { error } = await supabase
            .from('workouts')
            .upsert({ 
                email: email, 
                payload: payload 
            }, { onConflict: 'email' });

        if (error) throw error;
        return true;
    } catch (err) {
        console.error("Errore nel salvataggio su Supabase:", err.message);
        
        // Intercetta il blocco della Policy RLS per trial scaduto (Codice errore 42501 o violazione policy)
        if (err.code === '42501' || err.message?.includes('row-level security')) {
            alert("⚠️ Periodo di prova scaduto! Il tuo periodo di 15 giorni è terminato. Attiva un abbonamento per continuare a salvare i tuoi allenamenti sul Cloud.");
        } else {
            alert(`Impossibile salvare sul Cloud: ${err.message}`);
        }
        return false;
    }
}

/**
 * Recupera lo stato dell'abbonamento dell'utente corrente dal DB
 */
export async function getUserSubscriptionStatus(userOrEmail) {
    if (!supabase) return null;

    const email = typeof userOrEmail === 'object' ? userOrEmail?.email : userOrEmail;
    if (!email) return null;

    try {
        const { data, error } = await supabase
            .from('user_subscriptions')
            .select('status, trial_ends_at')
            .eq('email', email)
            .maybeSingle();

        if (error) throw error;
        return data;
    } catch (err) {
        console.error("Errore recupero abbonamento:", err.message);
        return null;
    }
}

export async function deleteCloudData(userOrEmail = null) {
    if (!supabase) return false;

    let email = typeof userOrEmail === 'object' ? userOrEmail?.email : userOrEmail;

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