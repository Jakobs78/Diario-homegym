import {inheritPersonalExerciseMapping} from '../mycoatch/exerciseIdentity.js';
import {reviewImportedPlan} from './importPreview.js';
/**
 * Module: csvHandler.js
 * Summary: Fornisce un parser universale in grado di elaborare file CSV o tabelle copiate da PDF ed Excel, rilevando automaticamente il delimitatore (\t, ;, ,) e gestendo correttamente virgolette e ritorni a capo. Si occupa inoltre della validazione del completamento del mesociclo attivo prima di caricare nuovi piani, dell'assegnazione automatica dei tag di raggruppamento visivo per Triset, Superset, Dropset e Jumpset, e dell'importazione/esportazione dello storico completo dei progressi sincronizzato con Supabase.
 */

// ==========================================
// 1. IMPORT & DIPENDENZE
// ==========================================
import { state } from './state.js';
import { stageProfileRevision, commitProfileRevision, profileSnapshot } from '../mycoatch/profileJournal.js';
import {commitJournalCandidate} from './journalTransaction.js';
import { applyTrisetDropsetGrouping, normalizeExerciseName } from './helpers.js';
import { isMesocycleCompleted } from './historySafety.js';
import { restoreProposalMetadata } from '../mycoatch/planMetadata.js';

// ==========================================
// 2. UTILITY DI PARSING E RICONOSCIMENTO COLONNE
// ==========================================
/**
 * Parser universale per CSV e tabelle copiate (gestisce tabulazioni da PDF/Excel, virgolette e a capo)
 */
export function parseCSV(text) {
    if (!text) return [];

    const sampleLine = text.split(/\r\n|\n/).find(l => l.trim().length > 0) || '';
    let delimiter = ',';
    if (sampleLine.includes('\t')) {
        delimiter = '\t';
    } else if (sampleLine.includes(';')) {
        delimiter = ';';
    }

    const result = [];
    let row = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            const cleaned = currentField.replace(/[\r\n]+/g, ' ').trim().replace(/^"|"$/g, '');
            row.push(cleaned);
            currentField = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            const cleaned = currentField.replace(/[\r\n]+/g, ' ').trim().replace(/^"|"$/g, '');
            row.push(cleaned);
            if (row.some(field => field.length > 0)) {
                result.push(row);
            }
            row = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }

    if (currentField || row.length > 0) {
        const cleaned = currentField.replace(/[\r\n]+/g, ' ').trim().replace(/^"|"$/g, '');
        row.push(cleaned);
        if (row.some(field => field.length > 0)) {
            result.push(row);
        }
    }

    return result;
}

/**
 * Helper per trovare l'indice di una colonna evitando falsi positivi
 */
function findColumnIndex(headers, targets) {
    for (const target of targets) {
        let idx = headers.indexOf(target);
        if (idx !== -1) return idx;

        idx = headers.findIndex(h => {
            if (target === 'set' || target === 'serie') {
                if (h.includes('settimana')) return false;
            }
            return h.includes(target);
        });
        if (idx !== -1) return idx;
    }
    return -1;
}

