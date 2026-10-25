import { buildLiveSessionSnapshot, assessExerciseLive } from '../mycoatch/liveCoach.js';
import { calibrationContextForDay } from '../mycoatch/calibrationReview.js';
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { createSessionCheckin } from '../mycoatch/sessionReadiness.js';
import {refreshExerciseCoachPanel} from './exerciseCoachUI.js';
import {actionableLiveAdvice} from '../mycoatch/coachCommunication.js';

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
}

function formatDuration(seconds) {
    const safe = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}


const LIVE_COACH_TOAST_DURATION_MS = 15_000;
let toastDismissTimer = null;

export function dismissLiveCoachToast() {
    if (toastDismissTimer !== null) {
        clearTimeout(toastDismissTimer);
        toastDismissTimer = null;
    }
    document.getElementById('mycoatch-live-toast')?.remove();
}

// Recupera il campo all'istante del click, non quello della renderizzazione:
// ogni check ricrea le card, dunque un riferimento precedente puo' diventare stantio.
function createAdviceApplyButton(advice, day = null) {
    if(day?.exercises?.[advice?.exerciseIndex]?.coachSetProposals)return null;
    if (advice?.suggestedWeight === null || advice?.suggestedWeight === undefined ||
        advice.nextSetIndex < 0) return null;
    const selector = '.set-kg[data-ex="' + advice.exerciseIndex +
        '"][data-set="' + advice.nextSetIndex + '"]';
    const input = document.querySelector(selector);
    if (!input || input.disabled) return null;
    const button = element('button', 'btn btn-secondary btn-mini mycoatch-live-apply',
        'Applica ' + advice.suggestedWeight + ' kg alla prossima serie');
    button.type = 'button';
    button.dataset.ex = String(advice.exerciseIndex);
    button.dataset.set = String(advice.nextSetIndex);
    button.addEventListener('click', () => {
        // Un check-in aggiornato deve impedire anche l'uso di un popup vecchio.
        const snapshot = day && buildLiveSessionSnapshot(day,{history:state.workoutData});
        const latest = snapshot?.readiness;
        if (latest?.level === 'stop' ||
            (latest?.allowIncrease === false &&
                advice.suggestedWeight > advice.weight)) return;
        const current=day && assessExerciseLive(day.exercises?.[advice.exerciseIndex],advice.exerciseIndex,
            {readiness:latest,equipmentSettings:{...state.workoutData?.athlete,...(state.workoutData?.athlete?.loadingSteps||{})}});
        if(current && (current.suggestedWeight!==advice.suggestedWeight ||
            current.nextSetIndex!==advice.nextSetIndex))return;
        const currentInput = document.querySelector(selector);
        if (!currentInput || currentInput.disabled) return;
        currentInput.value = String(advice.suggestedWeight);
        currentInput.dispatchEvent(new Event('input', { bubbles: true }));
        dismissLiveCoachToast();
        currentInput.focus();
    });
    return button;
}

function displayLiveCoachToast({ title, message, severity = 'info', advice = null,
    day = null, extra = null, urgent = false }) {
    dismissLiveCoachToast();
    const toast = element('aside', 'mycoatch-live-toast');
    toast.id = 'mycoatch-live-toast';
    toast.classList.add('is-' + (severity === 'caution' ? 'caution' :
        severity === 'ok' ? 'ok' : 'info'));
    toast.setAttribute('role', urgent ? 'alert' : 'status');
    toast.setAttribute('aria-live', urgent ? 'assertive' : 'polite');
    toast.setAttribute('aria-label', 'Feedback MyCoatch');
    const header = element('div', 'mycoatch-live-toast-header');
    header.append(element('strong', '', title));
    const dismiss = element('button', 'mycoatch-live-toast-dismiss', '×');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Chiudi il feedback MyCoatch');
    dismiss.addEventListener('click', dismissLiveCoachToast);
    header.append(dismiss);
    toast.append(header, element('p', 'mycoatch-live-toast-message', message));
    if (extra) toast.append(element('small', '', extra));
    if (advice) {
        const button = createAdviceApplyButton(advice, day);
        if (button) toast.append(button);
    }
    document.body.append(toast);
    toastDismissTimer = setTimeout(dismissLiveCoachToast, LIVE_COACH_TOAST_DURATION_MS);
    return toast;
}

