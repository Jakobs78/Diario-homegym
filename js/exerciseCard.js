import {barbellForExercise} from '../mycoatch/barbellInventory.js';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
import {hasDropPrescription} from './trainingTechniques.js';
import {dropFields,dropScopeControl} from './dropSetUI.js';
import {equipmentKind,automaticallyShowPlates,selectableBarbells,suggestedBarbell,barbellOptionValue} from './equipmentUI.js';
/**
 * Module: exerciseCard.js
 * Summary: Genera dinamicamente le card per ogni esercizio gestendo lo stato di esclusione dai massimali, i selettori del bilanciere, il calcolo dei dischi per lato e l'evidenziatura automatica fuori target per KG (inclusi Topset), REPS ed RPE (con supporto al feedback verde di miglioramento).
 */

import { formatExerciseSummary, getPlateBreakdown, findPreviousExercise, findPriorExerciseExposures, isValueOutOfRange, calculateSetVolumeTrend, isValueExceedingTarget, parseRPE, escapeHtml } from './helpers.js';
import { state } from './state.js';
import { enableCardSwipeGesture } from './gestures.js';
import { isWarmupExercise } from './workoutSemantics.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList } from './ui.js';
import { getSetPrefill } from './setPrefill.js';
import { recommendNextSessionReps } from '../mycoatch/nextSessionReps.js';
import { recommendCrossExposureLoad } from '../mycoatch/crossExposureLoad.js';
import { compareConfirmedSetVolume } from './setVolumeComparison.js';

// UI-only state: never stored in the journal or mistaken for a performed set.
const chosenSetByKey=new Map();
const selectedKey=exIdx=>[
    state.currentUser?.id || 'local',state.currentYear || new Date().getFullYear(),
    state.activeMesocycleIndex || 0,state.activeWeek || 1,state.activeDay || 1,exIdx
].join(':');

