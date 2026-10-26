import {saveAndSync} from './storage.js';
import {reconcileTrainingPlan} from '../mycoatch/trainingPlan.js';
import {bindActiveExercisePanels} from './activeExercise.js';
import {createCircuitCard} from './circuitUI.js';
import {isCircuit} from './restPolicy.js';
// ==========================================
// MODULI: ui.js - Gestione interfaccia utente, eventi DOM, rendering schede allenamento e upload universale
// ==========================================

// ==========================================
// 1. IMPORT & ELEMENTI DOM
// ==========================================
import { state } from './state.js';
import { historyWindow } from './historyWindow.js';
import { stopTimer, adjustTimer, handleTick, handleComplete } from './timer.js';
import { testTimerAudio } from './audio.js';
import { createSingleExerciseCard, updatePlatesBadgeUI } from './exerciseCard.js';
import { updateSessionHeaderUI } from './sessionTimer.js';
import { bindWorkoutTableEvents } from './workoutEvents.js';


import { createLiveCoachPanel, updateLiveCoachPanel, dismissLiveCoachToast } from './liveCoachUI.js';
import { toggleCurrentMesocycleLock } from './mesocycle.js';
import { createMesocycleClosurePanel } from './mesocycleClosureUI.js';
import { shouldHighlightMesocycleClosure, acknowledgeMesocycleClosurePrompt } from './mesocycleReminder.js';
import { createWeeklyReviewPanel } from './weeklyReviewUI.js';
import { createFutureLoadReviewPanel } from './futureLoadReviewUI.js';

export const DOM = {
    appContainer: document.getElementById('app-container'),
    workoutForm: document.getElementById('workout-form'),
    workoutListContainer: document.getElementById('workout-list-container'),
    timerDisplay: document.getElementById('timer-display')
};

// ==========================================
// 2. NOTIFICHE E BOTTOM SHEET
// ==========================================
export function showNotification(message) {
    alert(message);
}

// ==========================================
// 2.5 MODULO DI UPLOAD UNIVERSALE (PDF / EXCEL / XML)
// ==========================================
// ==========================================
// FUNZIONE DI SUPPORTO: RECUPERO SICURO MESOCICLO ATTIVO
// ==========================================
function getActiveYearAndMeso() {
    const yearsObj = state.showArchivedHistory ? state.workoutData?.history?.years || {}
        : historyWindow(state.workoutData).active;
    const requested=String(state.currentYear || new Date().getFullYear());
    const currentYear=yearsObj[requested] ? requested
        : yearsObj[String(new Date().getFullYear())] ? String(new Date().getFullYear())
        : Object.keys(yearsObj).filter(y=>/^\d{4}$/.test(y))
            .sort((a,b)=>Number(b)-Number(a))[0];
    if(currentYear && currentYear!==state.currentYear)state.currentYear=currentYear;
    
    let yearData = yearsObj[currentYear];
    if (!yearData || !yearData.mesocycles || yearData.mesocycles.length === 0) {
        const yearKeys = Object.keys(yearsObj);
        if (yearKeys.length > 0) {
            yearData = yearsObj[yearKeys.sort((a,b)=>Number(b)-Number(a))[0]];
        }
    }
    
    const mesoIndex = state.activeMesocycleIndex || 0;
    const meso = yearData?.mesocycles?.[mesoIndex] || yearData?.mesocycles?.[0];
    return { yearData, meso, mesoIndex };
}

