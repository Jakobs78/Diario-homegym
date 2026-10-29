import {exerciseCoachModel} from '../mycoatch/coachCommunication.js';
const contexts=new WeakMap();
const signatures=new WeakMap();

export function renderExerciseCoachPanel(card,exercise,context={}) {
    const panel=card.querySelector('.exercise-coach-notes');
    if(!panel)return;
    contexts.set(card,{exercise,context});
    const count=Math.max(exercise.loggedSets?.length||0,exercise.sets?.length||0);
    const prefills=context.getPrefill?Array.from({length:count},(_,i)=>context.getPrefill(i)):context.prefills;
    const model=exerciseCoachModel(exercise,{...context,prefills});
    const signature=JSON.stringify(model);
    if(signatures.get(card)===signature)return model;
    signatures.set(card,signature);
    const instructions=panel.querySelector('.note-allenatore-text');
    instructions.replaceChildren();
    for(const text of model.instructions){const p=document.createElement('p');p.textContent=text;instructions.append(p);}
    instructions.hidden=!model.instructions.length;
    instructions.closest('.exercise-plan-notes').hidden=instructions.hidden;
    const updates=panel.querySelector('.coach-adaptive-notes');updates.replaceChildren();
    for(const entry of model.updates){
        const p=document.createElement('p');
        if(entry.severity==='caution')p.className='coach-message-warning';
        if(entry.severity==='caution')p.append(document.createTextNode('⚠️ '));
        if(entry.labelSeries!==false&&entry.series.length){const label=document.createElement('strong');label.textContent='Serie '+entry.series.join(', ')+': ';p.append(label);}
        if(entry.change){
            const label=document.createElement('strong');
            const end=entry.text.indexOf(':');
            if(end>=0){label.textContent=entry.text.slice(0,end+1);p.append(label,document.createTextNode(entry.text.slice(end+1)));}
            else p.append(document.createTextNode(entry.text));
        }else p.append(document.createTextNode(entry.text));
        updates.append(p);
    }
    for(const text of model.references){
        const p=document.createElement('p');p.className='coach-reference-source';p.textContent=text;updates.append(p);
    }
    updates.hidden=!model.updates.length;
    panel.hidden=!model.instructions.length&&!model.updates.length;
    panel.querySelector('.exercise-coach-updates').hidden=updates.hidden;
    panel.classList.toggle('has-coach-content',!panel.hidden);
    return model;
}

export function refreshExerciseCoachPanel(card,liveAdvice){
    const saved=contexts.get(card);
    return saved?renderExerciseCoachPanel(card,saved.exercise,{...saved.context,liveAdvice}):null;
}
