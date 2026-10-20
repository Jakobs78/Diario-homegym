import { test, expect } from '@playwright/test';

// This test never visits production or contacts Supabase. It runs the actual
// local-storage and queue code in a browser, with a deliberately damaged queue.
test('an unreadable offline queue is preserved when a new diary save is attempted', async ({page}) => {
  await page.route('**/sync-queue-harness.html', route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><span id="sync-status"></span>'
  }));
  await page.goto('/sync-queue-harness.html');

  const outcomes = await page.evaluate(async () => {
    window.supabase = {createClient: () => ({
      auth: {onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}})},
      from() { throw Error('Remote database access prohibited in isolated test'); }
    })};
    window.jspdf = {jsPDF: class IsolatedPdfStub {}};

    const journal = await import('/js/journalStore.js');
    await journal.initializeJournalStorage();
    const {state} = await import('/js/state.js');
    const {saveAndSync,saveToLocalStorage} = await import('/js/storage.js');
    state.currentUser = null;
    const baseline = {athlete:{name:'original'},history:{years:{}},updatedAt:'2025-01-01T00:00:00.000Z'};
    if(!saveToLocalStorage(structuredClone(baseline),{preserveUpdatedAt:true}))throw Error('Baseline local save failed');
    await journal.flushJournalStorage();
    const originalBytes = journal.journalStorage.getItem('workoutApp_data');

    const results = [];
    for (const damagedQueue of ['{incomplete-json', '{"wrong":"shape"}', '[null]', '[{}]', '[{"id":"lost-payload","timestamp":1}]']) {
      journal.journalStorage.setItem('workoutApp_data_sync_queue', damagedQueue);
      await journal.flushJournalStorage();
      const newDiary = structuredClone(baseline);
      newDiary.athlete.name = 'NEVER_PERSIST_THIS_UNQUEUED_EDIT';
      const acknowledged = await saveAndSync(newDiary, 'TEST_OFFLINE_EDIT');
      await journal.flushJournalStorage();
      results.push({
        rejected: acknowledged === false,
        queueUntouched: journal.journalStorage.getItem('workoutApp_data_sync_queue') === damagedQueue,
        diaryUntouched: journal.journalStorage.getItem('workoutApp_data') === originalBytes,
        visibleWarning: document.getElementById('sync-status')?.textContent?.includes('Salvataggio')
      });
    }
    return results;
  });
  expect(outcomes).toEqual(Array.from({length:5},()=>({
    rejected:true,queueUntouched:true,diaryUntouched:true,visibleWarning:true
  })));
});


test('offline edits for one account never discard another account queue', async ({page,context}) => {
  await page.route('**/sync-queue-harness.html', route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><span id="sync-status"></span>'
  }));
  await page.goto('/sync-queue-harness.html');
  await page.evaluate(async () => {
    window.supabase = {createClient: () => ({
      auth:{onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}})},
      from(){throw Error('Remote database access prohibited in isolated test');}
    })};
    const journal = await import('/js/journalStore.js');
    await journal.initializeJournalStorage();
    // Load the application modules while the local HTTP server is reachable.
    await import('/js/state.js');
    await import('/js/storage.js');
  });

  // The app is now loaded. Make the browser offline so the actual saveAndSync
  // flow persists locally but can never schedule any cloud write.
  await context.setOffline(true);
  const outcome = await page.evaluate(async () => {
    const journal = await import('/js/journalStore.js');
    const {state} = await import('/js/state.js');
    const {saveAndSync} = await import('/js/storage.js');
    state.currentUser = {id:'test-account-A',email:'a@invalid.example'};
    const foreign = {
      id:'foreign-action',ownerId:'test-account-B',
      type:'UPDATE_WORKOUT',timestamp:1000,
      payload:{athlete:{name:'ACCOUNT_B_PRIVATE'},history:{years:{}}}
    };
    journal.journalStorage.setItem('workoutApp_data_sync_queue',JSON.stringify([foreign]));
    await journal.flushJournalStorage();

    const first = await saveAndSync({
      athlete:{name:'A_FIRST'},history:{years:{}}
    },'ACCOUNT_A_FIRST_EDIT');
    const second = await saveAndSync({
      athlete:{name:'A_LAST'},history:{years:{}}
    },'ACCOUNT_A_LAST_EDIT');
    await journal.flushJournalStorage();
    const queue = JSON.parse(journal.journalStorage.getItem('workoutApp_data_sync_queue'));
    return {
      firstAccepted:first!==false,
      secondAccepted:second!==false,
      foreignUnchanged:JSON.stringify(queue.find(x=>x.ownerId==='test-account-B'))===JSON.stringify(foreign),
      accountAEntries:queue.filter(x=>x.ownerId==='test-account-A').length,
      currentAValue:queue.find(x=>x.ownerId==='test-account-A')?.payload?.athlete?.name,
      totalEntries:queue.length
    };
  });
  expect(outcome).toEqual({
    firstAccepted:true,secondAccepted:true,foreignUnchanged:true,
    accountAEntries:1,currentAValue:'A_LAST',totalEntries:2
  });

  // Avoid a background upload when network connectivity is restored.
  await page.evaluate(async()=>{
    const {state}=await import('/js/state.js');
    state.currentUser=null;
  });
  await context.setOffline(false);
  await page.reload();
  const persisted = await page.evaluate(async () => {
    const journal = await import('/js/journalStore.js');
    await journal.initializeJournalStorage();
    const queue=JSON.parse(journal.journalStorage.getItem('workoutApp_data_sync_queue'));
    return queue.map(x=>({owner:x.ownerId,name:x.payload.athlete.name})).sort((a,b)=>a.owner.localeCompare(b.owner));
  });
  expect(persisted).toEqual([
    {owner:'test-account-A',name:'A_LAST'},
    {owner:'test-account-B',name:'ACCOUNT_B_PRIVATE'}
  ]);
});


