import {test,expect} from '@playwright/test';
const key='workoutApp_data';
async function harness(page){
 await page.route('**/storage-harness.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated storage</title>'}));
 await page.goto('/storage-harness.html');
}
test('migrazione verificata e ricaricamento di un diario di quattro anni oltre 5 MB',async({page})=>{
 await harness(page);
 const result=await page.evaluate(async()=>{
  localStorage.setItem('workoutApp_data',JSON.stringify({legacy:true}));
  localStorage.setItem('auth-sentinel','keep');
  const store=await import('/js/journalStore.js');await store.initializeJournalStorage();
  const migrated=JSON.parse(store.journalStorage.getItem('workoutApp_data')).legacy;
  const data={history:{years:Object.fromEntries([2023,2024,2025,2026].map(y=>[y,{mesocycles:[],notes:'x'.repeat(1500000)}]))}};
  store.journalStorage.setItem('workoutApp_data',JSON.stringify(data));await store.flushJournalStorage();
  return {migrated,legacy:localStorage.getItem('workoutApp_data'),auth:localStorage.getItem('auth-sentinel')};
 });
 expect(result).toEqual({migrated:true,legacy:null,auth:'keep'});
 await page.reload();
 const loaded=await page.evaluate(async()=>{
  const s=await import('/js/journalStore.js');await s.initializeJournalStorage();
  const raw=s.journalStorage.getItem('workoutApp_data');return {size:raw.length,years:Object.keys(JSON.parse(raw).history.years)};
 });
 expect(loaded.size).toBeGreaterThan(6000000);expect(loaded.years).toEqual(['2023','2024','2025','2026']);
});
test('migrazione fallita conserva copia precedente e token',async({page})=>{
 await harness(page);
 const result=await page.evaluate(async()=>{
  localStorage.setItem('workoutApp_data','original');localStorage.setItem('auth-sentinel','keep');
  const transaction=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(store,mode,...args){
   if(mode==='readwrite')throw new DOMException('Full','QuotaExceededError');
   return transaction.call(this,store,mode,...args);
  };
  const s=await import('/js/journalStore.js');let rejected=false;
  try{await s.initializeJournalStorage();}catch{rejected=true;}
  return {rejected,original:localStorage.getItem('workoutApp_data'),auth:localStorage.getItem('auth-sentinel')};
 });
 expect(result).toEqual({rejected:true,original:'original',auth:'keep'});
});
test('scrittura concorrente da altra scheda non viene sovrascritta',async({page})=>{
 await harness(page);
 const result=await page.evaluate(async()=>{
  const s=await import('/js/journalStore.js');await s.initializeJournalStorage();
  s.journalStorage.setItem('workoutApp_data','original');await s.flushJournalStorage();
  const db=await new Promise(resolve=>{const r=indexedDB.open('homegym-journal-v2',1);r.onsuccess=()=>resolve(r.result);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('journal','readwrite');tx.objectStore('journal').put('other-tab','workoutApp_data');tx.oncomplete=resolve;tx.onabort=reject;});
  let rejected=false;s.journalStorage.setItem('workoutApp_data','stale-tab');
  try{await s.flushJournalStorage();}catch{rejected=true;}
  const disk=await new Promise(resolve=>{const r=db.transaction('journal').objectStore('journal').get('workoutApp_data');r.onsuccess=()=>resolve(r.result);});
  db.close();return {rejected,disk,memory:s.journalStorage.getItem('workoutApp_data'),failed:s.journalStorageFailed()};
 });
 expect(result).toEqual({rejected:true,disk:'other-tab',memory:'stale-tab',failed:true});
});
