// Gestione LocalStorage, Supabase, Import/ Export CSV, ecc.
import { supabaseClient, STORAGE_KEY_DATA, STORAGE_KEY_PLAN } from './config.js';
import { state } from './state.js';
import { renderCurrentView, generateDynamicDays } from './ui.js';

export async function loadUserDataFromSupabase() {
    if (!state.currentUser) return;

    if (!navigator.onLine) {
        console.log("Modalità offline attiva: carico i dati dal browser.");
        updateSyncStatus('offline');
        if (typeof loadWorkoutPlanForCurrentMeso === 'function') {
            loadWorkoutPlanForCurrentMeso();
        }
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('workout_data')
            .select('data_key, valore')
            .eq('user_id', state.currentUser.id);

        if (error) {
            console.error("Errore nel caricamento Supabase:", error);
            return;
        }

        const remoteKeys = new Set(data ? data.map(row => row.data_key) : []);

        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && (key.includes(STORAGE_KEY_PLAN) || key.includes('_mese_'))) {
                if (!remoteKeys.has(key)) {
                    localStorage.removeItem(key);
                }
            }
        }

        let savedData = {};
        if (data && data.length > 0) {
            data.forEach(row => {
                let val = row.valore;
                if (val === 'true') val = true;
                if (val === 'false') val = false;

                if (row.data_key.includes(STORAGE_KEY_PLAN) || row.data_key.includes('_mese_')) {
                    localStorage.setItem(row.data_key, val);
                } else {
                    savedData[row.data_key] = val;
                }
            });
        }
        localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(savedData));

        if (typeof loadWorkoutPlanForCurrentMeso === 'function') {
            loadWorkoutPlanForCurrentMeso();
        }
    } catch (err) {
        console.error("Errore di rete:", err);
        updateSyncStatus('offline');
    }
}

export function updateSyncStatus(status) {
    const badge = document.getElementById('sync-status');
    if (!badge) return;

    switch (status) {
        case 'saving':
            badge.innerHTML = '🔄 Salvataggio...';
            badge.style.borderColor = '#f59e0b';
            break;
        case 'synced':
            badge.innerHTML = '🟢 Sincronizzato';
            badge.style.borderColor = 'var(--border-color)';
            break;
        case 'error':
            badge.innerHTML = '🔴 Errore sync';
            badge.style.borderColor = '#dc2626';
            break;
        case 'offline':
            badge.innerHTML = '⚠️ Offline';
            badge.style.borderColor = '#d97706';
            break;
        default:
            badge.innerHTML = '⚪ Inattivo';
    }
}

window.updateSyncStatus = updateSyncStatus;

