/**
 * Module: pdfTextMapper.js
 * Summary: Converte il testo grezzo estratto dai documenti PDF dei coach in una struttura dati gerarchica standardizzata (mesociclo, settimane, giorni, esercizi, serie) identificando i pattern relativi a settimane, giorni, set, ripetizioni, range di carico, RPE target, tempi di recupero e note.
 */
import { applyTrisetDropsetGrouping, normalizeExerciseName } from './helpers.js';

export function mapPdfTextToWorkoutData(cleanedText, existingMesocount = 0) {
    if (!cleanedText || typeof cleanedText !== 'string') {
        cleanedText = "";
    }

    const nextMesoNumber = existingMesocount + 1;

    const newMesocycle = {
        id: `meso_${crypto.randomUUID()}`,
        name: `Mesociclo ${nextMesoNumber}`,
        importedAt: new Date().toISOString(),
        locked: false,
        weeks: []
    };

    const lines = cleanedText.split('\n').map(l => l.trim()).filter(Boolean);

    let currentWeek = null;
    let currentDay = null;
    let lastExercise = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Intercetta cambio Settimana
        const weekMatch = line.match(/(?:^|--- PAGINA \d+ --- )?\bSettimana\s+(\d+)/i);
        if (weekMatch && line.toLowerCase().includes("settimana")) {
            const weekNum = parseInt(weekMatch[1], 10);
            currentWeek = newMesocycle.weeks.find(w => w.weekNumber === weekNum);
            if (!currentWeek) {
                currentWeek = { weekNumber: weekNum, coachNotes: "", days: [] };
                newMesocycle.weeks.push(currentWeek);
            }
            currentDay = null;
            lastExercise = null;
            continue;
        }

        // Intercetta cambio Giorno
        const dayMatch = line.match(/^\s*giorno\s+(\d+)/i);
        if (dayMatch) {
            const dayNum = parseInt(dayMatch[1], 10);
            if (!currentWeek) {
                currentWeek = { weekNumber: 1, coachNotes: "", days: [] };
                newMesocycle.weeks.push(currentWeek);
            }

            const dayName = `Giorno ${dayNum}`;
            currentDay = currentWeek.days.find(d => d.dayName === dayName);
            if (!currentDay) {
                currentDay = { dayName: dayName, exercises: [] };
                currentWeek.days.push(currentDay);
            }
            lastExercise = null;
            continue;
        }

        // Intercetta riga RPE isolata (quando nel PDF va a capo, es. "@6,0")
        const standaloneRpeMatch = line.match(/^@\s*(\d+(?:[.,]\d+)?)/i);
        if (standaloneRpeMatch && lastExercise) {
            const val = standaloneRpeMatch[1];
            const rpeVal = `@${val.replace(',', '.')}`;
            lastExercise.targetRpe = rpeVal;
            lastExercise.rpeTarget = rpeVal;
            if (lastExercise.loggedSets) {
                lastExercise.loggedSets.forEach(s => s.rpe = rpeVal);
            }
            continue;
        }

        // Intercetta riga Esercizio
        const exMatch = line.match(/^(.+?)\s+(\d+)\s*set\s*x\s*([\d-]+)\s*rep(.*)$/i);
        if (exMatch) {
            const rawName = exMatch[1];
            const targetSets = parseInt(exMatch[2], 10);
            const targetReps = exMatch[3].trim();
            const restOfLine = exMatch[4];

            const cleanName = cleanExerciseName(rawName);
            const targets = extractTargetMetrics(restOfLine);

            if (currentDay) {
                const loggedSets = Array.from({ length: targetSets }, () => ({
                    weight: "",
                    reps: "",
                    rpe: targets.rpe, // Assegna l'RPE se trovato sulla stessa riga
                    isLocked: false
                }));

                const newExercise = {
                    name: normalizeExerciseName(cleanName), // 👈 Ora garantisce sempre Title Case pulito (es. "Panca Piana")
                    targetSets: targetSets,
                    sets: targetSets,
                    targetReps: targetReps,
                    reps: targetReps,
                    repsTarget: targetReps,
                    topset: targets.topset,
                    kgMin: targets.kgMin,
                    kgMax: targets.kgMax,
                    targetRpe: targets.rpe,
                    rpeTarget: targets.rpe,
                    rest: targets.rest,
                    notes: targets.notes,
                    loggedSets: loggedSets
                };

                currentDay.exercises.push(newExercise);
                lastExercise = newExercise;
            }
        } else if (lastExercise && !line.includes("ESERCIZIO") && !line.includes("--- PAGINA")) {
            // Eventuali note multilinea vengono accodate
            lastExercise.notes = lastExercise.notes ? `${lastExercise.notes} ${line}` : line;
        }
    }

    if (newMesocycle.weeks.length === 0) {
        newMesocycle.weeks.push({ weekNumber: 1, coachNotes: "", days: [] });
    }
    newMesocycle.weeks.forEach(week => {
        if (week.days) {
            applyTrisetDropsetGrouping(week.days);
        }
    });

    return newMesocycle;
}

function extractTargetMetrics(restOfLine) {
    let kgMin = "";
    let kgMax = "";
    let topset = "";
    let rest;
    let rpe = "";

    const rpeMatch = restOfLine.match(/(?:rpe\s*[:=]?\s*|@)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*rpe/i);
    if (rpeMatch) {
        const val = rpeMatch[1] || rpeMatch[2];
        rpe = `@${val.replace(',', '.')}`;
    }

    const restMatch = restOfLine.match(/(\d+(?:[.,]\d+)?\s*(?:min|minuti|'|"|sec|s\b))/i);
    if (restMatch) {
        rest = restMatch[0].trim();
    } else {
        rest = "120s";
    }

    const rangeKgMatch = restOfLine.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*kg/i);
    if (rangeKgMatch) {
        kgMin = rangeKgMatch[1];
        kgMax = rangeKgMatch[2];
    } else {
        const kgMatches = [...restOfLine.matchAll(/(\d+(?:[.,]\d+)?)\s*kg/gi)];
        if (kgMatches.length >= 2) {
            kgMin = kgMatches[0][1];
            kgMax = kgMatches[1][1];
        } else if (kgMatches.length === 1) {
            topset = `${kgMatches[0][1]} kg`;
        }
    }

    const notes = restOfLine
        .replace(/(?:rpe\s*[:=]?\s*|@)\s*\d+(?:[.,]\d+)?/gi, '')
        .replace(/\d+(?:[.,]\d+)?\s*rpe/gi, '')
        .replace(/\d+([.,]\d+)?\s*%/g, '')
        .replace(/\d+([.,]\d+)?\s*-\s*\d+([.,]\d+)?\s*kg/gi, '')
        .replace(/\d+([.,]\d+)?\s*kg/gi, '')
        .replace(/\d+([.,]\d+)?\s*m\/s/gi, '')
        .replace(/^[-–—\s\d.,]+/, '')
        .replace(/[-–—\s]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();

    return { kgMin, kgMax, topset, rest, rpe, notes };
}

function cleanExerciseName(rawText) {
    return rawText
        .replace(/--- PAGINA \d+ ---/gi, '')
        .replace(/Settimana \d+/gi, '')
        .replace(/^giorno \d+/gi, '')
        .replace(/\b(ESERCIZIO|SERIE x RIPETIZIONI|RECUPERO|Commenti|Massimale stimato|rpe target|LRV TARGET|vl TARGET|rpe effettivo|LRV effettivo|vl effettivo|carico min|carico max|carico topset|% min|%max)\b/gi, '')
        .trim();
}