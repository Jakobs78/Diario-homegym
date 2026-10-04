/**
 * Module: mycoatch/autoregulation.js
 * Summary: Gestisce l'autoregolazione intelligente dell'allenamento.
 * Analizza ogni singola serie e l'e1RM reale ponderato su RPE, suggerendo incrementi
 * proporzionali al carico base (microcarichi) o rilevando overshooting e stalli reali.
 */

/**
 * Calcola l'e1RM (1RM stimato) basandosi su peso, reps ed RPE.
 */
export function calculateE1RM(weight, reps, rpe = 8) {
    const w = parseFloat(weight) || 0;
    const r = parseInt(reps, 10) || 0;
    const rpeVal = parseFloat(rpe) || 8;

    if (w <= 0 || r <= 0) return 0;

    const rir = Math.max(0, 10 - rpeVal);
    const estimatedMaxReps = r + rir;

    const e1rm = w * (1 + estimatedMaxReps / 30);
    return Math.round(e1rm * 10) / 10;
}

/**
 * Sanifica qualsiasi valore RPE (es. "@6,5", "7.0", " 8 ") restituendo un numero valido.
 */
export function cleanRpeValue(rawRpe, fallback = 8) {
    if (rawRpe === null || rawRpe === undefined) return fallback;
    const str = String(rawRpe).replace('@', '').replace(',', '.').trim();
    const parsed = parseFloat(str);
    return isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

/**
 * Calcola l'incremento di peso ideale basato sulla fisiologia e sul peso attuale.
 */
export function calculateSmartIncrement(currentKg, isIsolation = false) {
    if (currentKg <= 0) return 1.0;

    if (currentKg <= 12.0 || isIsolation) {
        if (currentKg < 6.0) return 0.5;
        if (currentKg <= 12.0) return 1.0;
        return 1.25;
    }

    if (currentKg <= 50.0) return 2.5;
    return currentKg >= 100.0 ? 5.0 : 2.5;
}

/**
 * Analizza lo storico dell'esercizio e decide il feedback / progressione per l'utente.
 */
export function analyzeUserHistory(exerciseHistory) {
    if (!exerciseHistory || exerciseHistory.length === 0) {
        return null;
    }

    const lastSession = exerciseHistory[exerciseHistory.length - 1];
    const sets = lastSession.loggedSets || lastSession.sets || [];
    
    const confirmedSets = sets.filter(s => (s.isLocked || s.completed) && s.reps && parseInt(s.reps, 10) > 0);
    if (confirmedSets.length === 0) return null;

    const repsCompleted = confirmedSets.map(s => parseInt(s.reps, 10) || 0);
    const weightsUsed = confirmedSets.map(s => parseFloat(String(s.weight || '0').replace(',', '.')) || 0);
    const rpeValues = confirmedSets.map(s => cleanRpeValue(s.rpe, 8));

    const currentKg = Math.max(...weightsUsed);
    if (currentKg === 0) return null;

    const targetRepsStr = String(lastSession.targetReps || lastSession.reps || "8").trim();
    let minTargetReps = 8, maxTargetReps = 10;

    if (targetRepsStr.includes('-')) {
        const parts = targetRepsStr.split('-');
        minTargetReps = parseInt(parts[0], 10) || 8;
        maxTargetReps = parseInt(parts[1], 10) || 10;
    } else {
        minTargetReps = parseInt(targetRepsStr, 10) || 8;
        maxTargetReps = minTargetReps;
    }

    const targetRpe = cleanRpeValue(lastSession.targetRpe || lastSession.rpe || "8", 8);

    const avgReps = repsCompleted.reduce((a, b) => a + b, 0) / repsCompleted.length;
    const avgRpe = rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length;
    const currentE1RM = calculateE1RM(currentKg, avgReps, avgRpe);
    const isIsolation = Boolean(lastSession.isIsolation || currentKg <= 12);

    const baseMetaData = {
        currentKg,
        minTargetReps,
        maxTargetReps,
        avgReps,
        avgRpe,
        targetRpe,
        isIsolation,
        currentE1RM
    };

    if (avgRpe >= targetRpe + 1.5) {
        const kgReduction = currentKg >= 100 ? 5.0 : (currentKg <= 12 ? 1.0 : 2.5);
        return {
            ...baseMetaData,
            action: "REDUCE_LOAD",
            suggestedKgIncrement: -kgReduction,
            message: `⚠️ **Overshooting:** RPE medio elevato (@${avgRpe.toFixed(1)} vs Target @${targetRpe}). Per evitare accumulo di fatica, considera di ridurre a **${currentKg - kgReduction}kg**.`
        };
    }

    const allSetsMaxed = repsCompleted.every(r => r >= maxTargetReps);
    if (allSetsMaxed && avgRpe <= targetRpe) {
        const step = calculateSmartIncrement(currentKg, isIsolation);
        const nextTargetKg = currentKg + step;

        return {
            ...baseMetaData,
            action: "INCREMENT_LOAD",
            suggestedKgIncrement: step,
            nextTargetKg,
            message: `🔥 **MyCoach Progression:** Target chiuso con ottima riserva! (e1RM: ${currentE1RM}kg). Per la prossima sessione ti consiglio di salire a **${nextTargetKg}kg** (+${step}kg).`
        };
    }

    if (exerciseHistory.length >= 2) {
        const prevSession = exerciseHistory[exerciseHistory.length - 2];
        const prevSets = (prevSession.loggedSets || prevSession.sets || []).filter(s => (s.isLocked || s.completed) && s.reps);
        
        if (prevSets.length > 0) {
            const prevKg = Math.max(...prevSets.map(s => parseFloat(String(s.weight || '0').replace(',', '.')) || 0));
            const prevRepsArr = prevSets.map(s => parseInt(s.reps, 10) || 0);
            const prevRpeArr = prevSets.map(s => cleanRpeValue(s.rpe, 8));

            const prevAvgReps = prevRepsArr.reduce((a, b) => a + b, 0) / prevRepsArr.length;
            const prevAvgRpe = prevRpeArr.reduce((a, b) => a + b, 0) / prevRpeArr.length;
            const prevE1RM = calculateE1RM(prevKg, prevAvgReps, prevAvgRpe);

            if (currentE1RM > prevE1RM) {
                return {
                    ...baseMetaData,
                    action: "PROGRESSING",
                    message: `💪 **Miglioramento Rilevato:** Prestazione e1RM salita a ${currentE1RM}kg (vs ${prevE1RM}kg precedente).`
                };
            }

            if (currentE1RM < prevE1RM * 0.98 && repsCompleted.every(r => r < minTargetReps)) {
                return {
                    ...baseMetaData,
                    action: "TRIGGER_DELOAD_OR_VARIATION",
                    suggestedKgIncrement: 0,
                    message: `🛡 **MyCoach Stallo:** Calo di prestazione confermato su 2 microcicli. Si consiglia un taglio del 10% del carico nella prossima sessione.`
                };
            }
        }
    }

    return {
        ...baseMetaData,
        action: "MAINTAIN",
        message: null
    };
}

/**
 * Genera il promemoria specifico per la sessione successiva in base al focus.
 */
export function generateNextSessionReminder(lastAnalysis) {
    if (!lastAnalysis) return null;

    const { currentKg, maxTargetReps, minTargetReps, avgReps, avgRpe, targetRpe, isIsolation } = lastAnalysis;
    const isStrengthFocus = maxTargetReps <= 6;

    if (lastAnalysis.action === "INCREMENT_LOAD") {
        const step = calculateSmartIncrement(currentKg, isIsolation);
        const nextKg = currentKg + step;

        if (isStrengthFocus) {
            return {
                type: "STRENGTH_INCREASE",
                badge: `🏋️ Forza: Sali a ${nextKg}kg`,
                prompt: `🎯 **Target Forza Sbloccato:** Nella scorsa sessione hai gestito ${currentKg}kg x ${avgReps.toFixed(1)} @${avgRpe.toFixed(1)}. Oggi carica **${nextKg}kg** (+${step}kg) mantenendo ${minTargetReps}-${maxTargetReps} reps.`
            };
        } else {
            return {
                type: "HYPERTROPHY_LOAD_STEP",
                badge: `🔥 Ipertrofia: ${nextKg}kg (Reps reset)`,
                prompt: `🔥 **Progressione Doppia:** Hai saturato il range di reps col peso precedente. Oggi sali a **${nextKg}kg** e punta a chiudere il limite minimo (${minTargetReps} reps).`
            };
        }
    }

    if (!isStrengthFocus && avgReps < maxTargetReps && avgRpe <= targetRpe) {
        return {
            type: "HYPERTROPHY_REP_STEP",
            badge: `📈 Ipertrofia: Mantieni ${currentKg}kg, cerca +1/+2 reps`,
            prompt: `📈 **Target Reps:** Carico confermato a **${currentKg}kg**. L'obiettivo di oggi è spingere ogni serie verso **${maxTargetReps} reps** mantenendo RPE @${targetRpe}.`
        };
    }

    if (lastAnalysis.action === "REDUCE_LOAD") {
        const kgReduction = currentKg >= 100 ? 5.0 : (currentKg <= 12 ? 1.0 : 2.5);
        const suggestedKg = currentKg - kgReduction;
        return {
            type: "DELOAD_ADJUSTMENT",
            badge: `⚠ Gestione Fatica: Consiglio ${suggestedKg}kg`,
            prompt: `🛡 **Gestione Fatica:** Nella sessione precedente l'RPE è stato troppo elevato. Oggi si consiglia di usare **${suggestedKg}kg** per garantire qualità tecnica ed evitare sovraccarico.`
        };
    }

    return null;
}

/**
 * Valuta le prestazioni in TEMPO REALE per la singola serie compilata, 
 * confrontandola direttamente con i target prescritti nella scheda
 * e calcolando il carico suggerito per la serie successiva.
 */
export function evaluateRealTimePerformance(setObj, targetReps = "8-10", targetRpe = 8) {
    if (!setObj || (!setObj.weight && !setObj.reps)) return null;

    const weight = parseFloat(String(setObj.weight || '0').replace(',', '.')) || 0;
    const reps = parseInt(setObj.reps, 10) || 0;
    const rpe = cleanRpeValue(setObj.rpe, 8);

    if (weight <= 0 || reps <= 0) return null;

    // Parsing dinamico del range di ripetizioni target (es. "8-10" o "6")
    const repsTargetStr = String(targetReps || "8").trim();
    let minReps, maxReps;

    if (repsTargetStr.includes('-')) {
        const parts = repsTargetStr.split('-');
        minReps = parseInt(parts[0], 10) || 8;
        maxReps = parseInt(parts[1], 10) || 10;
    } else {
        const parsedSingle = parseInt(repsTargetStr, 10) || 8;
        minReps = parsedSingle;
        maxReps = parsedSingle;
    }

    const expectedRpe = cleanRpeValue(targetRpe, 8);
    
    // Calcolo e1RM della serie appena eseguita
    const e1rm = calculateE1RM(weight, reps, rpe);

    // Calcolo del carico ideale per la prossima serie (Reverse Epley)
    // Usiamo maxReps come target ideale di ripetizioni da raggiungere
    const targetRir = Math.max(0, 10 - expectedRpe);
    const expectedMaxReps = maxReps + targetRir;
    let idealNextWeight = e1rm / (1 + expectedMaxReps / 30);
    
    // Arrotondamento ai 2.5kg più vicini (o 1.25kg per carichi bassi)
    if (idealNextWeight < 15) {
        idealNextWeight = Math.round(idealNextWeight / 1.25) * 1.25;
    } else {
        idealNextWeight = Math.round(idealNextWeight / 2.5) * 2.5;
    }

    // Analisi prestazione serie per serie da Coach
    let status = "PERFECT"; 
    let feedbackNote = "Serie perfettamente in target!";
    let suggestedWeight = weight; // Di base mantiene il peso

    if (rpe > expectedRpe + 1.0) {
        status = "OVERSHOOT_RPE";
        suggestedWeight = idealNextWeight < weight ? idealNextWeight : weight - 2.5;
        feedbackNote = `⚠️ **Overshooting:** RPE @${rpe} troppo alto (Target @${expectedRpe}). Per la prossima serie scala a **${suggestedWeight}kg**.`;
    } else if (reps < minReps) {
        status = "UNDER_REPS";
        suggestedWeight = idealNextWeight < weight ? idealNextWeight : weight - 2.5;
        feedbackNote = `🔻 **Sotto Target:** Fatte ${reps} reps (minimo ${minReps}). Calo consigliato: usa **${suggestedWeight}kg** alla prossima.`;
    } else if (reps > maxReps && rpe <= expectedRpe) {
        status = "OVER_REPS";
        suggestedWeight = idealNextWeight > weight ? idealNextWeight : weight + 2.5;
        feedbackNote = `🔥 **Superato Target:** Chiuse ${reps} reps con RPE @${rpe}. Ottimo margine, sali a **${suggestedWeight}kg**.`;
    } else if (reps >= minReps && rpe <= expectedRpe - 1.5) {
        status = "UNDERSHOOT_RPE";
        suggestedWeight = idealNextWeight > weight ? idealNextWeight : weight + 2.5;
        feedbackNote = `💪 **Carico Leggero:** RPE @${rpe} basso (Target @${expectedRpe}). C'è margine, prova con **${suggestedWeight}kg**.`;
    }

    return {
        weight,
        reps,
        rpe,
        e1rm,
        status,
        feedbackNote,
        suggestedNextWeight: suggestedWeight,
        isTargetMet: reps >= minReps && reps <= maxReps && Math.abs(rpe - expectedRpe) <= 1.0
    };
}