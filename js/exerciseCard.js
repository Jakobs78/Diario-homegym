/**
 * Module: exerciseCard.js
 * Summary: Genera dinamicamente le card per ogni esercizio gestendo lo stato di esclusione dai massimali tramite doppio click o gesture di swipe, i selettori del bilanciere e il badge dinamico dei dischi che calcola il carico per lato (getPlateBreakdown)[cite: 27]. Include inoltre i riepiloghi dei target e le performance della sessione precedente[cite: 27].
 */

import { formatExerciseSummary, getPlateBreakdown, findPreviousExercise, isValueOutOfRange, calculateSetVolumeTrend } from './helpers.js';
import { state } from './state.js';
import { enableCardSwipeGesture } from './gestures.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList } from './ui.js';

export function createSingleExerciseCard(ex, exIdx, currentDay, mesoIndex, targetWeek, activeDayNum, isPastMeso) {
    const isExExcluded = ex.isExcluded || false;
    const isDropset = ex.isDropset || false;

    const exCard = document.createElement('div');
    exCard.className = 'exercise-card';
    exCard.dataset.ex = exIdx;
    exCard.style.cssText = `background: #ffffff; border: 1px solid ${isExExcluded ? '#fca5a5' : (isDropset ? '#f97316' : '#e2e8f0')}; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); opacity: ${isExExcluded ? '0.55' : '1'}; transition: all 0.25s ease; user-select: none; position: relative;`;

    let cardHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; letter-spacing: 0.5px;">BLOCCO ${ex.block || (exIdx + 1)}</div>
                ${isDropset ? '<span style="font-size: 0.7rem; background: #fff7ed; color: #c2410c; border: 1px solid #ffedd5; padding: 2px 8px; border-radius: 6px; font-weight: 800;">🔥 DROP SET</span>' : ''}
                ${!isExExcluded ? '<span style="font-size: 0.7rem; color: #94a3b8; font-style: italic;">(Doppio click o swipe per escludere)</span>' : ''}
            </div>
            ${isExExcluded ? '<span style="font-size: 0.7rem; background: #ef4444; color: #ffffff; padding: 2px 8px; border-radius: 12px; font-weight: 800;">ESCLUSO DAI MASSIMALI</span>' : ''}
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
            <h3 style="margin: 0; font-size: 1.1rem; color: #0f172a;">${exIdx + 1}. ${ex.name}</h3>
            
            <div style="display: flex; gap: 6px; align-items: center;">
                <select class="bar-select" data-ex="${exIdx}" style="font-size: 0.75rem; padding: 4px 6px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a;" ${isPastMeso ? 'disabled' : ''}>
                    <option value="20">Bil 20kg</option>
                    <option value="15">Bil 15kg</option>
                    <option value="12">Bil 12kg</option>
                    <option value="10">Bil 10kg</option>
                    <option value="9">Bil 9kg</option>
                    <option value="6">Bil 6kg</option>
                </select>
        
                <div class="plates-badge" data-ex="${exIdx}" style="font-size: 0.75rem; padding: 4px 10px; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b; font-weight: 700; font-family: monospace;">
                    🏋️ 0 kg/lato
                </div>
            </div>
        </div>
        
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; font-size: 0.8rem; color: #334155; font-family: monospace;">
            <strong>TARGET:</strong> ${formatExerciseSummary(ex)}${ (ex.targetRpe || ex.rpeTarget || ex.rpe) ? ` | ${ex.targetRpe || ex.rpeTarget || ex.rpe}` : '' }
        </div>
        </div>
    `;

    const prevExercise = findPreviousExercise(state.workoutData, mesoIndex, targetWeek.weekNumber, activeDayNum - 1, ex);
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

                return `<div style="font-size: 0.8rem; margin-top: 2px;"><strong>${idx + 1}° set:</strong> ${kg}, ${repsFormatted}${rpeFormatted}</div>`;
            }).join('');
        }
    }

    if (ex.notes || lastSessionSetsHtml) {
        cardHtml += `<div style="background: #f0f9ff; border: 1px solid #e0f2fe; border-radius: 8px; padding: 10px; margin-bottom: 12px;">`;
        if (ex.notes) {
            cardHtml += `
                <div style="font-size: 0.75rem; font-weight: 800; color: #0369a1; margin-bottom: 2px;">NOTE ALLENATORE</div>
                <div style="font-size: 0.85rem; color: #0f172a; line-height: 1.3; ${lastSessionSetsHtml ? 'margin-bottom: 8px;' : ''}">${ex.notes}</div>
            `;
        }
        if (lastSessionSetsHtml) {
            const divider = ex.notes ? `<div style="height: 1px; background: #bae6fd; margin-bottom: 6px; margin-top: 6px;"></div>` : '';
            cardHtml += `
                ${divider}
                <div style="font-size: 0.75rem; font-weight: 800; color: #0284c7; margin-bottom: 4px;">ULTIMA SESSIONE PRECEDENTE</div>
                <div style="color: #0f172a; line-height: 1.4;">${lastSessionSetsHtml}</div>
            `;
        }
        cardHtml += `</div>`;
    }

    cardHtml += `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 10px;">
            <thead>
                <tr style="background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; font-size: 0.75rem;">
                    <th style="padding: 6px; text-align: center; width: 22%;">SET</th>
                    <th style="padding: 6px; text-align: center; width: 25%;">KG</th>
                    <th style="padding: 6px; text-align: center; width: 25%;">REPS</th>
                    <th style="padding: 6px; text-align: center; width: 18%;">RPE</th>
                    <th style="padding: 6px; text-align: center; width: 10%;">✓</th>
                </tr>
            </thead>
            <tbody>
    `;

    (ex.loggedSets || []).forEach((setObj, setIdx) => {
        const isLocked = setObj.isLocked || false;
        const isDisabled = isLocked || isPastMeso;

        const prevSet = prevExercise?.loggedSets?.[setIdx];
        const prevKg = prevSet ? parseFloat(prevSet.weight) || 0 : 0;
        const prevReps = prevSet ? parseInt(prevSet.reps) || 0 : 0;
        
        const currentKg = parseFloat(setObj.weight) || 0;
        const currentReps = parseInt(setObj.reps) || 0;

        let trendHtml = '';
        const trend = calculateSetVolumeTrend(
            { weight: currentKg, reps: currentReps }, 
            { weight: prevKg, reps: prevReps }
        );

        if (trend) {
            const color = trend.isPositive ? '#16a34a' : '#dc2626';
            trendHtml = `<span style="color: ${color}; font-size: 0.7rem; font-weight: 800; white-space: nowrap;">${trend.text}</span>`;
        }

        const isRangeTarget = (ex.minReps && ex.maxReps) || (typeof ex.reps === 'string' && ex.reps.includes('-'));
        const rawTargetReps = ex.reps || ex.targetReps || '';
        const defaultTargetReps = isRangeTarget ? (prevSet?.reps || '') : rawTargetReps.toString().replace(/\D+/g, '');

        const displayWeight = setObj.weight !== undefined && setObj.weight !== '' ? setObj.weight : (prevSet?.weight || '');
        const displayReps = setObj.reps !== undefined && setObj.reps !== '' ? setObj.reps : defaultTargetReps;
        const displayRpe = setObj.rpe !== undefined && setObj.rpe !== '' ? setObj.rpe : (ex.targetRpe || ex.rpe || '');

        const isRepsOutOfRange = isValueOutOfRange(displayReps, ex.minReps, ex.maxReps);
        const isKgOutOfRange = isValueOutOfRange(displayWeight, ex.kgMin, ex.kgMax);

        const repsStyle = isRepsOutOfRange 
            ? 'border: 2px solid #ef4444 !important; background-color: #fef2f2 !important; color: #dc2626 !important;' 
            : `background: ${isDisabled ? '#f1f5f9' : '#ffffff'}; color: ${!setObj.reps && prevSet?.reps && !isLocked ? '#94a3b8' : '#0f172a'}; border: 1px solid #cbd5e1;`;

        const kgStyle = isKgOutOfRange 
            ? 'border: 2px solid #ef4444 !important; background-color: #fef2f2 !important; color: #dc2626 !important;' 
            : `background: ${isDisabled ? '#f1f5f9' : '#ffffff'}; color: ${!setObj.weight && prevSet?.weight && !isLocked ? '#94a3b8' : '#0f172a'}; border: 1px solid #cbd5e1;`;

        cardHtml += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px; text-align: center; border-right: 1px solid #e2e8f0;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;">
                        <span style="font-weight: 600; color: #334155;">${setIdx + 1}</span>
                        ${trendHtml}
                    </div>
                </td>
                <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                    <input type="text" inputmode="decimal" autocomplete="off" class="set-input set-kg" data-ex="${exIdx}" data-set="${setIdx}" value="${displayWeight}" placeholder="${prevSet?.weight || 'Kg'}" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border-radius: 4px; padding: 4px; font-weight: 800; ${kgStyle}">
                </td>
                <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                    <input type="text" inputmode="numeric" autocomplete="off" class="set-input set-reps" data-ex="${exIdx}" data-set="${setIdx}" value="${displayReps}" placeholder="${prevSet?.reps || 'reps'}" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border-radius: 4px; padding: 4px; font-weight: 800; ${repsStyle}">
                </td>
                <td style="padding: 4px; border-right: 1px solid #e2e8f0;">
                    <input type="text" inputmode="decimal" autocomplete="off" class="set-input set-rpe" data-ex="${exIdx}" data-set="${setIdx}" value="${displayRpe}" placeholder="RPE" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-weight: 800; background: ${isDisabled ? '#f1f5f9' : '#ffffff'};">
                </td>
                <td style="padding: 4px; text-align: center;">
                    <input type="checkbox" class="set-lock-check" data-ex="${exIdx}" data-set="${setIdx}" ${isLocked ? 'checked' : ''} ${isPastMeso ? 'disabled' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                </td>
            </tr>
        `;
    });

    cardHtml += `
            </tbody>
        </table>
        <input type="text" placeholder="Note esercizio..." value="${ex.userNotes || ''}" class="ex-user-notes" data-ex="${exIdx}" ${isPastMeso ? 'disabled' : ''} style="width: 100%; font-size: 0.8rem; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: ${isPastMeso ? '#f1f5f9' : '#f8fafc'};">
    `;

    exCard.innerHTML = cardHtml;
    // Gestione esclusione esercizio (doppio click e swipe)
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

    enableCardSwipeGesture(exCard, toggleExclusion, toggleExclusion);
    return exCard;
}

export function updatePlatesBadgeUI(exIdx) {
    // Cerca direttamente la card dell'esercizio nel DOM globale usando l'indice
    const card = document.querySelector(`.exercise-card[data-ex="${exIdx}"]`);
    if (!card) return;

    const barSelect = card.querySelector('.bar-select');
    const set1Input = card.querySelector('.set-kg[data-set="0"]');
    const badge = card.querySelector('.plates-badge');

    if (!badge) return;

    const barWeight = parseFloat(barSelect?.value || 20);
    const totalKg = parseFloat(set1Input?.value?.replace(',', '.')) || 0;

    if (barWeight === 0) {
        badge.innerHTML = `🏋️ Manubri / Macchina`;
        badge.style.background = '#f1f5f9';
        badge.style.color = '#475569';
        badge.style.borderColor = '#cbd5e1';
        return;
    }

    const breakdown = getPlateBreakdown(totalKg, barWeight);

    if (!breakdown) {
        badge.innerHTML = `🏋️ 0 kg/lato`;
        badge.style.background = '#f8fafc';
        badge.style.color = '#64748b';
        badge.style.borderColor = '#e2e8f0';
    } else {
        badge.innerHTML = `🏋️ <strong>${breakdown.sideWeight}kg</strong>/lato <span style="color: #166534; font-weight: normal;">[${breakdown.str}]</span>`;
        badge.style.background = '#f0fdf4';
        badge.style.color = '#15803d';
        badge.style.borderColor = '#bbf7d0';
    }
}