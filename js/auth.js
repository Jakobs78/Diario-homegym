// js/auth.js
import { supabase, CONFIG } from './config.js';
import { state } from './state.js';

export async function loginUser(email, password) {
    try {
        if (CONFIG.WHITELIST && CONFIG.WHITELIST.length > 0) {
            if (!CONFIG.WHITELIST.includes(email.trim().toLowerCase())) {
                throw new Error("Accesso negato: email non presente nella whitelist autorizzata.");
            }
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        state.currentUser = data.user;
        
        try {
            localStorage.setItem('user_email', data.user.email);
        } catch (e) {
            console.warn("Impossibile salvare l'email in localStorage (Storage disabilitato o Pieno).");
        }
        
        return { success: true, user: data.user };
    } catch (error) {
        console.error("Errore di login:", error.message);
        return { success: false, error: error.message };
    }
}

export async function logoutUser() {
    try {
        await supabase.auth.signOut();
        state.currentUser = null;
        try {
            localStorage.removeItem('user_email');
        } catch (e) {} // Silenzia errori in caso di incognito mode
        window.location.reload();
    } catch (error) {
        console.error("Errore durante il logout:", error.message);
    }
}

export async function checkSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session && session.user) {
            state.currentUser = session.user;
            localStorage.setItem('user_email', session.user.email);
            return true;
        }
    } catch (err) {
        console.warn("Connessione Supabase non disponibile o errore sessione. Attivazione modalità offline...", err);
    }

    // Fallback offline sicuro su LocalStorage
    try {
        const rawData = localStorage.getItem(CONFIG.STORAGE_KEY);
        const cachedEmail = localStorage.getItem('user_email');

        if (rawData) {
            const parsed = JSON.parse(rawData);
            
            const offlineEmail = parsed?.athlete?.email 
                || parsed?.user?.email 
                || cachedEmail 
                || (CONFIG.WHITELIST && CONFIG.WHITELIST[0]) 
                || 'atleta.offline@local.app';

            state.currentUser = {
                id: parsed?.athlete?.id || 'offline-user-id',
                email: offlineEmail,
                isOffline: true
            };
            return true;
        } else if (cachedEmail) {
            state.currentUser = { email: cachedEmail, isOffline: true };
            return true;
        }
    } catch (parseErr) {
        console.error("Errore critico nel parsing della sessione offline da LocalStorage:", parseErr);
    }

    return false;
}
export function setupAuthListeners() {
    supabase.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
            state.currentUser = session.user;
        } else {
            state.currentUser = null;
        }
    });
}