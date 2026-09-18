// mycoatch/autoregulation.js

/**
 * Calcola l'1RM Stimato (e1RM) incorporando il buffer (RIR = 10 - RPE)
 * Formula di Epley modificata per l'Evidence-Based Fitness
 */
export function calculateE1RM(weight, reps, rpe = 10) {
    const numericKg = parseFloat(weight) || 0;
    const numericReps = parseInt(reps, 10) || 0;
    const numericRpe = parseFloat(rpe) || 10;

    if (numericKg <= 0 || numericReps <= 0) return 0;

    // Reps stimate a cedimento reale = reps eseguite + (10 - RPE)
    const effectiveReps = numericReps + Math.max(0, 10 - numericRpe);
    
    // Epley Formula: 1RM = Weight * (1 + 0.0333 * Reps)
    const e1RM = numericKg * (1 + 0.0333 * effectiveReps);
    return Math.round(e1RM * 10) / 10;
}

/**
 * Analisi longitudinale delle prestazioni basata sull'e1RM e sulla varianza RPE
 */
export function analyzeUserHistory(exerciseHistory, currentConfig = {}) {
    // Se la cronologia è vuota o indefinita, esci subito in modalità standard
    if (!exerciseHistory || exerciseHistory.length === 0) {
        return { 
            action: "PROCEED_STANDARD", 
            message: "Nessun dato storico. Inizio del mesociclo con parametri di carico base.",
            suggestedKgIncrement: 0
        };
    }

    const lastSession = exerciseHistory[exerciseHistory.length - 1];
    
    // Recuperiamo i dati adattandoli alla struttura reale della tua WebApp (loggedSets)
    const sets = lastSession.loggedSets || lastSession.sets || [];
    const targetReps = lastSession.reps || lastSession.targetReps || "8-10";
    const targetRpe = parseFloat(String(lastSession.rpeTarget || lastSession.targetRpe || lastSession.rpe || "8").replace('@', '')) || 8;

    // Estraiamo i valori reali dalle serie completate (reps, kg, rpe)
    const repsCompleted = sets.map(s => parseInt(s.reps, 10) || 0).filter(r => r > 0);
    const weightsUsed = sets.map(s => parseFloat(s.weight) || 0).filter(w => w > 0);
    const rpeValues = sets.map(s => parseFloat(String(s.rpe).replace('@', '')) || targetRpe);

    // Prendiamo il carico massimo usato nella sessione precedente, o 0
    const currentKg = weightsUsed.length > 0 ? Math.max(...weightsUsed) : 0;

    // Se l'array delle ripetizioni reali è vuoto, è davvero un esercizio nuovo o senza storico
    if (repsCompleted.length === 0) {
        return {
            action: "PROCEED_STANDARD",
            message: "", // <-- SCRITTA FASTIDIOSA RIMOSSA!
            suggestedKgIncrement: 0
        };
    }
    
    const maxTargetReps = parseInt(targetReps?.toString().split('-')[1], 10) || parseInt(targetReps, 10) || 10;
    const minTargetReps = parseInt(targetReps?.toString().split('-')[0], 10) || parseInt(targetReps, 10) || 8;

    // 1. Calcolo dell'e1RM della sessione corrente
    const avgReps = repsCompleted.reduce((a, b) => a + b, 0) / repsCompleted.length;
    const avgRpe = rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length;
    const currentE1RM = calculateE1RM(currentKg, avgReps, avgRpe);

    // 2. Controllo Overshooting (RPE troppo alto rispetto al target)
    if (avgRpe >= targetRpe + 1.5) {
        const kgReduction = currentKg >= 100 ? 5.0 : 2.5;
        return {
            action: "REDUCE_LOAD",
            suggestedKgIncrement: -kgReduction,
            currentE1RM,
            message: `⚠️ Overshooting rilevato (RPE ${avgRpe} vs Target @${targetRpe}). Riduzione preventiva del carico a ${currentKg - kgReduction}kg per tutelare il recupero.`
        };
    }

    // 3. Saturazione del Target & Progressione
    const allSetsMaxed = repsCompleted.every(r => r >= maxTargetReps);
    if (allSetsMaxed && avgRpe <= targetRpe) {
        let increment = currentConfig.stepKg || 2.5;
        if (currentKg < 12.5) increment = 1.0;
        else if (currentKg >= 100) increment = 2.5;

        return {
            action: "INCREMENT_LOAD",
            suggestedKgIncrement: increment,
            currentE1RM,
            message: `🔥 Target saturato con successo (e1RM: ${currentE1RM}kg). Incremento del carico consigliato di +${increment}kg.`
        };
    }

    // 4. Stallo Rilevato (Reps sotto la soglia minima su più sessioni reali consecutive)
    const isUnderperforming = repsCompleted.every(r => r < minTargetReps);
    if (isUnderperforming && exerciseHistory.length >= 2) {
        const prevSession = exerciseHistory[exerciseHistory.length - 2];
        const prevRepsRaw = Array.isArray(prevSession.actualReps) ? prevSession.actualReps : [prevSession.actualReps];
        const prevReps = prevRepsRaw.map(r => parseInt(r, 10) || 0).filter(r => r > 0);
        
        // Verifichiamo lo stallo solo se anche la penultima sessione aveva dati reali validi
        if (prevReps.length > 0 && prevReps.every(r => r < minTargetReps)) {
            return {
                action: "TRIGGER_DELOAD_OR_VARIATION",
                suggestedKgIncrement: 0,
                currentE1RM,
                message: "🛡️ Stallo prolungato confermato su 2 microcicli. Attivazione scarico locale o rotazione variante biomeccanica."
            };
        }
    }

    return {
        action: "MAINTAIN",
        suggestedKgIncrement: 0,
        currentE1RM,
        message: `✅ Prestazione in linea con il target (e1RM: ${currentE1RM}kg). Mantenimento del carico corrente.`
    };
}

