// ==========================================
// ACCOUNT MANAGER & SUBSCRIPTION
// Gestione interfaccia utente, stato abbonamenti,
// notifiche di prova/scadenza e cancellazione account.
// ==========================================
import { supabase } from './config.js';
import { removeAccountLocalData, pauseSyncForAccountDeletion } from './storage.js';
import { state } from './state.js';

export function applyUserToUI(user) {
    const userEmailDisplay = document.getElementById('user-email-display');
    const userInfoBar = document.getElementById('user-info-bar');
    
    if (userInfoBar) userInfoBar.style.display = 'flex';
    
    if (userEmailDisplay) {
        if (user) {
            const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email;
            if (fullName) {
                userEmailDisplay.textContent = fullName;
                localStorage.setItem('cached_athlete_name', fullName);
                return;
            }
        }
        
        const cachedName = localStorage.getItem('cached_athlete_name');
        userEmailDisplay.textContent = cachedName || 'Atleta';
    }
}

export function showTrialToast(message) {
    const toast = document.getElementById('trial-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.style.display = 'block';

    setTimeout(() => { toast.style.opacity = '1'; }, 50);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 500);
    }, 3500);
}

export function showExpiredOverlay(title, message) {
    const overlay = document.getElementById('trial-expired-overlay');
    const titleEl = document.getElementById('trial-expired-title');
    const msgEl = document.getElementById('trial-expired-msg');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.innerHTML = message;
    if (overlay) overlay.style.display = 'flex';
}

export async function checkSubscriptionStatus(user) {
    if (!user || !user.id) return;

    try {
        const { data, error } = await supabase
            .from('user_subscriptions')
            .select('status, trial_ends_at, expires_at')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error || !data) return;

        if (data.status === 'lifetime') return;

        const now = new Date();

        if (data.status === 'active' && data.expires_at) {
            const endDate = new Date(data.expires_at);
            const diffDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 0) {
                showExpiredOverlay("Abbonamento Scaduto", "Il tuo abbonamento annuale è scaduto.");
            } else if (diffDays <= 7) {
                showTrialToast(`⚠️ Il tuo abbonamento scade tra ${diffDays} giorni!`);
            }
            return;
        }

        if (data.status === 'trial' && data.trial_ends_at) {
            const endDate = new Date(data.trial_ends_at);
            const diffDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 0) {
                showExpiredOverlay("Periodo di Prova Terminato", "I tuoi 45 giorni di prova gratuita sono terminati.");
            } else {
                showTrialToast(`⏳ Periodo di prova attivo: restano ${diffDays} giorni`);
            }
            return;
        }
    } catch (err) {
        console.warn("Eccezione controllo abbonamento:", err);
    }
}

export async function deleteUserAccount() {
    const confirmed = confirm("Sei sicuro di voler eliminare definitivamente il tuo account? Tutti i tuoi dati e allenamenti andranno persi.");
    if (!confirmed) return;

    let resume;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) throw new Error("Sessione non trovata.");
        resume=pauseSyncForAccountDeletion();

        const { error } = await supabase.functions.invoke('delete-account', {
            headers: { Authorization: `Bearer ${session.access_token}` }
        });

        if (error) throw error;

        await removeAccountLocalData(session.user);
        if(String(state.currentUser?.id)!==String(session.user.id))return;
        alert("Account eliminato con successo.");
        await supabase.auth.signOut();
        window.location.reload();
    } catch (err) {
        console.error("Errore eliminazione account:", err);
        alert("Impossibile eliminare l'account: " + (err.message || "Riprova."));
    } finally {resume?.();}
}
