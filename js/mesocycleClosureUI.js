/**
 * Guided end-of-block review next to the existing lock controls.
 * No mutation happens during rendering, inspection or report download.
 */
import { summarizeMesocycleClosure, formatMesocycleClosureForChat } from './mesocycleClosure.js';
import { concludeCurrentMesocycle } from './mesocycle.js';
import { startCoachChatAndGenerate } from '../mycoatch/mycoatch-adapter.js';

function node(tag, label, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (label !== undefined) el.textContent = label;
    return el;
}

function downloadText(text, name) {
    const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = String(name || 'mesociclo')
        .replace(/[^a-zA-Z0-9_-]/g, '_') + '_report_mycoatch.txt';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function createMesocycleClosurePanel(mesocycle) {
    const review = summarizeMesocycleClosure(mesocycle);
    const closed = mesocycle.coachClosure?.status === 'closed';
    const detail = node('details', undefined, 'mycoatch-meso-closure');
    detail.id = 'mesocycle-closure-panel';
    detail.append(node('summary', closed ?
        '✓ Mesociclo concluso · consulta il report' :
        '🏁 Chiusura guidata · controlla il riepilogo'));
    const body = node('div', undefined, 'mycoatch-meso-closure-content');
    const stats = [
        'Sedute complete: ' + review.completedSessions + '/' + review.plannedSessions +
            (review.adherencePercent === null ? '' : ' (' + review.adherencePercent + '%)'),
        'Sedute parziali: ' + review.partialSessions +
            ' · non iniziate: ' + review.skippedSessions,
        'Serie valide confermate: ' + review.completedSets + '/' + review.plannedSets +
            ' · RPE misurati: ' + review.measuredRpeSets + '/' + review.completedSets,
        'RPE medio osservato: ' + (review.averageRpe ?? 'dato insufficiente')
    ];
    for (const line of stats) body.append(node('p', line));
    if (review.invalidConfirmedSets) body.append(node('p',
        'Attenzione: ' + review.invalidConfirmedSets +
        ' serie spuntate contengono dati non validi e non sono considerate complete.'));
    if (review.archivedRepeats) body.append(node('p',
        'Sedute ripetute in archivio: ' + review.archivedRepeats +
        '. Non sostituiscono le sedute previste per il completamento.'));
    if (review.incompleteDays.length) {
        const list = node('ul');
        for (const day of review.incompleteDays.slice(0, 12))
            list.append(node('li', 'Settimana ' + day.weekNumber + ' · ' +
                day.dayName + ': ' + day.confirmedSets + '/' +
                day.plannedSets + ' serie confermate.'));
        if (review.incompleteDays.length > 12)
            list.append(node('li', 'Altre ' + (review.incompleteDays.length - 12) +
                ' sedute non complete.'));
        body.append(node('strong', 'Sedute da verificare:'), list);
    }
    if (review.exerciseChanges.length) {
        const list = node('ul');
        for (const exercise of review.exerciseChanges.slice(0, 8)) {
            list.append(node('li', exercise.name + ' · sett. ' + exercise.firstWeek +
                ': ' + exercise.firstKg + ' kg × minimo ' + exercise.firstMinReps +
                ' reps → sett. ' + exercise.lastWeek + ': ' + exercise.lastKg +
                ' kg × minimo ' + exercise.lastMinReps + ' reps' +
                (exercise.deltaReps === null ? ' (carichi non confrontabili)' :
                    ' (Δ reps ' + (exercise.deltaReps > 0 ? '+' : '') +
                    exercise.deltaReps + ')')));
        }
        body.append(node('strong', 'Confronto descrittivo delle prestazioni:'), list);
    }
    body.append(node('small',
        'Solo serie confermate. La progressione non misura direttamente la crescita muscolare. ' +
        'La consultazione e lo scaricamento del report non modificano il diario.'));
    const actions = node('div', undefined, 'mycoatch-meso-closure-actions');
    const exportBtn = node('button', '📄 Esporta report per ChatGPT', 'btn btn-secondary btn-sm');
    exportBtn.type = 'button';
    exportBtn.addEventListener('click', () =>
        downloadText(formatMesocycleClosureForChat(review), review.name));
    actions.append(exportBtn);

    if (!closed) {
        if (!review.plannedSessions) {
            body.append(node('p', 'Nessuna seduta programmata: non è possibile concludere il mesociclo.'));
        } else {
            const ready = node('label', undefined, 'mycoatch-meso-closure-check');
            const consent = node('input');
            consent.type = 'checkbox';
            ready.append(consent, node('span',
                'Ho controllato il riepilogo e voglio concludere questo mesociclo, bloccandolo in sola lettura.'));
            body.append(ready);
            let incomplete = null;
            if (review.status !== 'complete') {
                const warning = node('p',
                    'Il mesociclo NON è completamente registrato: la chiusura non inventerà sedute o serie. ' +
                    'Puoi tornare ad allenarti oppure chiuderlo anticipatamente.');
                warning.setAttribute('role', 'status');
                body.append(warning);
                const label = node('label', undefined, 'mycoatch-meso-closure-check');
                incomplete = node('input');
                incomplete.type = 'checkbox';
                label.append(incomplete, node('span',
                    'Confermo espressamente la chiusura anticipata con sedute incomplete.'));
                body.append(label);
            }
            const apply = node('button',
                '🔒 Concludi e blocca il mesociclo', 'btn btn-primary btn-sm');
            apply.type = 'button';
            apply.disabled = true;
            const refresh = () => apply.disabled =
                !consent.checked || Boolean(incomplete && !incomplete.checked);
            consent.addEventListener('change', refresh);
            incomplete?.addEventListener('change', refresh);
            const feedback = node('p');
            feedback.setAttribute('role', 'alert');
            apply.addEventListener('click', async () => {
                if (apply.disabled) return;
                if (!confirm('Concludere e bloccare il mesociclo? Potrai ancora consultarlo e scaricare i dati. Per modificarlo dovrai riaprirlo esplicitamente.')) return;
                apply.disabled = true;
                try {
                    await concludeCurrentMesocycle(mesocycle, review, {
                        acknowledgeIncomplete: Boolean(incomplete?.checked)
                    });
                    const panel = document.getElementById('mesocycle-closure-panel');
                    if (panel) panel.open = true;
                } catch (error) {
                    feedback.textContent = error.message || 'Impossibile registrare la chiusura.';
                    refresh();
                }
            });
            actions.append(apply);
            body.append(feedback);
        }
    } else {
        body.append(node('p', 'Concluso il ' +
            new Date(mesocycle.coachClosure.closedAt).toLocaleDateString('it-IT') +
            ' · 🔒 protetto in sola lettura. Lo sblocco richiede conferma e annulla la chiusura.'));
        const next = node('button', '🤖 Prepara il prossimo mesociclo',
            'btn btn-secondary btn-sm');
        next.type = 'button';
        next.addEventListener('click', startCoachChatAndGenerate);
        actions.append(next);
    }
    body.append(actions);
    detail.append(body);
    return detail;
}
