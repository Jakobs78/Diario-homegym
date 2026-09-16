// ==========================================
// mycoatch-adapter.js - Generazione & Export CSV
// ==========================================
import { MyCoatch, downloadMesocycleCSV } from './index.js';
import { getFromLocalStorage } from '../js/storage.js';

/**
 * Avvia la chat guidata con l'utente e genera il CSV personalizzato.
 */
export function startCoachChatAndGenerate() {
    // Step 1: Età
    const ageInput = prompt(
        "🧠 MyCoatch - Passaggio 1/3\n\nQuanti anni hai?\n(Serve per calcolare la capacità di recupero neurale)"
    );
    if (ageInput === null) return; // Utente ha annullato
    const age = parseInt(ageInput, 10) || 30;

    // Step 2: Sessioni settimanali
    const daysInput = prompt(
        "🧠 MyCoatch - Passaggio 2/3\n\nQuante sessioni vuoi fare a settimana?\n(Inserisci un numero da 2 a 5)"
    );
    if (daysInput === null) return;
    const daysPerWeek = parseInt(daysInput, 10) || 3;

    // Step 3: Durata allenamento
    const durationInput = prompt(
        "🧠 MyCoatch - Passaggio 3/3\n\nQuanto tempo hai per ogni allenamento?\nScegli tra: 45, 50, 60 o 90 minuti."
    );
    if (durationInput === null) return;
    const maxSessionMinutes = parseInt(durationInput, 10) || 60;

    // Consegna dati a MyCoatch
    const goalSettings = {
        age: age,
        daysPerWeek: daysPerWeek,
        maxSessionMinutes: maxSessionMinutes,
        focus: 'hybrid',
        stepKg: 2.5
    };

    generateAndDownloadCoachCSV(goalSettings);
}
/**
 * Legge lo storico dell'utente, genera il mesociclo ottimizzato 
 * ed avvia il download del file CSV pronto per essere controllato o importato.
 */
export function generateAndDownloadCoachCSV(goalSettings = {}) {
    try {
        // 1. Recupera lo storico reale con fallback a oggetto vuoto
        const currentData = getFromLocalStorage() || {};

        console.log("🧠 MyCoatch: Analisi dello storico in corso per la generazione della scheda...");

        // 2. Calcola le progressioni, gestisce gli stalli e crea il mesociclo in memoria
        MyCoatch.generateNextFromHistory(currentData, goalSettings);

        // 3. Scarica direttamente il CSV formattato
        const result = downloadMesocycleCSV();

        if (result && result.success) {
            console.log("✅ MyCoatch: File CSV generato e scaricato correttamente.");
        } else {
            const msg = result?.message || "Errore durante la creazione del CSV";
            alert("⚠️ " + msg);
        }

        return result;
    } catch (error) {
        console.error("❌ Errore in MyCoatch Adapter:", error);
        alert("Impossibile generare la scheda: " + error.message);
        return { success: false, error: error.message };
    }
}