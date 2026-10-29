import {isExerciseSkipped} from './sessionSkip.js';
import {setPrescription} from '../mycoatch/setPrescription.js';
import {trainingExposures} from '../mycoatch/trainingHistory.js';
import {previousSessionMarkup} from './exerciseHistoryUI.js';
import {renderExerciseCoachPanel} from './exerciseCoachUI.js';
import {assessSessionReadiness} from '../mycoatch/sessionReadiness.js';
import {recommendNextExposure} from '../mycoatch/nextExposure.js';
import {canonicalExerciseKey} from '../mycoatch/exerciseIdentity.js';
import {hasDropPrescription} from './trainingTechniques.js';
import {dropFields,dropScopeControl} from './dropSetUI.js';
import {equipmentKind,automaticallyShowPlates,selectableBarbells,suggestedBarbell,barbellOptionValue} from './equipmentUI.js';
/**
 * Module: exerciseCard.js
 * Summary: Genera dinamicamente le card per ogni esercizio gestendo lo stato di esclusione dai massimali, i selettori del bilanciere, il calcolo dei dischi per lato e l'evidenziatura automatica fuori target per KG (inclusi Topset), REPS ed RPE (con supporto al feedback verde di miglioramento).
 */

import { formatExerciseSummary, getPlateBreakdown, findPriorExerciseExposures, isValueOutOfRange, isValueExceedingTarget, parseRPE, escapeHtml } from './helpers.js';
import { state } from './state.js';
import { enableCardSwipeGesture } from './gestures.js';
import { isWarmupExercise } from './workoutSemantics.js';
import { saveAndSync } from './storage.js';
import { renderWorkoutList } from './ui.js';
import { getSetPrefill, getSetRepsTarget } from './setPrefill.js';
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
    const skipped=isExerciseSkipped(ex);
    const isDropsetPlan = ex.isDropset || (ex.sets||[]).some(s=>s.intensityTechnique==='DROP_SET');
    const equipment=equipmentKind(ex);

    const exCard = document.createElement('div');
    exCard.className = `ex-card ${isExExcluded ? 'is-excluded' : ''} ${isDropsetPlan ? 'is-dropset' : ''} ${skipped?'is-session-skipped':''}`;
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
        ${!isExExcluded?`<div class="exercise-skip-actions"><button type="button" class="btn btn-sm exercise-session-skip" data-ex="${exIdx}" ${isPastMeso||!skipped&&!logs.some(s=>!s.isLocked&&!s.completed&&!s.isWarmup)?'disabled':''}>${skipped?'Ripristina esercizio':"Salta solo quest'allenamento se hai problemi"}</button><span class="exercise-skip-status" role="status">${skipped?'Saltato oggi · Motivo obbligatorio nelle note personali. Le serie già eseguite restano registrate.':''}</span></div>`:''}
        
    `;

    const previousExposure=trainingExposures(state.workoutData,{year:state.currentYear,mesoIndex,weekNumber:targetWeek.weekNumber,dayIndex:activeDayNum-1},ex)[0];
    const prevExercise=previousExposure?.exercise??null;
    const recentExposures = findPriorExerciseExposures(
        state.workoutData,mesoIndex,targetWeek.weekNumber,activeDayNum,ex,state.currentYear);
    const equipmentSettings = {...athleteEquipment,...(athleteEquipment.loadingSteps||{})};
    const crossExposureAdvice = ex.coachSetProposals ? null : recommendCrossExposureLoad(ex,recentExposures,equipmentSettings);
    const nextExposureAdvice = ex.coachSetProposals ? null : recommendNextExposure(prevExercise,ex,equipmentSettings,
        assessSessionReadiness(currentDay.coachCheckin));
    const prefillFor = setIndex=>getSetPrefill(ex,setIndex,{
        previousExercise:prevExercise,crossExposureAdvice,nextExposureAdvice
    });
    const nextRepAdvice = recommendNextSessionReps(prevExercise, ex);
    const personalNotesMarkup = `
        <div class="exercise-personal-notes">
            <label class="workout-notes-label" for="ex-user-notes-${exIdx}">✍️ Note personali</label>
            <input type="text" id="ex-user-notes-${exIdx}" placeholder="Aggiungi una nota all'esercizio..."
                value="${escapeHtml(ex.userNotes || '')}" class="ex-user-notes w-100"
                data-ex="${exIdx}" ${isPastMeso&&!skipped ? 'disabled' : ''} ${skipped?'required':''}>
        </div>`;

    cardHtml += `
        <div class="target-box mb-md">
            <strong>${ex.coachSetProposals?'SCHEDA ORIGINALE':'TARGET'}:</strong> ${formatExerciseSummary(ex)}
        </div>
        <section class="exercise-coach-notes" aria-label="Istruzioni e aggiornamenti dell’esercizio">
            <div class="exercise-coach-notes-body">
                <div class="exercise-plan-notes"><strong>Note della scheda</strong><div class="note-allenatore-text"></div></div>
                <div class="exercise-coach-updates"><strong>Consigli di MyCoatch</strong><div class="coach-adaptive-notes" aria-live="polite" aria-atomic="true"></div><div class="coach-apply-slot"></div></div>
            </div>
        </section>
    `;

    cardHtml += previousSessionMarkup(previousExposure,escapeHtml);
    cardHtml += dropScopeControl(ex,exIdx,isPastMeso||skipped);
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
        const isDisabled = isLocked || isPastMeso || skipped;

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
        const defaultTargetReps = getSetRepsTarget(ex, setIdx);

        const rowPlan=setPrescription(ex,setIdx);
        let currentKgMin = suggested.range?.min ?? ex.coachSetProposals?.[setIdx]?.weight ?? rowPlan.kg?.min;
        let currentKgMax = suggested.range?.max ?? ex.coachSetProposals?.[setIdx]?.weight ?? rowPlan.kg?.max;

        if (!ex.coachSetProposals && (setIdx === 0 || setObj.isTopset) && (ex.topsetKgMin || ex.topsetKgMax || ex.topsetKg)) {
            currentKgMin = ex.topsetKgMin || ex.topsetKg;
            currentKgMax = ex.topsetKgMax || ex.topsetKg;
        }

        const isKgOutOfRange = isValueOutOfRange(displayWeight, currentKgMin, currentKgMax);
        const isKgExceeding = isValueExceedingTarget(displayWeight, currentKgMin, currentKgMax);

        const isRepsOutOfRange = isValueOutOfRange(displayReps, rowPlan.reps?.min, rowPlan.reps?.max);
        const isRepsExceeding = isValueExceedingTarget(displayReps, rowPlan.reps?.min, rowPlan.reps?.max);

        const targetRpeStr = String(ex.targetRpe || ex.rpeTarget || ex.rpe || '').replace('@', '').trim();
        const setTargetRpeStr = rowPlan.rpe ? (rowPlan.rpe.min===rowPlan.rpe.max?String(rowPlan.rpe.max):rowPlan.rpe.min+'–'+rowPlan.rpe.max) : targetRpeStr;
        const maxRpe = rowPlan.rpe?.max ?? ex.maxRpe ?? targetRpeStr;

        const cleanDisplayRpe = parseRPE(displayRpe);
        const isRpeOutOfRange = cleanDisplayRpe!=='' && (Number(cleanDisplayRpe)<5 || Number(cleanDisplayRpe)>10 || (Number.isFinite(Number(maxRpe)) && Number(cleanDisplayRpe)>Number(maxRpe)));
        const isRpeExceeding = false; // Lower RPE is margin, not a target violation.

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
                        ${isPastMeso||skipped ? 'disabled' : ''}>${setObj.isWarmup || setObj.warmup || setObj.is_warmup ? 'W ✓' : 'W'}</button>
                    ${intensityBadgeHtml}
                </td>
                <td class="td-input td-kg-container">
                    <div class="kg-input-wrapper flex-column flex-center">
                        <input type="text" inputmode="decimal" autocomplete="off" class="set-input set-kg ios-no-zoom ${kgClass} ${isUnsavedKg ? 'text-placeholder-active' : ''}" data-ex="${exIdx}" data-set="${setIdx}" value="${escapeHtml(displayWeight)}" placeholder="${escapeHtml(targetWeightDefault)}" ${isDisabled ? 'disabled' : ''}>
                        ${suggested.range?`<small class="coach-load-range" title="Intervallo operativo stimato, da verificare durante la seduta">${escapeHtml(suggested.range.min)}–${escapeHtml(suggested.range.max)} kg</small>`:''}
                        ${trendHtml}
                    </div>
                </td>
                <td class="td-input td-reps-stepper">
                    <div class="reps-stepper" role="group" aria-label="Correggi le ripetizioni eseguite nella serie ${setIdx + 1}">
                        <button type="button" class="reps-step-btn" data-ex="${exIdx}" data-set="${setIdx}" data-direction="-1" aria-label="Diminuisci ripetizioni di 1 nella serie ${setIdx + 1}" ${isDisabled ? 'disabled' : ''}>−</button>
                        <input type="text" inputmode="numeric" autocomplete="off" class="set-input set-reps ios-no-zoom ${repsClass} ${isUnsavedReps ? 'text-placeholder-active' : ''}" data-ex="${exIdx}" data-set="${setIdx}" value="${escapeHtml(displayReps)}" placeholder="${escapeHtml(defaultTargetReps || 'reps')}" aria-label="Ripetizioni eseguite nella serie ${setIdx + 1}" ${isDisabled ? 'disabled' : ''}>
                        <button type="button" class="reps-step-btn" data-ex="${exIdx}" data-set="${setIdx}" data-direction="1" aria-label="Aumenta ripetizioni di 1 nella serie ${setIdx + 1}" ${isDisabled ? 'disabled' : ''}>+</button>
                    </div>
                    <small class="reps-target-label" title="Ripetizioni previste dalla scheda per questa serie, non quelle effettivamente eseguite">Ob. ${escapeHtml(defaultTargetReps || '—')}</small>
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
                    <input type="checkbox" class="set-lock-check custom-big-check" aria-label="Conferma o riapri serie ${setIdx+1}" title="${hasDropPrescription(ex,setIdx)?'Conferma base e scarichi insieme':'Conferma serie'}" data-ex="${exIdx}" data-set="${setIdx}" ${isLocked ? 'checked' : ''} ${isPastMeso||skipped ? 'disabled' : ''}>
                </td>
            </tr>
        `;
        cardHtml += dropFields(ex,exIdx,setIdx,isPastMeso||skipped);
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
                <select class="bar-select" aria-label="Bilanciere: peso e diametro" ${isPastMeso||skipped ? 'disabled' : ''}>
                    <option value="">Scegli bilanciere…</option>
                    ${barOptions.length ? barOptions.map(bar=>`<option value="${barbellOptionValue(bar)}">Bil ${bar.weight} kg · Ø${bar.diameter} mm</option>`).join('')
                        : ''}
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
    exCard.querySelector('.set-table')?.insertAdjacentHTML('afterend',personalNotesMarkup);
    renderExerciseCoachPanel(exCard,ex,{getPrefill:prefillFor,readOnly:isPastMeso,
        nextExposureAdvice,crossExposureAdvice,nextRepAdvice,historySource:previousExposure?.source});

    // Il coaching in seduta è calcolato centralmente solo dai set confermati.
    // Nessun consiglio si basa su placeholder o su RPE inventati.
    const toggleExclusion = () => {
        if (isPastMeso||skipped) return;
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