export async function saveMetaToStorage() {
    let savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
    savedData['meta-date'] = document.querySelector('[data-id="meta-date"]')?.value || '';
    savedData['meta-meso-num'] = state.currentMesoNumber;
    savedData['meta-week'] = document.getElementById('week-selector')?.value || '1';
    
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(savedData));

    if (state.currentUser && navigator.onLine) {
        try {
            for (const [key, val] of Object.entries(savedData)) {
                await supabaseClient
                    .from('workout_data')
                    .upsert({
                        user_id: state.currentUser.id,
                        data_key: key,
                        valore: String(val),
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id,data_key' });
            }
        } catch (err) {
            console.error("Errore di sincronizzazione meta-dati su Supabase:", err);
        }
    }
}

export async function saveInputToStorage(e) {
    const input = e.target;
    const dataId = input.getAttribute('data-id');
    if (!dataId) return;

    const weekNumber = parseInt(document.getElementById('week-selector').value) || 1;
    if (weekNumber > 1 && input.type !== 'checkbox') {
        const val = parseFloat(input.value);
        if (input.hasAttribute('data-csv-kg')) {
            const csvKg = parseFloat(input.getAttribute('data-csv-kg'));
            if (!isNaN(csvKg) && !isNaN(val) && val !== csvKg) {
                input.style.color = '#dc2626';
                input.style.fontWeight = '700';
            } else {
                input.style.color = '';
                input.style.fontWeight = '';
            }
        } else if (input.hasAttribute('data-csv-rep-min')) {
            const minRep = parseFloat(input.getAttribute('data-csv-rep-min'));
            const maxRep = parseFloat(input.getAttribute('data-csv-rep-max'));
            if (!isNaN(minRep) && !isNaN(maxRep) && !isNaN(val) && (val < minRep || val > maxRep)) {
                input.style.color = '#dc2626';
                input.style.fontWeight = '700';
            } else {
                input.style.color = '';
                input.style.fontWeight = '';
            }
        }
    } else {
        input.style.color = '';
        input.style.fontWeight = '';
    }

    let valToSave = input.type === 'checkbox' ? input.checked : input.value;

    let savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
    savedData[dataId] = valToSave;
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(savedData));

    if (state.currentUser) {
        if (!navigator.onLine) {
            window.updateSyncStatus('offline');
            return;
        }

        clearTimeout(state.supabaseDebounceTimer);
        window.updateSyncStatus('saving');

        state.supabaseDebounceTimer = setTimeout(async () => {
            if (!navigator.onLine) {
                window.updateSyncStatus('offline');
                return;
            }
            try {
                const { error } = await supabaseClient
                    .from('workout_data')
                    .upsert({
                        user_id: state.currentUser.id,
                        data_key: dataId,
                        valore: String(valToSave),
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id,data_key' });
                
                if (error) throw error;
                window.updateSyncStatus('synced');

            } catch (err) {
                console.error("Errore di sincronizzazione Supabase:", err);
                window.updateSyncStatus(!navigator.onLine ? 'offline' : 'error');
            }
        }, 500);
    }
}

export function importWorkoutPlan(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const mesoMatch = fileName.match(/mese[_\s-]?(\d+)/);
    
    if (mesoMatch) {
        state.currentMesoNumber = parseInt(mesoMatch[1]);
        document.getElementById('meso-display').innerText = state.currentMesoNumber;
        saveMetaToStorage();
    } else {
        const currentPlanKey = `${STORAGE_KEY_PLAN}_mese_${state.currentMesoNumber}`;
        const existingPlan = localStorage.getItem(currentPlanKey);
        if (existingPlan) {
            const nextMeso = state.currentMesoNumber + 1;
            const scelta = confirm(
                `Esiste già una scheda salvata per il Mesociclo ${state.currentMesoNumber}.\n\n` +
                `Vuoi passare al Mesociclo successivo (${nextMeso}) caricando qui la nuova scheda?\n` +
                `(Clicca 'Annulla' se vuoi invece sovrascrivere quella attuale del Mesociclo ${state.currentMesoNumber})`
            );

            if (scelta) {
                state.currentMesoNumber = nextMeso;
                document.getElementById('meso-display').innerText = state.currentMesoNumber;
                saveMetaToStorage();
            }
        }
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result;
        const lines = text.split(/\r\n|\n/);
        
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
        
        let newPlan = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = line.split(delimiter);
            let obj = {};
            
            headers.forEach((header, index) => {
                let val = values[index] ? values[index].replace(/""/g, '"').trim() : '';
                const cleanHeader = header.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                
                if (val.includes(',')) {
                    val = val.replace(',', '.');
                }
                
                obj[header] = val;

                if (cleanHeader === 'note' || cleanHeader === 'noteallenatore') obj['NoteAllenatore'] = val;
                if (cleanHeader === 'kg' || cleanHeader === 'peso' || cleanHeader === 'carico' || cleanHeader === 'kgtarget') obj['Kg'] = val.replace(/kg/gi, '').trim();
                if (cleanHeader === 'kgmin' || cleanHeader === 'pesomin' || cleanHeader === 'caricomin') obj['KgMin'] = val.replace(/kg/gi, '').trim();
                if (cleanHeader === 'kgmax' || cleanHeader === 'pesomax' || cleanHeader === 'caricomax') obj['KgMax'] = val.replace(/kg/gi, '').trim();
                if (cleanHeader === 'reps' || cleanHeader === 'ripetizioni') obj['Reps'] = val;
                if (cleanHeader === 'rpe') obj['RPE'] = val;
                if (cleanHeader === 'recupero' || cleanHeader === 'rest') obj['Recupero'] = val;
                if (cleanHeader === 'blocco') obj['Blocco'] = val;
                if (cleanHeader === 'settimana' || cleanHeader === 'week') obj['Settimana'] = val;
                if (cleanHeader === 'giorno' || cleanHeader === 'day') obj['Giorno'] = val;
                if (cleanHeader === 'esercizio' || cleanHeader === 'exercise') obj['Esercizio'] = val;
            });
            newPlan.push(obj);
        }

        if (newPlan.length > 0) {
            newPlan = newPlan.filter(item => {
                const dayNum = parseInt(item.Giorno);
                return !isNaN(dayNum) && dayNum >= 1 && dayNum <= 7; 
            });

            state.workoutPlan = newPlan;
            const planKey = `${STORAGE_KEY_PLAN}_mese_${state.currentMesoNumber}`;
            localStorage.setItem(planKey, JSON.stringify(state.workoutPlan));

            if (state.currentUser && navigator.onLine) {
                try {
                    await supabaseClient
                        .from('workout_data')
                        .upsert({
                            user_id: state.currentUser.id,
                            data_key: planKey,
                            valore: JSON.stringify(state.workoutPlan),
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id,data_key' });
                } catch (err) {
                    console.error("Errore di sincronizzazione piano su Supabase:", err);
                }
            }
            
            document.getElementById('empty-state').style.display = 'none';
            generateDynamicDays();
            renderCurrentView();
            alert(`Scheda importata con successo per il Mesociclo ${state.currentMesoNumber}!`);
        }
    };
    reader.readAsText(file);
}

export function loadWorkoutPlanForCurrentMeso() {
    const planKey = `${STORAGE_KEY_PLAN}_mese_${state.currentMesoNumber}`;
    const savedPlan = localStorage.getItem(planKey);
    
    if (savedPlan) {
        state.workoutPlan = JSON.parse(savedPlan);
        document.getElementById('empty-state').style.display = 'none';
        generateDynamicDays();
    } else {
        state.workoutPlan = [];
        document.getElementById('empty-state').style.display = 'block';
        document.getElementById('dynamic-views-container').innerHTML = '';
        document.getElementById('dynamic-day-tabs').innerHTML = '';
    }
    renderCurrentView();
}

export function exportProgressCSV() {
    const dataToExport = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
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

export function importProgressCSV(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split(/\r\n|\n/);
        let savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
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
        localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(savedData));
        alert(`Progressi importati con successo! (${count} valori caricati)`);
        renderCurrentView();
    };
    reader.readAsText(file);
}

window.resetTotalFactory = async function() {
    if (!navigator.onLine) {
        alert("⚠️ Connessione assente: per eliminare definitivamente i dati anche dal cloud è necessaria una connessione internet attiva.");
        return;
    }
    const conferma1 = confirm("ATTENZIONE: Esegui un backup prima di procedere ad eliminare COMPLETAMENTE tutti i dati, inclusi i mesocicli salvati, i piani di allenamento e lo storico. Vuoi procedere?");
    if (!conferma1) return;

    const conferma2 = confirm("Sei davvero sicuro al 100%? Questa operazione è irreversibile e riporterà l'app allo stato iniziale.");
    if (!conferma2) return;

    if (state.currentUser) {
        try {
            const { error } = await supabaseClient
                .from('workout_data')
                .delete()
                .eq('user_id', state.currentUser.id);
            
            if (error) {
                console.error("Errore durante la pulizia totale su Supabase:", error);
                alert("Attenzione: Il database cloud ha rifiutato la cancellazione. Controlla le policy RLS su Supabase.");
                return;
            }
        } catch (err) {
            console.error("Errore di rete durante la cancellazione totale:", err);
            alert("Errore di connessione: impossibile completare la cancellazione sul cloud.");
            return;
        }
    }

    localStorage.clear();
    alert("Tutti i dati e i mesocicli sono stati eliminati con successo.");
    location.reload();
};

// --- RESET MESOCICLO CORRENTE (PULIZIA TOTALE LOCALE E CLOUD) ---
window.resetCurrentMesocycleData = async function() {
    if (!navigator.onLine) {
        alert("⚠️ Connessione assente: impossibile eliminare il mesociclo senza una connessione internet.");
        return;
    }
    const mesoNum = state.currentMesoNumber;
    const conferma = confirm(`Sei sicuro di voler eliminare la scheda e il mesociclo ${mesoNum}?`);
    if (!conferma) return;

    const planKey = `${STORAGE_KEY_PLAN}_mese_${mesoNum}`;

    // Raccogliamo le chiavi dei log locali da rimuovere (tutto tranne i meta)
    let savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
    let keysToDelete = [];
    Object.keys(savedData).forEach(k => {
        if (!k.startsWith('meta-')) {
            keysToDelete.push(k);
            delete savedData[k];
        }
    });

    if (state.currentUser) {
        try {
            // 1. Elimina il piano specifico del mesociclo
            const { error: errorPlan } = await supabaseClient
                .from('workout_data')
                .delete()
                .eq('user_id', state.currentUser.id)
                .eq('data_key', planKey);

            if (errorPlan) throw errorPlan;

            // 2. Elimina i log degli esercizi associati da Supabase
            if (keysToDelete.length > 0) {
                const { error: errorLogs } = await supabaseClient
                    .from('workout_data')
                    .delete()
                    .eq('user_id', state.currentUser.id)
                    .in('data_key', keysToDelete);

                if (errorLogs) throw errorLogs;
            }
        } catch (err) {
            console.error("Errore durante l'eliminazione su Supabase:", err);
            alert("Errore dal cloud: impossibile eliminare completamento i dati da Supabase.");
            return;
        }
    }

    // Rimozione dal localStorage
    localStorage.removeItem(planKey);
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(savedData));
    state.workoutPlan = [];

    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.style.display = 'block';
    
    const viewsContainer = document.getElementById('dynamic-views-container');
    if (viewsContainer) viewsContainer.innerHTML = '';
    
    const dayTabs = document.getElementById('dynamic-day-tabs');
    if (dayTabs) dayTabs.innerHTML = '';

    if (typeof renderCurrentView === 'function') {
        renderCurrentView();
    }

    alert(`Il Mesociclo ${mesoNum} è stato eliminato e ripulito con successo.`);
};

// --- 1. GESTIONE TOAST DI RETE (IN ALTO) ---
function showNetworkToast(message, type = 'info') {
    let toast = document.getElementById('network-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'network-toast';
        document.body.appendChild(toast);
        
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        toast.style.padding = '12px 20px';
        toast.style.borderRadius = '10px';
        toast.style.color = '#fff';
        toast.style.fontSize = '14px';
        toast.style.fontWeight = '600';
        toast.style.zIndex = '99999';
        toast.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        toast.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
        toast.style.textAlign = 'center';
        toast.style.maxWidth = '90%';
        toast.style.opacity = '0';
    }

    if (type === 'offline') {
        toast.style.backgroundColor = '#d97706';
        toast.innerText = '⚠️ Connessione persa: modifiche salvate in locale';
    } else if (type === 'synced') {
        toast.style.backgroundColor = '#16a34a';
        toast.innerText = '🟢 Connessione ripristinata: dati sincronizzati!';
    } else if (type === 'saving') {
        toast.style.backgroundColor = '#2563eb';
        toast.innerText = '🔄 Sincronizzazione cloud in corso...';
    } else {
        toast.innerText = message;
    }

    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(window._toastTimeout);
    if (type !== 'offline') {
        window._toastTimeout = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(-20px)';
        }, 4000);
    }
}