/**
 * Aggiorna le indicazioni inline dopo una conferma. I popup restano
 * riservati agli errori che impediscono la registrazione.
 */
export function showLiveCoachToast(day) {
    // Compatibility entry point: useful advice now persists in its exercise
    // card. A successful ordinary check no longer creates a second popup.
    if(!day)return null;
    const snapshot=updateLiveCoachPanel(day);
    if(snapshot?.finished){
        const overview=document.getElementById('mycoatch-live-disclosure');
        if(overview)overview.open=true;
    }
    return null;
}


const CHECKIN_FIELDS = [
    { key: 'sleep', label: 'Sonno', options: [['ok', 'Adeguato'], ['poor', 'Scarso']] },
    { key: 'energy', label: 'Energia', options: [['ok', 'Buona'], ['low', 'Bassa']] },
    { key: 'soreness', label: 'Affaticamento muscolare', options: [['ok', 'Nella norma'], ['high', 'Molto affaticati']] },
    { key: 'pain', label: 'Dolore', options: [['none', 'Nessuno'], ['present', 'Presente']] }
];

function createSessionCheckinPanel(day, readiness, locked, panel) {
    const section = element('details', 'mycoatch-session-checkin');
    section.id = 'mycoatch-session-checkin';
    section.open = !locked && (readiness.level === 'unknown' ||
        readiness.level === 'stop' || readiness.level === 'caution');
    const status = readiness.level === 'unknown' ? 'da compilare' :
        readiness.level === 'normal' ? 'regolare' :
        readiness.level === 'stop' ? 'dolore segnalato' : 'prudenza';
    section.append(element('summary', '',
        '🧭 Come ti senti prima di allenarti? · ' + status));
    const body = element('div', 'mycoatch-checkin-body');
    const info = element('p', 'mycoatch-checkin-message', readiness.message);
    if (readiness.level !== 'normal' && readiness.level !== 'unknown')
        info.classList.add('mycoatch-checkin-warning');
    body.append(info);

    if (!locked && !day.completed) {
        const form = element('form', 'mycoatch-checkin-form');
        form.id = 'mycoatch-checkin-form';
        const fields = element('div', 'mycoatch-checkin-fields');
        for (const field of CHECKIN_FIELDS) {
            const label = element('label', '', field.label);
            const select = element('select');
            select.name = field.key;
            select.required = true;
            select.setAttribute('aria-label', field.label + ' prima dell’allenamento');
            const placeholder = element('option', '', 'Seleziona');
            placeholder.value = '';
            select.append(placeholder);
            for (const [value, title] of field.options) {
                const option = element('option', '', title);
                option.value = value;
                select.append(option);
            }
            const stored = day.coachCheckin?.[field.key];
            if (field.options.some(([value]) => value === stored))
                select.value = stored;
            label.append(select);
            fields.append(label);
        }
        for(const [key,title] of [['movement','Movimento che dà fastidio (facoltativo)'],['location','Zona e limitazione pratica (facoltativo)']]){
            const label=element('label','',title),input=element('input');input.name=key;input.maxLength=160;input.value=day.coachCheckin?.[key]||'';label.append(input);fields.append(label);
        }
        form.append(fields);
        const submit = element('button', 'btn btn-secondary btn-sm',
            readiness.level === 'unknown' ? 'Salva check-in' : 'Aggiorna check-in');
        submit.type = 'submit';
        form.append(submit);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (locked || day.completed) return;
            const values = Object.fromEntries(new FormData(form));
            try {
                const previous=day.coachCheckin;
                day.coachCheckin = {...createSessionCheckin(values),movement:String(values.movement||'').trim(),location:String(values.location||'').trim()};
                try{if(await saveAndSync(state.workoutData)===false)throw Error('Check-in non salvato: riprova.');}
                catch(error){day.coachCheckin=previous;throw error;}
                updateLiveCoachPanel(day, { readOnly: false }, panel);
            } catch (error) {
                info.textContent = error.message || 'Controlla i dati del check-in.';
            }
        });
        body.append(form, element('small', 'mycoatch-checkin-disclaimer',
            'Questo controllo serve a contestualizzare i consigli di oggi: sonno, energia, affaticamento e dolore segnalato. Non è una diagnosi e non cambia le serie già eseguite. Le risposte vengono salvate nel diario e sincronizzate quando possibile.'));
    }
    section.append(body);
    return section;
}

