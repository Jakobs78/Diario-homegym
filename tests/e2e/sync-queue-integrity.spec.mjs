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
