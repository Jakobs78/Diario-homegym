import {isExerciseSkipped,sessionWorkCounts} from './sessionSkip.js';
import {bindSessionSkip} from './sessionSkipUI.js';
import {setPrescription} from '../mycoatch/setPrescription.js';
import {advanceExercise} from './activeExercise.js';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
import {hasDropPrescription,needsDropScope,validateDropSegments} from './trainingTechniques.js';
import {bindDropFields} from './dropSetUI.js';
/**
 * Module: workoutEvents.js
 * Summary: Associa gli eventi di input per la modifica in tempo reale di kg, reps, RPE e note utente, validando i range consentiti, applicando feedback visivi d'errore o di miglioramento e gestendo il blocco delle serie.
 */
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { isValueOutOfRange, isValueExceedingTarget, findPreviousExercise, calculateSetVolumeTrend, parseRPE } from './helpers.js';
import { startTimer, stopTimer, handleTick, handleComplete, parseRecoveryTime } from './timer.js';
import { shouldStartRecoveryTimer, hasPendingWorkingSets, isCircuit, circuitMembers, currentCircuitRound, recoveryExercise } from './restPolicy.js';
import { updatePlatesBadgeUI } from './exerciseCard.js';
import { updateSessionAndCompletionState, updateSessionHeaderUI } from './sessionTimer.js';
import { validateCompletedSet } from '../mycoatch/liveCoach.js';
import { stepRpe } from './rpeStepper.js';
import { stepReps } from './repsStepper.js';
import { updateLiveCoachPanel, showLiveCoachInputError, showLiveCoachToast } from './liveCoachUI.js';


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
    bindSessionSkip(workoutListContainer,currentDay,isPastMeso,renderCallback);
    bindDropFields(workoutListContainer,currentDay,{readOnly:isPastMeso,save:()=>saveAndSync(state.workoutData),render:renderCallback});

    // Only the editable perceived RPE changes. Keep MyCoatch's prescription unchanged.
    workoutListContainer.querySelectorAll('.rpe-step-btn').forEach(button => {
        button.addEventListener('click', () => {
            if (isPastMeso || button.disabled) return;
            const exIdx = Number(button.dataset.ex);
            const setIdx = Number(button.dataset.set);
            const ex = currentDay.exercises?.[exIdx];
            const set = ex?.loggedSets?.[setIdx];
            if (!set || set.isLocked || set.completed) return;
            const input = workoutListContainer.querySelector(
                '.set-rpe[data-ex="' + exIdx + '"][data-set="' + setIdx + '"]');
            if (!input || input.disabled) return;
            const target = ex?.sets?.[setIdx]?.targetRpe ?? ex?.targetRpe ?? ex?.rpeTarget ?? ex?.rpe;
            const changed = stepRpe(input.value, Number(button.dataset.direction), target);
            if (changed === null) return;
            input.value = changed;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });

    // Adjust only the editable repetition result, not the set prescription.
    // Reuse the same input event as manual edits for validation, coaching
    // feedback and debounced persistence; never auto-confirm a set.
    workoutListContainer.querySelectorAll('.reps-step-btn').forEach(button => {
        button.addEventListener('click', () => {
            if (isPastMeso || button.disabled) return;
            const exIdx=Number(button.dataset.ex);
            const setIdx=Number(button.dataset.set);
            const ex=currentDay.exercises?.[exIdx];
            const set=ex?.loggedSets?.[setIdx];
            if (!set || set.isLocked || set.completed) return;
            const input=workoutListContainer.querySelector(
                '.set-reps[data-ex="' + exIdx + '"][data-set="' + setIdx + '"]');
            if (!input || input.disabled) return;
            const prescribed=ex?.sets?.[setIdx]?.targetReps ?? ex?.reps ?? ex?.targetReps;
            const changed=stepReps(input.value,Number(button.dataset.direction),prescribed);
            if (changed===null) return;
            input.value=changed;
            input.dispatchEvent(new Event('input',{bubbles:true}));
        });
    });

    workoutListContainer.querySelectorAll('.set-input, .ex-user-notes').forEach(input => {
        input.addEventListener('input',()=>{if(input.classList.contains('set-rpe'))input.dataset.edited='true';});
        input.addEventListener('focus', (e) => e.target.select());
        if(input.classList.contains('ex-user-notes'))input.addEventListener('blur',()=>{
            const ex=currentDay.exercises?.[input.dataset.ex];
            if(isExerciseSkipped(ex)&&!input.value.trim()){
                input.value=ex.userNotes||'';input.setCustomValidity('');input.setAttribute('aria-invalid','false');
            }
        });

        input.addEventListener('input', (e) => {
            const target = e.target;
            const exIdx = target.dataset.ex;
            const ex = currentDay.exercises[exIdx];
            if (!ex) return;
            const notes=target.classList.contains('ex-user-notes');
            if(isPastMeso&&!(notes&&isExerciseSkipped(ex)))return;

            if (notes) {
                const invalid=isExerciseSkipped(ex)&&!target.value.trim();
                target.setCustomValidity(invalid?'Il motivo dell’esclusione deve restare nelle note personali.':'');
                target.setAttribute('aria-invalid',String(invalid));
                if(invalid)return;
                ex.userNotes = target.value;
                updateLiveCoachPanel(currentDay,{readOnly:isPastMeso});
                saveAndSync(state.workoutData);
                return;
            }

            const setIdx = parseInt(target.dataset.set, 10);
            const setObj = ex.loggedSets?.[setIdx];
            if (!setObj||isExerciseSkipped(ex)) return;

            const val = target.value;
            const isKg = target.classList.contains('set-kg');
            const isReps = target.classList.contains('set-reps');
            const isRpe = target.classList.contains('set-rpe');

            setObj.manualFields ||= {};
            if(isKg||isReps||isRpe)setObj.manualFields[isKg?'weight':isReps?'reps':'rpe']=true;
            if (isKg) {
                const raw = val.trim();
                setObj.weight = raw === '' ? '' : (parseFloat(raw.replace(',', '.')) || 0);
            }
            if (isReps) setObj.reps = val;
            if (isRpe) {setObj.rpe = val;setObj.rpeSource=val.trim()===''?'unknown':'athlete_edited';}
            // Un valore modificato non deve apparire ancora come suggerimento.
            if (isKg || isReps || isRpe) target.classList.remove('text-placeholder-active');

            if (isKg) updatePlatesBadgeUI(exIdx);

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
                    const targetRpeStr = String(setPrescription(ex,Number(setIdx)).rpe?.max ?? ex.targetRpe ?? ex.rpeTarget ?? ex.rpe ?? '').replace('@', '').trim();
                    minVal = ex.minRpe || (targetRpeStr.includes('-') ? targetRpeStr.split('-')[0] : targetRpeStr);
                    maxVal = ex.maxRpe || (targetRpeStr.includes('-') ? targetRpeStr.split('-')[1] : targetRpeStr);
                    parsedVal = parseRPE(val);
                }

                const isOut = isRpe ? (parsedVal!==null&&parsedVal!==''&&(Number(parsedVal)<5||Number(parsedVal)>10||(maxVal!==''&&Number(parsedVal)>Number(maxVal)))) : isValueOutOfRange(parsedVal, minVal, maxVal);
                const isExceeding = !isRpe && isValueExceedingTarget(parsedVal, minVal, maxVal);

                const mesoIndex = state.activeMesocycleIndex || 0;
                const currentYear = String(state.currentYear || new Date().getFullYear());
                const yearData = state.workoutData?.history?.years?.[currentYear];
                const targetWeek = yearData?.mesocycles?.[mesoIndex]?.weeks?.find(w => w.weekNumber === (state.activeWeek || 1));
                const activeDayNum = state.activeDay || 1;
                const prevEx = findPreviousExercise(state.workoutData, mesoIndex, targetWeek?.weekNumber || 1, activeDayNum - 1, ex, false, state.currentYear);
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

            updateLiveCoachPanel(currentDay, { readOnly: isPastMeso });
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

    workoutListContainer.querySelectorAll('.set-warmup-toggle').forEach(button=>{
        button.addEventListener('click',event=>{
            if(isPastMeso)return;
            event.stopPropagation();
            const exIdx=Number(button.dataset.ex),setIdx=Number(button.dataset.set);
            const set=currentDay.exercises?.[exIdx]?.loggedSets?.[setIdx];
            if(!set||isExerciseSkipped(currentDay.exercises?.[exIdx]))return;
            const wasWarm=Boolean(set.isWarmup||set.warmup||set.is_warmup);
            set.isWarmup=!wasWarm;
            delete set.warmup;delete set.is_warmup;
            // A completed warm-up remains in the diary; removing W never
            // silently checks an unfinished working set.
            updateSessionAndCompletionState(currentDay);
            saveAndSync(state.workoutData);
            if(typeof renderCallback==='function')renderCallback();
        });
    });

    workoutListContainer.querySelectorAll('.set-lock-check').forEach(chk => {
        chk.addEventListener('change', (e) => {
            if (isPastMeso) { e.target.checked = !e.target.checked; return; }
            const exIdx = parseInt(e.target.dataset.ex, 10);
            const setIdx = parseInt(e.target.dataset.set, 10);
            
            const ex = currentDay.exercises[exIdx];
            const setObj = ex?.loggedSets?.[setIdx];
            if (!setObj) return;
            if(isExerciseSkipped(ex)){e.target.checked=Boolean(setObj.isLocked||setObj.completed);return;}

            const isChecked = e.target.checked;
            const wasSessionFinished=sessionWorkCounts(currentDay).finished;
            const rowCard = workoutListContainer.querySelector(`.ex-card[data-ex="${exIdx}"], .exercise-card[data-ex="${exIdx}"]`);
            const kgInput = rowCard?.querySelector(`.set-kg[data-set="${setIdx}"]`);
            const repsInput = rowCard?.querySelector(`.set-reps[data-set="${setIdx}"]`);
            const rpeInput = rowCard?.querySelector(`.set-rpe[data-set="${setIdx}"]`);

            if (isChecked) {
                if(isCircuit(ex) && setIdx!==currentCircuitRound(circuitMembers(currentDay,ex))){
                    e.target.checked=false;showLiveCoachInputError('Completa prima il giro corrente del gruppo.');return;
                }
                if(needsDropScope(ex)){
                    e.target.checked=false;showLiveCoachInputError('Specifica prima se il dropset è solo sull’ultima serie o su ogni serie.');return;
                }
                // Il checkbox attesta l'intera riga, anche senza editare i campi.
                // Kg/reps/RPE precompilati restano suggerimenti finche' non si spunta ✓.
                // MyCoatch considera solo set isLocked/completed confermati.
                const entered = {
                    weight: kgInput?.value ?? setObj.weight,
                    reps: repsInput?.value ?? setObj.reps,
                    rpe: rpeInput?.value ?? setObj.rpe ?? ''
                };
                const validation = validateCompletedSet(entered, ex, setObj);
                if (!validation.ok) {
                    e.target.checked = false;
                    showLiveCoachInputError(validation.message);
                    if (!entered.weight) kgInput?.focus();
                    else repsInput?.focus();
                    return;
                }
                if(hasDropPrescription(ex,setIdx)){
                    if(!/^\d{1,2}$/.test(String(validation.reps))){
                        e.target.checked=false;showLiveCoachInputError('Inserisci nella riga base solo le sue ripetizioni; registra gli scarichi nei campi sottostanti.');return;
                    }
                    const drops=validateDropSegments(validation.weight,setObj.dropSegments,setObj.dropSkipped);
                    if(!drops.ok){e.target.checked=false;showLiveCoachInputError(drops.message);return;}
                    setObj.dropSegments=drops.segments;setObj.dropSkipped=drops.skipped;
                    if(!drops.skipped)setObj.intensityTechnique='DROP_SET';
                    else if(setObj.intensityTechnique==='DROP_SET')delete setObj.intensityTechnique;
                }
                setObj.weight = validation.weight;
                setObj.reps = validation.reps;
                setObj.rpe = validation.rpe === null ? '' : validation.rpe;
                // Metadato JSONB nello storico esistente; nessuna migrazione DB.
                setObj.performedAt ||= setObj.completedAt || currentDay.sessionDate || currentDay.date || new Date().toISOString();
                setObj.completedAt ||= setObj.performedAt;
                setObj.recordedAt ||= new Date().toISOString();
                setObj.updatedAt = new Date().toISOString();
                setObj.rpeSource = validation.rpe === null ? 'unknown' : (rpeInput?.dataset.edited==='true'||setObj.rpeSource==='athlete_edited') ? 'athlete_edited' : 'athlete_accepted';
                const selectedBar=rowCard?.querySelector('.bar-select')?.value?.split('|');
                const recordedBar=selectedBar?.length===2 && Number(selectedBar[0])>0 ? {weight:Number(selectedBar[0]),diameter:selectedBar[1]} : state.workoutData?.athlete?.barbellAssignments?.[canonicalExerciseKey(ex.name)] || ex.barbell || null;
                setObj.equipmentSnapshot ||= {barbell:structuredClone(recordedBar),station:state.workoutData?.athlete?.stationConfigurations?.machine||null,weightConvention:/manubr/i.test(ex.name)?'single_dumbbell':'total_external_load'};
                if (kgInput) kgInput.value = String(setObj.weight);
                if (repsInput) repsInput.value = String(setObj.reps);
                if (rpeInput) rpeInput.value = String(setObj.rpe);

            } else {
                setObj.updatedAt = new Date().toISOString();
            }

            setObj.isLocked = isChecked;
            setObj.completed = isChecked;
            // ex.sets is the original prescription; performed sets are held
            // only in loggedSets. Never overwrite MyCoatch's plan on check.

            // 2. Aggiornamento dinamico delle classi e dei trend per ogni riga
            if (rowCard) {
                const mesoIndex = state.activeMesocycleIndex || 0;
                const currentYear = String(state.currentYear || new Date().getFullYear());
                const yearData = state.workoutData?.history?.years?.[currentYear];
                const targetWeek = yearData?.mesocycles?.[mesoIndex]?.weeks?.find(w => w.weekNumber === (state.activeWeek || 1));
                const activeDayNum = state.activeDay || 1;
                const prevEx = findPreviousExercise(state.workoutData, mesoIndex, targetWeek?.weekNumber || 1, activeDayNum - 1, ex, false, state.currentYear);

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
                        const targetRpeStr = String(setPrescription(ex,sIdx).rpe?.max ?? ex.targetRpe ?? ex.rpeTarget ?? ex.rpe ?? '').replace('@', '').trim();
                        const maxRpe = ex.maxRpe || (targetRpeStr.includes('-') ? targetRpeStr.split('-')[1] : targetRpeStr);
                        const actual=parseRPE(inp.value);
                        isOut = actual!=='' && (Number(actual)<5||Number(actual)>10||(maxRpe!==''&&Number(actual)>Number(maxRpe)));
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
                const totalSets = ex.loggedSets?.length || ex.sets?.length || 1;
                const startRecovery = !(setObj.isWarmup||setObj.warmup||setObj.is_warmup) &&
                    hasPendingWorkingSets(currentDay) &&
                    shouldStartRecoveryTimer(ex, setObj, setIdx, totalSets,currentDay);

                if (startRecovery) {
                    const restSource=recoveryExercise(currentDay,ex);
                    let rawRecovery = '';
                    for (const key of Object.keys(restSource)) {
                        const lKey = key.toLowerCase();
                        if ((lKey.includes('rest') || lKey.includes('rec') || lKey.includes('tempo') || lKey.includes('pause') || lKey.includes('recupero')) && restSource[key]) {
                            rawRecovery = restSource[key];
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
            if(currentDay.completed)stopTimer();
            updateSessionHeaderUI(currentDay, renderCallback, isPastMeso);
            updateLiveCoachPanel(currentDay, { readOnly: isPastMeso });
            saveAndSync(state.workoutData);
            if(isChecked)advanceExercise(currentDay,exIdx);
            if (typeof renderCallback === 'function') renderCallback();
            // Dopo il render aggiorna i consigli inline; a fine seduta apre il report.
            // I popup restano riservati agli errori di registrazione.
            if (isChecked && !isPastMeso) {
                showLiveCoachToast(currentDay, { revealSummary:!wasSessionFinished&&currentDay.completed });
            }
        });
    });
}