// ==========================================
// 3. EVENT DELEGATION UNIFICATO (TIMER & MESOCICLO)
// ==========================================
document.addEventListener('click', (e) => {
    if (!e.target) return;
    
    // Controlli Timer Flottante
    if (e.target.closest?.('#timer-test-audio')) {
        const available=testTimerAudio();
        const info=document.getElementById('timer-audio-status');
        if(info)info.textContent=available
            ? 'Test audio richiesto · tieni la PWA in primo piano'
            : 'Audio non supportato su questo dispositivo';
        return;
    }
    if (e.target.id === 'timer-minus-15') {
        adjustTimer(-15, handleTick, handleComplete);
        return;
    } else if (e.target.id === 'timer-plus-30') {
        adjustTimer(30, handleTick, handleComplete);
        return;
    } else if (e.target.id === 'stop-timer-btn' || e.target.id === 'timer-close') {
        stopTimer();
        const floatingTimerEl = document.getElementById('floating-timer');
        if (floatingTimerEl) floatingTimerEl.classList.remove('active');
        return;
    }

    const clickedBtn = e.target.closest('button');
    if (!clickedBtn) return;

    const { yearData } = getActiveYearAndMeso();

    if (clickedBtn.id === 'prev-meso-btn') {
        if (state.activeMesocycleIndex > 0) {
            state.activeMesocycleIndex--;
            localStorage.setItem('ui_active_meso', state.activeMesocycleIndex);
            renderWorkoutList();
        }
    } else if (clickedBtn.id === 'next-meso-btn') {
        if (yearData && yearData.mesocycles && state.activeMesocycleIndex < yearData.mesocycles.length - 1) {
            state.activeMesocycleIndex++;
            localStorage.setItem('ui_active_meso', state.activeMesocycleIndex);
            renderWorkoutList();
        }
    } else if (clickedBtn.id === 'toggle-lock-meso-btn') {
        e.preventDefault();
        toggleCurrentMesocycleLock();
    } else if (clickedBtn.id === 'review-close-meso-btn') {
        e.preventDefault();
        const { meso } = getActiveYearAndMeso();
        acknowledgeMesocycleClosurePrompt(meso);
        clickedBtn.classList.remove('meso-closure-attention');
        const panel = document.getElementById('mesocycle-closure-panel');
        if (panel) {
            panel.hidden = false;
            panel.open = true;
            panel.scrollIntoView({behavior:'smooth',block:'nearest'});
        }
    }
});

