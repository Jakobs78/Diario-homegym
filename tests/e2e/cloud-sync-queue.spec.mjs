import {test,expect} from '@playwright/test';

test('coda offline: upload CAS riuscito, poi conflitto server senza sovrascrittura o perdita',async({page})=>{
  await page.route('**/sync-cas-harness.html',route=>route.fulfill({
    contentType:'text/html',body:'<!doctype html><title>Mock Supabase CAS</title><span id="sync-status"></span>'
  }));
  await page.route('**/js/ui.js',route=>route.fulfill({
    contentType:'text/javascript',body:'export const renderWorkoutList=()=>{};'
  }));
  await page.route('**/js/config.js',route=>route.fulfill({
    contentType:'text/javascript',body:`
export const CONFIG={STORAGE_KEY:'workoutApp_data',APP_VERSION:'test'};
export const supabase={from(){
  return {
    filters:{},action:'read',values:null,
    select(){return this;},
    eq(key,value){this.filters[key]=value;return this;},
    update(values){this.action='update';this.values=values;return this;},
    insert(values){this.action='insert';this.values=values;return this;},
    async maybeSingle(){
      if(this.action==='read')return {data:window.__serverRow??null,error:null};
      if(this.action==='update'){
        if(!window.__serverRow||this.filters.updated_at!==window.__serverRow.updated_at)
          return {data:null,error:null};
        window.__serverRow={...this.values};
        return {data:{updated_at:this.values.updated_at},error:null};
      }
      if(window.__serverRow)return {data:null,error:{code:'23505'}};
      window.__serverRow={...this.values};
      return {data:{updated_at:this.values.updated_at},error:null};
    }
  };
}};`
  }));
  await page.goto('/sync-cas-harness.html');
  const result=await page.evaluate(async()=>{
    const store=await import('/js/journalStore.js');
    await store.initializeJournalStorage();
    const {state}=await import('/js/state.js');
    const {journalFingerprint}=await import('/js/cloudSafety.js');
    const {setCloudRevision,setCloudAcceptedHash,saveToLocalStorage,saveAndSync,
      processSyncQueue,hasPendingSync,getSyncConflict,getCloudRevision}=await import('/js/storage.js');
    const user={id:'123',email:'atleta@example.test'};
    const baseline={athlete:{email:null},history:{years:{2026:{mesocycles:[{
      name:'Blocco A',weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[{
        name:'Panca',loggedSets:[{weight:80,reps:8,rpe:8,isLocked:true}]
      }]}]}]
    }]}}},updatedAt:'2026-10-17T08:00:00Z'};
    state.currentUser=user;
    saveToLocalStorage(baseline,{preserveUpdatedAt:true});
    window.__serverRow={email:user.email,payload:structuredClone(baseline),
      updated_at:'2026-10-17T08:00:01Z'};
    setCloudRevision(user,window.__serverRow.updated_at);
    setCloudAcceptedHash(user,await journalFingerprint(baseline));
    await store.flushJournalStorage();

    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
    const local=structuredClone(baseline);
    local.history.years['2026'].mesocycles[0].weeks[0].days[0]
      .exercises[0].loggedSets[0].reps=9;
    await saveAndSync(local);
    await store.flushJournalStorage();
    const offline={pending:hasPendingSync(),
      series:JSON.parse(store.journalStorage.getItem('workoutApp_data'))
        .history.years['2026'].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[0].reps,
      server:window.__serverRow.payload.history.years['2026'].mesocycles[0]
        .weeks[0].days[0].exercises[0].loggedSets[0].reps};
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});
    await processSyncQueue();
    await store.flushJournalStorage();
    const uploaded={pending:hasPendingSync(),server:window.__serverRow.payload.history
      .years['2026'].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[0].reps,
      acknowledged:getCloudRevision(user)===window.__serverRow.updated_at};

    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
    const newer=structuredClone(local);
    newer.history.years['2026'].mesocycles[0].weeks[0].days[0]
      .exercises[0].loggedSets[0].reps=11;
    await saveAndSync(newer);
    // Another device writes 10 reps while our offline change is queued.
    window.__serverRow={...window.__serverRow,updated_at:'2026-10-17T13:00:00Z',
      payload:structuredClone(local)};
    window.__serverRow.payload.history.years['2026'].mesocycles[0]
      .weeks[0].days[0].exercises[0].loggedSets[0].reps=10;
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});
    await processSyncQueue();
    await store.flushJournalStorage();
    const conflict={pending:hasPendingSync(),
      alert:Boolean(getSyncConflict(user)),
      server:window.__serverRow.payload.history.years['2026']
        .mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[0].reps,
      local:JSON.parse(store.journalStorage.getItem('workoutApp_data'))
        .history.years['2026'].mesocycles[0].weeks[0].days[0].exercises[0]
        .loggedSets[0].reps};
    return {offline,uploaded,conflict};
  });
  expect(result.offline).toEqual({pending:true,series:9,server:8});
  expect(result.uploaded).toEqual({pending:false,server:9,acknowledged:true});
  expect(result.conflict).toEqual({pending:true,alert:true,server:10,local:11});
});
