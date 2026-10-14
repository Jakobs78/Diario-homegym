// mycoatch/mycoatch-adapter.js
import { MyCoatch, downloadMesocycleCSV } from './index.js';
import { CONFIG } from '../js/config.js'; // 🚀 AGGANCIO COMPATIBILITÀ: Importiamo la costante di configurazione della WebApp

/**
 * Adapter per l'estrazione dello storico e la generazione diretta del CSV.
 */
export async function generateAndDownloadMesocycleCSV(options = {}) {
    try {
        // La durata è un dato obbligatorio, mai un default silenzioso.
        const minutes = Number(options.maxSessionMinutes);
        if (!Number.isInteger(minutes) || minutes < 25 || minutes > 180) {
            throw new Error('Prima di generare la scheda, scegli quanto tempo hai per ogni allenamento.');
        }
        // 🛠️ RISOLTO: Utilizziamo la chiave di memoria esatta dichiarata in storage.js della WebApp
        const storageKey = CONFIG.STORAGE_KEY;
        let userHistory = null;
        const rawLocalData = localStorage.getItem(storageKey);

        const supabaseClient = window.supabaseClient || 
            (window.supabase && typeof window.supabase.from === 'function' ? window.supabase : null);

        if (rawLocalData) {
            userHistory = JSON.parse(rawLocalData);
        } else if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('workouts') // Allineato al nome tabella reale registrato in sync.js
                .select('payload')
                .single();
            
            if (!error && data) {
                userHistory = data.payload;
            }
        }

        // 🛡️ ASSICURIAMO CHE L'OGGETTO ESISTA
        if (!userHistory) {
            userHistory = {};
        }

        // 🧠 AGGANCIO lastWorkoutDate: Estraggiamo il timestamp dell'ultimo allenamento registrato nello storico
        // Cerchiamo nell'albero dei mesocicli o nei log salvati della webapp
        try {
            const historyObj = userHistory?.history || userHistory || {};
            const yearsObj = historyObj.years || {};
            const years = Object.keys(yearsObj);
            
            if (years.length > 0) {
                const currentYear = years[years.length - 1];
                const mesocycles = yearsObj[currentYear]?.mesocycles || [];
                const lastMeso = mesocycles[mesocycles.length - 1];
                
                if (lastMeso && lastMeso.weeks) {
                    // Cerca a ritroso l'ultima data o timestamp disponibile nelle settimane/giorni
                    for (let w = lastMeso.weeks.length - 1; w >= 0; w--) {
                        const days = lastMeso.weeks[w].days || [];
                        for (let d = days.length - 1; d >= 0; d--) {
                            const day = days[d];
                            // Se il giorno ha un timestamp o una data di completamento
                            if (day.date || day.timestamp) {
                                userHistory.lastWorkoutDate = day.date || day.timestamp;
                                break;
                            }
                        }
                        if (userHistory.lastWorkoutDate) break;
                    }
                }
            }

            // Fallback: se la struttura dati usa una chiave diretta o un array di sessioni recenti
            if (!userHistory.lastWorkoutDate && Array.isArray(userHistory.sessions) && userHistory.sessions.length > 0) {
                const lastSession = userHistory.sessions[userHistory.sessions.length - 1];
                userHistory.lastWorkoutDate = lastSession.date || lastSession.timestamp;
            }
        } catch (e) {
            console.warn("Impossibile estrarre automaticamente la lastWorkoutDate, procedo senza data di stop.", e);
        }

        // 2. Generazione del mesociclo tramite l'engine adattivo
        const newMesocycle = MyCoatch.generateNextFromHistory(userHistory, options);

        if (!newMesocycle) {
            throw new Error("Impossibile generare il mesociclo. Verificare i dati di input.");
        }

        // 3. Generazione e download del file CSV sul device
        const result = downloadMesocycleCSV();

        if (!result.success) {
            throw new Error(result.message);
        }

        return {
            success: true,
            message: "Mesociclo generato con successo e calibrato sui tuoi parametri! Il file CSV è stato scaricato.",
            mesocycleId: newMesocycle.id
        };

    } catch (error) {
        console.error("Errore durante la generazione CSV con MyCoatch:", error);
        return {
            success: false,
            message: `Errore durante la creazione del CSV: ${error.message}`
        };
    }
}

/**
 * Apre la configurazione MyCoatch. La scelta del tempo e' obbligatoria a ogni generazione.
 * Il submit convalida i dati in js/main.js prima di chiamare l'adapter.
 */
export function startCoachChatAndGenerate() {
    const modal = document.getElementById('mycoatch-config-modal');
    if (!modal) {
        alert('Configurazione MyCoatch non disponibile. Ricarica la pagina.');
        return;
    }

    // Non riutilizzare automaticamente una durata precedente.
    const time = document.getElementById('select-time');
    if (time) time.value = '';
    const custom = document.getElementById('mycoatch-custom-time');
    if (custom) {
        custom.value = '';
        custom.disabled = true;
        custom.required = false;
    }
    document.getElementById('mycoatch-custom-time-wrap')?.classList.add('hidden');
    const feedback = document.getElementById('mycoatch-form-feedback');
    if (feedback) feedback.textContent = '';

    modal.classList.remove('hidden');
    time?.focus();
}