// --- 2. FUNZIONE DI SUPPORTO PER LA SINCRONIZZAZIONE SILENZIOSA ---
async function silentBackgroundSync() {
    if (!state.currentUser || !navigator.onLine) return;

    try {
        const savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
        for (const [key, value] of Object.entries(savedData)) {
            await supabaseClient
                .from('workout_data')
                .upsert({
                    user_id: state.currentUser.id,
                    data_key: key,
                    valore: String(value),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,data_key' });
        }

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes(STORAGE_KEY_PLAN) || key.includes('_mese_'))) {
                const planVal = localStorage.getItem(key);
                if (planVal) {
                    await supabaseClient
                        .from('workout_data')
                        .upsert({
                            user_id: state.currentUser.id,
                            data_key: key,
                            valore: planVal,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id,data_key' });
                }
            }
        }
    } catch (err) {
        console.error("Errore nella sincronizzazione in background:", err);
    }
}

// --- CONTROLLO DI SESSIONE RESILIENTE PER SAFARI ---
let browserSessionId = localStorage.getItem('app_device_id');
if (!browserSessionId) {
    browserSessionId = 'dev_' + Math.random().toString(36).substring(2) + Date.now();
    localStorage.setItem('app_device_id', browserSessionId);
}

export async function enforceSingleDeviceSession() {
    if (!state.currentUser || !navigator.onLine) return;

    try {
        const { data } = await supabaseClient
            .from('workout_data')
            .select('valore')
            .eq('user_id', state.currentUser.id)
            .eq('data_key', 'active_device_token')
            .maybeSingle();

        // Se c'è un token diverso, invece di sloggarti di forza (causando falsi positivi su Safari),
        // aggiorniamo semplicemente il token per la sessione corrente in modo pacifico.
        if (data && data.valore && data.valore !== browserSessionId) {
            console.notes?.("Rilevato cambio di contesto/dispositivo, aggiornamento token di sessione in corso...");
        }

        await supabaseClient.from('workout_data').upsert({
            user_id: state.currentUser.id,
            data_key: 'active_device_token',
            valore: browserSessionId,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,data_key' });

    } catch (err) {
        console.error("Errore nel controllo di sessione:", err);
    }
}

// --- 4. MONITORAGGIO RETE ---
export function initNetworkMonitor() {
    if (navigator.onLine && state.currentUser) {
        enforceSingleDeviceSession();
    } else if (!navigator.onLine) {
        window.updateSyncStatus('offline');
        showNetworkToast(null, 'offline');
    }

    window.addEventListener('online', async () => {
        window.updateSyncStatus('synced');
        showNetworkToast(null, 'synced');
        if (state.currentUser) {
            window.updateSyncStatus('saving');
            showNetworkToast(null, 'saving');
            await enforceSingleDeviceSession();
            await silentBackgroundSync();
            window.updateSyncStatus('synced');
            showNetworkToast(null, 'synced');
        }
    });

    window.addEventListener('offline', () => {
        window.updateSyncStatus('offline');
        showNetworkToast(null, 'offline');
    });
}