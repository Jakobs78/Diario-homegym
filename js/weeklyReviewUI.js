/**
 * Revisione facoltativa della settimana successiva, integrata nel diario.
 * Nessun prompt bloccante e nessuna mutazione prima del click esplicito.
 * Le note e i dati vengono mostrati con textContent (mai HTML di terzi).
 */
import { reviewUpcomingWeek, applyUpcomingWeekReview,
    undoUpcomingWeekReview } from '../mycoatch/weeklyReview.js';
import {editJournal} from './journalTransaction.js';
import { state } from './state.js';

function node(tag, cls, content) {
    const result=document.createElement(tag);
    if(cls)result.className=cls;
    if(content!==undefined)result.textContent=String(content);
    return result;
}

export function createWeeklyReviewPanel(mesocycle, weekNumber, {
    readOnly=false, wasOpen=false, render=null
}={}) {
    const proposal=reviewUpcomingWeek(mesocycle,weekNumber);
    if(proposal.status==='none')return null;

    const details=node('details','mycoatch-weekly-review');
    details.id='mycoatch-weekly-review';
    details.open=wasOpen;
    const summary=proposal.status==='ready'
        ? '🤖 MyCoatch · Possibile riduzione dello sforzo nella settimana '+weekNumber
        : proposal.status==='pain'
            ? '⚠️ MyCoatch · Dolore segnalato nella settimana precedente'
            : proposal.status==='applied' ? '✓ MyCoatch · Obiettivi RPE della settimana '+weekNumber+' aggiornati'
                : '🤖 MyCoatch · Stato della revisione settimanale';
    details.append(node('summary','mycoatch-weekly-review-summary',summary));
    const body=node('div','mycoatch-weekly-review-content');
    body.append(node('p','',proposal.message));
    if(proposal.status==='ready'){
        body.append(node('p','mycoatch-weekly-review-data',
            'Perché viene suggerita: '+proposal.affectedDays+'/'+proposal.confirmedDays+
            ' giornate con segnali ripetuti · '+proposal.measuredSets+
            ' serie con RPE effettivamente registrato.'));
        const proposed=node('div','mycoatch-weekly-review-changes');
        const unique=[...new Map(proposal.changes.map(item=>[
            item.name+'|'+item.from+'|'+item.to,item
        ])).values()];
        proposed.append(node('strong','','RPE obiettivo per gli esercizi interessati (attuale → proposto):'));
        const list=node('ul');
        for(const item of unique.slice(0,6))
            list.append(node('li','',item.name+': RPE '+item.from+
                ' → '+item.to));
        if(unique.length>6)
            list.append(node('li','','Altri '+(unique.length-6)+' esercizi.'));
        proposed.append(list);
        body.append(proposed);
        body.append(node('small','',
            'Le prestazioni già registrate non vengono modificate. Dopo la conferma i pesi '+
            'non saranno precompilati: scegli il carico coerente con il nuovo RPE. '+
            'Serie e ripetizioni previste restano invariate.'));
        if(!readOnly){
            const apply=node('button','btn btn-secondary btn-sm mycoatch-weekly-apply',
                'Applica i nuovi obiettivi RPE alla settimana');
            apply.type='button';
            apply.addEventListener('click',async()=>{
                try {
                    await editJournal(candidate=>{
                        const current=candidate.history.years[state.currentYear].mesocycles[state.activeMesocycleIndex||0];
                        applyUpcomingWeekReview(current,weekNumber,proposal);
                    },'APPLY_WEEKLY_REVIEW');
                    if(typeof render==='function')render();
                } catch(error) {
                    errorLine.textContent=error.message||
                        'La proposta non è più valida: ricarica la scheda.';
                }
            });
            body.append(apply);
        }
    }
    if(proposal.status==='applied' && !readOnly){
        body.append(node('small','',
            'Puoi annullare soltanto se non hai ancora iniziato la nuova settimana.'));
        const undo=node('button','btn btn-secondary btn-sm mycoatch-weekly-undo',
            'Ripristina target originali');
        undo.type='button';
        undo.disabled=(mesocycle.weeks||[])
            .find(w=>Number(w.weekNumber)===Number(weekNumber))?.days?.some(day=>
                day.completed || day.sessionStart || (day.accumulatedSeconds||0)>0 ||
                (day.sessionArchives||[]).length>0 ||
                (day.exercises||[]).some(ex=>
                    (ex.loggedSets||[]).some(set=>set.isLocked||set.completed))) || false;
        undo.addEventListener('click',async()=>{
            try {
                await editJournal(candidate=>undoUpcomingWeekReview(candidate.history.years[state.currentYear].mesocycles[state.activeMesocycleIndex||0],weekNumber),'UNDO_WEEKLY_REVIEW');
                if(typeof render==='function')render();
            } catch(error) {
                errorLine.textContent=error.message||
                    'Non posso ripristinare gli obiettivi.';
            }
        });
        body.append(undo);
    }
    const errorLine=node('p','mycoatch-weekly-error');
    errorLine.setAttribute('role','alert');
    body.append(errorLine);
    details.append(body);
    return details;
}
