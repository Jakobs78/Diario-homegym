import {state} from './state.js';
import {trainingResumeDestination,activateTrainingPlan,planResumeTarget} from '../mycoatch/trainingResume.js';
import {editJournal} from './journalTransaction.js';
import {historyWindow} from './historyWindow.js';

/** Updates the persistent header; navigation itself never modifies workout data or timers. */
export function updateTrainingResumeUI(render) {
    const button=document.getElementById('resume-training-btn');
    if(!button)return;
    const destination=trainingResumeDestination(state.workoutData);
    button.hidden=!destination?.target;
    if(!destination?.target){button.onclick=null;return;}
    button.textContent=destination.target.label;
    button.title=destination.planName+' · '+destination.target.dayName;
    button.onclick=()=>{
        // Resolve again: sync or a completed set may have changed the next destination.
        const latest=trainingResumeDestination(state.workoutData);
        if(!latest?.target){updateTrainingResumeUI(render);return;}
        state.currentYear=latest.year;
        state.activeMesocycleIndex=latest.mesoIndex;
        state.activeWeek=latest.target.weekNumber;
        state.activeDay=latest.target.dayNumber;
        state.showArchivedHistory=!Object.hasOwn(historyWindow(state.workoutData).active,latest.year);
        state.activeView='workout';state.mesocycleAnalysis=null;
        for(const [key,value] of Object.entries({year:state.currentYear,meso:state.activeMesocycleIndex,week:state.activeWeek,day:state.activeDay}))
            localStorage.setItem('ui_active_'+key,String(value));
        document.querySelectorAll('.day-view').forEach(view=>view.classList.add('d-none'));
        document.getElementById('workout-list-container')?.classList.remove('d-none');
        for(const id of ['tools-modal','analytics-modal'])document.getElementById(id)?.classList.add('hidden');
        render();
        window.scrollTo({top:0,behavior:'instant'});
        document.getElementById('resume-training-btn')?.focus({preventScroll:true});
    };
}

export function createTrainingPlanSelection(meso,mesoIndex,readOnly,render) {
    if(readOnly || !planResumeTarget(meso))return null;
    const selected=trainingResumeDestination(state.workoutData);
    if(selected?.year===String(state.currentYear)&&selected.mesoIndex===mesoIndex)return null;
    const button=document.createElement('button');button.type='button';
    button.id='use-training-plan-btn';button.className='btn btn-secondary btn-sm';
    button.textContent='Usa questa scheda per allenarti';
    button.onclick=async()=>{
        try{
            const year=String(state.currentYear),id=meso.id;
            await editJournal(candidate=>{
                const plans=candidate.history?.years?.[year]?.mesocycles||[];
                const index=id?plans.findIndex(plan=>plan.id===id):mesoIndex;
                if(index<0 || (!id&&plans[index]?.name!==meso.name))throw Error('La scheda è cambiata: ricarica la vista.');
                activateTrainingPlan(candidate,year,index);
            },'SELECT_TRAINING_PLAN');
            render();
        }catch(error){alert(error.message);}
    };
    return button;
}