test('legacy queue with missing owner never writes into a different signed-in account',async({page})=>{
  await page.route('**/sync-queue-harness.html',route=>route.fulfill({
    status:200,contentType:'text/html',
    body:'<!doctype html><meta charset="utf-8"><span id="sync-status"></span>'
  }));
  await page.goto('/sync-queue-harness.html');
  const result=await page.evaluate(async()=>{
    let cloudCalls=0;
    window.supabase={createClient:()=>({
      auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from(){cloudCalls++;throw Error('An unrelated account must not receive legacy snapshots');}
    })};
    const journal=await import('/js/journalStore.js');
    await journal.initializeJournalStorage();
    const {state}=await import('/js/state.js');
    const {processSyncQueue,hasPendingSync}=await import('/js/storage.js');
    state.currentUser={id:'account-B',email:'b@invalid.example'};
    // A global owner marker can reflect the CURRENT user, even though the
    // old queue entry was created before account scoping existed.
    journal.journalStorage.setItem('workoutApp_data_owner','account-A');
    const orphan={id:'legacy-orphan',timestamp:1000,type:'UPDATE_WORKOUT',
      payload:{athlete:{name:'PRIVATE_LEGACY_OWNER_UNKNOWN'},history:{years:{}}}};
    const foreign={id:'account-A-entry',ownerId:'account-A',timestamp:2000,type:'UPDATE_WORKOUT',
      payload:{athlete:{name:'ACCOUNT_A_PRIVATE'},history:{years:{}}}};
    const original=JSON.stringify([orphan,foreign]);
    journal.journalStorage.setItem('workoutApp_data_sync_queue',original);
    await journal.flushJournalStorage();
    const blocksHydration=hasPendingSync();
    await processSyncQueue();
    await journal.flushJournalStorage();
    return {
      cloudCalls,blocksHydration,
      queueUntouched:journal.journalStorage.getItem('workoutApp_data_sync_queue')===original,
      visibleWarning:document.getElementById('sync-status')?.textContent?.includes('Salvataggio')
    };
  });
  expect(result).toEqual({cloudCalls:0,blocksHydration:true,queueUntouched:true,visibleWarning:true});
});


