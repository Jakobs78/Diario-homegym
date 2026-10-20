import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const original={
  athlete:{email:'legacy@invalid.example',name:'ANONYMOUS_UNATTRIBUTED'},
  history:{years:{2025:{mesocycles:[{name:'Legacy plan',weeks:[{days:[{exercises:[
    {name:'Squat',loggedSets:[{weight:'50',reps:'8',rpe:'7'}]}
  ]}]}]}]}}},
  updatedAt:'2025-11-01T10:00:00.000Z'
};

async function harness(page){
  // The same mock must survive reloads; the test never contacts Supabase.
  await page.addInitScript(()=>{
    window.supabase={createClient:()=>({
      auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from(){throw Error('Test isolation violated: no Supabase network permitted');}
    })};
  });
  await page.route('**/legacy-account-harness.html',route=>route.fulfill({
    status:200,contentType:'text/html',
    body:'<!doctype html><meta charset="utf-8"><span id="sync-status"></span><main id="workout-list-container"></main>'
  }));
  await page.goto('/legacy-account-harness.html');
  await page.evaluate(async()=>{
    const journal=await import('/js/journalStore.js');
    await journal.initializeJournalStorage();
    await import('/js/state.js');
    await import('/js/storage.js');
  });
}

test('ownerless legacy is not shown to a different account and survives new cloud hydration',async({page})=>{
  await harness(page);
  const first=await page.evaluate(async original=>{
    const {journalStorage,flushJournalStorage}=await import('/js/journalStore.js');
    const {state}=await import('/js/state.js');
    const {getFromLocalStorageForUser,saveToLocalStorage,getUnownedLegacySnapshot,
      updateSyncStatusUI}=await import('/js/storage.js');
    journalStorage.setItem('workoutApp_data',JSON.stringify(original));
    await flushJournalStorage();
    state.currentUser={id:'SECOND_ACCOUNT_ID',email:'second@invalid.example'};
    const isolated=getFromLocalStorageForUser(state.currentUser);
    const newData={athlete:{email:'second@invalid.example',name:'SECOND'},
      history:{years:{}},updatedAt:'2026-10-20T16:00:00.000Z'};
    const saved=saveToLocalStorage(newData,{preserveUpdatedAt:true});
    await flushJournalStorage();
    updateSyncStatusUI();
    return {
      noLegacyLeak:!JSON.stringify(isolated).includes('ANONYMOUS_UNATTRIBUTED') &&
        Object.keys(isolated.history.years).length===0,
      saved,
      archiveIdentical:getUnownedLegacySnapshot()===JSON.stringify(original),
      newUserOwnsData:getFromLocalStorageForUser(state.currentUser).athlete.name==='SECOND',
      genericNowSecond:JSON.parse(journalStorage.getItem('workoutApp_data')).athlete.name==='SECOND',
      bannerVisible:!!document.getElementById('legacy-unowned-recovery')
    };
  },original);
  expect(first).toEqual({
    noLegacyLeak:true,saved:true,archiveIdentical:true,newUserOwnsData:true,
    genericNowSecond:true,bannerVisible:true
  });

  // Download requires an affirmative, manual action; it never restores to a
  // different account or automatically uploads to Supabase.
  page.on('dialog',dialog=>dialog.accept());
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('#legacy-unowned-recovery button').click()
  ]);
  const archive=JSON.parse(await readFile(await download.path(),'utf8'));
  expect(archive.format).toBe('homegym-diary-full-backup');
  expect(archive.data).toEqual(original);

  await page.reload();
  const after=await page.evaluate(async original=>{
    const {journalStorage,initializeJournalStorage}=await import('/js/journalStore.js');
    await initializeJournalStorage();
    const {state}=await import('/js/state.js');
    const {getUnownedLegacySnapshot,getFromLocalStorageForUser,
      updateSyncStatusUI}=await import('/js/storage.js');
    state.currentUser={id:'SECOND_ACCOUNT_ID',email:'second@invalid.example'};
    updateSyncStatusUI();
    return {
      archiveIdentical:getUnownedLegacySnapshot()===JSON.stringify(original),
      secondAccountData:getFromLocalStorageForUser(state.currentUser).athlete.name,
      bannerVisible:!!document.getElementById('legacy-unowned-recovery'),
      archiveRaw:journalStorage.getItem('workoutApp_data_legacy_unowned_recovery')
        ===JSON.stringify(original)
    };
  },original);
  expect(after).toEqual({
    archiveIdentical:true,secondAccountData:'SECOND',bannerVisible:true,archiveRaw:true
  });
});

