import {editJournal} from './journalTransaction.js';
import {state} from './state.js';
import {renderWorkoutList} from './ui.js';
/**
 * Guided end-of-block review next to the existing lock controls.
 * No mutation happens during rendering, inspection or report download.
 */
import { summarizeMesocycleClosure } from './mesocycleClosure.js';
import {ANALYSIS_LABELS,muscleLabel} from '../mycoatch/mesocycleAnalysis.js';
import {TRACKED_MUSCLES} from '../mycoatch/volumeAccounting.js';
import { concludeCurrentMesocycle,exportMesoToPDF } from './mesocycle.js';
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
        'Risultati del mesociclo · in corso'));
    const body = node('div', undefined, 'mycoatch-meso-closure-content');
    const stats = [
        'Sedute complete: ' + review.completedSessions + '/' + review.plannedSessions +
            (review.adherencePercent === null ? '' : ' (' + review.adherencePercent + '%)'),
        'Sedute parziali: ' + review.partialSessions +
            ' · non iniziate: ' + review.skippedSessions,
        'Serie completate con dati validi: ' + review.completedSets + '/' + review.plannedSets +
            ' · mancanti: '+review.missingSets+' · RPE misurati: ' + review.measuredRpeSets + '/' + review.completedSets,
        'RPE medio percepito nelle serie registrate: ' + (review.averageRpe ?? 'dato insufficiente')
    ];
    for (const line of stats) body.append(node('p', line));
    body.append(node('small','L’RPE medio descrive lo sforzo registrato: non identifica da solo fatica o recupero. I confronti sotto usano serie equivalenti.'));
    if(review.skippedSets)body.append(node('p','Sedute concluse con esclusioni: '+review.sessionsWithSkips+'. Serie saltate intenzionalmente: '+review.skippedSets+'. I motivi sono nelle note personali del diario e nella stampa completa. Le esclusioni consentono di concludere la seduta, senza contare queste serie come eseguite.'));
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
        },'TOGGLE_COACHING_EVIDENCE');renderWorkoutList();}catch(error){alert(error.message);}};body.append(exclude,node('p','La scelta è reversibile: non elimina né nasconde il diario. Il mesociclo escluso non alimenta precompilazione, analisi per nuove proposte o calibrazione del coaching.'));
    }
    appendAnalysisSections(body,review);
    body.append(node('small',
        'Questo riepilogo utilizza solo le serie confermate. Un aumento di peso o ripetizioni non misura direttamente la crescita muscolare. ' +
        'La consultazione e lo scaricamento del report non modificano il diario.'));
    const actions = node('div', undefined, 'mycoatch-meso-closure-actions');
    const pdfBtn=node('button','Scarica analisi in PDF','btn btn-secondary btn-sm');
    pdfBtn.type='button';
    pdfBtn.onclick=()=>{
        if(!window.jspdf?.jsPDF){alert('Il lettore PDF non è disponibile. Riprova online oppure scarica il rapporto in testo.');return;}
        exportMesoToPDF(mesocycle,{includeDiary:false});
    };
    const markdownBtn=node('button','Rapporto completo da condividere (.md)','btn btn-secondary btn-sm');
    markdownBtn.type='button';
    markdownBtn.addEventListener('click',()=>{
        const data=buildMesocycleReviewDossier(mesocycle);
        downloadReviewDossier(formatMesocycleReviewDossierMarkdown(data),
            data.mesocycle.name,'md','text/markdown');
    });
    const advanced=node('details',undefined,'mesocycle-export-advanced');
    advanced.append(node('summary','Esportazioni avanzate'));
    advanced.append(node('p','Per strumenti compatibili; non è un backup e non ripristina il diario. Per conservare tutto usa il backup completo in Strumenti.'));
    const jsonBtn=node('button','Esporta dati dell’analisi (.json)','btn btn-secondary btn-sm');
    jsonBtn.type='button';
    jsonBtn.addEventListener('click',()=>{
        const data=buildMesocycleReviewDossier(mesocycle);
        downloadReviewDossier(serializeMesocycleReviewDossierJson(data),
            data.mesocycle.name,'json','application/json');
    });
    advanced.append(jsonBtn);
    actions.append(pdfBtn,markdownBtn,node('p','PDF: analisi leggibile e stampabile. MD: analisi e dettaglio delle serie in testo. Questi export escludono note libere, date delle sedute e dati account; i nomi personalizzati possono essere riconoscibili. Il PDF completo del diario, disponibile in Strumenti, conserva anche note e archivio. Nessun invio automatico.'),advanced);

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
        next.disabled=Boolean(mesocycle.excludedFromCoaching);
        if(next.disabled)body.append(node('p','Riutilizza questo mesociclo nel coaching per preparare la sua prosecuzione.'));
        next.addEventListener('click', () => startCoachChatAndGenerate(mesocycle));
        actions.append(next);
    }
    body.append(actions);
    detail.append(body);
    return detail;
}