// ==========================================
// 3. HELPER DI VALIDAZIONE & RAGGRUPPAMENTO
// ==========================================
// ==========================================
// 4. IMPORTAZIONE PIANO DI ALLENAMENTO
// ==========================================
export async function importWorkoutPlan(csvText, coachOptions = null) {
    try {
        // Non toccare state/history prima che TUTTO il file sia valido.
        // In caso di annullamento o errore non creare nemmeno anni vuoti.
        const currentYear = state.currentYear || new Date().getFullYear();
        const existingYears = state.workoutData?.history?.years || {};
        const currentMesos = existingYears[currentYear]?.mesocycles || [];
        const activeMeso = currentMesos[state.activeMesocycleIndex];

        const rows = parseCSV(csvText);
        if (rows.length < 2) throw new Error("Il file o il testo incollato è vuoto o non contiene intestazioni valide.");

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);
        if (findColumnIndex(headers, ['esercizio', 'exercise', 'name']) < 0 ||
            findColumnIndex(headers, ['set', 'serie']) < 0 ||
            findColumnIndex(headers, ['reps', 'ripetizioni']) < 0) {
            throw new Error('CSV scheda non valido: mancano Esercizio, Set o Reps.');
        }
        const nextMesoNumber = currentMesos.length + 1;

        let newMesocycle = {
            id: `meso_${crypto.randomUUID()}`,
            name: `Mesociclo ${nextMesoNumber}`,
            importedAt: new Date().toISOString(),
            weeks: []
        };

        const weeksMap = Object.create(null);
        let parsedExercises = 0;

        dataRows.forEach((row, rowIndex) => {
            const getVal = (colNames) => {
                const idx = findColumnIndex(headers, colNames);
                return (idx !== -1 && row[idx] !== undefined) ? row[idx].trim() : '';
            };

            const strictPositiveInteger = (raw, fallback, label, maximum) => {
                if (!raw) return fallback;
                if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > maximum) {
                    throw new Error('Riga ' + (rowIndex + 2) + ': ' + label + ' non valido.');
                }
                return Number(raw);
            };
            const weekNum = strictPositiveInteger(getVal(['settimana', 'week']), 1, 'Settimana', 52);
            const dayNum = strictPositiveInteger(getVal(['giorno', 'day']), 1, 'Giorno', 7);
            const blockNum = strictPositiveInteger(getVal(['blocco', 'block']), 1, 'Blocco', 99);
            const rawExName = getVal(['esercizio', 'exercise', 'name']);
            if (!rawExName) throw new Error('Riga ' + (rowIndex + 2) + ': esercizio mancante.');
            const exName = normalizeExerciseName(rawExName);
            const setsCount = strictPositiveInteger(getVal(['set', 'serie']), 3, 'Set', 30);
            parsedExercises++;
            
            // 🧠 1. Pulizia delle ripetizioni per rimuovere "rep" o "rip"
            const rawRepsVal = getVal(['reps', 'ripetizioni']) || '8';
            const repsVal = rawRepsVal.replace(/rep|rip/gi, '').trim();
            
            const rawKgMin = getVal(['kgmin', 'min']);
            const rawKgMax = getVal(['kgmax', 'max']);
            const kgMin = rawKgMin.replace(/kg/gi, '').trim();
            const kgMax = rawKgMax.replace(/kg/gi, '').trim();

            const topset = getVal(['topset']);
            const rpeVal = sanitizeRpe(getVal(['rpe']) || '');
            const restVal = getVal(['recupero', 'rest']) || '90';
            const notesVal = getVal(['note', 'noteallenatore']) || '';

            if (!weeksMap[weekNum]) {
                weeksMap[weekNum] = { weekNumber: weekNum, coachNotes: '', daysMap: {} };
            }
            if (!weeksMap[weekNum].daysMap[dayNum]) {
                weeksMap[weekNum].daysMap[dayNum] = { dayNumber: dayNum, dayName: `Giorno ${dayNum}`, exercises: [] };
            }
            // Compatibilità retroattiva: SOLO i CSV generati da MyCoatch
            // possono ricostruire l'etichetta Upper/Lower nel vecchio formato
            // a 12 colonne, senza influenzare importazioni di altri coach.
            const namedSplit = /^\[SPLIT MYCOATCH\]\s*(Upper [A-F]|Lower [A-F]|Full Body [A-F])\b/i.exec(notesVal);
            if (blockNum === 1 && namedSplit) {
                weeksMap[weekNum].daysMap[dayNum].dayName = namedSplit[1];
            }

            const perSetTag=/\[OBIETTIVO REPS PER SERIE\]\s*(\d+(?:\s*[-–]\s*\d+)?(?:\/\d+(?:\s*[-–]\s*\d+)?)*)/.exec(notesVal);
            const perSetReps=getVal(['repsperserie','ripetizioniperserie'])||perSetTag?.[1];
            const perSetTargets=perSetReps?String(perSetReps).split('/').map(v=>v.trim()):null;
            const perSetValues=(names)=>{const raw=getVal(names);if(!raw)return null;const values=String(raw).split('/').map(v=>v.trim());if(values.length!==setsCount)throw Error('Il numero di target per serie non coincide alla riga '+(rowIndex+2));return values;};
            const perSetRpe=perSetValues(['rpeperserie']);
            const perSetKgMin=perSetValues(['kgminperserie']);
            const perSetKgMax=perSetValues(['kgmaxperserie']);
            if(perSetTargets&&(perSetTargets.length!==setsCount||perSetTargets.some(n=>!/^\d+(?:\s*[-–]\s*\d+)?$/.test(n)||Number(n.split(/[-–]/)[0])<1||Number(n.split(/[-–]/).at(-1))>100||Number(n.split(/[-–]/)[0])>Number(n.split(/[-–]/).at(-1)))))throw Error('Obiettivi per serie non validi alla riga '+(rowIndex+2));
            const sets = [];
            for (let s = 1; s <= setsCount; s++) {
                sets.push({
                    setNumber: s,
                    ...(perSetTargets?{targetReps:perSetTargets[s-1]}:{}),
                    ...(perSetRpe?{targetRpe:perSetRpe[s-1]}:{}),
                    ...(perSetKgMin?{kgMin:perSetKgMin[s-1]}:{}),
                    ...(perSetKgMax?{kgMax:perSetKgMax[s-1]}:{}),
                    weight: '',
                    reps: '',               
                    rpe: '',
                    isLocked: false
                });
            }

            weeksMap[weekNum].daysMap[dayNum].exercises.push({
                block: blockNum,
                name: exName,
                originalName: rawExName,
                set: `${setsCount} set`,
                reps: repsVal,
                kgMin: kgMin,
                kgMax: kgMax,
                topset: topset,
                rpe: rpeVal,
                recupero: restVal,
                targetRpe: rpeVal,
                rest: restVal,
                notes: notesVal,
                sets: sets,
                loggedSets: structuredClone(sets)
            });
        });

        if (!parsedExercises) throw new Error('Nessun esercizio valido nel CSV.');

        Object.values(weeksMap).forEach(w => {
            const daysArray = Object.values(w.daysMap);
            applyTrisetDropsetGrouping(daysArray);

            newMesocycle.weeks.push({
                weekNumber: w.weekNumber,
                coachNotes: w.coachNotes,
                days: daysArray
            });
        });

        if(coachOptions?.generatedPlan)
            newMesocycle=restoreProposalMetadata(newMesocycle,coachOptions.generatedPlan);

        if(coachOptions?.review){const reviewed=await reviewImportedPlan(newMesocycle);if(!reviewed)return {success:false,error:'Importazione annullata.'};newMesocycle=reviewed;}
        // Anche l'avviso viene mostrato solo DOPO un parsing completo.
        // Inserire una nuova scheda mantiene il mesociclo originale intatto.
        if (activeMeso && !isMesocycleCompleted(activeMeso)) {
            const proceed = confirm(
                `⚠️ Il mesociclo attuale (${activeMeso.name}) non risulta completato.\\n\\n` +
                'Vuoi aggiungere la nuova scheda come mesociclo separato? ' +
                'Gli allenamenti precedenti rimarranno salvati.'
            );
            if (!proceed) {
                return { success: false,
                    error: 'Importazione annullata. Il diario non è stato modificato.' };
            }
        }

        const candidate=structuredClone(state.workoutData);
        if (!candidate.history) candidate.history = { years: {} };
        if (!candidate.history.years) candidate.history.years = {};
        if (!candidate.history.years[currentYear]) {
            candidate.history.years[currentYear] = { mesocycles: [] };
        }
        // The profile snapshot belongs to this imported plan, not to a later
        // mutable form state. Manual CSV imports keep their original behavior.
        if(coachOptions?.athleteProfile) {
            const staged=stageProfileRevision(candidate,coachOptions.athleteProfile,new Date(),coachOptions);
            newMesocycle.coachProfileSnapshot=profileSnapshot(staged,coachOptions);
            commitProfileRevision(candidate,staged);
        }
        const target = candidate.history.years[currentYear].mesocycles;
        for(const week of newMesocycle.weeks)for(const day of week.days)for(const ex of day.exercises){inheritPersonalExerciseMapping(candidate,ex);}
        target.push(newMesocycle);

        await commitJournalCandidate(candidate,'IMPORT_WORKOUT');
        state.activeMesocycleIndex = target.length - 1;
        state.activeWeek = 1;
        state.activeDay = 1;

        return { 
            success: true, 
            message: `Mesociclo ${nextMesoNumber} importato con successo!` 
        };
    } catch (err) {
        console.error("Errore importazione piano:", err);
        return { success: false, error: err.message };
    }
}

