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
    for (const damagedQueue of ['{incomplete-json', '{"wrong":"shape"}']) {
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
  expect(outcomes).toEqual([
    {rejected:true,queueUntouched:true,diaryUntouched:true,visibleWarning:true},
    {rejected:true,queueUntouched:true,diaryUntouched:true,visibleWarning:true}
  ]);
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
