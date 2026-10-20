import {test,expect} from '@playwright/test';

async function setupMockSync(page){
  await page.route('**/sync-integration-harness.html',route=>route.fulfill({
    status:200,contentType:'text/html',
    body:'<!doctype html><meta charset="utf-8"><span id="sync-status"></span>'
  }));
  await page.goto('/sync-integration-harness.html');
  await page.evaluate(async()=>{
    // Browser runs the production storage/sync code, with an in-memory fake
    // server. No real Supabase credentials, internet or production writes.
    window.__fakeCloud={record:null,reads:0,writes:0,blockedCrossAccountWrites:0};
    window.supabase={createClient:()=>({
      auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from(table){
        if(table!=='workouts')throw Error('Unexpected table');
        const operation={type:'read',email:null,revision:null,body:null};
        const query={
          select(){return query;},
          eq(k,v){
            if(k==='email')operation.email=v;
            else if(k==='updated_at')operation.revision=v;
            else throw Error('Unexpected filter');
            return query;
          },
          insert(data){operation.type='insert';operation.body=data;return query;},
          update(data){operation.type='update';operation.body=data;return query;},
          maybeSingle(){
            const cloud=window.__fakeCloud;
            if(operation.type==='read'){
              cloud.reads++;
              if(!cloud.record || cloud.record.email!==operation.email)
                return Promise.resolve({data:null,error:null});
              return Promise.resolve({data:structuredClone(cloud.record),error:null});
            }
            if(operation.body?.email!=='a@invalid.example'){
              cloud.blockedCrossAccountWrites++;
              return Promise.resolve({data:null,error:{code:'WRONG_ACCOUNT'}});
            }
            if(operation.type==='insert'){
              if(cloud.record)return Promise.resolve({data:null,error:{code:'23505'}});
              cloud.record=structuredClone(operation.body);
            }else{
              if(!cloud.record || cloud.record.email!==operation.email ||
                 cloud.record.updated_at!==operation.revision)
                return Promise.resolve({data:null,error:null});
              cloud.record=structuredClone(operation.body);
            }
            cloud.writes++;
            return Promise.resolve({data:{updated_at:cloud.record.updated_at},error:null});
          }
        };
        return query;
      }
    })};
    const journal=await import('/js/journalStore.js');
    await journal.initializeJournalStorage();
    await import('/js/state.js');
    await import('/js/storage.js');
  });
}

test('offline diary save reaches cloud exactly once after reconnection',async({page,context})=>{
  await setupMockSync(page);
  await context.setOffline(true);
  const local=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {saveAndSync,hasPendingSync}=await import('/js/storage.js');
    const {journalStorage,flushJournalStorage}=await import('/js/journalStore.js');
    state.currentUser={id:'account-A',email:'a@invalid.example'};
    const entry={athlete:{name:'OFFLINE_SYNTHETIC'},history:{years:{}}};
    const saved=await saveAndSync(entry,'SYNTHETIC_OFFLINE_EDIT');
    await flushJournalStorage();
    return {saved:saved!==false,pending:hasPendingSync(),
      queueSize:JSON.parse(journalStorage.getItem('workoutApp_data_sync_queue')).length,
      cloudWrites:window.__fakeCloud.writes};
  });
  expect(local).toEqual({saved:true,pending:true,queueSize:1,cloudWrites:0});
  await context.setOffline(false);
  await expect.poll(()=>page.evaluate(async()=>{
    const {hasPendingSync}=await import('/js/storage.js');
    return {writes:window.__fakeCloud.writes,pending:hasPendingSync()};
  }),{timeout:15000}).toEqual({writes:1,pending:false});
  const synced=await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {getCloudRevision}=await import('/js/storage.js');
    const {journalStorage}=await import('/js/journalStore.js');
    return {sameData:JSON.stringify(window.__fakeCloud.record?.payload)===JSON.stringify(state.workoutData),
      revisionMatches:getCloudRevision(state.currentUser)===window.__fakeCloud.record?.updated_at,
      queueAbsent:journalStorage.getItem('workoutApp_data_sync_queue')===null,
      userEmail:window.__fakeCloud.record?.email,
      unexpectedWrites:window.__fakeCloud.blockedCrossAccountWrites};
  });
  expect(synced).toEqual({sameData:true,revisionMatches:true,queueAbsent:true,
    userEmail:'a@invalid.example',unexpectedWrites:0});
});

test('stale revision creates a recoverable conflict without overwriting remote',async({page,context})=>{
  await setupMockSync(page);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {setCloudRevision}=await import('/js/storage.js');
    const {flushJournalStorage}=await import('/js/journalStore.js');
    state.currentUser={id:'account-A',email:'a@invalid.example'};
    setCloudRevision(state.currentUser,'2026-10-20T10:00:00.000Z');
    window.__fakeCloud.record={
      email:'a@invalid.example',
      payload:{athlete:{name:'BASELINE'},history:{years:{}}},
      updated_at:'2026-10-20T10:00:00.000Z'
    };
    await flushJournalStorage();
  });
  await context.setOffline(true);
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    const {saveAndSync}=await import('/js/storage.js');
    await saveAndSync({athlete:{name:'LOCAL_OFFLINE_EDIT'},history:{years:{}}},
      'SYNTHETIC_OFFLINE_EDIT');
    // A second device modifies the cloud while this device is offline.
    window.__fakeCloud.record={
      email:'a@invalid.example',
      payload:{athlete:{name:'REMOTE_CONCURRENT_EDIT'},history:{years:{}}},
      updated_at:'2026-10-20T11:00:00.000Z'
    };
  });
  await context.setOffline(false);
  await expect.poll(()=>page.evaluate(async()=>{
    const {getSyncConflict,hasPendingSync}=await import('/js/storage.js');
    return {conflict:!!getSyncConflict(),pending:hasPendingSync()};
  }),{timeout:15000}).toEqual({conflict:true,pending:true});
  const result=await page.evaluate(async()=>{
    const {getSyncConflict}=await import('/js/storage.js');
    const {state}=await import('/js/state.js');
    const {journalStorage}=await import('/js/journalStore.js');
    const pending=JSON.parse(journalStorage.getItem('workoutApp_data_sync_queue'));
    const conflict=getSyncConflict();
    return {
      writes:window.__fakeCloud.writes,
      remoteIntact:window.__fakeCloud.record?.payload?.athlete?.name==='REMOTE_CONCURRENT_EDIT',
      localPreserved:state.workoutData?.athlete?.name==='LOCAL_OFFLINE_EDIT',
      queuedEditsPreserved:pending.length===1 && pending[0].payload?.athlete?.name==='LOCAL_OFFLINE_EDIT',
      snapshotsRetained:conflict?.remote?.athlete?.name==='REMOTE_CONCURRENT_EDIT' &&
        conflict?.local?.athlete?.name==='LOCAL_OFFLINE_EDIT',
      conflictVisible:document.getElementById('sync-status')?.textContent?.includes('Conflitto')
    };
  });
  expect(result).toEqual({writes:0,remoteIntact:true,localPreserved:true,
    queuedEditsPreserved:true,snapshotsRetained:true,conflictVisible:true});
});
