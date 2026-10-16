/**
 * Module: exerciseCard.js
 * Summary: Genera dinamicamente le card per ogni esercizio gestendo lo stato di esclusione dai massimali, i selettori del bilanciere, il calcolo dei dischi per lato e l'evidenziatura automatica fuori target per KG (inclusi Topset), REPS ed RPE (con supporto al feedback verde di miglioramento).
 */

import { formatExerciseSummary, getPlateBreakdown, findPreviousExercise, isValueOutOfRange, calculateSetVolumeTrend, isValueExceedingTarget, parseRPE, escapeHtml, slugify } from './helpers.js';
import { state } from './state.js';
import { enableCardSwipeGesture } from './gestures.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList } from './ui.js';
import { getSetPrefill } from './setPrefill.js';

// UI-only state: never stored in the journal or mistaken for a performed set.
const chosenSetByKey=new Map();
const selectedKey=exIdx=>[
    state.currentUser?.id || 'local',state.currentYear || new Date().getFullYear(),
    state.activeMesocycleIndex || 0,state.activeWeek || 1,state.activeDay || 1,exIdx
].join(':');

export function createSingleExerciseCard(ex, exIdx, currentDay, mesoIndex, targetWeek, activeDayNum, isPastMeso) {
    const isExExcluded = ex.isExcluded || false;
    const isDropsetPlan = ex.isDropset || false;
    const isFirstWeek = targetWeek.weekNumber === 1;

    const exCard = document.createElement('div');
    exCard.className = `ex-card ${isExExcluded ? 'is-excluded' : ''} ${isDropsetPlan ? 'is-dropset' : ''}`;
    exCard.dataset.ex = exIdx;
    exCard.id = 'workout-exercise-' + exIdx;
    const uiKey=selectedKey(exIdx);
    const logs=ex.loggedSets || [];
    const remembered=chosenSetByKey.get(uiKey);
    const firstUnfinished=logs.findIndex(set=>!set.isLocked && !set.completed);
    const selected=Number.isInteger(remembered) && remembered>=0 && remembered<logs.length &&
        !(logs[remembered]?.isLocked || logs[remembered]?.completed) ? remembered :
        (firstUnfinished>=0 ? firstUnfinished : Math.max(0,logs.length-1));
    exCard.dataset.activeSet=String(selected);
    const completedCount=logs.filter(set=>set.isLocked || set.completed).length;
    const barKey='homegym_bar_'+(state.currentUser?.id || 'local')+'_'+slugify(ex.name);


    let cardHtml = `
        <div class="ex-card-header flex-between mb-sm">
            <div class="flex-center gap-md">
                <div class="block-title m-0">BLOCCO ${ex.block || (exIdx + 1)}</div>
                ${isDropsetPlan ? '<span class="badge-dropset">🔥 DROP SET</span>' : ''}

            </div>
            ${isExExcluded
                ? '<span class="badge-danger">ESCLUSO DAI MASSIMALI</span>'
                : '<span class="exercise-exclude-hint text-xs text-muted flex-italic">(Doppio click o swipe per escludere)</span>'}
        </div>
        
        <!-- Nome Esercizio in primo piano -->
        <h3 class="ex-name mb-md">${exIdx + 1}. ${escapeHtml(ex.name)}</h3>
        
    `;

    const prevExercise = findPreviousExercise(state.workoutData, mesoIndex, targetWeek.weekNumber, activeDayNum - 1, ex, true);
    let lastSessionSetsHtml = '';

    if (prevExercise && prevExercise.loggedSets && prevExercise.loggedSets.length > 0) {
        const validSets = prevExercise.loggedSets.filter(s =>
            (s.isLocked === true || s.completed === true) && s.weight && s.reps);
        
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

                return `<div class="text-xs mt-xs"><strong>${idx + 1}° set:</strong> ${escapeHtml(kg)}, ${escapeHtml(repsFormatted)}${escapeHtml(rpeFormatted)}</div>`;
            }).join('');
        }
    }

    // Performed history stays in plain sight; long coach notes move below the set table.
    if (lastSessionSetsHtml) {
        cardHtml += `
            <section class="exercise-history-box exercise-notes-box mb-md"
                     aria-label="Ultima sessione precedente">
                <div class="history-title mb-xs">↩ ULTIMA SESSIONE PRECEDENTE</div>
                <div class="history-content">${lastSessionSetsHtml}</div>
            </section>
        `;
    }

    cardHtml += `
        <!-- Box Target -->
        <div class="target-box mb-md">
            <strong>TARGET:</strong> ${formatExerciseSummary(ex)}
        </div>

        <div class="workout-set-status flex-between mb-sm">
            <strong>Serie di oggi · ${completedCount}/${logs.length} confermate</strong>
            <span class="active-set-label" aria-live="polite">Serie ${selected+1} selezionata</span>
        </div>
    `;

    cardHtml += `
        <table class="set-table mb-sm">
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
        
        const suggested = getSetPrefill(ex, setIdx, { previousExercise: prevExercise });
        const displayWeight = isLocked ? (setObj.weight ?? '') : suggested.weight;
        const displayReps = isLocked ? (setObj.reps ?? '') : suggested.reps;
        // Precompila come kg/reps. Il valore diventa prestazione SOLO con il check ✓.
        const displayRpe = isLocked ? (setObj.rpe ?? '') : suggested.rpe;
        const targetWeightDefault = ex.kgMin || ex.kgMax || 'Kg';
        const defaultTargetReps = ex.reps || ex.targetReps || 'reps';

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

        const isUnsavedKg = suggested.isSuggestedWeight && !!displayWeight && !isLocked;
        const isUnsavedReps = suggested.isSuggestedReps && !!displayReps && !isLocked;
        const isUnsavedRpe = suggested.isSuggestedRpe && !!displayRpe && !isLocked;

        let intensityBadgeHtml = '';
        if (setObj.intensityTechnique) {
            const isDrop = setObj.intensityTechnique === 'DROP_SET';
            intensityBadgeHtml = `<span class="badge-tech ${isDrop ? 'tech-drop' : 'tech-rpause'}">${isDrop ? 'DROP' : 'R-PAUSE'}</span>`;
        }

        cardHtml += `
            <tr class="workout-set-row" data-set-index="${setIdx}" data-prefill-source="${suggested.source}">
                <td class="td-set flex-column flex-center">
                    <span class="font-bold text-sm">${setIdx + 1}</span>
                    ${intensityBadgeHtml}
                </td>
                <td class="td-input td-kg-container">
                    <div class="kg-input-wrapper flex-column flex-center">
                        <input type="text" inputmode="decimal" autocomplete="off" class="set-input set-kg ios-no-zoom ${kgClass} ${isUnsavedKg ? 'text-placeholder-active' : ''}" data-ex="${exIdx}" data-set="${setIdx}" value="${escapeHtml(displayWeight)}" placeholder="${escapeHtml(targetWeightDefault)}" ${isDisabled ? 'disabled' : ''}>
                        ${trendHtml ? `<div class="set-trend-badge">${trendHtml}</div>` : ''}
                    </div>
                </td>
                <td class="td-input">
                    <input type="text" inputmode="numeric" autocomplete="off" class="set-input set-reps ios-no-zoom ${repsClass} ${isUnsavedReps ? 'text-placeholder-active' : ''}" data-ex="${exIdx}" data-set="${setIdx}" value="${escapeHtml(displayReps)}" placeholder="${escapeHtml(defaultTargetReps)}" ${isDisabled ? 'disabled' : ''}>
                </td>
                <td class="td-input">
                    <input type="text" inputmode="decimal" autocomplete="off" class="set-input set-rpe ios-no-zoom ${rpeClass} ${isUnsavedRpe ? 'text-placeholder-active' : ''}" data-ex="${exIdx}" data-set="${setIdx}" value="${escapeHtml(displayRpe)}" placeholder="RPE" title="RPE proposto: verifica che corrisponda alla fatica percepita. La spunta ✓ conferma tutti i valori della serie." ${isDisabled ? 'disabled' : ''}>
                </td>
                <td class="td-check text-center">
                    <input type="checkbox" class="set-lock-check custom-big-check" aria-label="Conferma o riapri serie ${setIdx+1}" data-ex="${exIdx}" data-set="${setIdx}" ${isLocked ? 'checked' : ''} ${isPastMeso ? 'disabled' : ''}>
                </td>
            </tr>
        `;
    });

    cardHtml += `
            </tbody>
        </table>
    `;

    cardHtml += `
        <!-- Carico e dischi per la serie selezionata, non solo per il primo set -->
        <div class="bar-plates-container mb-md" aria-label="Calcolo dischi serie attiva">
            <div class="flex-center gap-md">
                <span class="bar-select-label">🏋️ DISCHI · SERIE <span class="plates-active-set">${selected+1}</span></span>
                <select class="bar-select flex-1" data-ex="${exIdx}" ${isPastMeso ? 'disabled' : ''}>
                    <option value="20">Bil 20kg</option>
                    <option value="15">Bil 15kg</option>
                    <option value="12">Bil 12kg</option>
                    <option value="10">Bil 10kg</option>
                    <option value="9">Bil 9kg</option>
                    <option value="6">Bil 6kg</option>
                    <option value="0">Manubri / Macchina</option>
                </select>
            </div>
    
            <div class="plates-badge flex-between gap-sm" data-ex="${exIdx}">
                <span class="plates-label">CARICO PER LATO:</span>
                <div class="plates-content flex-center gap-xs">
                    0 kg
                </div>
            </div>
        </div>
    `;
    cardHtml += `
        <div id="mycoach-advice-${exIdx}" class="mycoach-fatigue-alert is-hidden"></div>
        <section class="exercise-coach-notes" aria-label="Note del coach e note personali">
            <div class="exercise-coach-notes-body">
                <div class="note-allenatore-title">📝 NOTE COACH</div>
                <div class="note-allenatore-text">${ex.notes ? escapeHtml(ex.notes) : '<span class="text-muted">Nessuna nota del coach.</span>'}</div>
                <label class="workout-notes-label" for="ex-user-notes-${exIdx}">✍️ Note personali</label>
                <input type="text" id="ex-user-notes-${exIdx}" placeholder="Aggiungi una nota all'esercizio..."
                    value="${escapeHtml(ex.userNotes || '')}" class="ex-user-notes w-100"
                    data-ex="${exIdx}" ${isPastMeso ? 'disabled' : ''}>
            </div>
        </section>
    `;

    exCard.innerHTML = cardHtml;

    // Il coaching in seduta è calcolato centralmente solo dai set confermati.
    // Nessun consiglio si basa su placeholder o su RPE inventati.
    const toggleExclusion = () => {
        if (isPastMeso) return;
        currentDay.exercises[exIdx].isExcluded = !currentDay.exercises[exIdx].isExcluded;
        saveAndSync(state.workoutData);
        renderWorkoutList();
    };

    // Ripristino del gesto intenzionale: doppio click su desktop e swipe orizzontale >=300px su telefono.
    // I campi, gli elementi interattivi e le note non devono attivare l'esclusione.
    exCard.addEventListener('dblclick', event => {
        // I doppi tocchi sul telefono non equivalgono a un doppio click da PC.
        if (window.matchMedia?.('(pointer: coarse)').matches) return;
        if (event.target.closest('input, select, textarea, button, a, label, summary, details, .exercise-coach-notes')) return;
        toggleExclusion();
    });
    enableCardSwipeGesture(exCard, toggleExclusion, toggleExclusion);

    const selectSet=(idx)=>{
        if(!Number.isInteger(idx)||idx<0||idx>=logs.length)return;
        exCard.dataset.activeSet=String(idx);
        chosenSetByKey.set(uiKey,idx);
        exCard.querySelectorAll('.workout-set-row').forEach(row=>{
            const active=Number(row.dataset.setIndex)===idx;
            row.classList.toggle('is-active-set',active);
            row.setAttribute('aria-current',active?'true':'false');
        });
        const title=exCard.querySelector('.active-set-label');
        if(title)title.textContent='Serie '+(idx+1)+' di '+logs.length+' selezionata';
        const platesTitle=exCard.querySelector('.plates-active-set');
        if(platesTitle)platesTitle.textContent=String(idx+1);
        updatePlatesBadgeUI(exIdx,exCard);
    };
    exCard.querySelectorAll('.workout-set-row').forEach(row=>{
        const idx=Number(row.dataset.setIndex);
        row.addEventListener('click',()=>selectSet(idx));
        row.addEventListener('focusin',()=>selectSet(idx));
    });
    const barSelect=exCard.querySelector('.bar-select');
    if(barSelect){
        const preferred=localStorage.getItem(barKey);
        const equipment=String(ex.equipment||'').toLowerCase();
        const dumbbell=/dumbbell|manubri|manubrio|machine|macchina|cable|cavi/.test(equipment)
            || /manubri|manubrio|macchina|cavi/.test(ex.name.toLowerCase());
        const fallback=dumbbell?'0':'20';
        barSelect.value=[...barSelect.options].some(opt=>opt.value===preferred)?preferred:fallback;
        barSelect.addEventListener('change',()=>{
            localStorage.setItem(barKey,barSelect.value);
            updatePlatesBadgeUI(exIdx,exCard);
        });
    }
    selectSet(selected);
    return exCard;
}

export function updatePlatesBadgeUI(exIdx, cardNode=null) {
    const card=cardNode || document.querySelector('.ex-card[data-ex="'+exIdx+'"]');
    if(!card)return;
    const badge=card.querySelector('.plates-badge');
    if(!badge)return;
    const select=card.querySelector('.bar-select');
    const setIdx=Number(card.dataset.activeSet||0);
    const kgField=card.querySelector('.set-kg[data-set="'+setIdx+'"]');
    const total=Number(String(kgField?.value||'').replace(',','.'));
    const barWeight=Number(select?.value??20);
    if(barWeight===0){
        badge.className='plates-badge plates-badge-disabled';
        badge.textContent='Manubri / macchina · dischi non necessari';
        return;
    }
    if(!kgField?.value.trim() || !Number.isFinite(total) || total<=0){
        badge.className='plates-badge plates-badge-empty';
        badge.textContent='Inserisci i kg della serie per vedere i dischi per lato.';
        return;
    }
    if(total<barWeight){
        badge.className='plates-badge plates-badge-empty';
        badge.textContent='Carico inferiore al peso del bilanciere selezionato.';
        return;
    }
    if(total===barWeight){
        badge.className='plates-badge plates-badge-active';
        badge.textContent='Solo bilanciere: 0 kg di dischi per lato.';
        return;
    }
    const breakdown=getPlateBreakdown(total,barWeight);
    if(!breakdown?.plates?.length){
        badge.className='plates-badge plates-badge-empty';
        badge.textContent='Nessuna combinazione disponibile per questo carico.';
        return;
    }
    const counts={};
    for(const plate of breakdown.plates)counts[plate]=(counts[plate]||0)+1;
    const fragments=Object.keys(counts).map(Number).sort((a,b)=>b-a)
        .map(plate=>counts[plate]>1?counts[plate]+'×'+plate: String(plate));
    const loaded=breakdown.plates.reduce((sum,plate)=>sum+plate,0);
    const leftover=Math.round((breakdown.sideWeight-loaded)*100)/100;
    badge.className='plates-badge plates-badge-active';
    badge.replaceChildren();
    const heading=document.createElement('strong');
    heading.textContent=breakdown.sideWeight+' kg/lato: ';
    const list=document.createElement('span');
    list.className='plate-breakdown-items';
    list.textContent=fragments.join(' + ')+' kg';
    badge.append(heading,list);
    if(leftover>0.001){
        const note=document.createElement('small');
        note.className='plate-breakdown-warning';
        note.textContent='Combinazione incompleta: mancano '+leftover+' kg/lato.';
        badge.append(note);
    }
    if(kgField.classList.contains('text-placeholder-active')){
        const hint=document.createElement('small');
        hint.className='plate-breakdown-hint';
        hint.textContent='Carico suggerito, non ancora confermato.';
        badge.append(hint);
    }
}