test('an explicitly owned journal stays scoped; a different login never sees it',async({page})=>{
  await harness(page);
  const result=await page.evaluate(async()=>{
    const {journalStorage,flushJournalStorage}=await import('/js/journalStore.js');
    const {state}=await import('/js/state.js');
    const {getFromLocalStorageForUser,getUnownedLegacySnapshot}=await import('/js/storage.js');
    const a={athlete:{name:'ACCOUNT_A_PRIVATE'},history:{years:{}}};
    journalStorage.setItem('workoutApp_data',JSON.stringify(a));
    journalStorage.setItem('workoutApp_data_owner','A');
    journalStorage.setItem('workoutApp_data_user_A',JSON.stringify(a));
    await flushJournalStorage();
    const accountA=getFromLocalStorageForUser({id:'A'});
    state.currentUser={id:'B'};
    const accountB=getFromLocalStorageForUser(state.currentUser);
    return {
      aOk:accountA.athlete.name==='ACCOUNT_A_PRIVATE',
      bEmpty:!JSON.stringify(accountB).includes('ACCOUNT_A_PRIVATE'),
      unownedArchive:getUnownedLegacySnapshot()
    };
  });
  expect(result).toEqual({aOk:true,bEmpty:true,unownedArchive:null});
});

test('corrupt unattributed legacy backup stays byte-identical and manually downloadable',async({page})=>{
  await harness(page);
  const raw='{damaged snapshot; preserve exact text';
  await page.evaluate(async raw=>{
    const {journalStorage,flushJournalStorage}=await import('/js/journalStore.js');
    const {state}=await import('/js/state.js');
    const {saveToLocalStorage,updateSyncStatusUI}=await import('/js/storage.js');
    journalStorage.setItem('workoutApp_data',raw);
    await flushJournalStorage();
    state.currentUser={id:'B'};
    saveToLocalStorage({athlete:{email:null},history:{years:{}}});
    await flushJournalStorage();
    updateSyncStatusUI();
  },raw);
  page.on('dialog',dialog=>dialog.accept());
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('#legacy-unowned-recovery button').click()
  ]);
  expect(download.suggestedFilename()).toMatch(/originale\.txt$/);
  expect(await readFile(await download.path(),'utf8')).toBe(raw);
});


test('multiple distinct ownerless journals fail closed instead of overwriting newest copy',async({page})=>{
  await harness(page);
  const outcome=await page.evaluate(async()=>{
    const {journalStorage,flushJournalStorage}=await import('/js/journalStore.js');
    const {state}=await import('/js/state.js');
    const {saveToLocalStorage}=await import('/js/storage.js');
    const oldest='{ "archived": "A" }';
    const newest='{ "unattributed": "C" }';
    journalStorage.setItem('workoutApp_data_legacy_unowned_recovery',oldest);
    journalStorage.setItem('workoutApp_data',newest);
    await flushJournalStorage();
    state.currentUser={id:'B',email:'b@invalid.example'};
    const result=saveToLocalStorage({athlete:{name:'B'},history:{years:{}}});
    await flushJournalStorage();
    return {
      rejected:result===false,
      oldestUntouched:journalStorage.getItem('workoutApp_data_legacy_unowned_recovery')===oldest,
      newestUntouched:journalStorage.getItem('workoutApp_data')===newest,
      ownerUnchanged:journalStorage.getItem('workoutApp_data_owner')===null
    };
  });
  expect(outcome).toEqual({
    rejected:true,oldestUntouched:true,newestUntouched:true,ownerUnchanged:true
  });
});
