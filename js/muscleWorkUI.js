import {TRACKED_MUSCLES} from '../mycoatch/volumeAccounting.js';
import {muscleGroupLabel} from '../mycoatch/muscleCatalog.js';
const cell=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
const fmt=n=>String(n).replace('.',',');
export function renderMuscleWorkDetails(canvas,report,{scope='period',expanded=false}={}){
 let panel=canvas.parentElement.querySelector('.muscle-work-report');
 if(!panel){panel=document.createElement('div');panel.className='muscle-work-report';canvas.after(panel);}
 panel.replaceChildren();
 panel.append(cell('p',(scope==='session'?'Serie di questa seduta. ':'Serie nel periodo selezionato. ')+'Dirette: 1 per serie; indirette: contributo stimato di 0,5. Stabilizzazione esclusa. Non misura la fatica o la crescita dei muscoli.'));
 const total=report.performed,planned=report.planned;
 panel.append(cell('p',total.totalPhysicalSets+' serie confermate su '+planned.totalPhysicalSets+' previste. Una stessa serie può coinvolgere più muscoli: non sommare i distretti come serie distinte.'));
 if(planned.unclassifiedSets||total.unclassifiedSets)panel.append(cell('p','Non attribuite: '+total.unclassifiedSets+' serie confermate, '+planned.unclassifiedSets+' previste. Esercizi: '+planned.unknownExercises.join(', ')+'.'));
 const details=document.createElement('details');details.open=expanded;details.append(cell('summary','Dettaglio per muscolo ed esercizio'));
 const scroll=document.createElement('div');scroll.className='muscle-work-table-scroll';const table=document.createElement('table');
 const head=document.createElement('thead'),hr=document.createElement('tr');
 for(const title of ['Distretto','Dirette previste','Dirette confermate','Contributi indiretti confermati','Totale stimato confermato','Esercizi (serie confermate/previste)'])hr.append(cell('th',title));
 head.append(hr);table.append(head);const body=document.createElement('tbody');
 for(const m of TRACKED_MUSCLES){
  const p=planned.byMuscle[m],v=total.byMuscle[m];if(!p.fractionalSets&&!v.fractionalSets)continue;
  const list=report.exercises.filter(e=>e.primary.includes(m)||e.secondary.includes(m)).map(e=>e.name+' '+e.performed+'/'+e.planned+(e.secondary.includes(m)?' (indiretto)':'')+(e.averageRpe!==null?' · RPE medio '+fmt(e.averageRpe):''));
  const row=document.createElement('tr');for(const value of [muscleGroupLabel(m),p.directSets,v.directSets,v.indirectSetCredits,v.fractionalSets,list.join('; ')])row.append(cell('td',typeof value==='number'?fmt(value):value));body.append(row);
 }
 table.append(body);scroll.append(table);details.append(scroll);panel.append(details);
}
