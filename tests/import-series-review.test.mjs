import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewImportedPlan} from '../js/importPreview.js';
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.value='';}
 set value(value){this._value=String(value??'');}
 get value(){return this._value;}
 append(...children){this.children.push(...children);}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(type,listener){this['on'+type]=listener;}
 replaceChildren(...children){this.children=children;}
 showModal(){} close(){} remove(){}
}
const find=(root,predicate)=>predicate(root)?root:root.children?.filter(x=>typeof x==='object').map(c=>find(c,predicate)).find(Boolean);
const original=()=>({weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[{name:'Panca',reps:'6-8',rpe:'8',targetRpe:'8',sets:[{targetReps:'3',targetRpe:'8',kgMin:'100',kgMax:'105'},{targetReps:'6-8',targetRpe:'8',kgMin:'80',kgMax:'85'}],loggedSets:[]}]}]}]});
test('import preview preserves independent row targets when only name is corrected',async()=>{
 const previous=globalThis.document;const body=new Element('body');
 globalThis.document={body,createElement:tag=>new Element(tag)};
 try{
  const source=original(),before=JSON.stringify(source),pending=reviewImportedPlan(source);
  const name=find(body,e=>e.attributes?.['aria-label']==='Esercizio · Panca');name.value='Panca personale';name.oninput();
  find(body,e=>e.attributes?.['aria-label']==='Associazione · Panca').value='custom';
  const summary=find(body,e=>e.className==='import-series-targets');assert.match(summary.textContent,/Serie 1: 3 reps/);
  find(body,e=>e.tag==='form').onsubmit({preventDefault(){}});
  const result=await pending;const exercise=result.weeks[0].days[0].exercises[0];
  assert.equal(exercise.name,'Panca personale');assert.equal(exercise.sets[0].targetReps,'3');assert.equal(exercise.sets[1].targetReps,'6-8');
  assert.equal(exercise.sets[0].kgMax,'105');assert.equal(exercise.sets[1].kgMin,'80');
  assert.ok(exercise.loggedSets.every(s=>s.weight===''&&!s.isLocked));assert.equal(JSON.stringify(source),before);
 }finally{globalThis.document=previous;}
});
test('cancelling import preview returns no plan and never changes row targets',async()=>{
 const previous=globalThis.document;const body=new Element('body');globalThis.document={body,createElement:tag=>new Element(tag)};
 try{
  const source=original(),before=JSON.stringify(source),pending=reviewImportedPlan(source);
  find(body,e=>e.tag==='button'&&e.textContent==='Annulla').onclick();
  assert.equal(await pending,null);assert.equal(JSON.stringify(source),before);
 }finally{globalThis.document=previous;}
});
