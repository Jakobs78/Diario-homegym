import {bodyweightMetadata} from '../mycoatch/bodyweight.js';
import {plannedWorkSetCount,isWarmupExercise,isWarmupSet} from './workoutSemantics.js';
const number=value=>{const s=String(value??'').trim().replace(',','.');return /^\d+(?:\.\d+)?$/.test(s)&&Number(s)<=700?Number(s):null;};
const fmt=n=>String(n).replace('.',',');
export function prescribedLoadText(ex){
 const min=number(ex.kgMin),max=number(ex.kgMax);
 const base=min!==null&&max!==null&&min!==max?fmt(min)+'–'+fmt(max)+' kg':min!==null?fmt(min)+' kg':max!==null?fmt(max)+' kg':'';
 return [base,ex.topset?String(ex.topset):''].filter(Boolean).join(' · ');
}
/** Uses the same displayed prefills as the set rows; never saves a proposal. */
export function exerciseLoadSummary(ex,prefills=[],{readOnly=false}={}){
 const original=prescribedLoadText(ex),body=bodyweightMetadata(ex);
 if(isWarmupExercise(ex))return {text:'Carichi di riscaldamento nelle serie',original};
 const logs=ex.loggedSets||[],sets=ex.sets||[];
 const count=Math.max(Array.isArray(logs)?logs.length:0,Array.isArray(sets)?sets.length:0,plannedWorkSetCount(ex));
 const rows=Array.from({length:count},(_,i)=>({index:i,log:logs[i]||{},plan:sets[i]||{},prefill:prefills[i]||{}}))
  .filter(r=>!isWarmupSet(r.log)&&!isWarmupSet(r.plan));
 const pending=rows.filter(r=>!r.log.isLocked&&!r.log.completed),complete=rows.length>0&&!pending.length;
 const selected=complete?rows:pending;
 const values=selected.map(r=>number(complete||readOnly?r.log.weight??r.log.actualKg:r.prefill.weight));
 const usable=n=>n!==null&&(n>0||body!==null);
 if(!selected.length||values.every(n=>!usable(n)))return {text:readOnly?'Carico non registrato':original&&!prefills.length?'Carico della scheda: '+original:'Carico da impostare',original};
 if(!values.every(usable)||new Set(values).size!==1)return {text:complete?'Carichi registrati nelle serie':'Carichi indicati nelle serie',original};
 const n=values[0];
 if(n===0&&body)return {text:body.unloaded?'Corpo libero':'Senza sovraccarico',original};
 const entered=selected.every(r=>number(r.log.weight??r.log.actualKg)!==null);
 const prescribed=selected.every(r=>r.prefill.source==='csv_target');
 const prefix=body
  ?complete?'Zavorra registrata: ':entered?'Zavorra impostata: ':prescribed?'Zavorra della scheda: ':'Zavorra proposta: '
  :complete?'Carico registrato: ':entered?'Carico impostato: ':prescribed?'Carico della scheda: ':'Carico proposto: ';
 return {text:prefix+fmt(n)+' kg',original};
}
