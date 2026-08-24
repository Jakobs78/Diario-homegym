// Gestione LocalStorage, Supabase, Import/ Export CSV, ecc.
import { supabaseClient, STORAGE_KEY_DATA, STORAGE_KEY_PLAN } from './config.js';
import { state } from './state.js';
import { renderCurrentView, generateDynamicDays } from './ui.js';

export async function loadUserDataFromSupabase() {
    if (!state.currentUser) return;
    try {
        const { data, error } = await supabaseClient
            .from('workout_data')
            .select('data_key, valore')
            .eq('user_id', state.currentUser.id);

        if (error) {
            console.error("Errore nel caricamento Supabase:", error);
            return;
        }

        if (data && data.length > 0) {
            let savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
            
            data.forEach(row => {
                let val = row.valore;
                if (val === 'true') val = true;
                if (val === 'false') val = false;

                // Se la chiave appartiene a un piano di allenamento (contiene STORAGE_KEY_PLAN o _mese_)
                if (row.data_key.includes(STORAGE_KEY_PLAN) || row.data_key.includes('_mese_')) {
                    // La salviamo direttamente come chiave dedicata nel localStorage
                    localStorage.setItem(row.data_key, val);
                } else {
                    // Altrimenti è un dato di progresso normale
                    savedData[row.data_key] = val;
                }
            });
            
            localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(savedData));
        }
    } catch (err) {
        console.error("Errore di rete:", err);
    }
}