export function createLiveCoachPanel(day, { readOnly = false } = {}) {
    const panel = element('section', 'mycoatch-live-panel');
    panel.id = 'mycoatch-live-panel';
    panel.setAttribute('aria-labelledby', 'mycoatch-live-title');
    panel.dataset.readOnly = readOnly ? 'true' : 'false';
    updateLiveCoachPanel(day, { readOnly }, panel);
    return panel;
}

/**
 * Viene chiamato su input, sul check/uncheck e dal timer sessione.
 * Aggiorna SOLO il box, mai la tabella degli esercizi o i dati archiviati.
 */
export function updateLiveCoachPanel(day, { readOnly = false } = {}, explicitPanel = null) {
    const panel = explicitPanel || document.getElementById('mycoatch-live-panel');
    if (!panel || !day) return null;
    const snapshot = buildLiveSessionSnapshot(day, { history: state.workoutData });
    const locked = readOnly || panel.dataset.readOnly === 'true';
    panel.replaceChildren();

    const title = element('h3', 'mycoatch-live-title', '🤖 Riepilogo seduta');
    title.id = 'mycoatch-live-title';
    panel.append(title);

    panel.append(createSessionCheckinPanel(day, snapshot.readiness, locked, panel));

    const meter = element('div', 'mycoatch-live-progress');
    const textProgress = element('span', '', `Serie confermate: ${snapshot.checkedSets}/${snapshot.totalSets} (${snapshot.percent}%)`);
    const progress = element('progress');
    progress.max = Math.max(1, snapshot.totalSets);
    progress.value = snapshot.checkedSets;
    progress.setAttribute('aria-label', 'Progressione delle serie confermate');
    meter.append(textProgress, progress);
    panel.append(meter);

    const metrics = element('div', 'mycoatch-live-metrics');
    const summary = [
        `⏱ ${formatDuration(snapshot.elapsedSeconds)}${snapshot.paused ? ' · pausa' : ''}`,
        snapshot.estimatedMinutes !== null ?
            `📋 Durata prevista ~${snapshot.estimatedMinutes} min su ${snapshot.budgetMinutes} disponibili (stima)` :
            '📋 Tempo previsto non disponibile: usa il cronometro della seduta come riferimento',
        `🏋️ Tonnellaggio registrato: ${snapshot.tonnageKg.toLocaleString('it-IT')} kg × ripetizioni (non misura la crescita)`,
        `Sforzo percepito (RPE) registrato: ${snapshot.rpeRecordedSets}/${snapshot.validSets} serie valide`
    ];
    for (const item of summary) metrics.append(element('span', '', item));
    panel.append(metrics);

    if (snapshot.projectedMinutes !== null && !locked) {
        panel.append(element('p', 'mycoatch-live-time-estimate',
            `Tempo finale approssimativo: ~${snapshot.projectedMinutes} min (${snapshot.paceCalibration
                ? 'calibrato su ' + snapshot.paceCalibration.samples + ' sedute precedenti'
                : 'stimato da serie e recuperi rimanenti'}; non è una misura).`));
    }

    const liveMessage = element('div', 'mycoatch-live-guidance');
    liveMessage.id = 'mycoatch-live-guidance';
    liveMessage.setAttribute('role', 'region');
    liveMessage.setAttribute('aria-label', 'Riepilogo dei consigli della sessione');
    // Gli aggiornamenti dell’esercizio sono annunciati nella relativa card.
    liveMessage.setAttribute('aria-live', 'off');

    if(snapshot.invalidSets){
        liveMessage.classList.add('mycoatch-live-warning');
        liveMessage.append(element('p','',
            'Verifica '+snapshot.invalidSets+' serie confermate con kg o ripetizioni incompleti.'));
    }

    if (snapshot.possibleOverrun) {
        liveMessage.classList.add('mycoatch-live-warning');
        liveMessage.append(element('p', '',
            'Il ritmo corrente potrebbe superare il tempo disponibile. Non comprimere i recuperi dei fondamentali: valuta gli accessori rimasti.'));
    }

    if (snapshot.sessionAdjustment?.action === 'reduce' && !snapshot.finished) {
        liveMessage.classList.add('mycoatch-live-warning');
        liveMessage.append(element('p', 'mycoatch-session-adjustment',
            '🛡️ ' + snapshot.sessionAdjustment.message));
    }

    // Card advice has one visible home, shared by ordinary and grouped
    // exercises. Session-wide warnings remain in this overview.
    for(const card of document.querySelectorAll('.ex-card')){
        const index=Number(card.dataset.ex),exercise=day.exercises?.[index];
        if(!exercise)continue;
        const advice=assessExerciseLive(exercise,index,{readiness:snapshot.readiness,
            equipmentSettings:{...state.workoutData?.athlete,...(state.workoutData?.athlete?.loadingSteps||{})}});
        refreshExerciseCoachPanel(card,locked?null:advice);
        const slot=card.querySelector('.coach-apply-slot');
        if(slot){
            slot.replaceChildren();
            if(!locked&&actionableLiveAdvice(advice,{hasProtocol:Boolean(exercise.coachSetProposals)})){
                const button=createAdviceApplyButton(advice,day);if(button)slot.append(button);
            }
        }
    }
    liveMessage.hidden=!liveMessage.childElementCount;

    panel.append(liveMessage);

    if(snapshot.finished){
        const done=element('section','mycoatch-session-summary');
        done.setAttribute('aria-label','Riepilogo conclusivo seduta');
        done.append(element('h4','','✅ Riepilogo fine seduta'));
        done.append(element('p','',
            snapshot.validSets+' serie allenanti valide · volume '+
            snapshot.tonnageKg.toLocaleString('it-IT')+' kg·rep · RPE dichiarato su '+
            snapshot.rpeRecordedSets+'/'+snapshot.validSets+' serie.'));
        const scored=(day.exercises||[]).flatMap(ex=>{
            if(ex.isWarmup||ex.isExcluded)return [];
            const sets=(ex.loggedSets||[]).filter(s=>
                !s.isWarmup&&!s.warmup&&!s.is_warmup&&
                (s.isLocked===true||s.completed===true)&&
                Number.isFinite(Number(s.rpe))&&String(s.rpe??'').trim()!=='');
            if(!sets.length)return [];
            const target=Number(String(ex.targetRpe??ex.rpeTarget??ex.rpe??'')
                .replace('@','').replace(',','.'));
            if(!Number.isFinite(target)||target<6||target>10)return [];
            const avg=sets.reduce((sum,s)=>sum+Number(s.rpe),0)/sets.length;
            return [ex.name+': RPE '+(Math.round(avg*10)/10)+
                ' percepito / '+target+' previsto'];
        });
        for(const line of scored)done.append(element('p','mycoatch-session-summary-exercise',line));
        if(!scored.length)done.append(element('p','',
            'Nessun confronto RPE attendibile: le serie non spuntate non vengono considerate.'));
        done.append(element('small','',
            'Il prossimo piano usa soltanto prestazioni confermate. Le proposte aggiornate sono visibili nelle serie e nelle sedute pertinenti; esercizi e struttura restano invariati.'));
        panel.append(done);
    }

    const calibration = calibrationContextForDay(state.workoutData, day);
    if (calibration) {
        const review = element('section', 'mycoatch-calibration-review');
        review.setAttribute('aria-label', 'Riepilogo calibrazione prima settimana');
        review.append(element('h4', '', '🧭 Calibrazione iniziale · ' +
            calibration.anchorsRecorded + '/' + calibration.anchorsTotal + ' fondamentali registrati'));
        review.append(element('p', '',
            'Giornate completate: ' + calibration.completeDays + '/' + calibration.days +
            ' · Serie valide: ' + calibration.validSets + '/' + calibration.totalSets +
            ' · Con RPE: ' + (calibration.validSets - calibration.withoutRpe) +
            '/' + calibration.validSets));
        if (calibration.missingAnchors.length) {
            review.append(element('p', 'mycoatch-calibration-caution',
                'Riferimenti ancora mancanti: ' + calibration.missingAnchors.join(', ') + '.'));
        }
        if (calibration.invalidSets) {
            review.append(element('p', 'mycoatch-calibration-caution',
                'Controlla ' + calibration.invalidSets +
                ' serie confermate con dati non validi o tecnica speciale.'));
        }
        if (calibration.withoutRpe) {
            review.append(element('p', 'mycoatch-calibration-caution',
                'RPE assente in ' + calibration.withoutRpe +
                ' serie: non verrà stimata la fatica percepita da questi dati.'));
        }
        review.append(element('p', '', calibration.message));
        if (calibration.readyForReview) {
            review.classList.add('is-ready');
            review.append(element('small', '',
                'Per una proposta aggiornata, apri Strumenti e gestione → MyCoatch. ' +
                'Valuta l’anteprima prima di importare un nuovo CSV; nessuna modifica automatica.'));
        }
        panel.append(review);
    }
    const count = panel.closest('.mycoatch-live-disclosure')?.querySelector('.mycoatch-live-count');
    if (count) count.textContent = `Serie ${snapshot.checkedSets}/${snapshot.totalSets}`;
    return snapshot;
}

