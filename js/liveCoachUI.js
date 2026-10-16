import { buildLiveSessionSnapshot, assessExerciseLive } from '../mycoatch/liveCoach.js';
import { calibrationContextForDay } from '../mycoatch/calibrationReview.js';
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { createSessionCheckin } from '../mycoatch/sessionReadiness.js';

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
        const latest = day && buildLiveSessionSnapshot(day).readiness;
        if (latest?.level === 'stop' ||
            (latest?.allowIncrease === false &&
                advice.suggestedWeight > advice.weight)) return;
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
 * Avviso NON modale per ogni check valido: visibile anche scorrendo gli
 * esercizi, scompare da solo dopo 15 secondi. Il pannello conserva lo
 * storico dell'ultimo consiglio, accessibile su richiesta.
 */
export function showLiveCoachToast(day, { exerciseIndex, setIndex } = {}) {
    if (!day) return null;
    const snapshot = buildLiveSessionSnapshot(day, { history: state.workoutData });
    if (snapshot.finished) {
        return displayLiveCoachToast({
            title: '✅ MyCoatch · Seduta completata',
            message: 'Tutte le serie di lavoro sono state confermate. Le prestazioni registrate alimentano il prossimo piano.',
            severity: 'ok'
        });
    }
    let advice = snapshot.lastAdvice;
    // Il consiglio e' riferito alla serie appena spuntata, non a un'altra
    // ancora precedente nel diario o presente in una card diversa.
    if (Number.isInteger(exerciseIndex) && Number.isInteger(setIndex) &&
        (advice?.exerciseIndex !== exerciseIndex || advice?.setIndex !== setIndex)) {
        advice = assessExerciseLive(day.exercises?.[exerciseIndex], exerciseIndex,
            { readiness: snapshot.readiness });
    }
    if (!advice) return null;
    const name = day.exercises?.[advice.exerciseIndex]?.name || 'Esercizio';
    return displayLiveCoachToast({
        title: '🤖 MyCoatch · ' + name + ' · serie ' + (advice.setIndex + 1),
        message: advice.message,
        severity: advice.severity,
        advice,
        day,
        extra: advice.e1rm === null ? null :
            'e1RM stimato: ' + advice.e1rm + ' kg (solo dati registrati)'
    });
}


const CHECKIN_FIELDS = [
    { key: 'sleep', label: 'Sonno', options: [['ok', 'Adeguato'], ['poor', 'Scarso']] },
    { key: 'energy', label: 'Energia', options: [['ok', 'Buona'], ['low', 'Bassa']] },
    { key: 'soreness', label: 'Muscoli', options: [['ok', 'Nella norma'], ['high', 'Molto affaticati']] },
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
        '🧭 Prima della seduta · ' + status));
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
        form.append(fields);
        const submit = element('button', 'btn btn-secondary btn-sm',
            readiness.level === 'unknown' ? 'Salva check-in' : 'Aggiorna check-in');
        submit.type = 'submit';
        form.append(submit);
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (locked || day.completed) return;
            const values = Object.fromEntries(new FormData(form));
            try {
                day.coachCheckin = createSessionCheckin(values);
                saveAndSync(state.workoutData);
                updateLiveCoachPanel(day, { readOnly: false }, panel);
            } catch (error) {
                info.textContent = error.message || 'Controlla i dati del check-in.';
            }
        });
        body.append(form, element('small', 'mycoatch-checkin-disclaimer',
            'Autovalutazione, non diagnosi. Le risposte restano nel diario e vengono sincronizzate se connesso. I set completati non cambiano.'));
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

    const title = element('h3', 'mycoatch-live-title', '🤖 MyCoatch · Coach in seduta');
    title.id = 'mycoatch-live-title';
    panel.append(title);

    const sub = element('p', 'mycoatch-live-subtitle',
        locked ? 'Sola lettura: analisi dello storico confermato.' :
            'Indicazioni durante l’allenamento. I carichi non cambiano senza una tua azione.');
    panel.append(sub);
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
            `📋 Piano ~${snapshot.estimatedMinutes} min / limite ${snapshot.budgetMinutes} min` :
            '📋 Durata del piano non indicata',
        `🏋️ Volume registrato: ${snapshot.tonnageKg.toLocaleString('it-IT')} kg·rep`,
        `RPE misurato: ${snapshot.rpeRecordedSets}/${snapshot.validSets} serie valide`
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
    // Il toast annuncia i nuovi consigli: evita letture doppie a ogni digitazione.
    liveMessage.setAttribute('aria-live', 'off');

    if (!snapshot.checkedSets) {
        liveMessage.append(element('p', '', 'Inizia confermando una serie reale con kg e ripetizioni. L’RPE è facoltativo, ma migliora la qualità dei suggerimenti.'));
    } else if (snapshot.invalidSets) {
        liveMessage.classList.add('mycoatch-live-warning');
        liveMessage.append(element('p', '',
            `Verifica ${snapshot.invalidSets} serie già spuntate ma incomplete: sono escluse dai calcoli di performance.`));
    } else if (snapshot.finished) {
        liveMessage.append(element('p', '', 'Seduta completata. MyCoatch terrà conto delle serie confermate nella prossima proposta di mesociclo.'));
    }

    if (snapshot.possibleOverrun) {
        liveMessage.classList.add('mycoatch-live-warning');
        liveMessage.append(element('p', '',
            'Il ritmo corrente potrebbe superare il tempo disponibile. Non comprimere i recuperi dei fondamentali: valuta gli accessori rimasti.'));
    }

    const advice = snapshot.lastAdvice;
    if (advice && !snapshot.finished) {
        const exercise = day.exercises[advice.exerciseIndex];
        const adviceHistory = element('details', 'mycoatch-live-advice-history');
        adviceHistory.append(element('summary', '',
            'Ultimo consiglio MyCoatch · tocca per rileggere'));
        const detail = element('div', 'mycoatch-live-advice');
        detail.classList.add(`is-${advice.severity}`);
        detail.append(element('strong', '', `${exercise?.name || 'Esercizio'} · serie ${advice.setIndex + 1}`));
        detail.append(element('p', '', advice.message));
        if (advice.e1rm !== null) {
            detail.append(element('small', '', `e1RM stimato: ${advice.e1rm} kg (da ripetizioni e RPE realmente registrati).`));
        }
        if (snapshot.previousExercise) {
            const prior = snapshot.previousExercise;
            detail.append(element('small', '',
                `Ultima prestazione comparabile: ${prior.kg} kg × ${prior.reps} reps${prior.rpe !== null ? ' @RPE ' + prior.rpe : ' (RPE non registrato)'}.`));
            if (snapshot.e1rmChangePercent !== null) {
                const change = snapshot.e1rmChangePercent;
                detail.append(element('small', '',
                    `Differenza e1RM rispetto a quella singola seduta: ${change > 0 ? '+' : ''}${change}%. Non equivale da sola a una progressione consolidata.`));
            }
        }
        if (!locked) {
            const button = createAdviceApplyButton(advice, day);
            if (button) detail.append(button);
        }
        adviceHistory.append(detail);
        liveMessage.append(adviceHistory);
    }

    if (!snapshot.rpeRecordedSets && snapshot.checkedSets &&
        !snapshot.invalidSets && !snapshot.finished) {
        liveMessage.append(element('p', 'mycoatch-live-soft-warning',
            'Manca l’RPE nelle serie registrate: nessuna stima della fatica o del massimale viene inventata.'));
    }

    panel.append(liveMessage);

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
