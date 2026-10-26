import {createSingleExerciseCard,updatePlatesBadgeUI} from './exerciseCard.js';
import {currentCircuitRound,circuitRoundComplete} from './restPolicy.js';
import {isWarmupExercise,isWarmupSet} from './workoutSemantics.js';
const selections=new WeakMap();
export function createCircuitCard(members,start,day,mesoIndex,week,dayNumber,readOnly,render){
    const first=members[0],key=String(first.groupBase)+':'+start;
    let choices=selections.get(day);if(!choices){choices=new Map();selections.set(day,choices);}
    const total=Math.max(0,...members.map(ex=>ex.loggedSets?.length||0));
    const round=Math.min(total-1,choices.get(key)??currentCircuitRound(members));
    const section=document.createElement('section');section.className='exercise-group-wrapper circuit-card';
    section.setAttribute('aria-label',first.groupType==='triset'?'Triset':'Superserie');
    const header=document.createElement('div');header.className='circuit-heading';
    const title=document.createElement('h3');title.textContent=(first.groupType==='triset'?'TRISET':first.groupType==='jumpset'?'JUMPSET':'SUPERSERIE')+' · Blocco '+first.groupBase;
    const nav=document.createElement('div');nav.className='circuit-rounds';nav.setAttribute('aria-label','Seleziona giro');
    for(let i=0;i<total;i++){
        const btn=document.createElement('button');btn.type='button';btn.textContent='Giro '+(i+1)+(circuitRoundComplete(members,i)?' ✓':'');
        btn.setAttribute('aria-pressed',String(i===round));btn.addEventListener('click',()=>{choices.set(key,i);render();});nav.append(btn);
    }
    const status=document.createElement('p');status.className='circuit-status';status.setAttribute('aria-live','polite');
    const pending=members.find(ex=>!isWarmupExercise(ex)&&ex.loggedSets?.[round]&&!isWarmupSet(ex.loggedSets[round])&&!ex.loggedSets[round].isLocked&&!ex.loggedSets[round].completed);
    const rest=members.at(-1).recupero||members.at(-1).restTime||members.at(-1).rest||'90s';
    status.textContent=pending?'Prossimo: '+pending.name+' · Recupero '+rest+' solo dopo il giro completo.':'Giro completato · Recupero '+rest+'.';
    header.append(title,nav,status);section.append(header);
    const grid=document.createElement('div');grid.className='circuit-exercises';section.append(grid);
    members.forEach((ex,offset)=>{
        const card=createSingleExerciseCard(ex,start+offset,day,mesoIndex,week,dayNumber,readOnly);
        card.classList.add('circuit-exercise');
        card.dataset.activeSet=String(round);
        card.querySelectorAll('.workout-set-row').forEach(row=>row.classList.toggle('is-active-set',Number(row.dataset.setIndex)===round));
        const sub=card.querySelector('.exercise-details-sub');
        if(sub)sub.textContent=sub.textContent.replace(/\s*\|\s*rest\s+.*$/i,'');
        updatePlatesBadgeUI(start+offset,card);
        card.querySelectorAll('.workout-set-row,.drop-detail-row').forEach(row=>{row.hidden=Number(row.dataset.setIndex)!==round;});
        card.querySelector('.ex-card-header')?.remove();
        card.querySelector('.workout-set-status')?.remove();
        if(!ex.loggedSets?.[round]){
            const note=document.createElement('p');note.textContent='Nessuna serie prevista in questo giro.';card.querySelector('.set-table')?.replaceWith(note);
        }
        grid.append(card);
    });
    section.addEventListener('change',event=>{
        if(event.target.matches('.set-lock-check'))choices.delete(key);
    },true);
    return section;
}
