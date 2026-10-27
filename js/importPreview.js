import {importedIdentity,importIdentitySuggestions} from '../mycoatch/importIdentity.js';
import {normalizeExerciseLabel} from '../mycoatch/exerciseIdentity.js';
/** Editable CSV/Excel preview. All decisions remain in the draft until import commits. */
export function reviewImportedPlan(plan,{journal={}}={}){
    return new Promise(resolve=>{
        const draft=structuredClone(plan),dialog=document.createElement('dialog');
        dialog.className='import-review-dialog';dialog.setAttribute('aria-label','Controlla e modifica la scheda prima di importare');
        const title=document.createElement('h2');title.textContent='Controlla la scheda prima di importare';dialog.append(title);
        const help=document.createElement('p');help.textContent='Tutti gli esercizi sono elencati. Correggi nomi, serie, ripetizioni, carichi, RPE e recuperi. Per i nomi non riconosciuti scegli la variante esatta o mantieni un esercizio personalizzato. Nessuna modifica è salvata finché non confermi.';dialog.append(help);
        const form=document.createElement('form'),entries=[];
        for(const week of draft.weeks||[])for(const day of week.days||[]){
            const heading=document.createElement('h3');heading.textContent='Settimana '+week.weekNumber+' · '+(day.dayName||'Giorno '+day.dayNumber);form.append(heading);
            for(const ex of day.exercises||[]){
                const box=document.createElement('fieldset');box.className='import-exercise-fields';
                const fields={};
                for(const [key,label,value] of [['name','Esercizio',ex.name],['setsCount','Serie',ex.setsCount||ex.sets?.length||ex.loggedSets?.length],['reps','Ripetizioni',ex.reps],['kgMin','Kg minimi',ex.kgMin],['kgMax','Kg massimi',ex.kgMax],['rpe','RPE',ex.rpe||ex.targetRpe],['rest','Recupero',ex.recupero||ex.restTime||ex.rest],['notes','Note',ex.notes]]){
                    const row=document.createElement('label');row.textContent=label;
                    const input=document.createElement(key==='notes'?'textarea':'input');input.value=value??'';input.setAttribute('aria-label',label+' · '+ex.name);if(['name','setsCount','reps'].includes(key))input.required=true;
                    fields[key]=input;row.append(input);box.append(row);
                }
                const identityBox=document.createElement('div');identityBox.className='import-identity';
                const identityTitle=document.createElement('strong');identityTitle.textContent='Quale esercizio intendi?';
                const identityHelp=document.createElement('p');identityHelp.textContent='Associa solo la stessa variante e attrezzatura. Se manca, mantieni il nome personalizzato: avrà uno storico proprio.';
                const search=document.createElement('input');search.type='search';search.placeholder='Cerca nel catalogo';search.setAttribute('aria-label','Cerca esercizio · '+ex.name);
                const select=document.createElement('select');select.setAttribute('aria-label','Associazione · '+ex.name);
                identityBox.append(identityTitle,identityHelp,search,select);box.append(identityBox);
                const identity={box:identityBox,select,search,key:'',choices:new Map()};
                const refreshIdentity=(remember=true)=>{
                    const label=fields.name.value.trim(),key=normalizeExerciseLabel(label);
                    if(remember&&identity.key&&identity.select.value)identity.choices.set(identity.key,identity.select.value);
                    const changed=key!==identity.key;identity.key=key;
                    if(changed)search.value='';
                    const recognition=importedIdentity(label,journal);
                    const unknown=recognition.kind==='unknown';identityBox.hidden=!unknown;
                    select.required=unknown;select.disabled=!unknown;search.disabled=!unknown;
                    if(!unknown)return;
                    const chosen=identity.choices.get(key)||'';
                    select.replaceChildren();
                    for(const [value,text] of [['','Scegli un’opzione'],['custom','Mantieni come esercizio personalizzato']]){
                        const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);
                    }
                    const suggestions=importIdentitySuggestions(label,search.value);
                    if(chosen&&chosen!=='custom'&&!suggestions.some(ex=>ex.name===chosen))suggestions.unshift({name:chosen});
                    for(const catalog of suggestions){const option=document.createElement('option');option.value=catalog.name;option.textContent=catalog.name;select.append(option);}
                    select.value=chosen;
                };
                fields.name.addEventListener('input',refreshIdentity);search.addEventListener('input',refreshIdentity);
                select.addEventListener('change',()=>{
                    identity.choices.set(identity.key,select.value);
                    for(const entry of entries)if(normalizeExerciseLabel(entry.fields.name.value)===identity.key){
                        entry.identity.choices.set(identity.key,select.value);entry.refreshIdentity(false);
                    }
                });
                refreshIdentity();
                const specific=(ex.sets||[]).some(row=>
                    row.targetReps&&String(row.targetReps)!==String(ex.reps)||
                    row.targetRpe&&String(row.targetRpe)!==String(ex.targetRpe||ex.rpe)||
                    row.kgMin!==undefined||row.kgMax!==undefined);
                if(specific){
                    const summary=document.createElement('p');summary.className='import-series-targets';
                    summary.textContent=(ex.sets||[]).map((row,i)=>'Serie '+(i+1)+': '+
                        (row.targetReps??ex.reps)+' reps @'+(row.targetRpe??ex.targetRpe??ex.rpe)+' · '+
                        (row.kgMin??row.targetKg??ex.kgMin??'')+'–'+(row.kgMax??row.targetKg??ex.kgMax??'')+' kg').join(' | ');
                    box.append(summary);
                }
                entries.push({ex,fields,identity,refreshIdentity});form.append(box);
            }
        }
        const error=document.createElement('p');error.setAttribute('role','alert');
        const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Annulla';
        const save=document.createElement('button');save.type='submit';save.textContent='Conferma importazione';
        const finish=value=>{dialog.close();dialog.remove();resolve(value);};
        cancel.onclick=()=>finish(null);dialog.oncancel=event=>{event.preventDefault();finish(null);};
        form.onsubmit=event=>{
            event.preventDefault();
            try{for(const {ex,fields,identity,refreshIdentity} of entries){
                const value=Object.fromEntries(Object.entries(fields).map(([k,input])=>[k,input.value.trim()]));
                const count=Number(value.setsCount),rpe=Number(value.rpe.replace(',','.'));
                if(!value.name||!Number.isInteger(count)||count<1||count>30||!/^\d{1,3}(?:\s*[-–+]\s*\d{1,3})*$/.test(value.reps))throw Error('Controlla nome, serie e ripetizioni di '+(value.name||ex.name));
                if(value.rpe&&(!Number.isFinite(rpe)||rpe<5||rpe>10))throw Error('RPE non valido in '+value.name);
                for(const key of ['kgMin','kgMax'])if(value[key]&&(!Number.isFinite(Number(value[key].replace(',','.')))||Number(value[key].replace(',','.'))<0))throw Error('Carico non valido in '+value.name);
                if(value.kgMin&&value.kgMax&&Number(value.kgMin.replace(',','.'))>Number(value.kgMax.replace(',','.')))throw Error('Kg minimi superiori ai massimi in '+value.name);
                refreshIdentity();
                if(importedIdentity(value.name,journal).kind==='unknown'){
                    if(!identity.select.value)throw Error('Scegli una variante o mantieni come personalizzato: '+value.name);
                    ex.importIdentityChoice=identity.select.value;
                }else delete ex.importIdentityChoice;
                if(value.name!==ex.name){delete ex.catalogMapping;delete ex.exerciseId;ex.originalName=value.name;}
                const old=structuredClone(ex.sets||[]);
                const sameReps=value.reps===String(ex.reps??'');
                const sameRpe=value.rpe===String(ex.rpe||ex.targetRpe||'');
                Object.assign(ex,value,{setsCount:count,targetRpe:value.rpe,restTime:value.rest,recupero:value.rest});
                ex.sets=Array.from({length:count},(_,i)=>({...old[i],setNumber:i+1,targetReps:sameReps?(old[i]?.targetReps??value.reps):value.reps,targetRpe:sameRpe?(old[i]?.targetRpe??value.rpe):value.rpe,weight:'',reps:'',rpe:'',completed:false,isLocked:false}));
                ex.loggedSets=structuredClone(ex.sets);
            }finish(draft);}catch(reason){error.textContent=reason.message;}
        };
        form.append(error,cancel,save);dialog.append(form);document.body.append(dialog);dialog.showModal();
    });
}
