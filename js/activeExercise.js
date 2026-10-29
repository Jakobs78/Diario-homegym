import {isExerciseSkipped} from './sessionSkip.js';
import {isCircuit,circuitMembers} from './restPolicy.js';
import {isWarmupExercise,isWarmupSet} from './workoutSemantics.js';
const sessions=new WeakMap();
const complete=ex=>isWarmupExercise(ex)||isExerciseSkipped(ex)||((ex.loggedSets||[]).length>0&&(ex.loggedSets||[]).filter(s=>!isWarmupSet(s)).every(s=>s.isLocked||s.completed));
function session(day){if(!sessions.has(day))sessions.set(day,{index:(day.exercises||[]).findIndex(ex=>!complete(ex)),manual:new Map(),scroll:false});return sessions.get(day);}
export function advanceExercise(day,index){
    const current=day.exercises?.[index];if(!current||!complete(current))return;
    const group=isCircuit(current)?circuitMembers(day,current):[current];
    if(!group.every(complete))return;
    const value=session(day),last=Math.max(...group.map(ex=>day.exercises.indexOf(ex)));
    value.index=(day.exercises||[]).findIndex((ex,i)=>i>last&&!complete(ex));
    value.manual.clear();value.scroll=true;
}
export function activeExerciseIndices(day){
    const value=session(day),ex=day.exercises?.[value.index];
    return ex?(isCircuit(ex)?circuitMembers(day,ex):[ex]).map(item=>day.exercises.indexOf(item)):[];
}
/** UI state only. Render/clock updates never reset the athlete's disclosures. */
export function bindActiveExercisePanels(container,day){
    const value=session(day),active=activeExerciseIndices(day);
    container.querySelectorAll('.ex-card').forEach(card=>{
        const index=Number(card.dataset.ex),isActive=active.includes(index);
        card.classList.toggle('is-active-exercise',isActive);
        card.querySelectorAll('.plates-disclosure').forEach((panel,i)=>{
            const key=index+':'+i;
            panel.open=value.manual.has(key)?value.manual.get(key):isActive;
            if(panel.classList.contains('plates-disclosure'))panel.dataset.manual='true';
            const summary=panel.querySelector('summary');
            if(summary)summary.onclick=()=>value.manual.set(key,!panel.open);
        });
        const title=card.querySelector('.ex-name');
        if(title){title.tabIndex=0;title.setAttribute('role','button');title.setAttribute('aria-expanded',String(isActive));
            const activate=()=>{value.index=index;value.manual.clear();bindActiveExercisePanels(container,day);};
            title.onclick=activate;title.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}};
        }
    });
    if(value.scroll){
        value.scroll=false;
        // Final-session scrolling happens after opening the report in liveCoachUI.
        const target=value.index<0?null:container.querySelector('[data-ex="'+value.index+'"].ex-card');
        target?.scrollIntoView?.({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
        if(value.index<0){const status=document.createElement('p');status.className='session-finished-summary';status.setAttribute('role','status');status.textContent='Seduta completata. Puoi riaprire gli esercizi per controllare o correggere le serie.';container.append(status);}
    }
}
