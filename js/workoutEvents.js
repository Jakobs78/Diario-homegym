/**
 * Module: workoutEvents.js
 * Summary: Associa gli eventi di input per la modifica in tempo reale di kg, reps, RPE e note utente, validando i range consentiti e applicando feedback visivi d'errore quando i valori escono dai parametri prescritti[cite: 25]. Gestisce il blocco delle serie (isLocked), la propagazione dei dati del primo set alle serie successive e l'avvio automatico del timer di recupero al completamento della serie[cite: 25].
 */
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { isValueOutOfRange } from './helpers.js';
import { startTimer, handleTick, handleComplete, parseRecoveryTime } from './timer.js';
import { updatePlatesBadgeUI } from './exerciseCard.js';
import { updateSessionAndCompletionState, updateSessionHeaderUI } from './sessionTimer.js';

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
            const exIdx = e.target.dataset.ex;
            const ex = currentDay.exercises[exIdx];
            if (!ex) return;

            if (e.target.classList.contains('ex-user-notes')) {
                ex.userNotes = e.target.value;
                saveAndSync(state.workoutData);
                return;
            }

            const setIdx = parseInt(e.target.dataset.set, 10);
            const setObj = ex.loggedSets?.[setIdx];
            if (!setObj) return;

            const val = e.target.value;
            const isKg = e.target.classList.contains('set-kg');
            const isReps = e.target.classList.contains('set-reps');
            const isRpe = e.target.classList.contains('set-rpe');

            if (isKg) {
                const raw = val.trim();
                setObj.weight = raw === '' ? '' : (parseFloat(raw.replace(',', '.')) || 0);
            }
            if (isReps) setObj.reps = val;
            if (isRpe) setObj.rpe = val;

            if (setIdx === 0 && isKg) {
                updatePlatesBadgeUI(exIdx);
            }

            if (isKg || isReps) {
                const minVal = isKg ? ex.kgMin : ex.minReps;
                const maxVal = isKg ? ex.kgMax : ex.maxReps;
                const parsedVal = isKg ? val.replace(',', '.') : val;

                if (isValueOutOfRange(parsedVal, minVal, maxVal)) {
                    e.target.style.setProperty('border', '2px solid #ef4444', 'important');
                    e.target.style.setProperty('background-color', '#fef2f2', 'important');
                    e.target.style.setProperty('color', '#dc2626', 'important');
                } else {
                    e.target.style.background = '#ffffff';
                    e.target.style.borderColor = '#cbd5e1';
                    e.target.style.color = '#0f172a';
                }
            }

            saveAndSync(state.workoutData);
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
            setObj.isLocked = isChecked;

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

            if (isChecked && setIdx === 0) {
                ['weight', 'reps', 'rpe'].forEach(prop => {
                    const val = setObj[prop];
                    if (val !== undefined && val !== null && val !== '') {
                        const targetClass = prop === 'weight' ? '.set-kg' : (prop === 'reps' ? '.set-reps' : '.set-rpe');
                        const setRows = workoutListContainer.querySelectorAll(`${targetClass}[data-ex="${exIdx}"]`);

                        setRows.forEach((rowInput, idx) => {
                            if (idx > 0 && (!ex.loggedSets[idx][prop])) {
                                rowInput.value = val;
                                ex.loggedSets[idx][prop] = val;
                            }
                        });
                    }
                });
            }

            if (rowCard) {
                rowCard.querySelectorAll('.set-input').forEach(inp => {
                    const sIdx = parseInt(inp.dataset.set, 10);
                    const isRowLocked = ex.loggedSets[sIdx]?.isLocked || false;
                    inp.disabled = isRowLocked;

                    const isKgField = inp.classList.contains('set-kg');
                    const isRepsField = inp.classList.contains('set-reps');
                    let isOut = false;

                    if (isKgField) isOut = isValueOutOfRange(inp.value, ex.kgMin, ex.kgMax);
                    if (isRepsField) isOut = isValueOutOfRange(inp.value, ex.minReps, ex.maxReps);

                    if (isOut) {
                        inp.style.setProperty('border', '2px solid #ef4444', 'important');
                        inp.style.setProperty('background-color', '#fef2f2', 'important');
                        inp.style.setProperty('color', '#dc2626', 'important');
                    } else {
                        inp.style.background = isRowLocked ? '#f1f5f9' : '#ffffff';
                        inp.style.borderColor = '#cbd5e1';
                        inp.style.color = '#0f172a';
                    }
                });
            }

           if (isChecked) {
                const isMiddleOfGroup = ex.groupType && !ex.isGroupLast;
                const isDropset = ex.isDropset || ex.groupType === 'dropset';
                const totalSets = ex.loggedSets?.length || ex.sets?.length || 1;
                const isLastSetOfExercise = setIdx === (totalSets - 1);

                // Controlla se nelle note il coach ha specificato una pausa tra gli esercizi
                const notesLower = (ex.notes || '').toLowerCase();
                const hasRestBetweenExercises = notesLower.includes('pausa') || 
                                              notesLower.includes('fra uno') || 
                                              notesLower.includes('tra uno') || 
                                              notesLower.includes('riposo');

                // Se c'è l'istruzione di pausa tra un esercizio e l'altro, non saltiamo il timer
                const shouldSkipTimer = (isMiddleOfGroup && !hasRestBetweenExercises) || (isDropset && !isLastSetOfExercise);

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
                        rawRecovery = '1:30 min'; // Precompila con 1:30 se vuoto
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