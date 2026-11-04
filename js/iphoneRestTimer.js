import {getRestTimerSnapshot} from './timer.js';
import {isAppleTouchDevice,restShortcutUrl} from './shortcutTimerLink.js';
const REQUEST_KEY='homegym_iphone_rest_request_v1';
export function setupIphoneRestTimer(){
 const timer=document.getElementById('floating-timer'),link=document.getElementById('iphone-rest-shortcut'),panel=document.getElementById('iphone-rest-actions');
 if(!timer||!link||!panel||!isAppleTouchDevice(navigator))return;
 timer.classList.add('has-iphone-rest');panel.hidden=false;
 const status=document.getElementById('iphone-rest-status');
 let requested=null;
 try{requested=JSON.parse(localStorage.getItem(REQUEST_KEY)||'null');}catch{}
 const render=()=>{
  const snapshot=getRestTimerSnapshot(),url=restShortcutUrl(snapshot.remainingSeconds);
  if(url)link.href=url;else link.removeAttribute('href');
  link.setAttribute('aria-disabled',String(!url));
  link.textContent=requested?.deadline===snapshot.deadline?'Richiedi di nuovo':'Avvia su iPhone';
  if(requested?.deadline>Date.now()&&snapshot.deadline!==requested.deadline&&status)
   status.textContent='Il recupero web è cambiato. Il timer eventualmente avviato in Orologio va modificato o annullato in Orologio.';
 };
 link.addEventListener('click',event=>{
  // Compute at the actual user gesture, not from the displayed rounded clock.
  const snapshot=getRestTimerSnapshot(),url=restShortcutUrl(snapshot.remainingSeconds);
  if(!url){event.preventDefault();if(status)status.textContent='Non c’è un recupero attivo da avviare su iPhone.';return;}
  link.href=url;
  requested={deadline:snapshot.deadline,requestedAt:Date.now()};
  try{localStorage.setItem(REQUEST_KEY,JSON.stringify(requested));}catch{}
  if(status)status.textContent='Richiesta a Comandi Rapidi: verifica che Orologio sia partito. Premere di nuovo può creare un altro timer.';
  render();
  // Native link navigation remains within the user gesture. No automatic
  // launch, forced app switch, or claim that the external timer started.
 });
 document.getElementById('iphone-rest-help')?.addEventListener('click',()=>{
  if(document.getElementById('manual')?.classList.contains('d-none'))document.getElementById('btn-user-manual')?.click();
  const section=document.getElementById('manual-attrezzatura');
  if(section){section.open=true;section.scrollIntoView({block:'start'});section.querySelector('summary')?.focus({preventScroll:true});}
 });
 document.addEventListener('homegym-rest-tick',render);
 render();
}
