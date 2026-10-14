import { buildLiveSessionSnapshot } from '../mycoatch/liveCoach.js';
import { state } from './state.js';

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
    liveMessage.setAttribute('role', 'status');
    liveMessage.setAttribute('aria-live', 'polite');

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
        if (!locked && advice.suggestedWeight !== null && advice.nextSetIndex >= 0) {
            const targetInput = document.querySelector(
                `.set-kg[data-ex="${advice.exerciseIndex}"][data-set="${advice.nextSetIndex}"]`
            );
            if (targetInput && !targetInput.disabled) {
                const button = element('button', 'btn btn-secondary btn-mini mycoatch-live-apply',
                    `Applica ${advice.suggestedWeight} kg alla prossima serie`);
                button.type = 'button';
                button.dataset.ex = String(advice.exerciseIndex);
                button.dataset.set = String(advice.nextSetIndex);
                button.addEventListener('click', () => {
                    if (targetInput.disabled) return;
                    targetInput.value = String(advice.suggestedWeight);
                    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    targetInput.focus();
                });
                detail.append(button);
            }
        }
        liveMessage.append(detail);
    }

    if (!snapshot.rpeRecordedSets && snapshot.checkedSets &&
        !snapshot.invalidSets && !snapshot.finished) {
        liveMessage.append(element('p', 'mycoatch-live-soft-warning',
            'Manca l’RPE nelle serie registrate: nessuna stima della fatica o del massimale viene inventata.'));
    }

    panel.append(liveMessage);
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
}