// ==========================================
// 5. IMPORTAZIONE STORICO & ESPORTAZIONE CSV
// ==========================================
export async function importProgressCSV(csvText) {
    try {
        const rows = parseCSV(csvText);
        if (rows.length < 2)
            throw new Error('Il file CSV dei progressi è vuoto o non valido.');

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const col = aliases => findColumnIndex(headers, aliases);
        const idxMeso = col(['mesociclo', 'meso']);
        const idxWeek = col(['settimana', 'week']);
        const idxDay = col(['giorno', 'day']);
        const idxDate = col(['data', 'date']);
        const idxBlock = col(['blocco', 'block']);
        const idxEx = col(['esercizio', 'exercise', 'name']);
        const idxSet = col(['serie', 'set']);
        const idxWeight = col(['kg_reali', 'kg', 'peso', 'weight']);
        const idxReps = col(['reps_reali', 'rep', 'ripetizioni']);
        const idxCompleted = col(['completato', 'completed']);
        const idxRpe = col(['rpe', 'sforzo']);
        const idxNotes = col(['note_esercizio', 'note']);

        if (idxEx < 0 || idxSet < 0 || idxWeight < 0 || idxReps < 0)
            throw new Error('CSV storico non valido: mancano esercizio, serie, kg o ripetizioni.');

        const currentYear = state.currentYear || new Date().getFullYear();
        const previousMesos =
            state.workoutData?.history?.years?.[currentYear]?.mesocycles || [];
        const takenNames = new Set(previousMesos.map(m => m.name));
        const drafts = new Map(); // appositi oggetti nuovi; NON riaprire mesocicli esistenti.
        const importedSets = new Set();
        let totalRows = 0;

        const nameFor = original => {
            if (!takenNames.has(original)) {
                takenNames.add(original);
                return original;
            }
            let number = 2;
            let candidate = original + ' (importazione ' + number + ')';
            while (takenNames.has(candidate)) {
                number++;
                candidate = original + ' (importazione ' + number + ')';
            }
            takenNames.add(candidate);
            return candidate;
        };
        const strictIndex = (raw, label, rowNumber, fallback, max) => {
            const input = String(raw ?? '').trim();
            if (!input) return fallback;
            if (!/^\d+$/.test(input) || Number(input) < 1 || Number(input) > max)
                throw new Error('Riga ' + rowNumber + ': ' + label + ' non valido.');
            return Number(input);
        };

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.every(cell => !String(cell).trim())) continue;
            const read = index => index < 0 ? '' : String(row[index] ?? '').trim();
            const line = i + 1;
            const originalName = read(idxMeso) || 'Storico Importato';
            const weekNumber = strictIndex(read(idxWeek), 'Settimana', line, 1, 52);
            const dayNumber = strictIndex(read(idxDay), 'Giorno', line, 1, 7);
            const setNumber = strictIndex(read(idxSet), 'Serie', line, 1, 99);
            const block = strictIndex(read(idxBlock), 'Blocco', line, 1, 99);
            const name = read(idxEx);
            if (!name) throw new Error('Riga ' + line + ': nome esercizio mancante.');
            const exerciseName = normalizeExerciseName(name);

            // Preserve missing values and don't transform a negative/invalid
            // value to a positive load by stripping its sign or units.
            const rawWeight = read(idxWeight).replace(',', '.');
            if (rawWeight && (!/^(?:\d+)(?:\.\d+)?$/.test(rawWeight) ||
                Number(rawWeight) > 700 || Number(rawWeight) < 0)) {
                throw new Error('Riga ' + line + ': peso registrato non valido.');
            }
            const weight = rawWeight ? Number(rawWeight) : '';
            const reps = read(idxReps);
            const status = read(idxCompleted).toUpperCase();
            const isLocked = ['SI', 'SÌ', 'TRUE', '1'].includes(status);
            if (status && !['SI', 'SÌ', 'TRUE', '1', 'NO', 'FALSE', '0'].includes(status))
                throw new Error('Riga ' + line + ': stato di completamento non valido.');
            // When no Completed column exists, never fabricate a completed set.
            const rpe = read(idxRpe) ? sanitizeRpe(read(idxRpe)) : '';
            const notes = read(idxNotes);
            const date = read(idxDate);
            const key = JSON.stringify([originalName, weekNumber, dayNumber, date,
                block, exerciseName, setNumber]);
            if (importedSets.has(key)) {
                throw new Error('Riga ' + line + ': serie duplicata nel CSV. ' +
                    'Importazione annullata senza modificare lo storico.');
            }
            importedSets.add(key);

            if (!drafts.has(originalName)) {
                drafts.set(originalName, {
                    id: 'meso_imp_' + crypto.randomUUID(),
                    name: nameFor(originalName),
                    originalImportedName: originalName,
                    importedAt: new Date().toISOString(),
                    weeks: []
                });
            }
            const meso = drafts.get(originalName);
            let week = meso.weeks.find(w => w.weekNumber === weekNumber);
            if (!week) {
                week = { weekNumber, coachNotes: '', days: [] };
                meso.weeks.push(week);
            }
            // A distinct performance date must never silently be mixed with
            // another session having the same day number.
            let day = week.days.find(d => d.dayNumber === dayNumber && d.date === date);
            if (!day) {
                day = { dayNumber, dayName: 'Giorno ' + dayNumber, date, exercises: [] };
                week.days.push(day);
            }
            let exercise = day.exercises.find(ex => ex.name === exerciseName &&
                Number(ex.block) === block);
            if (!exercise) {
                exercise = { block, name: exerciseName, notes, loggedSets: [], sets: [] };
                day.exercises.push(exercise);
            }
            exercise.loggedSets.push({
                setNumber, weight, reps, rpe, isLocked, completed: isLocked
            });
            totalRows++;
        }
        if (!totalRows || !drafts.size)
            throw new Error('Nessuna serie valida nello storico CSV.');

        // Commit in memoria UNICO, solo dopo ogni riga validata.
        const candidate=structuredClone(state.workoutData);
        if (!candidate.history) candidate.history = { years: {} };
        if (!candidate.history.years) candidate.history.years = {};
        if (!candidate.history.years[currentYear])
            candidate.history.years[currentYear] = { mesocycles: [] };
        candidate.history.years[currentYear].mesocycles.push(...drafts.values());
        await commitJournalCandidate(candidate,'IMPORT_WORKOUT');


        return {
            success: true,
            message: 'Importati ' + totalRows + ' record in ' + drafts.size +
                ' nuovi mesocicli. Lo storico precedente è rimasto invariato.'
        };
    } catch (err) {
        console.error('Errore nell’importazione dello storico CSV:', err);
        return { success: false, error: err.message };
    }
}