export function saveMetaToStorage() {
    let savedData = JSON.parse(localStorage.getItem(STORAGE_KEY_DATA)) || {};
    savedData['meta-date'] = document.querySelector('[data-id="meta-date"]').value;
    savedData['meta-meso-num'] = state.currentMesoNumber;
    savedData['meta-week'] = document.getElementById('week-selector').value;
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(savedData));
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
        clearTimeout(state.supabaseDebounceTimer);
        state.supabaseDebounceTimer = setTimeout(async () => {
            try {
                await supabaseClient
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

// Quando importi il piano, lo salvi legato al mesociclo corrente
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
        // Se il nome NON contiene il mese, controlliamo se esiste già una scheda per il mesociclo attuale
        const currentPlanKey = `${STORAGE_KEY_PLAN}_mese_${state.currentMesoNumber}`;
        const existingPlan = localStorage.getItem(currentPlanKey);
        if (existingPlan) {
            // Esiste già una scheda per questo mesociclo: chiediamo cosa fare
            const nextMeso = state.currentMesoNumber + 1;
            const scelta = confirm(
                `Esiste già una scheda salvata per il Mesociclo ${state.currentMesoNumber}.\n\n` +
                `Vuoi passare al Mesociclo successivo (${nextMeso}) caricando qui la nuova scheda?\n` +
                `(Clicca 'Annulla' se vuoi invece sovrascrivere quella attuale del Mesociclo ${state.currentMesoNumber})`
            );

        if (scelta) {
                // L'utente vuole avanzare di mesociclo
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
            state.workoutPlan = newPlan;
            // Salviamo il piano specifico per questo mesociclo
            const planKey = `${STORAGE_KEY_PLAN}_mese_${state.currentMesoNumber}`;
            localStorage.setItem(planKey, JSON.stringify(state.workoutPlan));
            // Sincronizziamo anche con Supabase se l'utente è loggato
            if (state.currentUser) {
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

// Funzione per caricare il piano del mesociclo attivo (da richiamare quando cambi mese o all'avvio)
export function loadWorkoutPlanForCurrentMeso() {
    const planKey = `${STORAGE_KEY_PLAN}_mese_${state.currentMesoNumber}`;
    const savedPlan = localStorage.getItem(planKey);
    
    if (savedPlan) {
        state.workoutPlan = JSON.parse(savedPlan);
        document.getElementById('empty-state').style.display = 'none';
        generateDynamicDays();
    } else {
        // Se per quel mesociclo non esiste una scheda caricata, puliamo il piano corrente o mostriamo lo stato vuoto
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

export async function resetDiaryData() {
    const primaConferma = confirm("Sei sicuro di voler azzerare tutti i progressi e le spunte registrate?");
    if (primaConferma) {
        const secondaConferma = confirm("ATTENZIONE: Questa azione è irreversibile e cancellerà definitivamente l'intero mesociclo. Vuoi davvero procedere?");
        if (secondaConferma) {
            localStorage.removeItem(STORAGE_KEY_DATA);
            if (state.currentUser) {
                try {
                    const { error } = await supabaseClient
                        .from('workout_data')
                        .delete()
                        .eq('user_id', state.currentUser.id);
                    
                    if (error) {
                        console.error("Errore durante la pulizia su Supabase:", error);
                    }
                } catch (err) {
                    console.error("Errore di rete:", err);
                }
            }
            location.reload();
        }
    }
}
window.resetTotalFactory = async function() {
    const conferma1 = confirm("ATTENZIONE: Esegui un backup prima di procedere ad eliminare COMPLETAMENTE tutti i dati, inclusi i mesocicli salvati, i piani di allenamento e lo storico. Vuoi procedere?");
    if (!conferma1) return;

    const conferma2 = confirm("Sei davvero sicuro al 100%? Questa operazione è irreversibile e riporterà l'app allo stato iniziale.");
    if (!conferma2) return;

    // 1. Cancella tutto il localStorage del browser
    localStorage.clear();

    // 2. CANCELLA TUTTO ANCHE DA SUPABASE (per evitare che i dati vengano riscaricati al login)
    if (state.currentUser) {
        try {
            const { error } = await supabaseClient
                .from('workout_data')
                .delete()
                .eq('user_id', state.currentUser.id);
            
            if (error) {
                console.error("Errore durante la pulizia totale su Supabase:", error);
            }
        } catch (err) {
            console.error("Errore di rete durante la cancellazione totale:", err);
        }
    }

    alert("Tutti i dati e i mesocicli sono stati eliminati con successo.");
    
    // Ricarica la pagina per ripulire lo stato in memoria
    location.reload();
};
// Funzione per azzerare i dati del mesociclo corrente e sincronizzare l'eliminazione su Supabase
window.resetCurrentMesocycleData = async function() {
    const mesoNum = state.currentMesoNumber;
    const conferma = confirm(`Sei sicuro di voler eliminare la scheda e il mesociclo ${mesoNum}?`);
    if (!conferma) return;

    const planKey = `${STORAGE_KEY_PLAN}_mese_${mesoNum}`;

    // 1. Rimuove la scheda specifica del mesociclo corrente dal localStorage
    localStorage.removeItem(planKey);

    // 2. ELIMINA ANCHE DA SUPABASE (così l'eliminazione si riflette sugli altri device)
    if (state.currentUser) {
        try {
            const { error } = await supabaseClient
                .from('workout_data')
                .delete()
                .eq('user_id', state.currentUser.id)
                .eq('data_key', planKey);

            if (error) {
                console.error("Errore durante l'eliminazione del piano su Supabase:", error);
            }
        } catch (err) {
            console.error("Errore di rete durante la cancellazione:", err);
        }
    }

    // 3. Pulisce lo stato in memoria del piano corrente
    state.workoutPlan = [];

    // 4. Mostra lo stato vuoto e ripulisce le viste a schermo
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.style.display = 'block';
    
    const viewsContainer = document.getElementById('dynamic-views-container');
    if (viewsContainer) viewsContainer.innerHTML = '';
    
    const dayTabs = document.getElementById('dynamic-day-tabs');
    if (dayTabs) dayTabs.innerHTML = '';

    if (typeof renderCurrentView === 'function') {
        renderCurrentView();
    }

    alert(`Il Mesociclo ${mesoNum} è stato eliminato e sincronizzato con successo.`);
};