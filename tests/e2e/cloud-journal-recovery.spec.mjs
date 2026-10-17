import {test, expect} from '@playwright/test';

// Browser tests are fully isolated: no request to the real Supabase project.
async function isolated(page) {
    await page.route('**/sync-harness.html',route=>route.fulfill({
        contentType:'text/html',body:'<!doctype html><title>Offline sync harness</title><span id="sync-status"></span>'
    }));
    await page.route('**/js/config.js',route=>route.fulfill({
        contentType:'text/javascript',
        body:`export const CONFIG={STORAGE_KEY:'workoutApp_data',APP_VERSION:'test'};
export const supabase={from(){return {
    select(){return this;},eq(){return this;},
    maybeSingle:async()=>({data:window.__mockCloudRow??null,error:null})
}}};`
    }));
    await page.route('**/js/ui.js',route=>route.fulfill({
        contentType:'text/javascript',body:'export const renderWorkoutList=()=>{};'
    }));
    await page.goto('/sync-harness.html');
}
const diary=(reps=8)=>({athlete:{email:null},history:{years:{'2026':{
    mesocycles:[{name:'A',weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[
        {name:'Panca Piana',loggedSets:[{weight:80,reps,rpe:8,isLocked:true}]}
    ]}]}]}]
}}},updatedAt:'2026-10-17T09:00:00.000Z'});

test('cancellare solo localStorage lascia diario e coda offline in IndexedDB',async({page})=>{
    await isolated(page);
    const records=await page.evaluate(async data=>{
        const {journalStorage,initializeJournalStorage,flushJournalStorage}=await import('/js/journalStore.js');
        await initializeJournalStorage();
        journalStorage.setItem('workoutApp_data',JSON.stringify(data));
        journalStorage.setItem('workoutApp_data_user_123',JSON.stringify(data));
        journalStorage.setItem('workoutApp_data_owner','123');
        journalStorage.setItem('workoutApp_data_sync_queue',JSON.stringify([
            {id:'queued-offline',ownerId:'123',payload:data,timestamp:1}
        ]));
        await flushJournalStorage();
        localStorage.setItem('ui_active_week','3');
        localStorage.clear();
        return {local:localStorage.getItem('workoutApp_data'),
            idb:journalStorage.getItem('workoutApp_data')};
    },diary());
    expect(records.local).toBeNull();
    expect(JSON.parse(records.idb)).toEqual(diary());
    await page.reload();
    const recovered=await page.evaluate(async()=>{
        const {journalStorage,initializeJournalStorage}=await import('/js/journalStore.js');
        await initializeJournalStorage();
        return {diary:JSON.parse(journalStorage.getItem('workoutApp_data_user_123')),
            queue:JSON.parse(journalStorage.getItem('workoutApp_data_sync_queue'))};
    });
    expect(recovered.diary).toEqual(diary());
    expect(recovered.queue[0].id).toBe('queued-offline');
    expect(recovered.queue[0].payload).toEqual(diary());
});

test('nuovo device senza IndexedDB: login recupera da cloud senza inventare serie',async({page})=>{
    await isolated(page);
    const result=await page.evaluate(async remote=>{
        const store=await import('/js/journalStore.js');await store.initializeJournalStorage();
        const {state}=await import('/js/state.js');
        const {pullDataFromSupabase}=await import('/js/sync.js');
        const {getCloudRevision,getSyncConflict,saveToLocalStorage}=await import('/js/storage.js');
        const user={id:'123',email:'atleta@example.test'};
        state.currentUser=user;
        state.workoutData={athlete:{email:null},history:{years:{}},updatedAt:null};
        window.__mockCloudRow={payload:remote,updated_at:'2026-10-17T09:01:00Z'};
        const retrieved=await pullDataFromSupabase(user);
        if(retrieved)saveToLocalStorage(retrieved,{preserveUpdatedAt:true});
        await store.flushJournalStorage();
        return {retrieved,revision:getCloudRevision(user),conflict:getSyncConflict(user),
            local:JSON.parse(store.journalStorage.getItem('workoutApp_data'))};
    },diary());
    expect(result.retrieved).toEqual(diary());
    expect(result.local).toEqual(diary());
    expect(result.revision).toBe('2026-10-17T09:01:00Z');
    expect(result.conflict).toBeNull();
});

test('copie diverse senza coda: blocca il pull, proteggendo serie locali confermate',async({page})=>{
    await isolated(page);
    const result=await page.evaluate(async({local,remote})=>{
        const store=await import('/js/journalStore.js');await store.initializeJournalStorage();
        const {state}=await import('/js/state.js');
        const {pullDataFromSupabase}=await import('/js/sync.js');
        const {getCloudRevision,getSyncConflict,saveToLocalStorage}=await import('/js/storage.js');
        const user={id:'123',email:'atleta@example.test'};
        state.currentUser=user;
        saveToLocalStorage(local,{preserveUpdatedAt:true});
        await store.flushJournalStorage();
        window.__mockCloudRow={payload:remote,updated_at:'2026-10-17T09:02:00Z'};
        const retrieved=await pullDataFromSupabase(user);
        await store.flushJournalStorage();
        return {retrieved,revision:getCloudRevision(user),conflict:getSyncConflict(user),
            local:JSON.parse(store.journalStorage.getItem('workoutApp_data'))};
    },{local:diary(8),remote:diary(10)});
    expect(result.retrieved).toBeNull();
    expect(result.revision).toBeNull();
    expect(result.conflict.remote).toEqual(diary(10));
    expect(result.conflict.local).toEqual(diary(8));
    expect(result.local).toEqual(diary(8));
});
