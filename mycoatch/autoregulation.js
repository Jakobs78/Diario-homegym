// mycoatch/autoregulation.js

/**
 * Analisi avanzata dello storico basata su performance reale (carico effettivo e reps)
 */
export function analyzeUserHistory(exerciseHistory, currentConfig) {
    if (!exerciseHistory || exerciseHistory.length === 0) {
        return { action: "PROCEED_STANDARD", message: "Nessuno storico recente. Applicazione parametri standard." };
    }

    const lastSession = exerciseHistory[exerciseHistory.length - 1];
    const { targetReps, actualReps, actualKg, rpe } = lastSession;

    const maxTargetReps = parseInt(targetReps.split('-')[1]) || parseInt(targetReps) || 10;
    const minTargetReps = parseInt(targetReps.split('-')[0]) || parseInt(targetReps) || 8;

    const allSetsCompletedMax = actualReps.every(reps => reps >= maxTargetReps);
    const rpeAcceptable = rpe.every(val => val <= 9);

    if (allSetsCompletedMax && rpeAcceptable) {
        // Se siamo sotto i 12.5 kg applichiamo uno step calibrato, altrimenti usiamo la configurazione o il default
        let suggestedIncrement = currentConfig.stepKg || 2.5;
        if (actualKg < 12.5) {
            suggestedIncrement = 1.0; // Incremento fluido per manubri componibili
        } else if (actualKg >= 100) {
            suggestedIncrement = 2.5;
        }

        return {
            action: "INCREMENT_LOAD",
            suggestedKgIncrement: suggestedIncrement,
            message: `Target di ripetizioni saturato a ${actualKg}kg. Incremento scientifico del carico consigliato.`
        };
    }

    const isStalled = actualReps.every(reps => reps < minTargetReps);
    const highFatigue = rpe.some(val => val >= 10);

    if (isStalled && exerciseHistory.length >= 2) {
        const prevSession = exerciseHistory[exerciseHistory.length - 2];
        const prevStalled = prevSession.actualReps.every(reps => reps < minTargetReps);

        if (prevStalled || highFatigue) {
            return {
                action: "TRIGGER_DELOAD_OR_VARIATION",
                message: "Stallo reiterato o fatica sistemica elevata rilevata sul carico corrente. Attivazione scarico locale o rotazione variante."
            };
        }
    }

    return {
        action: "MAINTAIN",
        message: `Mantenimento del carico a ${actualKg}kg in corso. Consolidamento del volume corrente.`
    };
}

/**
 * Valutazione in tempo reale della fatica e del crollo della performance durante la seduta (VBT indiretto)
 */
export function evaluateRealTimePerformance(exerciseLog, dailyReadiness = { sleep: 8, stress: 5 }) {
    if (!exerciseLog || exerciseLog.length < 2) return { action: "proceed", adjustmentKg: 0 };

    const lastSet = exerciseLog[exerciseLog.length - 1];
    const prevSet = exerciseLog[exerciseLog.length - 2];

    const performanceDrop = prevSet.reps - lastSet.reps;
    
    if (performanceDrop >= 3 || dailyReadiness.sleep <= 4) {
        return {
            action: "reduce_volume_or_load",
            adjustmentKg: -2.5,
            message: "⚠️ MyCoatch rileva fatica accumulata o calo repentino della performance: riduciamo il carico o tagliamo un set per preservare il sistema nervoso."
        };
    }

    return {
        action: "proceed",
        adjustmentKg: 0,
        message: "✅ Performance stabile. Procedi con il sovraccarico pianificato."
    };
}