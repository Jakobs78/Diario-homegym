// sync.js
import { supabase, CONFIG } from './config.js';

/**
 * Verifica se un'email è autorizzata tramite la whitelist in config.js
 */
function isEmailWhitelisted(email) {
    if (!CONFIG.WHITELIST || CONFIG.WHITELIST.length === 0) return true;
    return CONFIG.WHITELIST.map(e => e.toLowerCase()).includes(email?.toLowerCase());
}

/**
 * Gestisce il login dell'utente con controllo Whitelist
 */
export async function loginUser(email, password) {
    if (!supabase) {
        alert("Client Supabase non configurato correttamente in config.js.");
        return null;
    }

    if (!isEmailWhitelisted(email)) {
        alert("Accesso negato: Indirizzo email non autorizzato.");
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
 * Gestisce la registrazione di un nuovo account con controllo Whitelist
 */
export async function signupUser(email, password) {
    if (!supabase) {
        alert("Client Supabase non configurato correttamente in config.js.");
        return null;
    }

    if (!isEmailWhitelisted(email)) {
        alert("Registrazione non consentita per questo indirizzo email.");
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
 * Scarica il payload JSON da Supabase accettando sia stringhe email che oggetti utente
 */
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
 * Salva/Aggiorna il payload JSON su Supabase ritornando uno stato booleano per la coda di storage.js
 */
export async function pushDataToSupabase(userOrEmail, payload) {
    if (!supabase) return false;

    const email = typeof userOrEmail === 'object' ? userOrEmail?.email : userOrEmail;
    if (!email) return false;

    try {
        const { error } = await supabase
            .from('workouts')
            .upsert({ 
                email: email, 
                payload: payload, 
                updated_at: new Date().toISOString() 
            }, { onConflict: 'email' });

        if (error) throw error;
        return true;
    } catch (err) {
        console.error("Errore nel salvataggio su Supabase:", err.message);
        return false;
    }
}

/**
 * Esegue il logout
 */
export async function logoutUser() {
    if (!supabase) return false;
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