function appendAnalysisSections(body,review){
    const analysis=review.analysis;if(!analysis)return;
    const section=title=>{const el=node('section',undefined,'mesocycle-analysis-section');el.append(node('h2',title));body.append(el);return el;};
    const performance=section('Andamento degli esercizi');
    const list=node('ul');
    for(const ex of analysis.exercises){
        const li=node('li');li.append(node('strong',ex.name+' · '+ANALYSIS_LABELS[ex.status]));
        if(ex.firstWeek!==undefined){
            li.append(node('p','Confronto tra settimane '+ex.firstWeek+' e '+ex.lastWeek+':'));
            for(const [i,row] of (ex.firstRows||[]).entries()){
                const last=ex.lastRows[i];li.append(node('p','Serie '+row.setNumber+' ('+row.role+'): '+row.kg+' kg × '+row.reps+' @'+(row.rpe??'n.d.')+' → '+last.kg+' kg × '+last.reps+' @'+(last.rpe??'n.d.')+'.'));
            }
        }
        li.append(node('p',ex.reason+(ex.contextNote?' '+ex.contextNote:'')));
        const coverage=review.exerciseCoverage.find(item=>item.name===ex.name);
        li.append(node('small',ex.confirmedSets+' serie valide'+(coverage?.classificationStatus==='unmapped'?' · Esercizio non classificato: escluso dal conteggio muscolare.':'')));
        list.append(li);
    }
    if(!analysis.exercises.length)performance.append(node('p','Nessun esercizio allenante da analizzare.'));
    performance.append(list);
    const volume=section('Volume: previsto, eseguito e variazioni');
    volume.append(node('p',analysis.notice));
    volume.append(node('p','Medie eseguite: '+analysis.completeRegularWeeks+' settimane concluse non di scarico. '+(analysis.volumeComparison?'Variazione tra settimane '+analysis.volumeComparison.firstWeek+' e '+analysis.volumeComparison.lastWeek+'.':'Variazione non valutabile: servono due settimane concluse non di scarico.')));
    const wrap=node('div',undefined,'mesocycle-volume-table-wrap');const table=node('table',undefined,'mesocycle-volume-table');
    const head=node('thead'),tr=node('tr');
    const columns=['Muscolo','Dirette previste / sett.¹','Dirette eseguite / sett.²','Crediti indiretti / sett.²','Δ dirette / crediti²','Δ dirette previste²'];
    for(const title of columns){const th=node('th',title);th.scope='col';tr.append(th);}head.append(tr);table.append(head);
    const tbody=node('tbody');
    for(const m of analysis.muscles){
        if(!m.averagePlannedDirect&&!m.averagePerformedDirect&&!m.averageIndirectCredits)continue;
        const row=node('tr');for(const [i,v] of [m.title,m.averagePlannedDirect??'n.d.',m.averagePerformedDirect??'n.d.',m.averageIndirectCredits??'n.d.',m.directChange===null?'n.d.':(m.directChange>0?'+':'')+m.directChange+' / '+(m.indirectChange>0?'+':'')+m.indirectChange,m.plannedDirectChange===null?'n.d.':(m.plannedDirectChange>0?'+':'')+m.plannedDirectChange].entries()){const cell=node('td',String(v));cell.dataset.label=columns[i];row.append(cell);}tbody.append(row);
    }
    table.append(tbody);wrap.append(table);volume.append(wrap,node('small','¹ Tutte le settimane del piano. ² Solo settimane concluse non di scarico, incluse le esclusioni intenzionali. Crediti indiretti = 0,5 per coinvolgimento secondario riconosciuto.'));
    const weekly=node('details');weekly.append(node('summary','Dettaglio per settimana e gruppo muscolare'));
    for(const w of analysis.volumeWeeks){
        weekly.append(node('h3','Settimana '+w.weekNumber+(w.isDeload?' · Scarico':'')));
        weekly.append(node('p',w.performedSets+'/'+w.plannedSets+' serie eseguite · '+w.skippedSets+' saltate · '+w.missingSets+' mancanti.'+(w.complete?'':' Settimana incompleta: nessuna inferenza di calo del volume.')));
        const ul=node('ul');for(const m of TRACKED_MUSCLES){const p=w.planned[m],v=w.performed[m];if(p.fractionalSets||v.fractionalSets)ul.append(node('li',muscleLabel(m)+': dirette '+v.directSets+'/'+p.directSets+' previste; crediti indiretti '+v.indirectSetCredits+'/'+p.indirectSetCredits+' previsti.'));}weekly.append(ul);
        if(w.unclassifiedSets)weekly.append(node('p',w.unclassifiedSets+' serie previste non attribuibili a gruppi muscolari: esercizi non classificati.'));
    }
    volume.append(weekly);
    const next=section('Indicazioni per il prossimo mesociclo');
    for(const suggestion of analysis.suggestions)next.append(node('p',suggestion.name+': '+suggestion.text));
    next.append(node('small','Check-in storici pertinenti: '+analysis.recovery.validCheckins+'; difficoltà riferite: '+analysis.recovery.reportedDifficulties+'. Le proposte non cambiano serie, esercizi o struttura del mesociclo attivo. Nessuno scarico obbligatorio a calendario.'));
}
