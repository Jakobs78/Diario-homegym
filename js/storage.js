// Salvataggio locale, Supabase, Import/ export CSV
// js/storage.js
import { supabase } from './supabaseClient.js';
import { state } from './state.js';
    export async function saveInputToStorage(dataId, valToSave, renderCallback) {
    const savedData = JSON.parse(localStorage.getItem(state.STORAGE_KEY_DATA)) || {};
    savedData[dataId] = valToSave;
    localStorage.setItem(state.STORAGE_KEY_DATA, JSON.stringify(savedData));

    if (typeof renderCallback === 'function') {
        renderCallback();
    }

    if (state.currentUser && supabase) {
        clearTimeout(state.supabaseDebounceTimer);
        state.supabaseDebounceTimer = setTimeout(async () => {
            try {
                await supabase
                    .from('workout_data')
                    .upsert({
                        user_id: state.currentUser.id,
                        data_key: dataId,
                        valore: String(valToSave),
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id,data_key' });
            } catch (err) {
                console.error("Errore di sincronizzazione Supabase:", err);
            }
        }, 500);
    }
}

export function exportProgressCSV() {
    const dataToExport = JSON.parse(localStorage.getItem(state.STORAGE_KEY_DATA)) || {};
    let csvContent = "data:text/csv;charset=utf-8,ID_Dato,Valore\r\n";
    for (const [key, value] of Object.entries(dataToExport)) {
        const safeValue = String(value).replace(/"/g, '""');
        csvContent += `"${key}","${safeValue}"\r\n`;
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `progressi_homegym_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
export async function importProgressCSV(event, renderCallback) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result;
        const lines = text.split(/\r\n|\n/);
        let savedData = JSON.parse(localStorage.getItem(state.STORAGE_KEY_DATA)) || {};
        let count = 0;
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const delimiter = line.includes(';') ? ';' : ',';
            const parts = line.split(delimiter);
            
            if (parts.length >= 2) {
                const key = parts[0].replace(/^"|"$/g, '').trim();
                let val = parts[1].replace(/^"|"$/g, '').trim().replace(/""/g, '"');
                if (val === 'true') val = true;
                if (val === 'false') val = false;
                if (key) {
                    savedData[key] = val;
                    count++;
                }
            }
        }
        
        // Salva nel localStorage
        localStorage.setItem(state.STORAGE_KEY_DATA, JSON.stringify(savedData));

        // Se l'utente è loggato, sincronizza l'intero blocco su Supabase
        if (state.currentUser && supabase) {
            try {
                for (const [key, val] of Object.entries(savedData)) {
                    await supabase
                        .from('workout_data')
                        .upsert({
                            user_id: state.currentUser.id,
                            data_key: key,
                            valore: String(val),
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id,data_key' });
                }
            } catch (err) {
                console.error("Errore di sincronizzazione Supabase durante l'importazione:", err);
            }
        }

        alert(`Progressi importati con successo! (${count} valori caricati)`);
        
        // Ricarica la pagina per popolare l'interfaccia con i dati freschi
        location.reload();
    };
    reader.readAsText(file);
}

export function importWorkoutPlan(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        localStorage.setItem('workout_plan_csv_raw', e.target.result);
        alert("Scheda di allenamento caricata correttamente!");
        location.reload();
    };
    reader.readAsText(file);
}

// Aggiungi questa variabile in alto nel file, appena sotto gli import
let isRegistering = false;

// ... (le tue altre funzioni esistenti rimangono invariate) ...

// Aggiungi queste due funzioni in fondo al file storage.js
export function toggleAuthMode() {
    isRegistering = !isRegistering;
    const titleEl = document.getElementById('auth-title');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');

    if (isRegistering) {
        if (titleEl) titleEl.innerText = "Registrati al Diario";
        if (submitBtn) submitBtn.innerText = "Registrati";
        if (toggleText) toggleText.innerText = "Hai già un account? Accedi";
    } else {
        if (titleEl) titleEl.innerText = "Accedi al Diario";
        if (submitBtn) submitBtn.innerText = "Accedi";
        if (toggleText) toggleText.innerText = "Non hai un account? Registrati";
    }
}

export async function handleAuthSubmit() {
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const errorDiv = document.getElementById('auth-error');
    
    if (!emailInput || !passwordInput) return;
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!supabase) {
        alert("Credenziali Supabase non configurate.");
        return;
    }

    try {
        let result;
        if (isRegistering) {
            result = await supabase.auth.signUp({ email, password });
            if (result.error) throw result.error;
            alert("Registrazione completata! Controlla la tua email per confermare l'account.");
            // Reset modalità dopo registrazione
            isRegistering = false;
            toggleAuthMode();
        } else {
            result = await supabase.auth.signInWithPassword({ email, password });
            if (result.error) throw result.error;
            state.currentUser = result.data.user;
            location.reload();
        }
    } catch (err) {
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.innerText = err.message;
        } else {
            alert("Errore: " + err.message);
        }
    }
}
export async function handleLogout() {
    if (supabase) {
        await supabase.auth.signOut();
        state.currentUser = null;
        location.reload();
    }
}

export async function resetDiaryData() {
    const primaConferma = confirm("Sei sicuro di voler azzerare tutti i progressi e le spunte registrate?");
    if (primaConferma) {
        const secondaConferma = confirm("ATTENZIONE: Questa azione è irreversibile. Vuoi davvero procedere?");
        if (secondaConferma) {
            localStorage.removeItem(state.STORAGE_KEY_DATA);

            if (state.currentUser && supabase) {
                try {
                    await supabase
                        .from('workout_data')
                        .delete()
                        .eq('user_id', state.currentUser.id);
                } catch (err) {
                    console.error("Errore di rete durante il reset:", err);
                }
            }

            location.reload();
        }
    }
}