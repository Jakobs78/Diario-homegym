import {isExerciseSkipped,setExerciseSkipped} from './sessionSkip.js';
import {state} from './state.js';
import {editJournal} from './journalTransaction.js';
import {updateSessionAndCompletionState} from './sessionTimer.js';
import {stopTimer} from './timer.js';
import {activeExerciseIndices} from './activeExercise.js';
import {showLiveCoachInputError} from './liveCoachUI.js';
export function bindSessionSkip(container,day,readOnly,render){
    container.querySelectorAll('.exercise-session-skip').forEach(button=>{
        button.addEventListener('click',async()=>{
            if(readOnly||button.disabled)return;
            const index=Number(button.dataset.ex),ex=day.exercises?.[index];if(!ex)return;
            const input=container.querySelector('.ex-user-notes[data-ex="'+index+'"]');
            const active=!isExerciseSkipped(ex),note=input?.value??ex.userNotes??'';
            if(active&&!note.trim()){
                input.required=true;input.setCustomValidity('Scrivi il motivo nelle note personali prima di saltare l’esercizio.');
                input.setAttribute('aria-invalid','true');input.focus();input.reportValidity();return;
            }
            const wasActive=activeExerciseIndices(day).includes(index);
            button.disabled=true;
            try{
                const year=String(state.currentYear),mi=state.activeMesocycleIndex||0,wn=state.activeWeek||1,di=(state.activeDay||1)-1;
                await editJournal(data=>{
                    const meso=data.history.years[year].mesocycles[mi];
                    if(meso.locked||meso.coachClosure?.status==='closed')throw Error('Sblocca il mesociclo per modificare la seduta.');
                    const target=meso.weeks.find(w=>Number(w.weekNumber)===Number(wn)).days[di];
                    setExerciseSkipped(target.exercises[index],active,note);
                    updateSessionAndCompletionState(target);
                });
                if(active&&wasActive)stopTimer();
                render?.();
            }catch(error){button.disabled=false;showLiveCoachInputError(error.message||'Esclusione non salvata: riprova.');}
        });
    });
}
