import {escapeHtml} from './helpers.js';
import {hasDropPrescription,needsDropScope} from './trainingTechniques.js';
export function dropScopeControl(ex,index,readOnly){
    if(!needsDropScope(ex))return '';
    return `<label class="drop-scope-control">Dropset: la scheda non specifica su quali serie.
        <select class="drop-scope" data-ex="${index}" ${readOnly?'disabled':''}>
        <option value="">Scegli come prescritto dal coach</option><option value="last">Solo ultima serie</option><option value="all">Ogni serie</option></select></label>`;
}
export function dropFields(ex,exIndex,setIndex,readOnly){
    const set=ex.loggedSets[setIndex];
    if(!hasDropPrescription(ex,setIndex) && !set.dropSegments?.length && !set.dropSkipped)return '';
    const locked=readOnly||set.isLocked||set.completed;
    const segments=set.dropSegments?.length?set.dropSegments:[{}];
    return `<tr class="drop-detail-row" data-set-index="${setIndex}"><td colspan="5">
        <section class="drop-fields" data-ex="${exIndex}" data-set="${setIndex}" aria-label="Scarichi serie ${setIndex+1}">
        <strong>Serie ${setIndex+1} · base + scarico</strong>
        <p>Completa la serie base, poi gli scarichi senza pausa. Spunta la serie solo al termine dell’intera sequenza.</p>
        ${(set.isLocked||set.completed) && !set.dropSegments?.length && !set.dropSkipped?'<p>Registro precedente: fasi non separate. I dati originali restano conservati.</p>':''}
        <label class="drop-skip-label"><input class="drop-skip" type="checkbox" ${set.dropSkipped?'checked':''} ${locked?'disabled':''}> Dropset non eseguito</label>
        ${!set.dropSkipped?segments.map((s,i)=>`<div class="drop-segment">
            <span>Scarico ${i+1}</span>
            <label>Kg<input class="drop-input" data-segment="${i}" data-field="weight" inputmode="decimal" value="${escapeHtml(s.weight??'')}" ${locked?'disabled':''}></label>
            <label>Reps<input class="drop-input" data-segment="${i}" data-field="reps" inputmode="numeric" value="${escapeHtml(s.reps??'')}" ${locked?'disabled':''}></label>
            <label>RPE<input class="drop-input" data-segment="${i}" data-field="rpe" inputmode="decimal" placeholder="—" value="${escapeHtml(s.rpe??'')}" ${locked?'disabled':''}></label>
            ${!locked?`<button type="button" class="drop-remove" data-segment="${i}" aria-label="Rimuovi scarico ${i+1}">×</button>`:''}
        </div>`).join(''):''}
        ${!locked&&!set.dropSkipped?'<button type="button" class="drop-add btn btn-secondary btn-sm">+ Aggiungi scarico</button>':''}
        </section></td></tr>`;
}
export function bindDropFields(container,day,{readOnly,save,render}){
    container.querySelectorAll('.drop-scope').forEach(select=>select.addEventListener('change',()=>{
        if(readOnly||!['last','all'].includes(select.value))return;
        day.exercises[Number(select.dataset.ex)].dropSetScope=select.value;save();render();
    }));
    container.querySelectorAll('.drop-fields').forEach(panel=>{
        const set=day.exercises[Number(panel.dataset.ex)]?.loggedSets?.[Number(panel.dataset.set)];
        const canEdit=()=>!readOnly&&!set.isLocked&&!set.completed;
        panel.querySelectorAll('.drop-input').forEach(input=>input.addEventListener('input',()=>{
            if(!canEdit())return;
            const i=Number(input.dataset.segment);set.dropSegments ||= [];
            while(set.dropSegments.length<=i)set.dropSegments.push({});
            set.dropSegments[i][input.dataset.field]=input.value;save();
        }));
        panel.querySelector('.drop-skip')?.addEventListener('change',event=>{
            if(!canEdit())return;set.dropSkipped=event.target.checked;save();render();
        });
        panel.querySelector('.drop-add')?.addEventListener('click',()=>{
            if(!canEdit())return;set.dropSegments ||= [{}];
            if(set.dropSegments.length>=5)return;
            set.dropSegments.push({});save();render();
        });
        panel.querySelectorAll('.drop-remove').forEach(button=>button.addEventListener('click',()=>{
            if(!canEdit())return;set.dropSegments?.splice(Number(button.dataset.segment),1);save();render();
        }));
    });
}
