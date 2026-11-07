import {latestSavedProfile,latestSavedSettings,stageProfileRevision,commitProfileRevision} from '../mycoatch/profileJournal.js';
import {state} from './state.js';
import {editJournal} from './journalTransaction.js';
import {userDefaults,saveUserDefaults,needsUserSetup} from '../mycoatch/userDefaults.js';
import {EXERCISE_DATABASE} from '../mycoatch/exercisesDB.js';
const owner=()=>String(state.currentUser?.id||'local');
let activeDialog=null,dialogOwner=null;
const labels={barbell:'Bilancieri',dumbbell:'Manubri',cable:'Cavi',lat_machine:'Lat machine',machine:'Macchine',rack:'Rack',flat_bench:'Panca piana',incline_bench:'Panca inclinabile',ez_bar:'Barra EZ',triangle_handle:'Triangolo',rope_attachment:'Corda',ankle_strap:'Cavigliere',single_handle:'Maniglia singola',pullup_bar:'Barra trazioni',dip_station:'Parallele'};
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export function openUserDefaults(){
 if(activeDialog?.isConnected)return;
 const values=userDefaults(state.workoutData),dialog=el('dialog');dialog.id='user-defaults-dialog';dialog.className='user-defaults-dialog';dialogOwner=owner();activeDialog=dialog;
 const form=el('form');form.append(el('h3','Profilo personale'),el('p','Questi dati saranno le tue impostazioni predefinite. Puoi aggiornarli qui o nel modulo MyCoatch.'));
 const ageLabel=el('label','Età'),age=el('input');age.type='number';age.name='userAge';age.min=18;age.max=100;age.step=1;age.required=true;age.value=values.userAge??'';ageLabel.append(age);form.append(ageLabel);
 const checks={};
 const addGroup=(title,key,options)=>{
  const group=el('fieldset');group.append(el('legend',title));checks[key]=[];
  for(const [value,text] of options){const label=el('label'),input=el('input');input.type='checkbox';input.value=value;input.name=key;input.checked=values[key]?.includes(value)===true;label.append(input,document.createTextNode(text));group.append(label);checks[key].push(input);}
  form.append(group);
 };
 addGroup('Attrezzatura che utilizzi','availableEquipment',['barbell','dumbbell','cable','lat_machine','machine'].map(id=>[id,labels[id]]));
 addGroup('Panche e accessori','availableAccessories',[...new Set(EXERCISE_DATABASE.flatMap(e=>e.requires))].map(id=>[id,labels[id]||id]));
 addGroup('Macchine disponibili','availableMachines',EXERCISE_DATABASE.filter(e=>e.machineId).map(e=>[e.machineId,e.name]));
 const confirmedLabel=el('label'),confirmed=el('input');confirmed.type='checkbox';confirmed.name='equipmentConfirmed';confirmed.required=true;confirmed.checked=!needsUserSetup(state.workoutData);confirmedLabel.append(confirmed,document.createTextNode('Confermo la dotazione selezionata, anche se uso solo il corpo libero.'));form.append(confirmedLabel);
 form.append(el('p','I pesi dei manubri, i bilancieri e i dischi si aggiornano in Strumenti → Attrezzatura personale. L’inventario segnala la disponibilità, senza bloccare i carichi proposti.'));
 const status=el('p');status.setAttribute('role','status');const save=el('button','Salva profilo');save.type='submit';save.className='btn btn-primary';const cancel=el('button','Chiudi');cancel.type='button';cancel.className='btn btn-secondary';cancel.onclick=()=>dialog.close();const configure=el('button','Salva e configura pesi');configure.type='submit';configure.value='equipment';configure.className='btn btn-secondary';form.append(status,save,configure,cancel);
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(save.disabled||!form.reportValidity())return;save.disabled=configure.disabled=true;const equipmentNext=event.submitter?.value==='equipment';
  try{
   if(owner()!==dialogOwner)throw Error('L’account è cambiato: riapri il profilo.');
   const input={userAge:age.value,...Object.fromEntries(Object.entries(checks).map(([key,inputs])=>[key,inputs.filter(i=>i.checked).map(i=>i.value)]))};
   await editJournal(data=>{if(owner()!==dialogOwner)throw Error('L’account è cambiato.');const profile=latestSavedProfile(data);if(profile){const staged=stageProfileRevision(data,profile,new Date(),{...latestSavedSettings(data),...input});commitProfileRevision(data,staged);}
    saveUserDefaults(data,input,{confirmed:true});},'SAVE_USER_DEFAULTS');
   dialog.close();refreshUserDefaultsPrompt();
   if(equipmentNext){document.getElementById('open-tools-btn')?.click();const equipment=document.querySelector('.equipment-settings');if(equipment&&!equipment.open)equipment.querySelector('summary')?.click();equipment?.scrollIntoView({block:'start'});}
  }catch(error){status.textContent=error.message;}finally{save.disabled=configure.disabled=false;}
 });
 dialog.append(form);dialog.addEventListener('close',()=>{dialog.remove();if(activeDialog===dialog){activeDialog=null;dialogOwner=null;}});
 document.getElementById('tools-modal')?.classList.add('hidden');document.body.append(dialog);dialog.showModal();
}
export function refreshUserDefaultsPrompt(){
 if(activeDialog&&dialogOwner!==owner())activeDialog.close();
 let banner=document.getElementById('user-defaults-prompt');
 const incomplete=needsUserSetup(state.workoutData);
 const help=document.querySelector('#edit-user-defaults .sheet-item-help');if(help)help.textContent=incomplete?'Completa età e dotazione predefinite per MyCoatch.':'Età e attrezzatura predefinite per MyCoatch.';
 const hasHistory=Object.values(state.workoutData?.history?.years||{}).some(y=>y?.mesocycles?.length);
 if(!incomplete||hasHistory){banner?.remove();return;}
 if(!banner){
  const list=document.getElementById('workout-list-container');if(!list)return;
  banner=el('section');banner.id='user-defaults-prompt';banner.className='user-defaults-prompt';
  banner.append(el('strong','Completa il tuo profilo'),el('p','Indica età e attrezzatura: le ritroverai già compilate in MyCoatch.'));
  const button=el('button','Configura profilo');button.type='button';button.className='btn btn-secondary btn-sm';button.onclick=openUserDefaults;banner.append(button);list.before(banner);
 }
}
