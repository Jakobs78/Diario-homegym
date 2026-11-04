import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const released=(await readFile(path.join(root,'js/config.js'),'utf8')).match(/APP_VERSION:\s*'([^']+)'/)[1];
const workerSource=await readFile(path.join(root,'sw.js'),'utf8');
const releasedCache=workerSource.match(/const CACHE_NAME = '([^']+)'/)[1];
const nextCache=releasedCache.replace(/-v(\d+)-/,(_,n)=>'-v'+(Number(n)+1)+'-');
const oldVersion='1.3.1-20261031';
// Reproduce v83's cache-first lookup, waiting lifecycle and lack of an update UI.
const legacy=`const CACHE='workout-app-v83-legacy';self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/index.html','/js/config.js','/mycoatch/protocolLoad.js']))));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});`;
async function fixture(){
 const state={version:oldVersion,legacy:true,fail:false};
 const server=createServer(async(req,res)=>{
  if(state.offline){req.socket.destroy();return;}
  if(state.unavailable){res.writeHead(503);res.end('Server unavailable');return;}
  const name=new URL(req.url,'http://localhost').pathname;
  res.setHeader('Cache-Control','no-store');
  try{
   if(name==='/sw.js'){
    res.setHeader('Content-Type','application/javascript');
    res.end(state.legacy?legacy:workerSource.replace(released,state.version).replace(releasedCache,state.version===released?releasedCache:nextCache));return;
   }
   if(name==='/'||name==='/index.html'){
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html><meta charset="utf-8"><div class="app-header-container"><span id="app-release">v ${state.version}</span></div><button id="check-app-update-btn">Controlla aggiornamenti</button><input id="draft" value="73"><script type="module">${state.legacy?`navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});window.appReady=true;`:`import {setupAppUpdates} from '/js/appUpdates.js';import {initializeJournalStorage,flushJournalStorage} from '/js/journalStore.js';await initializeJournalStorage();window.updater=setupAppUpdates({version:'${state.version}',beforeReload:async()=>{if(window.rejectUpdates)throw Error('Test: archivio occupato');await flushJournalStorage();}});window.appReady=true;`}</script>`);return;
   }
   if(name==='/js/config.js'){
    res.setHeader('Content-Type','application/javascript');res.end(`export const CONFIG={APP_VERSION:'${state.version}'};`);return;
   }
   if(state.fail&&name==='/js/analytics.js'){res.writeHead(503);res.end('Simulated interrupted download');return;}
   const file=path.resolve(root,'.'+name);
   if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
   res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':name.endsWith('.webmanifest')?'application/manifest+json':'text/plain');
   res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {state,origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
const ready=async page=>{await expect.poll(()=>page.evaluate(()=>Boolean(window.appReady))).toBe(true);};
const stored=page=>page.evaluate(async()=>{
 const j=await import('/js/journalStore.js');await j.initializeJournalStorage();await j.flushJournalStorage();
 return {journal:j.journalStorage.getItem('workoutApp_data'),queue:j.journalStorage.getItem('workoutApp_data_sync_queue'),theme:localStorage.getItem('app-theme'),rest:sessionStorage.getItem('homegym_rest_timer_deadline_v1')};
});
async function update(page){
 await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
 await expect.poll(()=>page.evaluate(async()=>{
  const reg=await navigator.serviceWorker.getRegistration();
  if(!reg.active)return null;
  return new Promise(resolve=>{const ch=new MessageChannel();ch.port1.onmessage=e=>resolve(e.data.version);reg.active.postMessage({type:'GET_APP_VERSION'},[ch.port2]);setTimeout(()=>resolve(null),1500);});
 }),{timeout:30000}).not.toBeNull();
}

test('v83 upgrades with another window open; each document keeps its bundle and offline diary survives',async({browser})=>{
 test.setTimeout(60000);
 const f=await fixture(),context=await browser.newContext({serviceWorkers:'allow'});
 try{
  const page=await context.newPage();await page.goto(f.origin);await ready(page);
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.evaluate(async()=>{
   const j=await import('/js/journalStore.js');await j.initializeJournalStorage();
   j.journalStorage.setItem('workoutApp_data',JSON.stringify({history:{years:{2026:{mesocycles:[]}}},unsent:'73 kg'}));
   j.journalStorage.setItem('workoutApp_data_sync_queue',JSON.stringify([{id:'offline-1',payload:{weight:73,reps:8}}]));
   localStorage.setItem('app-theme','dark');const timer=await import('/js/timer.js');timer.startTimer(300);await j.flushJournalStorage();
  });
  const before=await stored(page);
  const other=await context.newPage();await other.goto(f.origin);await ready(other);
  f.state.legacy=false;f.state.version=released;
  await update(page);
  await expect(page.locator('#app-release')).toHaveText('v '+oldVersion);
  await expect(other.locator('#app-release')).toHaveText('v '+oldVersion);
  expect(await other.evaluate(()=>fetch('/js/config.js').then(r=>r.text()))).toContain(oldVersion);
  await page.reload();await ready(page);
  await expect(page.locator('#app-release')).toHaveText('v '+released);
  expect(await page.evaluate(()=>fetch('/js/config.js').then(r=>r.text()))).toContain(released);
  expect(await stored(page)).toEqual(before);
  // A suspended old document keeps its cache even after the worker restarts.
  expect(await other.evaluate(()=>fetch('/js/config.js').then(r=>r.text()))).toContain(oldVersion);
  f.state.offline=true;await page.reload();await ready(page);
  await expect(page.locator('#app-release')).toHaveText('v '+released);expect(await stored(page)).toEqual(before);
  f.state.offline=false;
  // Future updates are announced without a forced reload mid-workout.
  f.state.version='1.3.5-test';
  await page.locator('#check-app-update-btn').click();
  await expect(page.locator('#app-update-banner')).toContainText('1.3.5-test',{timeout:30000});
  await expect(page.locator('#app-release')).toContainText(released);
  await page.evaluate(()=>{window.rejectUpdates=true;});
  await page.getByRole('button',{name:'Aggiorna ora',exact:true}).click();
  await expect(page.locator('#app-update-banner')).toContainText('Aggiornamento rimandato');
  await expect(page.locator('#draft')).toHaveValue('73');expect(await stored(page)).toEqual(before);
  await page.evaluate(async()=>{
   window.rejectUpdates=false;
   const j=await import('/js/journalStore.js');j.journalStorage.setItem('workoutApp_data_sync_queue',JSON.stringify([{id:'offline-2',payload:{weight:74}}]));
  });
  await page.getByRole('button',{name:'Aggiorna ora',exact:true}).click();await ready(page);
  await expect(page.locator('#app-release')).toHaveText('v 1.3.5-test',{timeout:20000});
  const after=await stored(page);expect(after.journal).toBe(before.journal);expect(after.theme).toBe(before.theme);expect(after.rest).toBe(before.rest);expect(JSON.parse(after.queue)[0].id).toBe('offline-2');
  expect(await other.evaluate(()=>fetch('/js/config.js').then(r=>r.text()))).toContain(oldVersion);
 }finally{await context.close();await f.close();}
});

test('an incomplete update never replaces a working offline version',async({browser})=>{
 test.setTimeout(60000);
 const f=await fixture(),context=await browser.newContext({serviceWorkers:'allow'});
 try{
  const page=await context.newPage();await page.goto(f.origin);await ready(page);
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  f.state.legacy=false;f.state.version=released;f.state.fail=true;
  await page.evaluate(async()=>{
   const reg=await navigator.serviceWorker.getRegistration();
   window.__failedInstall=new Promise(resolve=>reg.addEventListener('updatefound',()=>{const w=reg.installing;w.addEventListener('statechange',()=>{if(w.state==='redundant')resolve(true);});},{once:true}));
   await reg.update();
  });
  await expect.poll(()=>page.evaluate(()=>window.__failedInstall),{timeout:30000}).toBe(true);
  // Return no usable network content. Linux WebKit can abort a legacy-worker
  // navigation internally on a TCP reset; a 503 still requires cached content.
  // The migration test above separately exercises a severed connection.
  f.state.unavailable=true;await page.reload();await ready(page);
  await expect(page.locator('#app-release')).toHaveText('v '+oldVersion);
  expect(await page.evaluate(()=>fetch('/js/config.js').then(r=>r.text()))).toContain(oldVersion);
  f.state.unavailable=false;f.state.fail=false;await update(page);
  await page.reload();await ready(page);await expect(page.locator('#app-release')).toHaveText('v '+released);
 }finally{await context.close();await f.close();}
});
