/**
 * Module: workoutEvents.js
 * Summary: Associa gli eventi di input per la modifica in tempo reale di kg, reps, RPE e note utente, validando i range consentiti, applicando feedback visivi d'errore o di miglioramento e gestendo il blocco delle serie.
 */
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { isValueOutOfRange, isValueExceedingTarget, findPreviousExercise, calculateSetVolumeTrend, parseRPE, checkFatigueAlert } from './helpers.js';
import { startTimer, handleTick, handleComplete, parseRecoveryTime } from './timer.js';
import { updatePlatesBadgeUI } from './exerciseCard.js';
import { updateSessionAndCompletionState, updateSessionHeaderUI } from './sessionTimer.js';


function updateInputStatusClasses(element, isOut, isImprovedOrExceeding) {
    element.classList.remove('input-out-of-range', 'input-improved', 'input-normal');
    if (isOut) {
        element.classList.add('input-out-of-range');
    } else if (isImprovedOrExceeding) {
        element.classList.add('input-improved');
    } else {
        element.classList.add('input-normal');
    }
}

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

                const mesoIndex = state.activeMesocycleIndex || 0;
                const currentYear = new Date().getFullYear().toString();
                const yearData = state.workoutData?.history?.years?.[currentYear];
                const targetWeek = yearData?.mesocycles?.[mesoIndex]?.weeks?.find(w => w.weekNumber === (state.activeWeek || 1));
                const activeDayNum = state.activeDay || 1;
                const prevEx = findPreviousExercise(state.workoutData, mesoIndex, targetWeek?.weekNumber || 1, activeDayNum - 1, ex, true);
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

                updateInputStatusClasses(target, isOut, isExceeding || (isImproved && (isKg || isReps)));
            }

            clearTimeout(window._syncTimeout);
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
            
            setObj.isLocked = isChecked;
            setObj.completed = isChecked;

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
            
            const rowCard = workoutListContainer.querySelector(`.ex-card[data-ex="${exIdx}"], .exercise-card[data-ex="${exIdx}"]`);
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

            if (!ex.sets) ex.sets = [];
            ex.sets[setIdx] = { ...setObj };

            checkFatigueAlert(ex, setIdx);

            // 2. Aggiornamento dinamico delle classi e dei trend per ogni riga
            if (rowCard) {
                const mesoIndex = state.activeMesocycleIndex || 0;
                const currentYear = new Date().getFullYear().toString();
                const yearData = state.workoutData?.history?.years?.[currentYear];
                const targetWeek = yearData?.mesocycles?.[mesoIndex]?.weeks?.find(w => w.weekNumber === (state.activeWeek || 1));
                const activeDayNum = state.activeDay || 1;
                const prevEx = findPreviousExercise(state.workoutData, mesoIndex, targetWeek?.weekNumber || 1, activeDayNum - 1, ex, true);

                rowCard.querySelectorAll('.set-input').forEach(inp => {
                    const sIdx = parseInt(inp.dataset.set, 10);
                    const setObj = ex.loggedSets[sIdx];
                    const isRowLocked = setObj?.isLocked || setObj?.completed || false;
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

                    const prevSet = prevEx?.loggedSets?.[sIdx];
                    const isCurrentConfirmed = Boolean(setObj?.isLocked || setObj?.completed);
                    const isPrevConfirmed = Boolean(prevSet?.isLocked || prevSet?.completed);

                    const curKg = isCurrentConfirmed ? (parseFloat(setObj?.weight) || 0) : 0;
                    const curReps = isCurrentConfirmed ? (parseInt(setObj?.reps, 10) || 0) : 0;
                    const pKg = isPrevConfirmed ? (parseFloat(prevSet?.weight) || 0) : 0;
                    const pReps = isPrevConfirmed ? (parseInt(prevSet?.reps, 10) || 0) : 0;

                    const t = (isCurrentConfirmed && isPrevConfirmed) ? calculateSetVolumeTrend({ weight: curKg, reps: curReps }, { weight: pKg, reps: pReps }) : null;
                    const improved = t && t.isPositive;

                    updateInputStatusClasses(inp, isOut, improved && (isKgField || isRepsField));
                });
            }

            if (isChecked) {
                const isMiddleOfGroup = ex.groupType && !ex.isGroupLast;
                const isDropsetPlan = ex.isDropset || ex.groupType === 'dropset';
                const totalSets = ex.loggedSets?.length || ex.sets?.length || 1;
                const isLastSetOfExercise = setIdx === (totalSets - 1);
                const hasIntensityTechnique = !!setObj.intensityTechnique;

                const notesLower = (ex.notes || '').toLowerCase();
                const hasRestBetweenExercises = notesLower.includes('pausa') || 
                                              notesLower.includes('fra uno') || 
                                              notesLower.includes('tra uno') || 
                                              notesLower.includes('riposo');

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