export function createSingleExerciseCard(ex, exIdx, currentDay, mesoIndex, targetWeek, activeDayNum, isPastMeso) {
    const isExExcluded = isWarmupExercise(ex);
    const isDropsetPlan = ex.isDropset || (ex.sets||[]).some(s=>s.intensityTechnique==='DROP_SET');
    const equipment=equipmentKind(ex);

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
    const athleteEquipment=state.workoutData?.athlete||{};
    const barOptions=selectableBarbells(ex,athleteEquipment);
    const suggestedBar=suggestedBarbell(ex,athleteEquipment);


    let cardHtml = `
        <div class="ex-card-header flex-between mb-sm">
            <div class="flex-center gap-md">
                ${!isExExcluded
                    ? '<span class="exercise-exclude-hint text-xs text-muted flex-italic">Doppio clic sulla card (PC) o swipe a sinistra (telefono) per segnare tutto l’esercizio come riscaldamento. W modifica solo una serie.</span>'
                    : ''}
                <!-- Il numero del blocco rimane nei dati e nei gruppi, non sulla singola card. -->
                ${isDropsetPlan ? '<span class="badge-dropset">🔥 DROP SET</span>' : ''}
            </div>
            ${isExExcluded
                ? '<span class="badge-danger">RISCALDAMENTO · ESCLUSO DAI MASSIMALI E DAL VOLUME ALLENANTE</span>'
                : ''}
        </div>
        
        <!-- Nome Esercizio in primo piano -->
        <h3 class="ex-name mb-md">${exIdx + 1}. ${escapeHtml(ex.name)}</h3>
        
    `;

    const prevExercise = findPreviousExercise(state.workoutData, mesoIndex, targetWeek.weekNumber, activeDayNum - 1, ex, false, state.currentYear);
    const recentExposures = findPriorExerciseExposures(
        state.workoutData,mesoIndex,targetWeek.weekNumber,activeDayNum,ex,state.currentYear);
    const equipmentSettings = {...athleteEquipment,...(athleteEquipment.loadingSteps||{})};
    const crossExposureAdvice = recommendCrossExposureLoad(ex,recentExposures,equipmentSettings);
    const prefillFor = setIndex=>getSetPrefill(ex,setIndex,{
        previousExercise:prevExercise,crossExposureAdvice
    });
    let lastSessionSetsHtml = '';
    const nextRepAdvice = recommendNextSessionReps(prevExercise, ex);

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

    // Historical numbers remain available but do not consume workout space.
    // Never discard their evidence just because the card is compact.
    const previousSessionMarkup = lastSessionSetsHtml ? `
        <details class="exercise-history-box exercise-notes-box mb-md"
                 aria-label="Ultima sessione precedente">
            <summary class="history-title">↩ Confronta con l’ultima seduta registrata</summary>
            <div class="history-content">${lastSessionSetsHtml}</div>
        </details>` : '';

    if (nextRepAdvice?.kind === 'build_reps' && !isPastMeso)
        cardHtml += `<p class="mycoatch-next-rep-hint">🤖 MyCoatch · ${escapeHtml(nextRepAdvice.reason)}</p>`;

    const notesPresent = Boolean(String(ex.notes||'').trim());
    const expandNotes = notesPresent || Boolean(String(ex.userNotes||'').trim());
    // Context label: this load was inferred from another prescription, not
    // copied from an identical day and never asserted to be an exact e1RM.
    const crossLabel = crossExposureAdvice
        ? `<p class="mycoatch-load-origin" role="note">🤖 Carico iniziale suggerito:
                <strong>${escapeHtml(crossExposureAdvice.kg)} kg</strong> · stima prudente da seduta con ripetizioni/RPE diversi. Verifica con avvicinamento.</p>`
        : '';
    cardHtml += `
        <div class="target-box mb-md">
            <strong>TARGET:</strong> ${formatExerciseSummary(ex)}
        </div>
        ${crossLabel}
        ${previousSessionMarkup}
        <details class="exercise-coach-notes" aria-label="Note del coach e note personali" ${expandNotes ? 'open' : ''}>
            <summary>📝 Istruzioni MyCoatch${notesPresent ? ' · presenti' : ''} e note personali</summary>
            <div class="exercise-coach-notes-body">
                ${notesPresent ? `<div class="note-allenatore-text">${escapeHtml(ex.notes)}</div>` : ''}
                <label class="workout-notes-label" for="ex-user-notes-${exIdx}">✍️ Note personali</label>
                <input type="text" id="ex-user-notes-${exIdx}" placeholder="Aggiungi una nota all'esercizio..."
                    value="${escapeHtml(ex.userNotes || '')}" class="ex-user-notes w-100"
                    data-ex="${exIdx}" ${isPastMeso ? 'disabled' : ''}>
            </div>
        </details>
    `;

    cardHtml += dropScopeControl(ex,exIdx,isPastMeso);
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

        // A persistent mini badge for confirmed comparable sets, also across
        // mesocycle/year boundaries. Never treat a draft or warmup as volume.
        const comparison=compareConfirmedSetVolume(ex,prevExercise,setIdx);
        const trendHtml=comparison
            ? '<span class="set-trend-badge is-'+comparison.status+
                '" title="'+escapeHtml(comparison.label)+'" aria-label="'+
                escapeHtml(comparison.label)+'"><span class="set-trend-pct">'+
                escapeHtml(comparison.display)+'</span><small class="set-trend-absolute">'+
                escapeHtml(comparison.absolute)+'</small></span>'
            : '';

        const suggested = prefillFor(setIdx);
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
        const setTargetRpeStr = String(ex.sets?.[setIdx]?.targetRpe ?? targetRpeStr).replace(/^@/, '').trim();
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
        if (setObj.intensityTechnique || hasDropPrescription(ex,setIdx)) {
            const isDrop = setObj.intensityTechnique === 'DROP_SET' || hasDropPrescription(ex,setIdx);
            intensityBadgeHtml = `<span class="badge-tech ${isDrop ? 'tech-drop' : 'tech-rpause'}">${isDrop ? 'DROP' : 'R-PAUSE'}</span>`;
        }

        cardHtml += `
            <tr class="workout-set-row ${setObj.isWarmup || setObj.warmup || setObj.is_warmup ? 'is-warmup-set' : ''}" data-set-index="${setIdx}" data-prefill-source="${suggested.source}">
                <td class="td-set flex-column flex-center">
                    <span class="font-bold text-sm">${setIdx + 1}</span>
                    <button type="button" class="set-warmup-toggle"
                        data-ex="${exIdx}" data-set="${setIdx}"
                        aria-pressed="${Boolean(setObj.isWarmup || setObj.warmup || setObj.is_warmup)}"
                        title="Alterna riscaldamento / serie allenante"
                        aria-label="Serie ${setIdx+1}: ${setObj.isWarmup || setObj.warmup || setObj.is_warmup ? 'riscaldamento, passa ad allenante' : 'segna come riscaldamento'}"
                        ${isPastMeso ? 'disabled' : ''}>${setObj.isWarmup || setObj.warmup || setObj.is_warmup ? 'W ✓' : 'W'}</button>
                    ${intensityBadgeHtml}
                </td>
                <td class="td-input td-kg-container">
                    <div class="kg-input-wrapper flex-column flex-center">
                        <input type="text" inputmode="decimal" autocomplete="off" class="set-input set-kg ios-no-zoom ${kgClass} ${isUnsavedKg ? 'text-placeholder-active' : ''}" data-ex="${exIdx}" data-set="${setIdx}" value="${escapeHtml(displayWeight)}" placeholder="${escapeHtml(targetWeightDefault)}" ${isDisabled ? 'disabled' : ''}>
                        ${trendHtml}
                    </div>
                </td>
                <td class="td-input td-reps-stepper">
                    <div class="reps-stepper" role="group" aria-label="Correggi le ripetizioni eseguite nella serie ${setIdx + 1}">
                        <button type="button" class="reps-step-btn" data-ex="${exIdx}" data-set="${setIdx}" data-direction="-1" aria-label="Diminuisci ripetizioni di 1 nella serie ${setIdx + 1}" ${isDisabled ? 'disabled' : ''}>−</button>
                        <input type="text" inputmode="numeric" autocomplete="off" class="set-input set-reps ios-no-zoom ${repsClass} ${isUnsavedReps ? 'text-placeholder-active' : ''}" data-ex="${exIdx}" data-set="${setIdx}" value="${escapeHtml(displayReps)}" placeholder="${escapeHtml(defaultTargetReps)}" aria-label="Ripetizioni eseguite nella serie ${setIdx + 1}" ${isDisabled ? 'disabled' : ''}>
                        <button type="button" class="reps-step-btn" data-ex="${exIdx}" data-set="${setIdx}" data-direction="1" aria-label="Aumenta ripetizioni di 1 nella serie ${setIdx + 1}" ${isDisabled ? 'disabled' : ''}>+</button>
                    </div>
                </td>
                <td class="td-input td-rpe-stepper">
                    <div class="rpe-stepper" role="group" aria-label="Correggi l'RPE percepito nella serie ${setIdx + 1}">
                        <button type="button" class="rpe-step-btn" data-ex="${exIdx}" data-set="${setIdx}" data-direction="-1" aria-label="Diminuisci RPE di 0,5 nella serie ${setIdx + 1}" ${isDisabled ? 'disabled' : ''}>−</button>
                        <input type="text" inputmode="decimal" autocomplete="off" class="set-input set-rpe ios-no-zoom ${rpeClass} ${isUnsavedRpe ? 'text-placeholder-active' : ''}" data-ex="${exIdx}" data-set="${setIdx}" value="${escapeHtml(displayRpe)}" placeholder="RPE" title="RPE percepito: correggi il valore suggerito prima del ✓. Il target rimane invariato." aria-label="RPE percepito nella serie ${setIdx + 1}" ${isDisabled ? 'disabled' : ''}>
                        <button type="button" class="rpe-step-btn" data-ex="${exIdx}" data-set="${setIdx}" data-direction="1" aria-label="Aumenta RPE di 0,5 nella serie ${setIdx + 1}" ${isDisabled ? 'disabled' : ''}>+</button>
                    </div>
                    <small class="rpe-target-label" title="Obiettivo RPE di MyCoatch, non prestazione effettuata">Target ${escapeHtml(setTargetRpeStr || '—')}</small>
                </td>
                <td class="td-check text-center">
                    <input type="checkbox" class="set-lock-check custom-big-check" aria-label="Conferma o riapri serie ${setIdx+1}" title="${hasDropPrescription(ex,setIdx)?'Conferma base e scarichi insieme':'Conferma serie'}" data-ex="${exIdx}" data-set="${setIdx}" ${isLocked ? 'checked' : ''} ${isPastMeso ? 'disabled' : ''}>
                </td>
            </tr>
        `;
        cardHtml += dropFields(ex,exIdx,setIdx,isPastMeso);
    });

    cardHtml += `
            </tbody>
        </table>
    `;

    if(equipment!=='other')cardHtml += `
        <details class="plates-disclosure"><summary>${equipment==='unknown'?'Usi un bilanciere? Calcola i dischi':'Calcola dischi per bilanciere'}</summary>
        <div class="bar-plates-container" aria-label="Calcolo dischi serie attiva">
            <div class="bar-controls-row">
                <span class="bar-select-label">🏋️ SERIE <span class="plates-active-set">${selected+1}</span></span>
                <select class="bar-select" aria-label="Bilanciere: peso e diametro" ${isPastMeso ? 'disabled' : ''}>
                    ${barOptions.length ? barOptions.map(bar=>`<option value="${barbellOptionValue(bar)}">Bil ${bar.weight} kg · Ø${bar.diameter} mm</option>`).join('')
                        : '<option value="">Configura bilanciere…</option>'}
                </select>
            </div>
            <div class="plates-badge" data-ex="${exIdx}">Configura i tuoi bilancieri in Strumenti → Attrezzatura personale.</div>
        </div>
        </details>
    `;
    cardHtml += `
        <div id="mycoach-advice-${exIdx}" class="mycoach-fatigue-alert is-hidden"></div>
    `;

    exCard.innerHTML = cardHtml;

    // Il coaching in seduta è calcolato centralmente solo dai set confermati.
    // Nessun consiglio si basa su placeholder o su RPE inventati.
    const toggleExclusion = () => {
        if (isPastMeso) return;
        const exercise=currentDay.exercises[exIdx];
        const warmup=!isWarmupExercise(exercise);
        // Preserve compatibility with legacy isExcluded flags and analytics.
        exercise.isWarmup=warmup;
        exercise.isExcluded=warmup;
        saveAndSync(state.workoutData);
        renderWorkoutList();
    };

    // Gesto intenzionale: doppio click su desktop e solo swipe a sinistra >=300px su telefono.
    // I campi, gli elementi interattivi e le note non devono attivare l'esclusione.
    exCard.addEventListener('dblclick', event => {
        // I doppi tocchi sul telefono non equivalgono a un doppio click da PC.
        if (window.matchMedia?.('(pointer: coarse)').matches) return;
        if (event.target.closest('input, select, textarea, button, a, label, summary, details, .exercise-coach-notes')) return;
        toggleExclusion();
    });
    enableCardSwipeGesture(exCard, toggleExclusion);

    const selectSet=(idx)=>{
        if(!Number.isInteger(idx)||idx<0||idx>=logs.length)return;
        exCard.dataset.activeSet=String(idx);
        chosenSetByKey.set(uiKey,idx);
        exCard.querySelectorAll('.workout-set-row').forEach(row=>{
            const active=Number(row.dataset.setIndex)===idx;
            row.classList.toggle('is-active-set',active);
            row.setAttribute('aria-current',active?'true':'false');
        });
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
        barSelect.value=barbellOptionValue(suggestedBar);
        barSelect.addEventListener('change',()=>{
            if(isPastMeso || !barSelect.value)return;
            const [weight,diameter]=barSelect.value.split('|');
            state.workoutData.athlete ||= {};
            state.workoutData.athlete.barbellAssignments ||= {};
            state.workoutData.athlete.barbellAssignments[canonicalExerciseKey(ex.name)]={
                weight:Number(weight),diameter};
            saveAndSync(state.workoutData,'SET_EQUIPMENT');
            updatePlatesBadgeUI(exIdx,exCard);
        });
    }
    exCard.dataset.platesAutoEligible=String(equipment==='barbell');
    const disclosure=exCard.querySelector('.plates-disclosure');
    if(disclosure){
        disclosure.open=automaticallyShowPlates(ex,prefillFor(selected).weight);
        disclosure.querySelector('summary').addEventListener('click',()=>{disclosure.dataset.manual='true';});
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
    const [selectedBarWeight,diameter]=String(select?.value||'').split('|');
    const barWeight=Number(selectedBarWeight);
    const disclosure=card.querySelector('.plates-disclosure');
    if(disclosure && !disclosure.dataset.manual)disclosure.open=card.dataset.platesAutoEligible==='true' && total>35;
    if(!select?.value || !['50','29'].includes(diameter) || !Number.isFinite(barWeight) || barWeight<=0){
        badge.className='plates-badge plates-badge-empty';
        badge.textContent='Configura i tuoi bilancieri in Strumenti → Attrezzatura personale.';
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
    const inventory=state.workoutData?.athlete?.plateInventories?.[diameter];
    if(!inventory){
        badge.className='plates-badge plates-badge-empty';
        badge.textContent='Configura i dischi da '+diameter+' mm in Attrezzatura personale.';
        return;
    }
    const breakdown=getPlateBreakdown(total,barWeight,inventory);
    if(!breakdown?.plates?.length){
        badge.className='plates-badge plates-badge-empty';
        badge.textContent='Nessuna combinazione disponibile per questo carico con i dischi configurati.';
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

