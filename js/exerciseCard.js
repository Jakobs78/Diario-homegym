/**
 * Module: exerciseCard.js
 * Summary: Genera dinamicamente le card per ogni esercizio gestendo lo stato di esclusione dai massimali, i selettori del bilanciere, il calcolo dei dischi per lato e l'evidenziatura automatica fuori target per KG (inclusi Topset), REPS ed RPE (con supporto al feedback verde di miglioramento).
 */

import { formatExerciseSummary, getPlateBreakdown, findPreviousExercise, isValueOutOfRange, calculateSetVolumeTrend, isValueExceedingTarget, parseRPE, checkFatigueAlert } from './helpers.js';
import { state } from './state.js';
import { enableCardSwipeGesture } from './gestures.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList } from './ui.js';
import { analyzeUserHistory, generateNextSessionReminder, evaluateRealTimePerformance } from '../mycoatch/autoregulation.js';

export function createSingleExerciseCard(ex, exIdx, currentDay, mesoIndex, targetWeek, activeDayNum, isPastMeso) {
    const isExExcluded = ex.isExcluded || false;
    const isDropsetPlan = ex.isDropset || false;
    const isFirstWeek = targetWeek.weekNumber === 1;

    const exCard = document.createElement('div');
    exCard.className = `ex-card ${isExExcluded ? 'is-excluded' : ''} ${isDropsetPlan ? 'is-dropset' : ''}`;
    exCard.dataset.ex = exIdx;

    // --- 1. Analisi MyCoach & Promemoria Dinamico ---
    let reminderHtml = '';
    if (ex.history || ex.loggedSets) {
        const exerciseHistory = ex.history || [];
        const lastAnalysis = analyzeUserHistory(exerciseHistory);
        const reminder = generateNextSessionReminder(lastAnalysis, {
            isIsolation: ex.isIsolation || false
        });

        if (reminder) {
            const themeClass = reminder.type?.startsWith('STRENGTH') 
                ? 'strength-theme' 
                : (reminder.type?.startsWith('HYPERTROPHY') ? 'hypertrophy-theme' : 'warning-theme');

            reminderHtml = `
                <div class="mycoach-reminder-box ${themeClass} mb-md">
                    <div class="reminder-badge">${reminder.badge}</div>
                    <p class="reminder-text">${reminder.prompt}</p>
                </div>
            `;
        }
    }

    let cardHtml = `
        <div class="ex-card-header flex-between mb-sm">
            <div class="flex-center gap-md">
                <div class="block-title m-0">BLOCCO ${ex.block || (exIdx + 1)}</div>
                ${isDropsetPlan ? '<span class="badge-dropset">🔥 DROP SET</span>' : ''}
                ${!isExExcluded ? '<span class="text-xs text-muted flex-italic">(Doppio click o swipe per escludere)</span>' : ''}
            </div>
            ${isExExcluded ? '<span class="badge-danger">ESCLUSO DAI MASSIMALI</span>' : ''}
        </div>
        
        <!-- Nome Esercizio in primo piano -->
        <h3 class="ex-name mb-md">${exIdx + 1}. ${ex.name}</h3>
        
        <!-- Promemoria dinamico MyCoach -->
        ${reminderHtml}
    `;

    const prevExercise = findPreviousExercise(state.workoutData, mesoIndex, targetWeek.weekNumber, activeDayNum - 1, ex, true);
    let lastSessionSetsHtml = '';

    if (prevExercise && prevExercise.loggedSets && prevExercise.loggedSets.length > 0) {
        const validSets = prevExercise.loggedSets.filter(s => s.weight || s.reps);
        
        if (validSets.length > 0) {
            const rangeStr = (prevExercise.minReps && prevExercise.maxReps) 
                ? `${prevExercise.minReps}-${prevExercise.maxReps}`
                : ((typeof prevExercise.reps === 'string' && prevExercise.reps.includes('-')) ? prevExercise.reps : null);

            lastSessionSetsHtml = validSets.map((s, idx) => {
                const kg = s.weight ? `${s.weight}kg` : '-';
                let repsFormatted = rangeStr 
                    ? ((s.reps && s.reps !== rangeStr) ? `${s.reps} reps (target ${rangeStr})` : `${rangeStr} reps`)
                    : `${s.reps || prevExercise.reps || '-'} reps`;
                const rpeFormatted = s.rpe ? `, con ${s.rpe} rpe` : '';

                return `<div class="text-xs mt-xs"><strong>${idx + 1}° set:</strong> ${kg}, ${repsFormatted}${rpeFormatted}</div>`;
            }).join('');
        }
    }

    if (ex.notes || lastSessionSetsHtml) {
        cardHtml += `<div class="exercise-notes-box mb-md">`;
        if (ex.notes) {
            cardHtml += `
                <div class="note-allenatore-title">NOTE ALLENATORE</div>
                <div class="note-allenatore-text ${lastSessionSetsHtml ? 'mb-sm' : ''}">${ex.notes}</div>
            `;
        }
        if (lastSessionSetsHtml) {
            const divider = ex.notes ? `<div class="divider-line my-sm"></div>` : '';
            cardHtml += `
                ${divider}
                <div class="history-title mb-xs">ULTIMA SESSIONE PRECEDENTE</div>
                <div class="history-content">${lastSessionSetsHtml}</div>
            `;
        }
        cardHtml += `</div>`;
    }

    cardHtml += `
        <!-- Box Target -->
        <div class="target-box mb-md">
            <strong>TARGET:</strong> ${formatExerciseSummary(ex)}
        </div>

        <!-- 2. Selettore Bilanciere e Dischi -->
        <div class="bar-plates-container mb-md">
            <div class="flex-center gap-md">
                <span class="bar-select-label">BILANCIERE:</span>
                <select class="bar-select flex-1" data-ex="${exIdx}" ${isPastMeso ? 'disabled' : ''}>
                    <option value="20">Bil 20kg</option>
                    <option value="15">Bil 15kg</option>
                    <option value="12">Bil 12kg</option>
                    <option value="10">Bil 10kg</option>
                    <option value="9">Bil 9kg</option>
                    <option value="6">Bil 6kg</option>
                </select>
            </div>
    
            <div class="plates-badge flex-between gap-sm" data-ex="${exIdx}">
                <span class="plates-label">🏋️️ CARICO PER LATO:</span>
                <div class="plates-content flex-center gap-xs">
                    0 kg
                </div>
            </div>
        </div>
    `;

    cardHtml += `
        <!-- 3. Tabella Serie Riorganizzata -->
        <table class="set-table mb-md">
            <thead>
                <tr>
                    <th class="col-set">SET</th>
                    <th class="col-kg">KG</th>
                    <th class="col-reps">REPS</th>
                    <th class="col-rpe">RPE</th>
                    <th class="col-check">✓</th>
                </tr>
            </thead>
            <tbody>
    `;

    (ex.loggedSets || []).forEach((setObj, setIdx) => {
        const isLocked = setObj.isLocked || setObj.completed || false;
        const isDisabled = isLocked || isPastMeso;

        const prevSet = isFirstWeek ? null : prevExercise?.loggedSets?.[setIdx];

        const isCurrentSetConfirmed = Boolean(setObj.isLocked || setObj.completed);
        const isPrevSetConfirmed = Boolean(prevSet?.isLocked || prevSet?.completed);

        const parseRepsSafe = (val) => {
            if (!val) return 0;
            const match = String(val).match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
        };

        const currentKg = isCurrentSetConfirmed ? (parseFloat(String(setObj.weight || 0).replace(',', '.')) || 0) : 0;
        const currentReps = isCurrentSetConfirmed ? parseRepsSafe(setObj.reps) : 0;

        const prevKg = isPrevSetConfirmed ? (parseFloat(String(prevSet?.weight || prevSet?.kg || 0).replace(',', '.')) || 0) : 0;
        const prevReps = isPrevSetConfirmed ? parseRepsSafe(prevSet?.reps) : 0;

        let trendHtml = '';
        if (!isFirstWeek && isCurrentSetConfirmed && isPrevSetConfirmed && currentKg > 0 && currentReps > 0 && prevKg > 0 && prevReps > 0) {
            const trend = calculateSetVolumeTrend(
                { weight: currentKg, reps: currentReps }, 
                { weight: prevKg, reps: prevReps }
            );

            if (trend) {
                const trendClass = trend.isPositive ? 'text-success' : 'text-danger';
                trendHtml = `<span class="${trendClass} text-xs font-bold whitespace-nowrap">${trend.text}</span>`;
            }
        }
        
        const isRangeTarget = (ex.minReps && ex.maxReps) || (typeof ex.reps === 'string' && ex.reps.includes('-'));
        const rawTargetReps = ex.reps || ex.targetReps || '';
        const defaultTargetReps = isRangeTarget 
            ? rawTargetReps 
            : rawTargetReps.toString().trim();

        const targetWeightDefault = (ex.kgMin && ex.kgMax && ex.kgMin !== ex.kgMax) 
            ? `${ex.kgMin}-${ex.kgMax}` 
            : (ex.kgMin || ex.kgMax || ex.topset || ex.weight || '');

        const displayWeight = setObj.weight !== undefined && setObj.weight !== '' 
            ? setObj.weight 
            : (isFirstWeek ? targetWeightDefault : (prevSet?.weight || ''));

        const displayReps = setObj.reps !== undefined && setObj.reps !== '' 
            ? setObj.reps 
            : (isFirstWeek ? defaultTargetReps : (prevSet?.reps || defaultTargetReps));

        const defaultTargetRpe = ex.targetRpe || ex.rpe || '';
        const displayRpe = setObj.rpe !== undefined && setObj.rpe !== '' 
            ? setObj.rpe 
            : (isFirstWeek ? defaultTargetRpe : (prevSet?.rpe || defaultTargetRpe));

        let currentKgMin = ex.kgMin;
        let currentKgMax = ex.kgMax;

        if ((setIdx === 0 || setObj.isTopset) && (ex.topsetKgMin || ex.topsetKgMax || ex.topsetKg)) {
            currentKgMin = ex.topsetKgMin || ex.topsetKg;
            currentKgMax = ex.topsetKgMax || ex.topsetKg;
        }

        const isKgOutOfRange = isValueOutOfRange(displayWeight, currentKgMin, currentKgMax);
        const isKgExceeding = isValueExceedingTarget(displayWeight, currentKgMin, currentKgMax);

        const isRepsOutOfRange = isValueOutOfRange(displayReps, ex.minReps || ex.reps, ex.maxReps || ex.reps);
        const isRepsExceeding = isValueExceedingTarget(displayReps, ex.minReps || ex.reps, ex.maxReps || ex.reps);

        const targetRpeStr = String(ex.targetRpe || ex.rpeTarget || ex.rpe || '').replace('@', '').trim();
        let minRpe = ex.minRpe;
        let maxRpe = ex.maxRpe;
        if (!minRpe && !maxRpe && targetRpeStr.includes('-')) {
            const parts = targetRpeStr.split('-');
            minRpe = parts[0];
            maxRpe = parts[1];
        } else if (!minRpe && !maxRpe && targetRpeStr) {
            minRpe = targetRpeStr;
            maxRpe = targetRpeStr;
        }

        const cleanDisplayRpe = parseRPE(displayRpe);
        const isRpeOutOfRange = isValueOutOfRange(cleanDisplayRpe, minRpe, maxRpe);
        const isRpeExceeding = isValueExceedingTarget(cleanDisplayRpe, minRpe, maxRpe);

        const kgClass = isKgOutOfRange ? 'input-out-of-range' : (isKgExceeding ? 'input-target-exceeded' : '');
        const repsClass = isRepsOutOfRange ? 'input-out-of-range' : (isRepsExceeding ? 'input-target-exceeded' : '');
        const rpeClass = isRpeOutOfRange ? 'input-out-of-range' : (isRpeExceeding ? 'input-target-exceeded' : '');

        const isUnsavedKg = (!setObj.weight && displayWeight && !isLocked);
        const isUnsavedReps = (!setObj.reps && displayReps && !isLocked);
        const isUnsavedRpe = (!setObj.rpe && displayRpe && !isLocked);

        let intensityBadgeHtml = '';
        if (setObj.intensityTechnique) {
            const isDrop = setObj.intensityTechnique === 'DROP_SET';
            intensityBadgeHtml = `<span class="badge-tech ${isDrop ? 'tech-drop' : 'tech-rpause'}">${isDrop ? 'DROP' : 'R-PAUSE'}</span>`;
        }

        cardHtml += `
            <tr>
                <td class="td-set flex-column flex-center">
                    <span class="font-bold text-sm">${setIdx + 1}</span>
                    ${intensityBadgeHtml}
                </td>
                <td class="td-input td-kg-container">
                    <div class="kg-input-wrapper flex-column flex-center">
                        <input type="text" inputmode="decimal" autocomplete="off" class="set-input set-kg ios-no-zoom ${kgClass} ${isUnsavedKg ? 'text-placeholder-active' : ''}" data-ex="${exIdx}" data-set="${setIdx}" value="${displayWeight}" placeholder="${targetWeightDefault || 'Kg'}" ${isDisabled ? 'disabled' : ''}>
                        ${trendHtml ? `<div class="set-trend-badge">${trendHtml}</div>` : ''}
                    </div>
                </td>
                <td class="td-input">
                    <input type="text" inputmode="numeric" autocomplete="off" class="set-input set-reps ios-no-zoom ${repsClass} ${isUnsavedReps ? 'text-placeholder-active' : ''}" data-ex="${exIdx}" data-set="${setIdx}" value="${displayReps}" placeholder="${defaultTargetReps || 'reps'}" ${isDisabled ? 'disabled' : ''}>
                </td>
                <td class="td-input">
                    <input type="text" inputmode="decimal" autocomplete="off" class="set-input set-rpe ios-no-zoom ${rpeClass} ${isUnsavedRpe ? 'text-placeholder-active' : ''}" data-ex="${exIdx}" data-set="${setIdx}" value="${displayRpe}" placeholder="RPE" ${isDisabled ? 'disabled' : ''}>
                </td>
                <td class="td-check text-center">
                    <input type="checkbox" class="set-lock-check custom-big-check" data-ex="${exIdx}" data-set="${setIdx}" ${isLocked ? 'checked' : ''} ${isPastMeso ? 'disabled' : ''}>
                </td>
            </tr>
        `;
    });

    cardHtml += `
            </tbody> 
        </table>
        <div id="mycoach-advice-${exIdx}" class="mycoach-fatigue-alert is-hidden"></div>
        <input type="text" placeholder="Note esercizio..." value="${ex.userNotes || ''}" class="ex-user-notes w-100" data-ex="${exIdx}" ${isPastMeso ? 'disabled' : ''}>
    `;

    exCard.innerHTML = cardHtml;

    // --- FUNZIONE PER VALUTARE ED EVIDENZIARE IL ADVICE IN TEMPO REALE ---
    // --- FUNZIONE PER VALUTARE ED EVIDENZIARE IL ADVICE IN TEMPO REALE ---
    const updateRealTimeAdviceUI = () => {
        const adviceBox = exCard.querySelector(`#mycoach-advice-${exIdx}`);
        if (!adviceBox) return;

        const targetReps = ex.reps || ex.targetReps || "8-10";
        const targetRpe = ex.targetRpe || ex.rpe || 8;

        const allSetRows = exCard.querySelectorAll('tbody tr');
        let activeAdvice = null;

        allSetRows.forEach((row, setIdx) => {
            const kgVal = row.querySelector('.set-kg')?.value?.replace(',', '.').trim() || '';
            const repsVal = row.querySelector('.set-reps')?.value?.replace(',', '.').trim() || '';
            const rpeVal = row.querySelector('.set-rpe')?.value?.replace(',', '.').trim() || '';

            if (kgVal || repsVal) {
                const setObj = { weight: kgVal, reps: repsVal, rpe: rpeVal };
                const perf = evaluateRealTimePerformance(setObj, targetReps, targetRpe);

                if (perf && perf.feedbackNote) {
                    if (!activeAdvice || perf.status !== 'PERFECT') {
                        activeAdvice = {
                            setNum: setIdx + 1,
                            ...perf
                        };
                    }
                }
            }
        });

        if (activeAdvice && activeAdvice.feedbackNote) {
            adviceBox.innerHTML = `
                <div class="mycoach-rt-advice status-${(activeAdvice.status || '').toLowerCase()}">
                    <strong>SET ${activeAdvice.setNum}:</strong> ${activeAdvice.feedbackNote}
                </div>
            `;
            adviceBox.classList.remove('is-hidden');
        } else {
            adviceBox.innerHTML = '';
            adviceBox.classList.add('is-hidden');
        }
    };

    // --- EVENT DELEGATION SULLA CARD (Cattura input, change, keyup e blur su iOS/Safari) ---
    ['input', 'change', 'keyup', 'blur'].forEach(eventType => {
        exCard.addEventListener(eventType, (e) => {
            if (e.target.matches('.set-input, .set-lock-check')) {
                updateRealTimeAdviceUI();
            }
        });
    });

    // Controllo iniziale all'avvio
    updateRealTimeAdviceUI();
    
    // Aggiungiamo i listener sugli input
    exCard.querySelectorAll('.set-input, .set-lock-check').forEach(input => {
        input.addEventListener('input', updateRealTimeAdviceUI);
        input.addEventListener('change', updateRealTimeAdviceUI);
    });

    // Controllo iniziale
    updateRealTimeAdviceUI();

    // Verifica dello stato iniziale della fatica via helper
    checkFatigueAlert(ex, exIdx);

    const toggleExclusion = () => {
        if (isPastMeso) return;
        currentDay.exercises[exIdx].isExcluded = !currentDay.exercises[exIdx].isExcluded;
        saveAndSync(state.workoutData);
        renderWorkoutList();
    };

    exCard.addEventListener('dblclick', (e) => {
        if (['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;
        toggleExclusion();
    });

    const barSelectEl = exCard.querySelector('.bar-select');
    if (barSelectEl) {
        barSelectEl.addEventListener('change', () => updatePlatesBadgeUI(exIdx));
    }

    const firstSetInputEl = exCard.querySelector('.set-kg[data-set="0"]');
    if (firstSetInputEl) {
        firstSetInputEl.addEventListener('input', () => updatePlatesBadgeUI(exIdx));
    }

    updatePlatesBadgeUI(exIdx);

    enableCardSwipeGesture(exCard, toggleExclusion, toggleExclusion);
    return exCard;
}

export function updatePlatesBadgeUI(exIdx) {
    const card = document.querySelector(`.exercise-card[data-ex="${exIdx}"], .ex-card[data-ex="${exIdx}"]`);
    if (!card) return;

    const barSelect = card.querySelector('.bar-select');
    const set1Input = card.querySelector('.set-kg[data-set="0"]');
    const badge = card.querySelector('.plates-badge');
    if (!badge) return;

    const barWeight = parseFloat(barSelect?.value || 20);
    const totalKg = parseFloat(set1Input?.value?.replace(',', '.')) || 0;

    if (barWeight === 0) {
        badge.className = 'plates-badge plates-badge-disabled';
        badge.innerHTML = `<span class="text-muted font-semibold">🏋️ Manubri / Macchina</span>`;
        return;
    }

    const breakdown = getPlateBreakdown(totalKg, barWeight);

    if (!breakdown || !breakdown.plates || breakdown.plates.length === 0) {
        badge.innerHTML = `🏋️️ 0 kg/lato`;
        badge.className = 'plates-badge plates-badge-empty';
    } else {
        const counts = {};
        breakdown.plates.forEach(p => counts[p] = (counts[p] || 0) + 1);
        const sortedPlates = Object.keys(counts).map(Number).sort((a, b) => b - a);

        const platesPills = sortedPlates.map(p => {
            const count = counts[p];
            const label = count > 1 ? `${count}×${p}` : `${p}`;
            return `<span class="plate-pill">${label}</span>`;
        }).join('<span class="plate-plus">+</span>');

        badge.innerHTML = `
            <div class="flex-center gap-xs w-100 flex-wrap">
                <span class="whitespace-nowrap">🏋️ <strong>${breakdown.sideWeight}kg</strong>/lato:</span>
                <div class="flex-center gap-xs flex-wrap">${platesPills}</div>
            </div>
        `;
        
        badge.className = 'plates-badge plates-badge-active';
    }
}