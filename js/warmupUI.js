import {buildWarmupPlan} from '../mycoatch/warmupPlan.js';
import {state} from './state.js';
import {saveAndSync} from './storage.js';
const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export function createWarmupPanel(ex,day,{workWeight,readOnly=false}={}){
 if((readOnly||day.completed)&&!ex.warmupSets)return null;
 const index=day.exercises.indexOf(ex);
 const proposed=buildWarmupPlan(ex,state.workoutData?.athlete||{},{workWeight,previousExercises:day.exercises.slice(0,index)});
 if(!proposed.length)return null;
 const panel=node('details');panel.className='exercise-warmups';panel.open=!ex.warmupSkipped;
 panel.append(node('summary','🔥 Avvicinamento · riscaldamento W'));
 const info=node('p','Serie facoltative, escluse da volume e progressioni. Kg per il totale del bilanciere o per singolo manubrio. Usa carichi leggeri, senza affaticarti.');panel.append(info);
 if(proposed.some(row=>row.targetKg&&!row.verified))info.textContent+=' Carichi indicativi: verifica i pesi realmente disponibili.';
 if(proposed.some(row=>!row.targetKg))info.textContent+=' Completa i kg mancanti con un peso leggero disponibile.';
 const rows=structuredClone(Array.isArray(ex.warmupSets)?ex.warmupSets.filter(row=>row&&typeof row==='object'):proposed);
 const status=node('p');status.setAttribute('role','status');
 const save=async()=>{
  const previous=ex.warmupSets;ex.warmupSets=structuredClone(rows);
  try{if(await saveAndSync(state.workoutData)===false)throw Error('Avvicinamento non salvato: riprova.');status.textContent='Riscaldamento salvato; non conta come lavoro allenante.';}
  catch(error){if(previous===undefined)delete ex.warmupSets;else ex.warmupSets=previous;status.textContent=error.message;}
 };
 const list=node('div');panel.append(list);
 const renderRow=(row,i)=>{
  const line=node('div');line.className='warmup-row';line.append(node('strong','W'+(i+1)));
  const weight=node('input');weight.type='number';weight.min='1';weight.max='700';weight.step='1';weight.inputMode='numeric';weight.value=row.weight??row.targetKg??'';weight.placeholder='Kg da scegliere';weight.setAttribute('aria-label','Riscaldamento '+(i+1)+' kg');weight.className='warmup-weight';
  const reps=node('input');reps.type='number';reps.min='1';reps.max='30';reps.step='1';reps.inputMode='numeric';reps.value=row.reps??row.targetReps??'';reps.setAttribute('aria-label','Riscaldamento '+(i+1)+' ripetizioni');reps.className='warmup-reps';
  const check=node('input');check.type='checkbox';check.checked=Boolean(row.completed);check.setAttribute('aria-label','Conferma riscaldamento '+(i+1));check.className='warmup-check';
  for(const field of [weight,reps]){field.disabled=readOnly||row.completed;field.onchange=()=>{
   if(!field.reportValidity())return;row.weight=weight.value;row.reps=reps.value;save();
  };}
  check.disabled=readOnly;check.onchange=async()=>{
   if(check.checked&&(!weight.value||!reps.value||!weight.reportValidity()||!reps.reportValidity())){check.checked=false;status.textContent='Indica kg interi e ripetizioni prima di confermare il riscaldamento.';return;}
   row.weight=weight.value;row.reps=reps.value;row.completed=check.checked;row.isWarmup=true;
   weight.disabled=reps.disabled=readOnly||row.completed;await save();
  };
  line.append(weight,node('span','kg ×'),reps,check);list.append(line);
 };
 rows.forEach(renderRow);
 const skip=node('button',ex.warmupSkipped?'Ripristina avvicinamento':'Salta avvicinamento');skip.type='button';skip.className='btn btn-secondary btn-sm';skip.disabled=readOnly;
 skip.onclick=async()=>{const previous=ex.warmupSkipped;ex.warmupSkipped=!previous;
  if(await saveAndSync(state.workoutData)===false){ex.warmupSkipped=previous;status.textContent='Scelta non salvata: riprova.';return;}
  panel.open=!ex.warmupSkipped;skip.textContent=ex.warmupSkipped?'Ripristina avvicinamento':'Salta avvicinamento';
 };
 const add=node('button','+ Aggiungi serie di avvicinamento');add.type='button';add.className='btn btn-secondary btn-sm';add.disabled=readOnly;
 add.onclick=async()=>{if(rows.length>=5){status.textContent='Sono già presenti cinque serie di avvicinamento.';return;}const row={isWarmup:true,targetKg:'',targetReps:'2',completed:false};rows.push(row);renderRow(row,rows.length-1);await save();};
 panel.append(add,skip,status);return panel;
}
