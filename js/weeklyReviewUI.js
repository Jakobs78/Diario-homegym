/**
 * Revisione facoltativa della settimana successiva, integrata nel diario.
 * Nessun prompt bloccante e nessuna mutazione prima del click esplicito.
 * Le note e i dati vengono mostrati con textContent (mai HTML di terzi).
 */
import { reviewUpcomingWeek, applyUpcomingWeekReview,
    undoUpcomingWeekReview } from '../mycoatch/weeklyReview.js';
import { saveAndSync } from './storage.js';
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
    if(!['ready','pain','applied'].includes(proposal.status))return null;

    const details=node('details','mycoatch-weekly-review');
    details.id='mycoatch-weekly-review';
    details.open=wasOpen;
    const summary=proposal.status==='ready'
        ? '🤖 MyCoatch · Revisione settimana '+weekNumber+' da valutare'
        : proposal.status==='pain'
            ? '⚠️ MyCoatch · Dolore segnalato nella settimana precedente'
            : '✓ MyCoatch · Settimana '+weekNumber+' rivista';
    details.append(node('summary','mycoatch-weekly-review-summary',summary));
    const body=node('div','mycoatch-weekly-review-content');
    body.append(node('p','',proposal.message));
    if(proposal.status==='ready'){
        body.append(node('p','mycoatch-weekly-review-data',
            'Evidenze: '+proposal.affectedDays+'/'+proposal.confirmedDays+
            ' giornate con segnali ripetuti · '+proposal.measuredSets+
            ' RPE realmente misurati.'));
        const proposed=node('div','mycoatch-weekly-review-changes');
        const unique=[...new Map(proposal.changes.map(item=>[
            item.name+'|'+item.from+'|'+item.to,item
        ])).values()];
        proposed.append(node('strong','','Nuovi target (prima → dopo):'));
        const list=node('ul');
        for(const item of unique.slice(0,6))
            list.append(node('li','',item.name+': RPE '+item.from+
                ' → '+item.to));
        if(unique.length>6)
            list.append(node('li','','Altri '+(unique.length-6)+' esercizi.'));
        proposed.append(list);
        body.append(proposed);
        body.append(node('small','',
            'I kg non vengono cancellati dallo storico. Dopo la conferma i pesi '+
            'non saranno precompilati: scegli il carico coerente con il nuovo RPE. '+
            'Serie e ripetizioni previste restano invariate.'));
        if(!readOnly){
            const apply=node('button','btn btn-secondary btn-sm mycoatch-weekly-apply',
                'Conferma revisione');
            apply.type='button';
            apply.addEventListener('click',()=>{
                try {
                    applyUpcomingWeekReview(mesocycle,weekNumber,proposal);
                    saveAndSync(state.workoutData);
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
        undo.addEventListener('click',()=>{
            try {
                undoUpcomingWeekReview(mesocycle,weekNumber);
                saveAndSync(state.workoutData);
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
