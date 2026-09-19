/**
 * Module: workoutEvents.js
 * Summary: Associa gli eventi di input per la modifica in tempo reale di kg, reps, RPE e note utente, validando i range consentiti, applicando feedback visivi d'errore o di miglioramento (verde) e gestendo il blocco delle serie.
 */
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { isValueOutOfRange, isValueExceedingTarget, findPreviousExercise, calculateSetVolumeTrend, parseRPE } from './helpers.js';
import { startTimer, handleTick, handleComplete, parseRecoveryTime } from './timer.js';
import { updatePlatesBadgeUI } from './exerciseCard.js';
import { updateSessionAndCompletionState, updateSessionHeaderUI } from './sessionTimer.js';

// Aggiungi questa funzione sotto gli import
function evaluateFatigue(exerciseIndex, targetRepsString, actualRepsValue) {
    const adviceBox = document.getElementById(`mycoach-advice-${exerciseIndex}`);
    if (!adviceBox) return;

    if (!actualRepsValue || String(actualRepsValue).trim() === "") {
        adviceBox.style.display = 'none';
        return;
    }

    const targetMin = parseInt(String(targetRepsString).split('-')[0]) || 0;
    const actual = parseInt(actualRepsValue) || 0;

    // LA REGOLA DEL COACH: Se manchi il target minimo di 2 o più ripetizioni
    if (actual > 0 && actual <= targetMin - 2) {
        adviceBox.innerHTML = `⚠️ <strong>MyCoach:</strong> Hai chiuso ${actual} rep (Target: ${targetMin}). Il drop di performance è eccessivo. Scala il carico del 10% nella prossima serie o il volume diventerà spazzatura.`;
        adviceBox.style.display = 'block';
    } else {
        adviceBox.style.display = 'none';
    }
}
/**
 * Associa gli eventi della tabella di allenamento (input, modifica note, blocco set).
 * @param {Object} currentDay - L'oggetto del giorno corrente
 * @param {boolean} isPastMeso - Se il mesociclo è bloccato
 * @param {Function} renderCallback - Funzione per rirenderizzare la vista
 */
