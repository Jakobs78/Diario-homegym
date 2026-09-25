/**
 * Module: exerciseCard.js
 * Summary: Genera dinamicamente le card per ogni esercizio gestendo lo stato di esclusione dai massimali, i selettori del bilanciere, il calcolo dei dischi per lato e l'evidenziatura automatica fuori target per KG (inclusi Topset), REPS ed RPE (con supporto al feedback verde di miglioramento).
 */

import { formatExerciseSummary, getPlateBreakdown, findPreviousExercise, isValueOutOfRange, calculateSetVolumeTrend, isValueExceedingTarget, parseRPE } from './helpers.js';
import { state } from './state.js';
import { enableCardSwipeGesture } from './gestures.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList } from './ui.js';

export function createSingleExerciseCard(ex, exIdx, currentDay, mesoIndex, targetWeek, activeDayNum, isPastMeso) {
    const isExExcluded = ex.isExcluded || false;
    const isDropsetPlan = ex.isDropset || false;
    const isFirstWeek = targetWeek.weekNumber === 1; // 👈 Riconosce se siamo all'inizio di un nuovo mesociclo

    const exCard = document.createElement('div');
    exCard.className = 'exercise-card';
    exCard.dataset.ex = exIdx;
    exCard.style.cssText = `background: #ffffff; border: 1px solid ${isExExcluded ? '#fca5a5' : (isDropsetPlan ? '#f97316' : '#e2e8f0')}; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); opacity: ${isExExcluded ? '0.55' : '1'}; transition: all 0.25s ease; user-select: none; position: relative;`;

    let cardHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; letter-spacing: 0.5px;">BLOCCO ${ex.block || (exIdx + 1)}</div>
                ${isDropsetPlan ? '<span style="font-size: 0.7rem; background: #fff7ed; color: #c2410c; border: 1px solid #ffedd5; padding: 2px 8px; border-radius: 6px; font-weight: 800;">🔥 DROP SET</span>' : ''}
                ${!isExExcluded ? '<span style="font-size: 0.95rem; color: #94a3b8; font-style: italic;">(Doppio click o swipe per escludere)</span>' : ''}
            </div>
            ${isExExcluded ? '<span style="font-size: 0.7rem; background: #ef4444; color: #ffffff; padding: 2px 8px; border-radius: 12px; font-weight: 800;">ESCLUSO DAI MASSIMALI</span>' : ''}
        </div>
        
        <!-- 1. Nome Esercizio in primo piano -->
        <h3 style="margin: 0 0 10px 0; font-size: 1.25rem; font-weight: 800; line-height: 1.2; color: #0f172a;">${exIdx + 1}. ${ex.name}</h3>
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
        <!-- Box Target -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 0.95rem; color: #334155; font-family: monospace;">
            <strong>TARGET:</strong> ${formatExerciseSummary(ex)}
        </div>

        <!-- 2. Selettore Bilanciere e Dischi (Layout a due livelli moderno e pulito) -->
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; background: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.75rem; font-weight: 800; color: #64748b; letter-spacing: 0.5px;">BILANCIERE:</span>
                <select class="bar-select" data-ex="${exIdx}" style="font-size: 0.95rem; padding: 6px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a; flex-grow: 1;" ${isPastMeso ? 'disabled' : ''}>
                    <option value="20">Bil 20kg</option>
                    <option value="15">Bil 15kg</option>
                    <option value="12">Bil 12kg</option>
                    <option value="10">Bil 10kg</option>
                    <option value="9">Bil 9kg</option>
                    <option value="6">Bil 6kg</option>
                </select>
            </div>
    
            <div class="plates-badge" data-ex="${exIdx}" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; font-size: 0.85rem; padding: 8px 10px; border-radius: 6px; background: #ffffff; border: 1px solid #e2e8f0; color: #64748b; font-weight: 700; gap: 6px;">
                <span style="font-size: 0.75rem; color: #64748b;">🏋️ CARICO PER LATO:</span>
                <div class="plates-content" style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-family: monospace;">
                    0 kg
                </div>
            </div>
        </div>
    `;

    

    cardHtml += `
        <!-- 3. Tabella Serie Riorganizzata (Set ristretto, Input attivi ottimizzati) -->
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 12px;">
            <thead>
                <tr style="background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; font-size: 0.75rem;">
                    <th style="padding: 6px 2px; text-align: center; width: 8%;">SET</th>
                    <th style="padding: 6px 4px; text-align: center; width: 40%;">KG</th>
                    <th style="padding: 6px 4px; text-align: center; width: 28%;">REPS</th>
                    <th style="padding: 6px 4px; text-align: center; width: 14%;">RPE</th>
                    <th style="padding: 6px 2px; text-align: center; width: 10%;">✓</th>
                </tr>
            </thead>
            <tbody>
    `;

    (ex.loggedSets || []).forEach((setObj, setIdx) => {
        const isLocked = setObj.isLocked || false;
        const isDisabled = isLocked || isPastMeso;

        // 👈 Alla Settimana 1 non peschiamo i carichi reali dai vecchi mesocicli, usiamo i target del nuovo CSV
        const prevSet = isFirstWeek ? null : prevExercise?.loggedSets?.[setIdx];
        const prevKg = prevSet ? parseFloat(prevSet.weight) || 0 : 0;
        const prevReps = prevSet ? parseInt(prevSet.reps) || 0 : 0;
        
        const currentKg = parseFloat(setObj.weight) || 0;
        const currentReps = parseInt(setObj.reps) || 0;

        let trendHtml = '';
        if (!isFirstWeek) {
            const trend = calculateSetVolumeTrend(
                { weight: currentKg, reps: currentReps }, 
                { weight: prevKg, reps: prevReps }
            );

            if (trend) {
                const color = trend.isPositive ? '#16a34a' : '#dc2626';
                trendHtml = `<span style="color: ${color}; font-size: 0.7rem; font-weight: 800; white-space: nowrap;">${trend.text}</span>`;
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
        // riporta i suggerimenti della scheda csv o l'ultima sessione
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

        const kgBorderColor = isKgOutOfRange ? '#ef4444' : (isKgExceeding ? '#16a34a' : '#cbd5e1');
        const kgBorderWidth = (isKgOutOfRange || isKgExceeding) ? '2px' : '1px';
        const repsBorderColor = isRepsOutOfRange ? '#ef4444' : (isRepsExceeding ? '#16a34a' : '#cbd5e1');
        const repsBorderWidth = (isRepsOutOfRange || isRepsExceeding) ? '2px' : '1px';
        const rpeBorderColor = isRpeOutOfRange ? '#ef4444' : (isRpeExceeding ? '#16a34a' : '#cbd5e1');
        const rpeBorderWidth = (isRpeOutOfRange || isRpeExceeding) ? '2px' : '1px';

        
        const kgTextColor = (!setObj.weight && displayWeight && !isLocked) ? '#94a3b8' : '#0f172a';
        const repsTextColor = (!setObj.reps && displayReps && !isLocked) ? '#94a3b8' : '#0f172a';
        const rpeTextColor = (!setObj.rpe && displayRpe && !isLocked) ? '#94a3b8' : '#0f172a';

        let intensityBadgeHtml = '';
        if (setObj.intensityTechnique) {
            const isDrop = setObj.intensityTechnique === 'DROP_SET';
            const badgeBg = isDrop ? '#fff7ed' : '#edf2ff';
            const badgeColor = isDrop ? '#c2410c' : '#3b82f6';
            const badgeBorder = isDrop ? '#ffedd5' : '#dbe4ff';
            
            intensityBadgeHtml = `<span style="font-size: 0.65rem; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; padding: 1px 4px; border-radius: 4px; font-weight: 800; margin-top: 2px; text-transform: uppercase;">${isDrop ? 'DROP' : 'R-PAUSE'}</span>`;
        }

        cardHtml += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 2px; text-align: center; border-right: 1px solid #e2e8f0;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;">
                        <span style="font-weight: 700; font-size: 0.9rem; color: #334155;">${setIdx + 1}</span>
                        ${trendHtml}
                        ${intensityBadgeHtml}
                    </div>
                </td>
                <td style="padding: 6px 4px; border-right: 1px solid #e2e8f0;">
                    <input type="text" inputmode="decimal" autocomplete="off" class="set-input set-kg ios-no-zoom" data-ex="${exIdx}" data-set="${setIdx}" value="${displayWeight}" placeholder="${targetWeightDefault || 'Kg'}" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: ${kgBorderWidth} solid ${kgBorderColor}; border-radius: 6px; padding: 10px 4px; font-weight: 800; font-size: 16px; color: ${kgTextColor}; background: ${isDisabled ? '#f1f5f9' : '#ffffff'};">
                </td>
                <td style="padding: 6px 4px; border-right: 1px solid #e2e8f0;">
                    <input type="text" inputmode="numeric" autocomplete="off" class="set-input set-reps ios-no-zoom" data-ex="${exIdx}" data-set="${setIdx}" value="${displayReps}" placeholder="${defaultTargetReps || 'reps'}" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: ${repsBorderWidth} solid ${repsBorderColor}; border-radius: 6px; padding: 10px 4px; font-weight: 800; font-size: 16px; color: ${repsTextColor}; background: ${isDisabled ? '#f1f5f9' : '#ffffff'};">
                </td>
                <td style="padding: 6px 4px; border-right: 1px solid #e2e8f0;">
                    <input type="text" inputmode="decimal" autocomplete="off" class="set-input set-rpe ios-no-zoom" data-ex="${exIdx}" data-set="${setIdx}" value="${displayRpe}" placeholder="RPE" ${isDisabled ? 'disabled' : ''} style="width: 100%; text-align: center; border: ${rpeBorderWidth} solid ${rpeBorderColor}; border-radius: 6px; padding: 10px 4px; font-weight: 800; font-size: 16px; color: ${rpeTextColor}; background: ${isDisabled ? '#f1f5f9' : '#ffffff'};">
                </td>
                <td style="padding: 6px 2px; text-align: center; vertical-align: middle;">
                    <!-- 👈 Checkbox ingrandito per facilitare il tap su iPhone Pro Max -->
                    <input type="checkbox" class="set-lock-check custom-big-check" data-ex="${exIdx}" data-set="${setIdx}" ${isLocked ? 'checked' : ''} ${isPastMeso ? 'disabled' : ''} style="width: 24px; height: 24px; cursor: pointer; accent-color: #0284c7;">
                </td>
            </tr>
        `;
    });

    cardHtml += `
            </tbody> 
        </table>
        <div id="mycoach-advice-${exIdx}" class="mycoach-fatigue-alert"></div>
        <input type="text" placeholder="Note esercizio..." value="${ex.userNotes || ''}" class="ex-user-notes" data-ex="${exIdx}" ${isPastMeso ? 'disabled' : ''} style="width: 100%; font-size: 0.8rem; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: ${isPastMeso ? '#f1f5f9' : '#f8fafc'};">
    `;

    exCard.innerHTML = cardHtml;

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

    // 🧠 Event listener per ricalcolare i dischi al cambio bilanciere o input kg
    const barSelectEl = exCard.querySelector('.bar-select');
    if (barSelectEl) {
        barSelectEl.addEventListener('change', () => updatePlatesBadgeUI(exIdx));
    }

    const firstSetInputEl = exCard.querySelector('.set-kg[data-set="0"]');
    if (firstSetInputEl) {
        firstSetInputEl.addEventListener('input', () => updatePlatesBadgeUI(exIdx));
    }

    // Calcolo iniziale al caricamento della card
    updatePlatesBadgeUI(exIdx);

    enableCardSwipeGesture(exCard, toggleExclusion, toggleExclusion);
    return exCard;
}