test('a corrupted offline queue cannot be mistaken for fully synced local data',async({page})=>{
  await page.route('**/sync-queue-harness.html',route=>route.fulfill({
    status:200,contentType:'text/html',
    body:'<!doctype html><meta charset="utf-8"><span id="sync-status"></span>'
  }));
  await page.goto('/sync-queue-harness.html');
  const result=await page.evaluate(async()=>{
    window.supabase={createClient:()=>({
      auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from(){throw Error('No cloud request needed for corruption test');}
    })};
    const journal=await import('/js/journalStore.js');
    await journal.initializeJournalStorage();
    const {state}=await import('/js/state.js');
    const {hasPendingSync,saveAndSync}=await import('/js/storage.js');
    state.currentUser={id:'account-A',email:'a@invalid.example'};
    const original={athlete:{name:'IMPORTANT_UNSYNCED_LOCAL_DATA'},history:{years:{}}};
    journal.journalStorage.setItem('workoutApp_data',JSON.stringify(original));
    journal.journalStorage.setItem('workoutApp_data_sync_queue','{invalid-json');
    await journal.flushJournalStorage();
    const pending=hasPendingSync();
    const save=await saveAndSync({athlete:{name:'OTHER'},history:{years:{}}});
    await journal.flushJournalStorage();
    return {
      pending,
      rejected:save===false,
      unchanged:JSON.parse(journal.journalStorage.getItem('workoutApp_data')).athlete.name
        ==='IMPORTANT_UNSYNCED_LOCAL_DATA',
      damagedQueueUntouched:journal.journalStorage.getItem('workoutApp_data_sync_queue')==='{invalid-json',
      badgeWarning:document.getElementById('sync-status')?.textContent?.includes('Salvataggio')
    };
  });
  expect(result).toEqual({
    pending:true,rejected:true,unchanged:true,damagedQueueUntouched:true,badgeWarning:true
  });
});


test('deleting account A never discards ownerless or B pending actions',async({page})=>{
  await page.route('**/sync-queue-harness.html',r=>r.fulfill({
    status:200,contentType:'text/html',body:'<!doctype html><span id="sync-status"></span>'
  }));
  await page.goto('/sync-queue-harness.html');
  const value=await page.evaluate(async()=>{
    window.supabase={createClient:()=>({
      auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from(){throw Error('No cloud writes permitted');}
    })};
    const {journalStorage,initializeJournalStorage,flushJournalStorage}=await import('/js/journalStore.js');
    await initializeJournalStorage();
    const {removeAccountLocalData}=await import('/js/storage.js');
    const snapshot=name=>({athlete:{name},history:{years:{}}});
    const actions=[
      {id:'unknown',timestamp:1,type:'UPDATE_WORKOUT',payload:snapshot('UNOWNED_PRIVATE')},
      {id:'a',ownerId:'A',timestamp:2,type:'UPDATE_WORKOUT',payload:snapshot('A')},
      {id:'b',ownerId:'B',timestamp:3,type:'UPDATE_WORKOUT',payload:snapshot('B')}
    ];
    journalStorage.setItem('workoutApp_data_owner','A');
    journalStorage.setItem('workoutApp_data',JSON.stringify(snapshot('A')));
    journalStorage.setItem('workoutApp_data_sync_queue',JSON.stringify(actions));
    await flushJournalStorage();
    await removeAccountLocalData({id:'A'});
    return {
      remaining:JSON.parse(journalStorage.getItem('workoutApp_data_sync_queue'))
        .map(x=>x.id),
      ownedGenericRemoved:journalStorage.getItem('workoutApp_data')===null
    };
  });
  expect(value).toEqual({remaining:['unknown','b'],ownedGenericRemoved:true});
});

test('a signed-out browser never attributes new pending edits to a previous account',async({page})=>{
  await page.route('**/sync-queue-harness.html',r=>r.fulfill({
    status:200,contentType:'text/html',body:'<!doctype html><span id="sync-status"></span>'
  }));
  await page.goto('/sync-queue-harness.html');
  const value=await page.evaluate(async()=>{
    window.supabase={createClient:()=>({
      auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from(){throw Error('No cloud writes permitted');}
    })};
    const {journalStorage,initializeJournalStorage,flushJournalStorage}=await import('/js/journalStore.js');
    await initializeJournalStorage();
    const {state}=await import('/js/state.js');
    const {saveAndSync}=await import('/js/storage.js');
    journalStorage.setItem('workoutApp_data_owner','account-A');
    await flushJournalStorage();
    state.currentUser=null;
    const saved=await saveAndSync({athlete:{name:'UNVERIFIED_OFFLINE'},history:{years:{}}},'OFFLINE_TEST');
    await flushJournalStorage();
    const pending=JSON.parse(journalStorage.getItem('workoutApp_data_sync_queue'));
    return {saved:saved!==false,ownerId:pending[0].ownerId};
  });
  expect(value).toEqual({saved:true,ownerId:null});
});
