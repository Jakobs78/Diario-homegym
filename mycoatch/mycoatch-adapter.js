// mycoatch/mycoatch-adapter.js
import { MyCoatch, downloadMesocycleCSV } from './index.js';
import { CONFIG } from '../js/config.js'; // 🚀 AGGANCIO COMPATIBILITÀ: Importiamo la costante di configurazione della WebApp

/**
 * Adapter per l'estrazione dello storico e la generazione diretta del CSV.
 */
export async function generateAndDownloadMesocycleCSV(options = {}) {
    try {
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
 * Entry point: Intervista l'utente step-by-step sui parametri fisiologici e logistici.
 */
export async function startCoachChatAndGenerate() {
    const ageInput = document.getElementById('input-age');
    const daysInput = document.getElementById('select-days');
    const timeInput = document.getElementById('select-time');
    const focusInput = document.getElementById('select-focus');

    let userAge, daysPerWeek, maxSessionMinutes, focus, primaryGoal;

    if (!ageInput || !daysInput || !timeInput || !focusInput) {
        const rawAge = prompt("🤖 MyCoatch: Inserisci la tua età (fondamentale per calcolare il recupero sistemico e la tolleranza al volume):", "30");
        if (rawAge === null) return; 
        userAge = parseInt(rawAge, 10) || 30;

        const rawDays = prompt("🤖 MyCoatch: Quanti giorni a settimana vuoi allenarti? (es. 3, 4, 5):", "3");
        if (rawDays === null) return;
        daysPerWeek = parseInt(rawDays, 10) || 3;

        const rawTime = prompt("🤖 MyCoatch: Quanti minuti massimi hai a disposizione per ogni sessione? (es. 45, 60, 75, 90):", "60");
        if (rawTime === null) return;
        maxSessionMinutes = parseInt(rawTime, 10) || 60;

        const rawGoal = prompt(
            "🤖 MyCoatch: Qual è il tuo obiettivo primario?\n" +
            "1 = Bodybuilding (Massima Massa Muscolare)\n" +
            "2 = Powerbuilding (Estetica & Forza)\n" +
            "3 = Powerlifting (Prestazione di Forza SBD)", 
            "1"
        );
        if (rawGoal === null) return;

        primaryGoal = "bodybuilding";
        if (rawGoal === "2") primaryGoal = "powerbuilding";
        if (rawGoal === "3") primaryGoal = "powerlifting";

        focus = (primaryGoal === "powerlifting") ? "strength" : "hybrid";
    } else {
        userAge = parseInt(ageInput.value, 10) || 30;
        daysPerWeek = parseInt(daysInput.value, 10) || 3;
        maxSessionMinutes = parseInt(timeInput.value, 10) || 60;
        focus = focusInput.value || 'hybrid';
        primaryGoal = 'bodybuilding';
    }

    const userGoalSettings = {
        userAge,
        daysPerWeek,
        maxSessionMinutes,
        focus,
        primaryGoal
    };

    const response = await generateAndDownloadMesocycleCSV(userGoalSettings);

    if (response.success) {
        alert(response.message);
    } else {
        alert(`Attenzione: ${response.message}`);
    }
}
