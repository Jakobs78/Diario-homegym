import {circuitMembers,currentCircuitRound,circuitRoundComplete,isCircuit} from './restPolicy.js';
import {isExerciseSkipped} from './sessionSkip.js';
import {isWarmupExercise,isWarmupSet} from './workoutSemantics.js';
let activeDay=null,activeContainer=null,pending=null;
const bound=new WeakSet();
export function cancelCircuitTransition(){
    if(pending){clearTimeout(pending.timer);pending.popup.remove();pending=null;}
}
export function bindCircuitTransitionDay(day,container){
    if(day!==activeDay||container!==activeContainer)cancelCircuitTransition();
    activeDay=day;activeContainer=container;
    if(!bound.has(container)){
        container.addEventListener('pointerdown',event=>{
            if(event.target.closest('.circuit-rounds,.set-lock-check'))cancelCircuitTransition();
        },true);
        container.addEventListener('change',event=>{
            if(event.target.matches('.set-lock-check'))cancelCircuitTransition();
        },true);
        bound.add(container);
    }
}
export function showCircuitTransition(day,exercise,completedRound,container){
    cancelCircuitTransition();
    if(!isCircuit(exercise)||day.completed)return;
    const members=circuitMembers(day,exercise),next=currentCircuitRound(members);
    if(next<=completedRound||!circuitRoundComplete(members,completedRound))return;
    const popup=document.createElement('div');popup.className='circuit-round-popup';
    popup.setAttribute('role','status');popup.setAttribute('aria-live','polite');
    popup.textContent='Si riparte col giro '+(next+1);document.body.append(popup);
    const transition={popup,timer:null};pending=transition;
    transition.timer=setTimeout(()=>{
        if(pending!==transition)return;
        cancelCircuitTransition();
        if(activeDay!==day||activeContainer!==container||!container.isConnected||day.completed||
            currentCircuitRound(members)!==next||!circuitRoundComplete(members,completedRound))return;
        const first=members.find(ex=>!isExerciseSkipped(ex)&&!isWarmupExercise(ex)&&ex.loggedSets?.[next]&&
            !isWarmupSet(ex.loggedSets[next])&&!ex.loggedSets[next].isLocked&&!ex.loggedSets[next].completed);
        const index=day.exercises.indexOf(first);
        const target=container.querySelector('.ex-card[data-ex="'+index+'"]');
        target?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    },3000);
}
