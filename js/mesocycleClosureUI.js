import {editJournal} from './journalTransaction.js';
import {state} from './state.js';
import {renderWorkoutList} from './ui.js';
/**
 * Guided end-of-block review next to the existing lock controls.
 * No mutation happens during rendering, inspection or report download.
 */
import { summarizeMesocycleClosure, formatMesocycleClosureForChat } from './mesocycleClosure.js';
import { concludeCurrentMesocycle } from './mesocycle.js';
import { startCoachChatAndGenerate } from '../mycoatch/mycoatch-adapter.js';
import { assessMesocycleProfileContinuity } from '../mycoatch/profileJournal.js';
import { buildMesocycleReviewDossier, formatMesocycleReviewDossierMarkdown,
    serializeMesocycleReviewDossierJson } from '../mycoatch/reviewDossier.js';

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

function downloadReviewDossier(content,name,extension,mime) {
    const safe=String(name || 'mesociclo').replace(/[^a-z0-9_-]/gi,'_').slice(0,80);
    const blob=new Blob([content],{type:mime+';charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=(safe || 'mesociclo')+'_dossier_mycoatch.'+extension;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
}

export function createMesocycleClosurePanel(mesocycle, athleteDiary = null) {
    const review = summarizeMesocycleClosure(mesocycle);
    const closed = mesocycle.coachClosure?.status === 'closed';
    const detail = node('details', undefined, 'mycoatch-meso-closure');
    detail.id = 'mesocycle-closure-panel';
    detail.append(node('summary', closed ?
        '✓ Mesociclo concluso · consulta il report' :
        '🏁 Concludi questo mesociclo: verifica prima i risultati'));
    const body = node('div', undefined, 'mycoatch-meso-closure-content');
    const stats = [
        'Sedute complete: ' + review.completedSessions + '/' + review.plannedSessions +
            (review.adherencePercent === null ? '' : ' (' + review.adherencePercent + '%)'),
        'Sedute parziali: ' + review.partialSessions +
            ' · non iniziate: ' + review.skippedSessions,
        'Serie completate con dati validi: ' + review.completedSets + '/' + review.plannedSets +
            ' · RPE misurati: ' + review.measuredRpeSets + '/' + review.completedSets,
        'RPE medio percepito nelle serie registrate: ' + (review.averageRpe ?? 'dato insufficiente')
    ];
    for (const line of stats) body.append(node('p', line));
    // Snapshot provenance is informative: never change an active training
    // prescription merely because the athlete edited their saved profile.
    const continuity=assessMesocycleProfileContinuity(mesocycle, athleteDiary);
    if(continuity.status==='updated_since_plan' ||
        continuity.status==='inconsistent' ||
        continuity.status==='invalid_snapshot'){
        const notice=node('p',continuity.message,'mycoatch-profile-continuity-notice');
        notice.setAttribute('role','status');
        body.append(notice);
    } else if(continuity.status==='same_profile' && continuity.profileVersion !== null){
        body.append(node('p','Profilo MyCoatch della scheda: versione '+
            continuity.profileVersion+' (versione salvata: '+
            continuity.currentVersion+').'));
    }
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
    {
        const exclude=node('button',mesocycle.excludedFromCoaching?'Riutilizza questo mesociclo nel coaching':'Escludi questo mesociclo dalle decisioni future','btn btn-secondary btn-sm');
        exclude.type='button';exclude.onclick=async()=>{try{await editJournal(candidate=>{
            candidate.history.years[state.currentYear].mesocycles[state.activeMesocycleIndex||0].excludedFromCoaching=!mesocycle.excludedFromCoaching;
        },'TOGGLE_COACHING_EVIDENCE');renderWorkoutList();}catch(error){alert(error.message);}};body.append(exclude);
    }
    if(review.exerciseCoverage?.length){
        const coverage=node('ul');
        for(const ex of review.exerciseCoverage)coverage.append(node('li',ex.name+' · '+ex.confirmedSets+' serie allenanti valide'+(ex.classificationStatus==='unmapped'?' · classificazione muscolare da associare':'')+' · '+(ex.comparisonStatus==='available'?'confronto disponibile':ex.comparisonStatus==='no_valid_working_sets'?'nessuna serie allenante valida':'dati datati e confrontabili insufficienti')));
        body.append(node('strong','Tutti gli esercizi del mesociclo'),coverage);
    }
    if (review.exerciseChanges.length) {
        const list = node('ul');
        for (const exercise of review.exerciseChanges) {
            list.append(node('li', exercise.name + ' · sett. ' + exercise.firstWeek +
                ': ' + exercise.firstKg + ' kg × minimo ' + exercise.firstMinReps +
                ' reps → sett. ' + exercise.lastWeek + ': ' + exercise.lastKg +
                ' kg × minimo ' + exercise.lastMinReps + ' reps' +
                (exercise.deltaReps === null ? ' (carichi non confrontabili)' :
                    ' (Δ reps ' + (exercise.deltaReps > 0 ? '+' : '') +
                    exercise.deltaReps + ')')));
        }
        body.append(node('strong', 'Confronto tra le prime e ultime settimane con dati disponibili (non prova da solo crescita muscolare):'), list);
    }
    body.append(node('small',
        'Questo riepilogo utilizza solo le serie confermate. Un aumento di peso o ripetizioni non misura direttamente la crescita muscolare. ' +
        'La consultazione e lo scaricamento del report non modificano il diario.'));
    const actions = node('div', undefined, 'mycoatch-meso-closure-actions');
    const exportBtn = node('button', '📄 Scarica testo dei risultati da condividere volontariamente', 'btn btn-secondary btn-sm');
    exportBtn.type = 'button';
    exportBtn.addEventListener('click', () =>
        downloadText(formatMesocycleClosureForChat(review), review.name));
    actions.append(exportBtn);
    // Two explicit downloads: browsers may block simultaneous file downloads.
    // Never contact an AI service or write to the journal to build the dossier.
    const markdownBtn=node('button','Scarica dossier dettagliato (.md)','btn btn-secondary btn-sm');
    markdownBtn.type='button';
    markdownBtn.addEventListener('click',()=>{
        const data=buildMesocycleReviewDossier(mesocycle);
        downloadReviewDossier(formatMesocycleReviewDossierMarkdown(data),
            data.mesocycle.name,'md','text/markdown');
    });
    const jsonBtn=node('button','Dati dossier (.json)','btn btn-secondary btn-sm');
    jsonBtn.type='button';
    jsonBtn.addEventListener('click',()=>{
        const data=buildMesocycleReviewDossier(mesocycle);
        downloadReviewDossier(serializeMesocycleReviewDossierJson(data),
            data.mesocycle.name,'json','application/json');
    });
    actions.append(markdownBtn,jsonBtn);

    if (!closed) {
        if (!review.plannedSessions) {
            body.append(node('p', 'Nessuna seduta programmata: non è possibile concludere il mesociclo.'));
        } else {
            // Keep the existing consent rules, but make the prerequisites
            // visible and actionable instead of silently disabling the button.
            const confirmations = node('section', undefined,
                'mycoatch-meso-closure-confirmations');
            confirmations.setAttribute('aria-label', 'Conferme obbligatorie per la chiusura');
            confirmations.append(node('strong',
                '⚠️ Prima di concludere: spunta le conferme',
                'mycoatch-meso-closure-confirmation-title'));
            const progress = node('p', undefined, 'mycoatch-meso-closure-progress');
            progress.id = 'mesocycle-closure-confirmation-status';
            progress.setAttribute('role', 'status');
            progress.setAttribute('aria-live', 'polite');
            confirmations.append(progress);

            const ready = node('label', undefined, 'mycoatch-meso-closure-check');
            const consent = node('input');
            consent.type = 'checkbox';
            ready.append(consent, node('span',
                '1. Ho controllato il riepilogo e voglio concludere questo mesociclo, bloccandolo in sola lettura.'));
            confirmations.append(ready);

            let incomplete = null;
            let incompleteLabel = null;
            if (review.status !== 'complete') {
                const warning = node('p',
                    'Il mesociclo NON è completamente registrato: la chiusura non inventerà sedute o serie. ' +
                    'Puoi tornare ad allenarti oppure chiuderlo anticipatamente.',
                    'mycoatch-meso-closure-warning');
                warning.setAttribute('role', 'status');
                confirmations.append(warning);
                incompleteLabel = node('label', undefined, 'mycoatch-meso-closure-check');
                incomplete = node('input');
                incomplete.type = 'checkbox';
                incompleteLabel.append(incomplete, node('span',
                    '2. Confermo espressamente la chiusura anticipata con sedute incomplete.'));
                confirmations.append(incompleteLabel);
            }
            body.append(confirmations);

            const apply = node('button',
                '🔒 Concludi e blocca il mesociclo',
                'btn btn-primary btn-sm mycoatch-meso-close-button');
            apply.type = 'button';
            apply.setAttribute('aria-describedby', progress.id);
            const checks = [ready, ...(incompleteLabel ? [incompleteLabel] : [])];
            const refresh = () => {
                ready.classList.toggle('is-confirmed', consent.checked);
                if (incompleteLabel) incompleteLabel.classList.toggle('is-confirmed', incomplete.checked);
                const missing = checks.filter(label => !label.querySelector('input').checked);
                const completed = checks.length - missing.length;
                progress.textContent = missing.length
                    ? 'Conferme: ' + completed + '/' + checks.length +
                      '. Spunta ' + missing.length + ' casell' +
                      (missing.length === 1 ? 'a' : 'e') + ' per poter concludere.'
                    : '✓ Conferme: ' + checks.length + '/' + checks.length +
                      '. Ora puoi concludere e bloccare il mesociclo.';
                apply.dataset.confirmationsPending = String(missing.length > 0);
                if (!missing.length) confirmations.classList.remove('requires-attention');
                return missing;
            };
            const feedback = node('p', undefined, 'mycoatch-meso-closure-feedback');
            feedback.setAttribute('role', 'alert');
            const onChange = () => {
                refresh();
                feedback.textContent = '';
            };
            consent.addEventListener('change', onChange);
            incomplete?.addEventListener('change', onChange);
            refresh();
            apply.addEventListener('click', async () => {
                const missing = refresh();
                if (missing.length) {
                    confirmations.classList.add('requires-attention');
                    feedback.textContent = 'Prima di concludere, spunta ' +
                        (missing.length === 1 ? 'la conferma evidenziata' :
                            'le conferme evidenziate') + ' qui sopra.';
                    const first = missing[0];
                    first.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
                    first.querySelector('input')?.focus({ preventScroll: true });
                    return;
                }
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
                    apply.disabled = false;
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
        next.addEventListener('click', () => startCoachChatAndGenerate(mesocycle));
        actions.append(next);
    }
    body.append(actions);
    detail.append(body);
    return detail;
}
