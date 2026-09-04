// js/auth.js
import { supabase, CONFIG } from './config.js';
import { state } from './state.js';

export async function loginUser(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        state.currentUser = data.user;
        
        try {
            localStorage.setItem('user_email', data.user.email);
        } catch (e) {
            console.warn("Impossibile salvare l'email in localStorage.");
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
        } catch (e) {}
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
            hideAuthOverlay();
            return true;
        }
    } catch (err) {
        console.warn("Connessione Supabase non disponibile, modalità offline...", err);
    }

    try {
        const rawData = localStorage.getItem(CONFIG.STORAGE_KEY);
        const cachedEmail = localStorage.getItem('user_email');

        if (rawData || cachedEmail) {
            state.currentUser = { email: cachedEmail || 'atleta.offline@local.app', isOffline: true };
            hideAuthOverlay();
            return true;
        }
    } catch (parseErr) {
        console.error("Errore parsing sessione offline:", parseErr);
    }

    return false;
}

function hideAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

export function setupAuthListeners() {
    supabase.auth.onAuthStateChange((event, session) => {
        const authOverlay = document.getElementById('auth-overlay');
        
        if (session && session.user) {
            state.currentUser = session.user;
            if (authOverlay) authOverlay.style.display = 'none';
        } else {
            state.currentUser = null;
            if (authOverlay) authOverlay.style.display = 'flex';
        }
    });

    const submitBtn = document.getElementById('auth-submit-btn');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const toggleText = document.getElementById('auth-toggle-text');
    const authTitle = document.getElementById('auth-title');
    const errorDiv = document.getElementById('auth-error');

    let isRegistering = false;

    if (toggleText) {
        toggleText.addEventListener('click', () => {
            isRegistering = !isRegistering;
            if (isRegistering) {
                authTitle.textContent = "Registrati al Diario";
                submitBtn.textContent = "Registrati";
                toggleText.textContent = "Hai già un account? Accedi";
            } else {
                authTitle.textContent = "Accedi al Diario";
                submitBtn.textContent = "Accedi";
                toggleText.textContent = "Non hai un account? Registrati";
            }
        });
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = emailInput?.value.trim();
            const password = passwordInput?.value;

            if (!email || !password) {
                if (errorDiv) {
                    errorDiv.textContent = "Inserisci email e password.";
                    errorDiv.style.display = 'block';
                }
                return;
            }

            if (errorDiv) errorDiv.style.display = 'none';

            if (isRegistering) {
                try {
                    const { data, error } = await supabase.auth.signUp({ email, password });
                    if (error) throw error;
                    alert("Registrazione completata! Controlla la tua email o accedi ora.");
                    isRegistering = false;
                    authTitle.textContent = "Accedi al Diario";
                    submitBtn.textContent = "Accedi";
                } catch (err) {
                    if (errorDiv) {
                        errorDiv.textContent = err.message;
                        errorDiv.style.display = 'block';
                    }
                }
            } else {
                const result = await loginUser(email, password);
                if (result.success) {
                    const authOverlay = document.getElementById('auth-overlay');
                    if (authOverlay) authOverlay.style.display = 'none';
                    window.location.reload();
                } else {
                    if (errorDiv) {
                        errorDiv.textContent = result.error;
                        errorDiv.style.display = 'block';
                    }
                }
            }
        });
    }
}