export function exportToCSV(workoutData) {
    try {
        const currentYear = state.currentYear || new Date().getFullYear();
        const mesocycles = workoutData?.history?.years?.[currentYear]?.mesocycles || [];

        if (mesocycles.length === 0) {
            alert("Nessun dato di mesociclo disponibile per l'esportazione CSV.");
            return;
        }

        // Intestazione arricchita con i campi reali compilati dall'utente
        let csvContent = "Mesociclo,Settimana,Giorno,Data,Blocco,Esercizio,Serie,Kg_Reali,Reps_Reali,Completato,Rpe,Recupero,Note_Esercizio\n";

        const csvQuote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
        const appendRows = (mesoName, weekNumber, dayNumber, date, exercises, archived = false) => {
            for (const ex of exercises || []) {
                const logged = Array.isArray(ex.loggedSets) && ex.loggedSets.length
                    ? ex.loggedSets : (ex.sets || []);
                for (const set of logged) {
                    const completed = set.isLocked === true || set.completed === true;
                    // An unrecorded RPE is ALWAYS empty, never the planned exercise RPE.
                    csvContent += [
                        csvQuote(mesoName),
                        weekNumber,
                        dayNumber,
                        csvQuote(date),
                        ex.block || 1,
                        csvQuote(ex.name),
                        set.setNumber || 1,
                        csvQuote(set.weight ?? ''),
                        csvQuote(set.reps ?? ''),
                        completed ? 'SI' : 'NO',
                        csvQuote(set.rpe ?? ''),
                        csvQuote(ex.rest || ex.recupero || ''),
                        csvQuote((archived ? '[ARCHIVIO RIPETIZIONE] ' : '') +
                            String(ex.notes || ''))
                    ].join(',') + '\n';
                }
            }
        };
        mesocycles.forEach(meso => {
            meso.weeks?.forEach(week => {
                week.days?.forEach(day => {
                    appendRows(meso.name, week.weekNumber || 1, day.dayNumber || 1,
                        day.date || '', day.exercises);
                    // Format legacy stays at 13 columns. Each archived session is
                    // exported as an additional, DISTINCT historical mesocycle
                    // so that re-importing it will never overwrite the current sets.
                    (day.sessionArchives || []).forEach((oldSession, index) => {
                        const oldName = String(meso.name || 'Mesociclo') +
                            ' [archivio S' + (week.weekNumber || 1) +
                            ' G' + (day.dayNumber || 1) +
                            ' #' + (index + 1) + ']';
                        appendRows(oldName, week.weekNumber || 1, day.dayNumber || 1,
                            oldSession.sessionDate ||
                                String(oldSession.capturedAt || '').slice(0, 10),
                            oldSession.exercises, true);
                    });
                });
            });
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `storico_completo_workout_${currentYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Errore durante l'esportazione dello storico CSV:", err);
        alert("Errore durante l'esportazione del file CSV.");
    }
}

// ==========================================
// 6. LETTURA FILE CON GESTIONE ENCODING
// ==========================================
export function readCsvFile(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const buffer = e.target.result;
        let text;
        
        try {
            const decoderUtf8 = new TextDecoder('utf-8', { fatal: true });
            text = decoderUtf8.decode(buffer);
        } catch {
            const decoderUtf16 = new TextDecoder('utf-16le');
            text = decoderUtf16.decode(buffer);
        }
        
        callback(text);
    };
    reader.readAsArrayBuffer(file);
}
/**
 * Pulisce e normalizza la stringa dell'RPE proveniente da qualsiasi CSV.
 * Rimuove il carattere '@', eventuali spazi bianchi e gestisce valori vuoti.
 */
export function sanitizeRpe(rawRpe) {
    if (rawRpe === null || rawRpe === undefined || rawRpe === "") {
        return ""; 
    }
    // Rimuove qualsiasi carattere '@' e spazi superflui
    return String(rawRpe).replace(/@/g, '').trim();
}