// ==========================================
// 4. RENDERING SCHEDA ALLENAMENTO
// ==========================================
export function renderWorkoutList() {
    // Cambiare esercizio, settimana o seduta non deve lasciare consigli obsoleti.
    dismissLiveCoachToast();
    if (!DOM.workoutListContainer) return;
    const coachWasOpen = Boolean(document.getElementById('mycoatch-live-disclosure')?.open);
    const reviewWasOpen = Boolean(document.getElementById('mycoatch-weekly-review')?.open);
    const closureWasOpen = Boolean(document.getElementById('mesocycle-closure-panel')?.open);
    DOM.workoutListContainer.innerHTML = '';

    if (!state.activeView) state.activeView = 'workout';
    if (state.activeView !== 'workout') {
        DOM.workoutListContainer.classList.add('d-none');
        return;
    }
    
    DOM.workoutListContainer.classList.remove('d-none');

    const historyScope=historyWindow(state.workoutData);
    if(Object.keys(historyScope.archived).length){
        const archiveControl=document.createElement('button');
        archiveControl.type='button';archiveControl.id='history-archive-toggle';
        archiveControl.className='btn btn-secondary btn-sm';
        archiveControl.textContent=state.showArchivedHistory
            ? `Torna allo storico ${historyScope.start}–${historyScope.end}` : 'Consulta anche gli anni precedenti';
        archiveControl.addEventListener('click',()=>{
            state.showArchivedHistory=!state.showArchivedHistory;
            state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;
            renderWorkoutList();
        });
        DOM.workoutListContainer.append(archiveControl);
    }
    const { yearData, meso, mesoIndex } = getActiveYearAndMeso();

    if (!yearData || !yearData.mesocycles || yearData.mesocycles.length === 0) {
        const emptyNotice = document.createElement('div');
        emptyNotice.className = 'day-card text-center padding-lg';
        emptyNotice.innerHTML = `<p class="text-muted text-sm m-0">Nessuna scheda di allenamento trovata. Vai su <strong>Strumenti e gestione -> Importa scheda</strong> per caricarne una.</p>`;
        DOM.workoutListContainer.appendChild(emptyNotice);
        return;
    }

    const isPastMeso = Boolean(meso.locked);
    const activeWeekNum = state.activeWeek || 1;
    const targetWeek = (meso.weeks || []).find(w => w.weekNumber === activeWeekNum) || meso.weeks?.[0];

    if (!targetWeek) return;

    if(!isPastMeso && reconcileTrainingPlan(state.workoutData,{year:state.currentYear,mesoIndex})) {
        saveAndSync(state.workoutData,'COACH_PROTOCOL_REFRESH');
    }

    // BANNER MESOCICLO BLOCCATO
    if (isPastMeso) {
        const archiveBadge = document.createElement('div');
        archiveBadge.className = 'meso-locked-badge mb-md flex-center gap-md';
        archiveBadge.textContent = meso.coachClosure?.status === 'closed'
            ? '🔒 Mesociclo concluso: archivio in sola lettura. Consulta il report o sblocca con conferma per riaprire.'
            : '🔒 Mesociclo bloccato: dati in sola lettura. Sblocca per modificarli.';
        DOM.workoutListContainer.appendChild(archiveBadge);
    }
    
    // Un'unica fascia per Meso / Settimana / Timer, con i giorni subito sotto.
    const unifiedHeaderBox = document.createElement('div');
    unifiedHeaderBox.className = 'unified-header-box';
    unifiedHeaderBox.setAttribute('aria-label', 'Navigazione della scheda di allenamento');

    const quickRow = document.createElement('div');
    quickRow.className = 'workout-quick-controls';

    const isLocked = Boolean(meso.locked);
    const years=Object.keys(state.showArchivedHistory ? state.workoutData?.history?.years||{} : historyScope.active)
        .filter(y=>/^\d{4}$/.test(y) && state.workoutData.history.years[y]?.mesocycles?.length)
        .sort((a,b)=>Number(b)-Number(a));
    if(years.length){
        const wrapper=document.createElement('div');
        wrapper.className='year-selector-container';
        const label=document.createElement('label');
        label.htmlFor='workout-year-select';
        label.textContent='Anno';
        label.className='workout-compact-label';
        const sel=document.createElement('select');
        sel.id='workout-year-select';
        sel.className='week-select-input';
        for(const year of years){
            const opt=document.createElement('option');
            opt.value=year;opt.textContent=year;
            opt.selected=year===String(state.currentYear);
            sel.append(opt);
        }
        sel.addEventListener('change',()=>{
            state.currentYear=sel.value;
            localStorage.setItem('ui_active_year',sel.value);
            state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;
            localStorage.setItem('ui_active_meso','0');
            localStorage.setItem('ui_active_week','1');
            localStorage.setItem('ui_active_day','1');
            renderWorkoutList();
        });
        wrapper.append(label,sel);
        quickRow.appendChild(wrapper);
    }
    const mesoRow = document.createElement('div');
    mesoRow.className = 'meso-compact-control';
    mesoRow.innerHTML = `
        <span class="workout-compact-label">Meso</span>
        <button class="btn btn-secondary btn-mini" id="prev-meso-btn"
            type="button" aria-label="Mesociclo precedente" title="Mesociclo precedente"
            ${mesoIndex === 0 ? 'disabled' : ''}>‹</button>
        <span id="meso-display" class="font-bold text-sm">${mesoIndex + 1}</span>
        <button class="btn btn-secondary btn-mini" id="next-meso-btn"
            type="button" aria-label="Mesociclo successivo" title="Mesociclo successivo"
            ${mesoIndex >= yearData.mesocycles.length - 1 ? 'disabled' : ''}>›</button>
    `;
    quickRow.appendChild(mesoRow);

    const weekRow = document.createElement('div');
    weekRow.className = 'week-selector-container';
    const weeksOptions = (meso.weeks || []).map(w =>
        `<option value="${w.weekNumber}" ${w.weekNumber === targetWeek.weekNumber ? 'selected' : ''}>${w.weekNumber}</option>`
    ).join('');
    weekRow.innerHTML = `
        <label for="week-selector" class="workout-compact-label">Sett.</label>
        <select id="week-selector" class="week-select-input" aria-label="Seleziona settimana">${weeksOptions}</select>
    `;
    const weekSelectEl = weekRow.querySelector('#week-selector');
    weekSelectEl.onchange = (event) => {
        state.activeWeek = parseInt(event.target.value, 10);
        localStorage.setItem('ui_active_week', state.activeWeek);
        renderWorkoutList();
    };
    quickRow.appendChild(weekRow);

    const currentDayIndex = state.activeDay || 1;
    // Compatibilita' con createSingleExerciseCard e con i tab di esercizio.
    const activeDayNum = currentDayIndex;
    const currentDay = targetWeek.days?.[currentDayIndex - 1] || targetWeek.days?.[0];
    if (!currentDay) return;

    const timerRow = document.createElement('div');
    timerRow.className = 'session-timer-box';
    timerRow.innerHTML = `
        <span class="timer-dot" aria-hidden="true"></span>
        <span id="live-session-timer" class="session-timer-text">0:00</span>
    `;
    quickRow.appendChild(timerRow);

    // Blocco mesociclo sempre visibile, anche su smartphone.
    const lockButton = document.createElement('button');
    lockButton.type = 'button';
    lockButton.className = `btn btn-secondary btn-sm ${isLocked ? 'is-locked' : ''}`;
    lockButton.id = 'toggle-lock-meso-btn';
    lockButton.textContent = isLocked ? '🔒 Sblocca mesociclo' : '🔓 Blocca mesociclo';
    lockButton.title = isLocked ? 'Rendi modificabile il mesociclo' : 'Blocca il mesociclo';
    lockButton.setAttribute('aria-pressed', String(isLocked));
    lockButton.setAttribute('aria-label', isLocked ? 'Sblocca mesociclo' : 'Blocca mesociclo');
    lockButton.classList.add('meso-direct-lock');
    quickRow.appendChild(lockButton);
    const closureButton = document.createElement('button');
    closureButton.type = 'button';
    closureButton.id = 'review-close-meso-btn';
    closureButton.className = 'btn btn-secondary btn-sm meso-guided-closure-trigger';
    const closedMeso = meso.coachClosure?.status === 'closed';
    const closureIcon = document.createElement('span');
    closureIcon.textContent = closedMeso ? '📄' : '🤖';
    closureIcon.setAttribute('aria-hidden', 'true');
    const closureText = document.createElement('span');
    closureText.className = 'meso-guided-closure-text';
    const highlightClosure = shouldHighlightMesocycleClosure(meso);
    closureText.textContent = closedMeso ? 'Report fine mesociclo'
        : highlightClosure ? 'MyCoatch' : 'Concludi mesociclo';
    closureButton.append(closureIcon, closureText);
    if (highlightClosure) closureButton.classList.add('meso-closure-attention');
    closureButton.setAttribute('aria-label', highlightClosure
        ? 'Apri il report MyCoatch: controlla anche le serie non confermate'
        : closureText.textContent);
    closureButton.title = highlightClosure
        ? 'Ultima serie dell’ultimo giorno spuntata. Apri il report MyCoatch e controlla eventuali serie mancanti.'
        : 'Controlla il riepilogo prima di confermare la chiusura';
    quickRow.appendChild(closureButton);
    unifiedHeaderBox.appendChild(quickRow);

    // I giorni restano accessibili tramite chip scorrevoli.
    const dayTabsContainer = document.createElement('nav');
    dayTabsContainer.className = 'day-tabs';
    dayTabsContainer.setAttribute('aria-label', 'Giorni di allenamento');
    (targetWeek.days || []).forEach((day, idx) => {
        const dayIndex = idx + 1;
        const dayBtn = document.createElement('button');
        dayBtn.type = 'button';
        dayBtn.className = `btn ${dayIndex === currentDayIndex ? 'btn-primary active-day-btn' : 'btn-secondary inactive-day-btn'}`;
        dayBtn.textContent = day.dayName || `Giorno ${dayIndex}`;
        if (dayIndex === currentDayIndex) dayBtn.setAttribute('aria-current', 'true');
        dayBtn.onclick = () => {
            state.activeDay = dayIndex;
            localStorage.setItem('ui_active_day', state.activeDay);
            renderWorkoutList();
        };
        dayTabsContainer.appendChild(dayBtn);
    });
    unifiedHeaderBox.appendChild(dayTabsContainer);
    DOM.workoutListContainer.appendChild(unifiedHeaderBox);
    const closurePanel = createMesocycleClosurePanel(meso, state.workoutData);
    closurePanel.open = closureWasOpen;
    closurePanel.hidden = !closureWasOpen;
    DOM.workoutListContainer.appendChild(closurePanel);

    // Il pannello mantiene ogni dato e comando ma e' ripiegato di default.
    const coachDisclosure = document.createElement('details');
    coachDisclosure.className = 'mycoatch-live-disclosure';
    coachDisclosure.id = 'mycoatch-live-disclosure';
    coachDisclosure.open = coachWasOpen;
    const coachSummary = document.createElement('summary');
    coachSummary.className = 'mycoatch-live-trigger';
    coachSummary.setAttribute('aria-label', 'Apri o chiudi il riepilogo MyCoatch');
    const coachName = document.createElement('strong');
    coachName.textContent = '🤖 Riepilogo seduta';
    const coachCount = document.createElement('span');
    coachCount.className = 'mycoatch-live-count';
    coachCount.setAttribute('aria-live', 'off');
    coachCount.textContent = 'Serie 0/0';
    coachSummary.append(coachName, coachCount);
    coachDisclosure.append(coachSummary, createLiveCoachPanel(currentDay, { readOnly: isPastMeso }));
    DOM.workoutListContainer.appendChild(coachDisclosure);
    const futureReview=meso.coachProtocol ? null : createFutureLoadReviewPanel(meso,targetWeek.weekNumber,currentDayIndex-1,{
        readOnly:isPastMeso,render:renderWorkoutList
    });
    if(futureReview)DOM.workoutListContainer.appendChild(futureReview);
    const weeklyReview = meso.coachProtocol ? null : createWeeklyReviewPanel(meso, targetWeek.weekNumber, {
        readOnly:isPastMeso,wasOpen:reviewWasOpen,render:renderWorkoutList
    });
    if(weeklyReview)DOM.workoutListContainer.appendChild(weeklyReview);

    // Una sola istruzione per la seduta: mai ripeterla per ogni esercizio.
    if ((currentDay.exercises || []).length) {
        const info = document.createElement('p');
        info.className = 'workout-confirmation-help';
        info.textContent = 'Conferma ✓ dopo aver verificato i valori realmente eseguiti.';
        DOM.workoutListContainer.appendChild(info);
    }

    if (currentDay.sessionStart) {
        const startDate = new Date(currentDay.sessionStart).toDateString();
        const todayDate = new Date().toDateString();
        if (startDate !== todayDate && !currentDay.completed) {
            currentDay.sessionStart = null;
            currentDay.accumulatedSeconds = 0;
            currentDay.isPaused = false;
        }
    }

    if (window._sessionTimerInterval) {
        clearInterval(window._sessionTimerInterval);
    }

    window._sessionTimerInterval = setInterval(() => {
        const timerEl = document.getElementById('live-session-timer');
        if (!timerEl || currentDay.completed || currentDay.isPaused || !currentDay.sessionStart) return;
        
        const activeSegmentSecs = Math.floor((Date.now() - currentDay.sessionStart) / 1000);
        const totalSecs = (currentDay.accumulatedSeconds || 0) + activeSegmentSecs;
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }, 1000);

    updateSessionHeaderUI(currentDay, renderWorkoutList, isPastMeso);

    // RENDER CARDS ESERCIZI
    const exercises = currentDay.exercises || [];
    let i = 0;

    while (i < exercises.length) {
        const ex = exercises[i];

        if (isCircuit(ex) && ex.groupBase) {
            const start=i,members=[];
            while(i<exercises.length && exercises[i].groupBase===ex.groupBase && exercises[i].groupType===ex.groupType){
                members.push(exercises[i]);i++;
            }
            DOM.workoutListContainer.append(createCircuitCard(members,start,currentDay,mesoIndex,targetWeek,activeDayNum,isPastMeso,renderWorkoutList));
        } else {
            const card = createSingleExerciseCard(ex, i, currentDay, mesoIndex, targetWeek, activeDayNum, isPastMeso);
            DOM.workoutListContainer.appendChild(card);
            updatePlatesBadgeUI(i);
            i++;
        }
    }

    bindActiveExercisePanels(DOM.workoutListContainer,currentDay);
    bindWorkoutTableEvents(currentDay, isPastMeso, renderWorkoutList);
    // Ora le input delle schede esistono: eventuali pulsanti di suggerimento
    // possono riferirsi solo a set futuri realmente modificabili.
    updateLiveCoachPanel(currentDay, { readOnly: isPastMeso });
}


