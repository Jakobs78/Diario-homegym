// js/auth.js
import { supabase} from './config.js'
import { state } from './state.js';
import { saveAndSync, getFromLocalStorage } from './storage.js';
import { pullDataFromSupabase, loginUser, logoutUser, signupUser } from './sync.js';
import { renderWorkoutList } from './ui.js';
import { showNotification } from './helpers.js';

/**
 * Gestisce il logout dell'utente ed azzera l'interfaccia.
 */
export async function handleLogout() {
    const success = await logoutUser();
    if (success) {
        state.currentUser = null;
        state.workoutData.athlete.email = "";
        
        const userInfoBar = document.getElementById('user-info-bar');
        if (userInfoBar) userInfoBar.style.display = 'none';
        
        const emailDisplay = document.getElementById('user-email-display');
        if (emailDisplay) emailDisplay.textContent = '';
        
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay) authOverlay.style.display = 'flex';
    }
}

/**
 * Inizializza i listener per il form di login e registrazione.
 */
export function setupAuthListeners() {
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    const authTitle = document.getElementById('auth-title');
    const authOverlay = document.getElementById('auth-overlay');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const errorDiv = document.getElementById('auth-error');

    let isSignUpMode = false;

    toggleText?.addEventListener('click', () => {
        isSignUpMode = !isSignUpMode;
        if (isSignUpMode) {
            authTitle.textContent = "Crea un Account";
            submitBtn.textContent = "Registrati";
            toggleText.textContent = "Hai già un account? Accedi";
        } else {
            authTitle.textContent = "Accedi al Diario";
            submitBtn.textContent = "Accedi";
            toggleText.textContent = "Non hai un account? Registrati";
        }
        if (errorDiv) errorDiv.style.display = 'none';
    });

    submitBtn?.addEventListener('click', async () => {
        const email = emailInput?.value.trim();
        const password = passwordInput?.value.trim();

        if (!email || !password) {
            if (errorDiv) {
                errorDiv.textContent = "Inserisci email e password.";
                errorDiv.style.display = 'block';
            }
            return;
        }

        if (errorDiv) errorDiv.style.display = 'none';

        if (isSignUpMode) {
            const user = await signupUser(email, password);
            if (user) {
                isSignUpMode = false;
                authTitle.textContent = "Accedi al Diario";
                submitBtn.textContent = "Accedi";
                toggleText.textContent = "Non hai un account? Registrati";
            }
        } else {
            const user = await loginUser(email, password);
            if (user) {
                state.currentUser = user.email;
                state.workoutData.athlete.email = user.email;
                
                if (authOverlay) authOverlay.style.display = 'none';

                const userInfoBar = document.getElementById('user-info-bar');
                if (userInfoBar) userInfoBar.style.display = 'flex';

                const emailDisplay = document.getElementById('user-email-display');
                if (emailDisplay) emailDisplay.textContent = user.email;

                const remoteData = await pullDataFromSupabase(user.email);
                if (remoteData && remoteData.history) {
                    saveAndSync(remoteData);
                } else {
                    saveAndSync(state.workoutData);
                }
                renderWorkoutList();
            }
        }
    });
}
/**
 * Verifica se esiste una sessione Supabase attiva al ricaricamento della pagina.
 */
export async function checkSession() {
    // 1. Se siamo OFFLINE, ripristina la sessione dall'ultimo utente salvato in locale
    if (!navigator.onLine) {
        const localData = getFromLocalStorage();
        const localEmail = localData?.athlete?.email;

        if (localEmail) {
            state.currentUser = localEmail;
            state.workoutData = localData;

            const userInfoBar = document.getElementById('user-info-bar');
            if (userInfoBar) userInfoBar.style.display = 'flex';

            const emailDisplay = document.getElementById('user-email-display');
            if (emailDisplay) emailDisplay.textContent = localEmail;

            const authOverlay = document.getElementById('auth-overlay');
            if (authOverlay) authOverlay.style.display = 'none';

            return { email: localEmail };
        }
        return null;
    }

    // 2. Se siamo ONLINE, verifica normalmente su Supabase
    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
            state.currentUser = session.user.email;
            state.workoutData.athlete.email = session.user.email;

            const userInfoBar = document.getElementById('user-info-bar');
            if (userInfoBar) userInfoBar.style.display = 'flex';

            const emailDisplay = document.getElementById('user-email-display');
            if (emailDisplay) emailDisplay.textContent = session.user.email;

            const authOverlay = document.getElementById('auth-overlay');
            if (authOverlay) authOverlay.style.display = 'none';

            return session.user;
        }
    } catch (err) {
        console.warn("⚠️ Verifica sessione Supabase fallita (offline/errore):", err.message);
    }
    
    return null;
}