export function bindWorkoutTableEvents(currentDay, isPastMeso, renderCallback) {
    const workoutListContainer = document.getElementById('workout-list-container');
    if (!workoutListContainer) return;

    workoutListContainer.querySelectorAll('.set-input, .ex-user-notes').forEach(input => {
        input.addEventListener('focus', (e) => e.target.select());

        input.addEventListener('input', (e) => {
            const target = e.target;
            const exIdx = target.dataset.ex;
            const ex = currentDay.exercises[exIdx];
            if (!ex) return;

            if (target.classList.contains('ex-user-notes')) {
                ex.userNotes = target.value;
                saveAndSync(state.workoutData);
                return;
            }

            const setIdx = parseInt(target.dataset.set, 10);
            const setObj = ex.loggedSets?.[setIdx];
            if (!setObj) return;

            const val = target.value;
            const isKg = target.classList.contains('set-kg');
            const isReps = target.classList.contains('set-reps');
            const isRpe = target.classList.contains('set-rpe');

            if (isKg) {
                const raw = val.trim();
                setObj.weight = raw === '' ? '' : (parseFloat(raw.replace(',', '.')) || 0);
            }
            if (isReps) setObj.reps = val;
            if (isRpe) setObj.rpe = val;

            if (setIdx === 0 && isKg) {
                updatePlatesBadgeUI(exIdx);
            }

            if (isKg || isReps || isRpe) {
                let minVal, maxVal, parsedVal;

                if (isKg) {
                    const isTopsetRow = setIdx === 0 || setObj.isTopset;
                    const hasTopsetTarget = ex.topsetKgMin || ex.topsetKgMax || ex.topsetKg;

                    if (isTopsetRow && hasTopsetTarget) {
                        minVal = ex.topsetKgMin || ex.topsetKg;
                        maxVal = ex.topsetKgMax || ex.topsetKg;
                    } else {
                        minVal = ex.kgMin;
                        maxVal = ex.kgMax;
                    }
                    parsedVal = val.replace(',', '.');
                } else if (isReps) {
                    minVal = ex.minReps || ex.reps;
                    maxVal = ex.maxReps || ex.reps;
                    parsedVal = val;
                } else if (isRpe) {
                    const targetRpeStr = String(ex.targetRpe || ex.rpeTarget || ex.rpe || '').replace('@', '').trim();
                    minVal = ex.minRpe || (targetRpeStr.includes('-') ? targetRpeStr.split('-')[0] : targetRpeStr);
                    maxVal = ex.maxRpe || (targetRpeStr.includes('-') ? targetRpeStr.split('-')[1] : targetRpeStr);
                    parsedVal = parseRPE(val);
                }

                const isOut = isValueOutOfRange(parsedVal, minVal, maxVal);
                const isExceeding = isValueExceedingTarget(parsedVal, minVal, maxVal);
                target.classList.toggle('input-out-of-range', isOut);

                // Calcolo trend e miglioramento per feedback visivo verde
                const mesoIndex = state.activeMesocycleIndex || 0;
                const currentYear = new Date().getFullYear().toString();
                const yearData = state.workoutData?.history?.years?.[currentYear];
                const targetWeek = yearData?.mesocycles?.[mesoIndex]?.weeks?.find(w => w.weekNumber === (state.activeWeek || 1));
                const activeDayNum = state.activeDay || 1;
                const prevEx = findPreviousExercise(state.workoutData, mesoIndex, targetWeek?.weekNumber || 1, activeDayNum - 1, ex);
                const prevSet = prevEx?.loggedSets?.[setIdx];

                const currentKg = parseFloat(ex.loggedSets[setIdx]?.weight) || 0;
                const currentReps = parseInt(ex.loggedSets[setIdx]?.reps, 10) || 0;
                const prevKg = prevSet ? parseFloat(prevSet.weight) || 0 : 0;
                const prevReps = prevSet ? parseInt(prevSet.reps) || 0 : 0;

                const trend = calculateSetVolumeTrend(
                    { weight: currentKg, reps: currentReps },
                    { weight: prevKg, reps: prevReps }
                );
                const isImproved = trend && trend.isPositive;

                if (isOut) {
                    target.style.borderColor = '#ef4444';
                    target.style.borderWidth = '2px';
                } else if (isExceeding || (isImproved && (isKg || isReps))) {
                    target.style.borderColor = '#16a34a';
                    target.style.borderWidth = '2px';
                } else {
                    target.style.borderColor = '#cbd5e1';
                    target.style.borderWidth = '1px';
                }
            }

            // Cancella il timer precedente se l'utente sta ancora digitando
            clearTimeout(window._syncTimeout);

            // Imposta un nuovo timer: salva i dati solo dopo 2000 millisecondi (2 secondi) di completa inattività
            window._syncTimeout = setTimeout(() => {
                saveAndSync(state.workoutData);
            }, 2000);
        });
    });

    workoutListContainer.querySelectorAll('.bar-select').forEach(select => {
        select.addEventListener('change', (e) => {
            updatePlatesBadgeUI(e.target.dataset.ex);
        });
    });

    workoutListContainer.querySelectorAll('.set-lock-check').forEach(chk => {
    chk.addEventListener('change', (e) => {
        const exIdx = parseInt(e.target.dataset.ex, 10);
        const setIdx = parseInt(e.target.dataset.set, 10);
        
        const ex = currentDay.exercises[exIdx];
        const setObj = ex?.loggedSets?.[setIdx];
        if (!setObj) return;

        const isChecked = e.target.checked;
        
        // 1. IMPOSTA SIA ISLOCKED CHE COMPLETED
        setObj.isLocked = isChecked;
        setObj.completed = isChecked; // <-- FONDAMENTALE PER LE ANALISI

        // 👈 2. AUTOCOMPILAZIONE DEI SET SUCCESSIVI (SE È IL 1° SET ED È SPUNTATO)
        if (setIdx === 0 && isChecked) {
            const firstSet = ex.loggedSets[0];
            for (let i = 1; i < ex.loggedSets.length; i++) {
                if (!ex.loggedSets[i].isLocked) {
                    ex.loggedSets[i].weight = firstSet.weight;
                    ex.loggedSets[i].reps = firstSet.reps;
                    ex.loggedSets[i].rpe = firstSet.rpe;
                }
            }
        }

        const rowCard = workoutListContainer.querySelector(`.exercise-card[data-ex="${exIdx}"]`);
        const kgInput = rowCard?.querySelector(`.set-kg[data-set="${setIdx}"]`);
        const repsInput = rowCard?.querySelector(`.set-reps[data-set="${setIdx}"]`);
        const rpeInput = rowCard?.querySelector(`.set-rpe[data-set="${setIdx}"]`);

        if (isChecked) {
            if (setObj.weight === undefined || setObj.weight === '') {
                const val = kgInput?.value || kgInput?.placeholder;
                if (val && val !== 'Kg') {
                    setObj.weight = parseFloat(val.replace(',', '.')) || 0;
                    if (kgInput) kgInput.value = setObj.weight;
                }
            }
            if (!setObj.reps) {
                const val = repsInput?.value || repsInput?.placeholder;
                if (val && val !== 'reps') {
                    setObj.reps = val;
                    if (repsInput) repsInput.value = setObj.reps;
                }
            }
            if (!setObj.rpe) {
                const val = rpeInput?.value || rpeInput?.placeholder;
                if (val && val !== 'RPE') {
                    setObj.rpe = val;
                    if (rpeInput) rpeInput.value = setObj.rpe;
                }
            }
        }

        // 2. MANTIENI ALLINEATO L'ARRAY ex.sets USATO DALLE ANALISI
        if (!ex.sets) ex.sets = [];
        ex.sets[setIdx] = { ...setObj };

        // 🚀 VALUTAZIONE STANCHEZZA IN TEMPO REALE CON MYCOATCH (UI NON BLOCCANTE)
        if (isChecked) {
            // Ricava il target stringa (es. "8-10" o "10")
            const targetStr = ex.minReps ? `${ex.minReps}-${ex.maxReps || ex.minReps}` : (ex.reps || '');
            evaluateFatigue(exIdx, targetStr, setObj.reps);
        } else {
            // Se l'utente sblocca la serie per modificarla, nascondiamo temporaneamente l'avviso
            const adviceBox = document.getElementById(`mycoach-advice-${exIdx}`);
            if (adviceBox) adviceBox.style.display = 'none';
        }

            if (rowCard) {
                const mesoIndex = state.activeMesocycleIndex || 0;
                const currentYear = new Date().getFullYear().toString();
                const yearData = state.workoutData?.history?.years?.[currentYear];
                const targetWeek = yearData?.mesocycles?.[mesoIndex]?.weeks?.find(w => w.weekNumber === (state.activeWeek || 1));
                const activeDayNum = state.activeDay || 1;
                const prevEx = findPreviousExercise(state.workoutData, mesoIndex, targetWeek?.weekNumber || 1, activeDayNum - 1, ex);

                rowCard.querySelectorAll('.set-input').forEach(inp => {
                    const sIdx = parseInt(inp.dataset.set, 10);
                    const isRowLocked = ex.loggedSets[sIdx]?.isLocked || false;
                    inp.disabled = isRowLocked;

                    const isKgField = inp.classList.contains('set-kg');
                    const isRepsField = inp.classList.contains('set-reps');
                    const isRpeField = inp.classList.contains('set-rpe');
                    let isOut = false;

                    if (isKgField) isOut = isValueOutOfRange(inp.value, ex.kgMin, ex.kgMax);
                    if (isRepsField) isOut = isValueOutOfRange(inp.value, ex.minReps || ex.reps, ex.maxReps || ex.reps);
                    if (isRpeField) {
                        const targetRpeStr = String(ex.targetRpe || ex.rpeTarget || ex.rpe || '').replace('@', '').trim();
                        const minRpe = ex.minRpe || (targetRpeStr.includes('-') ? targetRpeStr.split('-')[0] : targetRpeStr);
                        const maxRpe = ex.maxRpe || (targetRpeStr.includes('-') ? targetRpeStr.split('-')[1] : targetRpeStr);
                        isOut = isValueOutOfRange(parseRPE(inp.value), minRpe, maxRpe);
                    }

                    inp.classList.toggle('input-out-of-range', isOut);

                    const prevSet = prevEx?.loggedSets?.[sIdx];
                    const curKg = parseFloat(ex.loggedSets[sIdx]?.weight) || 0;
                    const curReps = parseInt(ex.loggedSets[sIdx]?.reps, 10) || 0;
                    const pKg = prevSet ? parseFloat(prevSet.weight) || 0 : 0;
                    const pReps = prevSet ? parseInt(prevSet.reps) || 0 : 0;
                    const t = calculateSetVolumeTrend({ weight: curKg, reps: curReps }, { weight: pKg, reps: pReps });
                    const improved = t && t.isPositive;

                    if (isOut) {
                        inp.style.borderColor = '#ef4444';
                        inp.style.borderWidth = '2px';
                    } else if (improved && (isKgField || isRepsField)) {
                        inp.style.borderColor = '#16a34a';
                        inp.style.borderWidth = '2px';
                    } else {
                        inp.style.borderColor = '#cbd5e1';
                        inp.style.borderWidth = '1px';
                    }
                });
            }

                        if (isChecked) {
                const isMiddleOfGroup = ex.groupType && !ex.isGroupLast;
                const isDropsetPlan = ex.isDropset || ex.groupType === 'dropset';
                const totalSets = ex.loggedSets?.length || ex.sets?.length || 1;
                const isLastSetOfExercise = setIdx === (totalSets - 1);

                // 🚀 NUOVO: Verifica se il singolo set corrente contiene una tecnica di intensità attiva di MyCoatch
                const hasIntensityTechnique = !!setObj.intensityTechnique;

                const notesLower = (ex.notes || '').toLowerCase();
                const hasRestBetweenExercises = notesLower.includes('pausa') || 
                                              notesLower.includes('fra uno') || 
                                              notesLower.includes('tra uno') || 
                                              notesLower.includes('riposo');

                // Se l'ultimo set prevede un Drop-Set o un Rest-Pause, escludiamo l'avvio del timer di recupero
                const shouldSkipTimer = (isMiddleOfGroup && !hasRestBetweenExercises) || 
                                        (isDropsetPlan && !isLastSetOfExercise) ||
                                        hasIntensityTechnique;

                if (!shouldSkipTimer) {
                    let rawRecovery = '';
                    for (const key of Object.keys(ex)) {
                        const lKey = key.toLowerCase();
                        if ((lKey.includes('rest') || lKey.includes('rec') || lKey.includes('tempo') || lKey.includes('pause') || lKey.includes('recupero')) && ex[key]) {
                            rawRecovery = ex[key];
                            break;
                        }
                    }

                    if (!rawRecovery || String(rawRecovery).trim() === '') {
                        rawRecovery = '1:30 min';
                        ex.rest = '1:30 min';
                    }

                    const recoveryTime = parseRecoveryTime(rawRecovery);
                    startTimer(recoveryTime, handleTick, handleComplete);
                }
            }


            updateSessionAndCompletionState(currentDay);
            updateSessionHeaderUI(currentDay, renderCallback);
            saveAndSync(state.workoutData);
            if (typeof renderCallback === 'function') renderCallback();
        });
    });
}