/**
 * Autoregolazione Intra-Sessione in Tempo Reale (Systemic Fatigue & Velocity Loss)
 */
export function evaluateRealTimePerformance(exerciseLog = [], dailyReadiness = { sleepHours: 8, stressLevel: 5 }) {
    if (!exerciseLog || exerciseLog.length < 2) {
        return { action: "PROCEED", adjustmentKg: 0, cutSet: false };
    }

    const lastSet = exerciseLog[exerciseLog.length - 1];
    const prevSet = exerciseLog[exerciseLog.length - 2];

    const lastReps = parseInt(lastSet.reps || lastSet.actualReps, 10) || 0;
    const prevReps = parseInt(prevSet.reps || prevSet.actualReps, 10) || 0;
    
    // Se i set non sono stati ancora compilati, non fare nessuna correzione live
    if (lastReps === 0 || prevReps === 0) {
        return { action: "PROCEED", adjustmentKg: 0, cutSet: false };
    }

    const repDrop = prevReps - lastReps;

    // Fatica sistemica alta (Sonno critico o crollo verticale di reps)
    const isCriticalReadiness = dailyReadiness.sleepHours <= 4 || dailyReadiness.stressLevel >= 8;

    if (repDrop >= 3 || (repDrop >= 2 && isCriticalReadiness)) {
        return {
            action: "CUT_VOLUME_OR_LOAD",
            adjustmentKg: -2.5,
            cutSet: true,
            message: "⚡ Crollo di prestazione rilevato inter-set (>20% drop). Consiglio: ferma l'esercizio o riduci il carico del 10% per evitare volume spazzatura."
        };
    }

    return {
        action: "PROCEED",
        adjustmentKg: 0,
        cutSet: false,
        message: "✅ Tasso di affaticamento ottimale. Procedi con la serie successiva."
    };
}
