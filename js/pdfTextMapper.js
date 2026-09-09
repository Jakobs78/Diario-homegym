// pdfTextMapper.js - Versione con pulizia dei kg nei range e supporto note/RPE

import { applyTrisetDropsetGrouping } from './csvHandler.js';

export function mapPdfTextToWorkoutData(cleanedText, existingMesocount = 0) {
    if (!cleanedText || typeof cleanedText !== 'string') {
        cleanedText = "";
    }

    const nextMesoNumber = existingMesocount + 1;

    // Struttura del singolo mesociclo da accodare
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

    for (const line of lines) {
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

        // Intercetta riga Esercizio
        const exMatch = line.match(/^(.+?)\s+(\d+)\s*set\s*x\s*([\d\-]+)\s*rep(.*)$/i);
        if (exMatch) {
            const rawName = exMatch[1];
            const targetSets = parseInt(exMatch[2], 10);
            const targetReps = exMatch[3].trim();
            const restOfLine = exMatch[4];

            const cleanName = cleanExerciseName(rawName);
            const rpeTarget = extractRPEFromLine(line, restOfLine);
            const targets = extractTargetMetrics(restOfLine);

            if (currentDay) {
                const loggedSets = Array.from({ length: targetSets }, () => ({
                    weight: "",
                    reps: "",
                    rpe: "",
                    isLocked: false
                }));

                const newExercise = {
                    name: capitalize(cleanName),
                    targetSets: targetSets,
                    sets: targetSets,
                    targetReps: targetReps,
                    reps: targetReps,
                    repsTarget: targetReps,
                    topset: targets.topset,
                    kgMin: targets.kgMin,
                    kgMax: targets.kgMax,
                    rpeTarget: rpeTarget,
                    targetRpe: rpeTarget,
                    rest: targets.rest,
                    notes: targets.notes,
                    loggedSets: loggedSets
                };

                currentDay.exercises.push(newExercise);
                lastExercise = newExercise;
            }
        } else if (lastExercise && !line.includes("ESERCIZIO") && !line.includes("--- PAGINA")) {
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

function extractRPEFromLine(fullLine, restOfLine) {
    const atMatch = restOfLine.match(/@\s*(\d+(?:[.,]\d+)?)/);
    if (atMatch) return `@${atMatch[1].replace(',', '.')}`;

    const numbersInRest = [...restOfLine.matchAll(/(\d+(?:[.,]\d+)?)/g)];
    for (const match of numbersInRest) {
        const valStr = match[1].replace(',', '.');
        const num = parseFloat(valStr);
        const index = match.index;
        const surrounding = restOfLine.substring(Math.max(0, index - 3), Math.min(restOfLine.length, index + 6));
        
        if (num >= 5 && num <= 10 && !surrounding.includes('kg') && !surrounding.includes('min') && !surrounding.includes('%')) {
            return `@${match[1]}`;
        }
    }

    const globalMatch = fullLine.match(/rpe\s*[:=@]?\s*(\d+(?:[.,]\d+)?)/i);
    if (globalMatch) return `@${globalMatch[1]}`;

    return "";
}

function extractTargetMetrics(restOfLine) {
    let kgMin = "";
    let kgMax = "";
    let topset = "";
    let rest = "";

    const restMatch = restOfLine.match(/(\d+(?:[.,]\d+)?\s*(?:min|minuti|'|"|sec|s\b))/i);
    if (restMatch) {
        rest = restMatch[0].trim();
    }

    // Salviamo solo i valori numerici senza la stringa "kg" per evitare il raddoppio nella UI
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
        .replace(/\d+([.,]\d+)?\s*%/g, '')
        .replace(/\d+([.,]\d+)?\s*-\s*\d+([.,]\d+)?\s*kg/gi, '')
        .replace(/\d+([.,]\d+)?\s*kg/gi, '')
        .replace(/\d+([.,]\d+)?\s*m\/s/gi, '')
        .replace(/@\d+([.,]\d+)?/g, '')
        .replace(/^[-–—\s\d.,]+/, '')
        .replace(/[-–—\s]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();

    return { kgMin, kgMax, topset, rest, notes };
}

function cleanExerciseName(rawText) {
    return rawText
        .replace(/--- PAGINA \d+ ---/gi, '')
        .replace(/Settimana \d+/gi, '')
        .replace(/^giorno \d+/gi, '')
        .replace(/\b(ESERCIZIO|SERIE x RIPETIZIONI|RECUPERO|Commenti|Massimale stimato|rpe target|LRV TARGET|vl TARGET|rpe effettivo|LRV effettivo|vl effettivo|carico min|carico max|carico topset|% min|%max)\b/gi, '')
        .trim();
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}