/**
 * Il timer aggiorna solo i numeri: non ricrea la regione aria-live e non
 * rimuove il focus da un eventuale bottone "Applica al prossimo set".
 */
export function refreshLiveCoachClock(day) {
    const panel = document.getElementById('mycoatch-live-panel');
    if (!panel || !day) return;
    const snapshot = buildLiveSessionSnapshot(day, { history: state.workoutData });
    const clock = panel.querySelector('.mycoatch-live-metrics > span');
    if (clock) {
        clock.textContent = `⏱ ${formatDuration(snapshot.elapsedSeconds)}${snapshot.paused ? ' · pausa' : ''}`;
    }
    const forecast = panel.querySelector('.mycoatch-live-time-estimate');
    if (forecast && snapshot.projectedMinutes !== null) {
        forecast.textContent = `Tempo finale approssimativo: ~${snapshot.projectedMinutes} min (${snapshot.paceCalibration
            ? 'calibrato su ' + snapshot.paceCalibration.samples + ' sedute precedenti'
            : 'stimato da serie e recuperi rimanenti'}; non è una misura).`;
    }
}

export function showLiveCoachInputError(message) {
    const panel = document.getElementById('mycoatch-live-panel');
    if (!panel) return;
    const existing = panel.querySelector('#mycoatch-live-input-error');
    if (existing) existing.remove();
    const error = element('p', 'mycoatch-live-input-error', message);
    error.id = 'mycoatch-live-input-error';
    error.setAttribute('role', 'alert');
    panel.append(error);
    displayLiveCoachToast({
        title: '⚠️ MyCoatch · Serie non confermata',
        message,
        severity: 'caution',
        urgent: true
    });
}

