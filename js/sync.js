// sync.js
import { supabase } from './config.js';

/**
 * Gestisce il login dell'utente
 */
export async function loginUser(email, password) {
    if (!supabase) {
        alert("Client Supabase non configurato correttamente in config.js.");
        return null;
    }
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data.user;
    } catch (err) {
        console.error("Errore durante il login:", err.message);
        alert(`Errore di login: ${err.message}`);
        return null;
    }
}

/**
 * Gestisce la registrazione di un nuovo account
 */
export async function signupUser(email, password) {
    if (!supabase) {
        alert("Client Supabase non configurato correttamente in config.js.");
        return null;
    }
    try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert("Registrazione completata! Controlla la tua email o effettua il login.");
        return data.user;
    } catch (err) {
        console.error("Errore durante la registrazione:", err.message);
        alert(`Errore di registrazione: ${err.message}`);
        return null;
    }
}

/**
 * Scarica il payload JSON da Supabase per l'utente loggato
 */
export async function pullDataFromSupabase(email) {
    if (!supabase) return null;
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
 * Salva/Aggiorna il payload JSON su Supabase
 */
export async function pushDataToSupabase(email, payload) {
    if (!supabase) return;
    try {
        const { error } = await supabase
            .from('workouts')
            .upsert({ 
                email: email, 
                payload: payload, 
                updated_at: new Date().toISOString() 
            });

        if (error) throw error;
    } catch (err) {
        console.error("Errore nel salvataggio su Supabase:", err.message);
    }
}
// Esegue il logout
export async function logoutUser() {
    if (!supabase) return;
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        return true;
    } catch (err) {
        console.error("Errore durante il logout:", err.message);
        alert(`Errore di logout: ${err.message}`);
        return false;
    }
}