/**
 * Inline, explicit approval of future-only load proposals. There is never a
 * hidden plan rewrite: changes are previewed, checked again on click, and
 * reversible until the first affected workout starts.
 */
import { state } from './state.js';
import { saveAndSync } from './storage.js';
import { buildLiveSessionSnapshot } from '../mycoatch/liveCoach.js';
import {
    previewFutureLoadReview,applyFutureLoadReview,
    getAppliedFutureLoadReview,undoFutureLoadReview,canUndoFutureLoadReview
} from '../mycoatch/futureLoadReview.js';

const el=(tag,cls,text)=>{
    const x=document.createElement(tag);
    if(cls)x.className=cls;
    if(text!==undefined)x.textContent=String(text);
    return x;
};
const optionsFor=day=>({
    readiness:buildLiveSessionSnapshot(day,{history:state.workoutData}).readiness,
    equipmentSettings:{
                    ...state.workoutData?.athlete,
        ...(state.workoutData?.athlete?.loadingSteps||{}),
        platePairs:state.workoutData?.athlete?.platePairs,
        barbellWeight:state.workoutData?.athlete?.barbellWeight
    }
});

export function createFutureLoadReviewPanel(meso,weekNumber,dayIndex,{
    readOnly=false,render=null
}={}) {
    const day=meso?.weeks?.find(w=>Number(w.weekNumber)===Number(weekNumber))
        ?.days?.[dayIndex];
    if(!day?.completed)return null;
    const choices=[];
    for(const [exerciseIndex,ex] of (day.exercises||[]).entries()){
        const applied=getAppliedFutureLoadReview(meso,weekNumber,dayIndex,exerciseIndex);
        const preview=applied?null:previewFutureLoadReview(
            meso,weekNumber,dayIndex,exerciseIndex,optionsFor(day)
        );
        if(applied||preview)choices.push({ex,applied,preview,exerciseIndex});
    }
    if(!choices.length)return null;
    const details=el('details','mycoatch-future-load-review');
    details.id='mycoatch-future-load-review';
    details.append(el('summary','mycoatch-future-load-summary',
        '📈 MyCoatch · Aggiorna solo le prossime sedute'));
    const content=el('div','mycoatch-future-load-content');
    content.append(el('p','',
        'La prestazione confermata suggerisce un incremento. Qui puoi vedere le singole sedute interessate; nulla viene applicato senza conferma. Il programma passato rimane intatto.'));
    for(const {ex,applied,preview} of choices){
        const item=el('section','mycoatch-future-load-item');
        const record=applied||preview;
        item.append(el('h4','',ex.name+' · '+record.source.from+' → '+record.source.to+' kg'));
        item.append(el('p','',record.reason));
        item.append(el('small','',
            applied?'Revisione applicata su tua conferma.':
            'Proposta provvisoria da una seduta. Non sostituisce una progressione consolidata su due settimane.'));
        const summary=el('strong','',record.changes.length+
            ' esposizion'+(record.changes.length===1?'e':'i')+
            (applied?' aggiornat'+(record.changes.length===1?'a':'e'): ' modificabil'+(record.changes.length===1?'e':'i')));
        item.append(summary);
        const list=el('ul','mycoatch-future-load-targets');
        for(const c of record.changes){
            list.append(el('li','',
                'Settimana '+c.weekNumber+' · '+c.dayName+' · '+
                c.exerciseName+': '+String(c.before.kgMin??c.before.kgMax)+
                ' → '+c.after+' kg'));
        }
        item.append(list);
        const status=el('p','mycoatch-future-load-error');
        status.setAttribute('role','alert');
        if(!readOnly && !applied && preview){
            const button=el('button','btn btn-secondary btn-sm mycoatch-future-load-apply',
                'Conferma e aggiorna solo queste sedute future');
            button.type='button';
            button.addEventListener('click',async()=>{
                button.disabled=true;
                try{
                    applyFutureLoadReview(meso,preview,optionsFor(day));
                    const saved=await saveAndSync(state.workoutData,'COACH_APPROVED_FUTURE_LOAD');
                    if(saved===false){
                        status.textContent='Salvataggio locale o coda cloud non riusciti: scarica subito un backup JSON.';
                        return;
                    }
                    if(typeof render==='function')render();
                }catch(error){
                    status.textContent=error.message||'Proposta non più valida: aggiorna il diario.';
                    button.disabled=false;
                }
            });
            item.append(button);
        }else if(!readOnly && applied){
            const undo=el('button','btn btn-secondary btn-sm mycoatch-future-load-undo',
                'Annulla aggiornamento e ripristina i kg precedenti');
            undo.type='button';
            undo.disabled=!canUndoFutureLoadReview(meso,applied);
            undo.addEventListener('click',async()=>{
                undo.disabled=true;
                try{
                    undoFutureLoadReview(meso,applied);
                    const saved=await saveAndSync(state.workoutData,'COACH_UNDO_FUTURE_LOAD');
                    if(saved===false){
                        status.textContent='Ripristino locale non sicuro: scarica subito backup JSON.';
                        return;
                    }
                    if(typeof render==='function')render();
                }catch(error){
                    status.textContent=error.message||'Ripristino non disponibile.';
                    undo.disabled=!canUndoFutureLoadReview(meso,applied);
                }
            });
            item.append(undo);
            if(undo.disabled)item.append(el('small','',
                'Ripristino disabilitato: una seduta interessata è iniziata o il mesociclo è bloccato.'));
        }
        item.append(status);
        content.append(item);
    }
    content.append(el('small','',
        'MyCoatch non modifica serie già eseguite, warmup, top set, back-off, scarichi o sedute iniziate. Le modifiche future restano incluse nel backup del diario.'));
    details.append(content);
    return details;
}

