/** App-code updates only. Never deletes journal storage, auth or sync queues. */
const message=(worker,data,timeout=5000)=>new Promise((resolve,reject)=>{
 if(!worker){reject(Error('Aggiornamento non ancora pronto.'));return;}
 const channel=new MessageChannel();
 const timer=setTimeout(()=>{channel.port1.close();reject(Error('Verifica non completata. Riprova fra poco.'));},timeout);
 channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
 try{worker.postMessage(data,[channel.port2]);}catch(error){clearTimeout(timer);channel.port1.close();reject(error);}
});
const installed=worker=>new Promise((resolve,reject)=>{
 if(!worker||worker.state==='activated'||worker.state==='installed'){resolve();return;}
 const finish=error=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);error?reject(error):resolve();};
 const changed=()=>{if(['installed','activated'].includes(worker.state))finish();else if(worker.state==='redundant')finish(Error('Download non riuscito. Riprova quando sei online.'));};
 const timer=setTimeout(()=>finish(Error('Download ancora in corso: riprova fra poco.')),30000);
 worker.addEventListener('statechange',changed);changed();
});
export function setupAppUpdates({version,beforeReload}){
 const button=document.getElementById('check-app-update-btn');
 if(!('serviceWorker' in navigator)){
  if(button)button.disabled=true;
  return null;
 }
 const banner=document.createElement('section');banner.id='app-update-banner';banner.className='app-update-banner';banner.hidden=true;
 banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
 const text=document.createElement('p');
 const apply=document.createElement('button');apply.type='button';apply.className='btn btn-primary';apply.textContent='Aggiorna ora';apply.hidden=true;
 const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='btn btn-secondary';dismiss.textContent='Più tardi';dismiss.onclick=()=>{banner.hidden=true;};
 banner.append(text,apply,dismiss);
 (document.querySelector('.app-header-container')||document.body.firstElementChild)?.after(banner);
 let registration=null,checking=null,available=null,reloading=false,lastCheck=0;
 const show=(value,update=false)=>{text.textContent=value;apply.hidden=!update;banner.hidden=false;};
 const notify=next=>{
  if(!next||next===version)return;
  available=next;
  const release=document.getElementById('app-release');
  if(release){release.textContent='v '+version+' · Aggiornamento disponibile';release.classList.add('app-release-update');}
  show('È disponibile la versione '+next+'. Puoi applicarla quando sei pronto: prima salvo i dati su questo dispositivo.',true);
 };
 const pin=()=>message(navigator.serviceWorker.controller,{type:'PIN_APP_VERSION',version}).catch(()=>{});
 const inspect=async()=>{
  const worker=registration?.waiting||registration?.active||navigator.serviceWorker.controller;
  const result=await message(worker,{type:'GET_APP_VERSION'});
  notify(result.version);
  await pin();
  return result.version;
 };
 const bind=reg=>{
  if(registration===reg)return;
  registration=reg;
  reg.addEventListener('updatefound',()=>{
   const worker=reg.installing;
   installed(worker).then(inspect).catch(()=>{});
  });
 };
 const check=({explicit=false}={})=>{
  if(checking)return checking;
  if(!explicit&&Date.now()-lastCheck<60000)return Promise.resolve();
  lastCheck=Date.now();if(button)button.disabled=true;
  if(explicit)show('Controllo la disponibilità di una nuova versione…');
  checking=(async()=>{
   try{
    const reg=registration||await navigator.serviceWorker.getRegistration()||await navigator.serviceWorker.register('/sw.js',{updateViaCache: 'none'});
    bind(reg);
    await reg.update();
    await installed(reg.installing);
    const latest=await inspect();
    if(explicit&&latest===version)show('La versione '+version+' è aggiornata.');
   }catch{
    if(explicit)show('Non riesco a completare il controllo. Verifica la connessione e riprova; i dati restano sul dispositivo.',Boolean(available));
   }finally{checking=null;if(button)button.disabled=false;}
  })();return checking;
 };
 const waitForController=async expected=>{
  const start=Date.now();
  while(Date.now()-start<15000){
   try{if((await message(navigator.serviceWorker.controller,{type:'GET_APP_VERSION'},2000)).version===expected)return;}catch{/* Activation can briefly replace the controller. */}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Aggiornamento non ancora attivo. Riprova fra poco.');
 };
 apply.addEventListener('click',async()=>{
  if(reloading||!available)return;
  apply.disabled=true;
  try{
   // Wait for durable IndexedDB writes, including pending offline queue entries.
   await beforeReload();
   // Some browsers leave a downloaded worker waiting after resuming the app.
   if(registration?.waiting)await message(registration.waiting,{type:'ACTIVATE_UPDATE'});
   await waitForController(available);
   reloading=true;location.reload();
  }catch(error){show('Aggiornamento rimandato: '+error.message+' I dati restano disponibili; la schermata non viene riavviata.',true);apply.disabled=false;}
 });
 button?.addEventListener('click',()=>check({explicit:true}));
 navigator.serviceWorker.addEventListener('controllerchange',()=>{inspect().catch(()=>{});});
 navigator.serviceWorker.addEventListener('message',event=>{
  if(event.data?.type==='APP_UPDATE_READY'){notify(event.data.version);pin();}
 });
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
 window.addEventListener('pageshow',()=>check());window.addEventListener('online',()=>check({explicit:true}));
 // Register after the app has initialized; also observe an already-installed update.
 navigator.serviceWorker.register('/sw.js',{updateViaCache: 'none'}).then(reg=>{bind(reg);return check();}).catch(()=>{});
 return {check};
}