export function updatePlatesBadgeUI(exIdx) {
    const card = document.querySelector(`.exercise-card[data-ex="${exIdx}"]`);
    if (!card) return;

    const barSelect = card.querySelector('.bar-select');
    const set1Input = card.querySelector('.set-kg[data-set="0"]');
    const badge = card.querySelector('.plates-badge');
    if (!badge) return;

    const barWeight = parseFloat(barSelect?.value || 20);
    const totalKg = parseFloat(set1Input?.value?.replace(',', '.')) || 0;

    if (barWeight === 0) {
        badge.style.background = '#f1f5f9';
        badge.style.borderColor = '#cbd5e1';
        badge.innerHTML = `<span style="color: #475569; font-weight: 600;">🏋️ Manubri / Macchina</span>`;
        return;
    }

    const breakdown = getPlateBreakdown(totalKg, barWeight);

    if (!breakdown || !breakdown.plates || breakdown.plates.length === 0) {
        badge.innerHTML = `🏋️ 0 kg/lato`;
        badge.style.background = '#f8fafc';
        badge.style.color = '#64748b';
        badge.style.borderColor = '#e2e8f0';
    } else {
        // 🧠 Raggruppamento intelligente dei dischi uguali (es. 3×20 anziché 20 + 20 + 20)
        const counts = {};
        breakdown.plates.forEach(p => counts[p] = (counts[p] || 0) + 1);
        const sortedPlates = Object.keys(counts).map(Number).sort((a, b) => b - a);

        // Genera chip compatti (es. "3×20", "10", "5")
        const platesPills = sortedPlates.map(p => {
            const count = counts[p];
            const label = count > 1 ? `${count}×${p}` : `${p}`;
            return `<span style="background: #dcfcf2; color: #0d0e0d; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; font-weight: 800; border: 1px solid #29d967; white-space: nowrap;">${label}</span>`;
        }).join('<span style="color: #94a3b8; font-size: 0.85rem; font-weight: bold; margin: 0 2px;">+</span>');

        // 👈 Spostato tutto a sinistra con justify-content: flex-start
        badge.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: flex-start; width: 100%; gap: 6px; flex-wrap: wrap;">
                <span style="white-space: nowrap;">🏋️ <strong>${breakdown.sideWeight}kg</strong>/lato:</span>
                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 2px;">${platesPills}</div>
            </div>
        `;
        
        badge.style.background = '#f0fdf4';
        badge.style.color = '#070703';
        badge.style.borderColor = '#bbf7d0';
    }
}