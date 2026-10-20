import {test, expect} from '@playwright/test';

const APP='https://diario-homegym.vercel.app/';
const EMAIL=process.env.HOMEGYM_E2E_EMAIL;
const PASSWORD=process.env.HOMEGYM_E2E_PASSWORD;

// Never run on routine CI or PR syntax checks. This is an explicit, narrowly
// scoped production write-and-restore experiment on a dedicated test account.
test.skip(process.env.HOMEGYM_E2E_ENABLE_WRITE!=='YES_RESTORE_OR_ABORT',
  'Production writes require an explicit opt-in and an externally saved backup.');

test('cloud CAS write → new browser → CAS rollback, no workout history changes',async({browser,page})=>{
  test.setTimeout(120_000);
  if(!EMAIL||!PASSWORD)throw Error('GitHub Actions test-account Secrets missing.');
  let phase='preflight';
  let blocked=0;
  let newDevice;
  let original=null, baselinePayload=null, expectedAfterWrite=null, marker=null;
  let writeWasAttempted=false, rollbackSucceeded=false;
  const permittedMutations=[];

  // Fail closed: permit ONLY auth POST and one precise CAS workouts PATCH for
  // the active test account. Payload and filtering are independently checked.
  const writeGuard=async route=>{
    const req=route.request(), url=new URL(req.url());
    const method=req.method().toUpperCase();
    if(['GET','HEAD','OPTIONS'].includes(method))return route.continue();
    if(method==='POST' && (url.pathname.startsWith('/auth/v1/token')||
       url.pathname.startsWith('/auth/v1/logout')))return route.continue();

    if(url.pathname==='/rest/v1/workouts' && !!baselinePayload && !!marker) {
      let body;
      try{body=req.postDataJSON();}catch{}
      const payload=body?.payload;
      const target=EMAIL.trim().toLowerCase();
      const rowFilter=url.searchParams.get('email')==='eq.'+target;
      const casFilter=(url.searchParams.get('updated_at')||'').startsWith('eq.');
      const samePayloadWithoutMarker=!!payload?.athlete &&
        JSON.stringify({...payload,athlete:{...payload.athlete,__homegymE2eProbe:undefined},
          updatedAt:baselinePayload.updatedAt})===
        JSON.stringify({...baselinePayload,
          athlete:{...baselinePayload.athlete,__homegymE2eProbe:undefined}});
      const testWrite=phase==='writing' && payload?.athlete?.__homegymE2eProbe===marker &&
        samePayloadWithoutMarker && body?.email===target &&
        typeof body.updated_at==='string';
      const updateOriginal=method==='PATCH' && !!original &&
        rowFilter && casFilter && testWrite;
      const insertNew=method==='POST' && !original && testWrite;
      const restoreOriginal=phase==='rollback' && !!original && method==='PATCH' &&
        rowFilter && casFilter && body?.email===target &&
        JSON.stringify(payload)===JSON.stringify(baselinePayload) &&
        typeof body.updated_at==='string';
      // Only delete the exact synthetic row created by this test, never an
      // existing user-owned row. Versioned CAS + preceding full-payload check.
      const deleteNew=phase==='rollback' && !original && method==='DELETE' &&
        rowFilter && casFilter;
      if(updateOriginal||insertNew||restoreOriginal||deleteNew){
        permittedMutations.push({phase,method});
        return route.continue();
      }
    }
    blocked++;
    return route.abort('blockedbyclient');
  };
  await page.route(/https:\/\/[^/]+\.supabase\.co\//,writeGuard);

  const signIn=async p=>{
    await p.goto(APP,{waitUntil:'domcontentloaded'});
    await expect(p.locator('#auth-overlay')).toBeVisible();
    await p.locator('#auth-email').fill(EMAIL);
    await p.locator('#auth-password').fill(PASSWORD);
    const reload=p.waitForEvent('load',{timeout:30000});
    await p.locator('#auth-submit-btn').click();
    await reload;
    await expect(p.locator('#auth-overlay')).toBeHidden({timeout:30000});
    await expect.poll(()=>p.evaluate(()=>!!window.state?.currentUser?.id),
      {timeout:30000}).toBe(true);
  };

  const readCloud=async p=>p.evaluate(async()=>{
    const {supabase}=await import('/js/config.js');
    const {data:{user},error}=await supabase.auth.getUser();
    if(error||!user)throw Error('Account cloud non autenticato.');
    const result=await supabase.from('workouts')
      .select('payload,updated_at').eq('email',user.email).maybeSingle();
    if(result.error)throw Error('SELECT cloud fallita.');
    return result.data;
  });

  try{
    await signIn(page);
    const verifiedIdentity=await page.evaluate(async expectedEmail=>{
      const {supabase}=await import('/js/config.js');
      const {data:{user},error}=await supabase.auth.getUser();
      return !error && user?.email?.toLowerCase()===expectedEmail.toLowerCase();
    },EMAIL);
    expect(verifiedIdentity).toBe(true);
    original=await readCloud(page);
    const preflight=await page.evaluate(async()=>{
      const {state}=await import('/js/state.js');
      const {hasPendingSync,getSyncConflict,getCloudRevision}=await import('/js/storage.js');
      return {sameUser:!!state.currentUser?.id,
        snapshot:state.workoutData,pending:hasPendingSync(),
        conflict:!!getSyncConflict(),revision:getCloudRevision(state.currentUser)};
    });
    expect(preflight.sameUser).toBe(true);
    expect(preflight.pending,'Non scrivere con coda offline da sincronizzare.').toBe(false);
    expect(preflight.conflict,'Non scrivere con conflitto già presente.').toBe(false);
    if(original){
      if(!original.updated_at || !original.payload)
        test.skip(true,'Cloud row senza revisione valida: nessuna scrittura.');
      expect(preflight.revision,'Versione CAS cloud non inizializzata.')
        .toBe(original.updated_at);
      expect(preflight.snapshot,'Snapshot locale e cloud divergenti.')
        .toEqual(original.payload);
      baselinePayload=original.payload;
      console.log('LIVE_PREFLIGHT','existing_cloud_row');
    }else{
      // Creating and removing a new row is reversible ONLY for a completely
      // blank test account. Never import historical local data implicitly.
      const years=preflight.snapshot?.history?.years;
      if(!years || Object.values(years).some(y=>y?.mesocycles?.length))
        test.skip(true,'Cloud vuoto ma storico locale presente: nessuna scrittura.');
      if(preflight.revision)
        test.skip(true,'Cloud vuoto ma revisione locale presente: nessuna scrittura.');
      baselinePayload=preflight.snapshot;
      console.log('LIVE_PREFLIGHT','empty_cloud_row_and_blank_local_history');
    }
    expect(baselinePayload.history?.years).toBeTruthy();
    expect(baselinePayload.athlete?.__homegymE2eProbe).toBeUndefined();

    marker='HG-E2E-'+crypto.randomUUID();
    phase='writing';
    writeWasAttempted=true;
    const attempted=await page.evaluate(async marker=>{
      const {state}=await import('/js/state.js');
      const {saveAndSync}=await import('/js/storage.js');
      const testCopy=structuredClone(state.workoutData);
      testCopy.athlete={...testCopy.athlete,__homegymE2eProbe:marker};
      return (await saveAndSync(testCopy,'E2E_CAS_SYNTHETIC'))!==false;
    },marker);
    expect(attempted,'Impossibile salvare il record sintetico.').toBe(true);

    await expect.poll(async()=>{
      const record=await readCloud(page);
      expectedAfterWrite=record;
      return record?.payload?.athlete?.__homegymE2eProbe===marker;
    },{timeout:35000,intervals:[750,1500,2500]}).toBe(true);
    expect(expectedAfterWrite.updated_at).toBeTruthy();
    if(original)expect(expectedAfterWrite.updated_at).not.toBe(original.updated_at);
    const withoutProbe=structuredClone(expectedAfterWrite.payload);
    delete withoutProbe.athlete.__homegymE2eProbe;
    withoutProbe.updatedAt=baselinePayload.updatedAt;
    expect(withoutProbe,'Il test non deve cambiare allenamenti o altri campi.')
      .toEqual(baselinePayload);
    phase='verifying';

    // Truly independent browser: no cookies, IndexedDB or localStorage shared.
    newDevice=await browser.newContext({serviceWorkers:'block'});
    const secondPage=await newDevice.newPage();
    await secondPage.route(/https:\/\/[^/]+\.supabase\.co\//,async route=>{
      const req=route.request(),url=new URL(req.url());
      const method=req.method().toUpperCase();
      if(['GET','HEAD','OPTIONS'].includes(method)||
        (method==='POST'&&(url.pathname.startsWith('/auth/v1/token')||
          url.pathname.startsWith('/auth/v1/logout'))))return route.continue();
      blocked++;
      return route.abort('blockedbyclient');
    });
    await signIn(secondPage);
    await expect.poll(async()=>secondPage.evaluate(async marker=>{
      const {state}=await import('/js/state.js');
      const {supabase}=await import('/js/config.js');
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)return false;
      const {data,error}=await supabase.from('workouts')
        .select('payload').eq('email',user.email).maybeSingle();
      return !error && data?.payload?.athlete?.__homegymE2eProbe===marker &&
        state.workoutData?.athlete?.__homegymE2eProbe===marker;
    },marker),{timeout:25000}).toBe(true);
    console.log('LIVE_SYNC_PROBE','second_device_verified');
  }finally{
    // Restore the EXACT original payload, only if the remote record still
    // matches our synthetic write. CAS prevents overwriting concurrent edits.
    if(writeWasAttempted && baselinePayload){
      phase='rollback';
      try{
        const rolledBack=await page.evaluate(async({original,baselinePayload,marker})=>{
          const {supabase}=await import('/js/config.js');
          const {state}=await import('/js/state.js');
          const {saveToLocalStorage,setCloudRevision,hasPendingSync,getSyncConflict}=await import('/js/storage.js');
          const {journalStorage,flushJournalStorage}=await import('/js/journalStore.js');
          const {data:{user}}=await supabase.auth.getUser();
          if(!user)throw Error('Sessione persa, rollback automatico sospeso.');
          const {data:current,error:readError}=await supabase.from('workouts')
            .select('payload,updated_at').eq('email',user.email).maybeSingle();
          if(readError)throw Error('Impossibile verificare lo snapshot per rollback.');

          if(current){
            if(current.payload?.athlete?.__homegymE2eProbe!==marker)
              throw Error('Cloud modificato da altri: rollback sospeso per proteggere i dati.');
            const clean=structuredClone(current.payload);
            delete clean.athlete.__homegymE2eProbe;
            clean.updatedAt=baselinePayload.updatedAt;
            if(JSON.stringify(clean)!==JSON.stringify(baselinePayload))
              throw Error('Altre modifiche al diario: rollback sospeso.');
            if(hasPendingSync()||getSyncConflict())
              throw Error('Coda offline o conflitto: rollback sospeso.');
            let result;
            if(original){
              result=await supabase.from('workouts')
                .update({email:user.email,payload:baselinePayload,
                  updated_at:new Date(Math.max(Date.now(),Date.parse(current.updated_at)+1000)).toISOString()})
                .eq('email',user.email).eq('updated_at',current.updated_at)
                .select('updated_at').maybeSingle();
            }else{
              // The only deleted row is our own freshly inserted synthetic row.
              result=await supabase.from('workouts').delete()
                .eq('email',user.email).eq('updated_at',current.updated_at)
                .select('updated_at').maybeSingle();
            }
            if(result.error||!result.data?.updated_at)
              throw Error('CAS rollback non confermato.');
            setCloudRevision(user,original?result.data.updated_at:null);
          }else if(original){
            throw Error('Riga precedente scomparsa: rollback automatico sospeso.');
          }

          // Remove only our synthetic queued snapshot if upload failed before
          // reaching Supabase. Preserve unrelated pending actions untouched.
          const key='workoutApp_data_sync_queue';
          const raw=journalStorage.getItem(key);
          if(raw){
            let queue;
            try{queue=JSON.parse(raw);}catch{throw Error('Coda offline corrotta: nessuna cancellazione.');}
            if(!Array.isArray(queue))throw Error('Coda offline non valida: nessuna cancellazione.');
            const remaining=queue.filter(x=>x?.payload?.athlete?.__homegymE2eProbe!==marker);
            if(remaining.length!==queue.length){
              if(remaining.length)journalStorage.setItem(key,JSON.stringify(remaining));
              else journalStorage.removeItem(key);
            }
          }
          if(!saveToLocalStorage(structuredClone(baselinePayload),{preserveUpdatedAt:true}))
            throw Error('Cloud ripristinato ma cache locale non ripristinata.');
          await flushJournalStorage();
          const {data:check,error:checkError}=await supabase.from('workouts')
            .select('payload').eq('email',user.email).maybeSingle();
          if(checkError || (original
            ? JSON.stringify(check?.payload)!==JSON.stringify(baselinePayload)
            : check!==null))
            throw Error('Verifica finale dei dati cloud non riuscita.');
          state.workoutData=baselinePayload;
          return true;
        },{original,baselinePayload,marker});
        rollbackSucceeded=rolledBack===true;
        if(rollbackSucceeded)console.log('LIVE_SYNC_ROLLBACK','original_cloud_state_restored_and_verified');
      }catch(error){
        console.error('CRITICAL_TEST_ACCOUNT_RECOVERY_REQUIRED',error.message);
        throw error;
      }
    }
    phase='finished';
    if(newDevice)await newDevice.close();
  }
  expect(blocked,'Il test ha tentato una scrittura non consentita.').toBe(0);
  expect(permittedMutations.filter(x=>x.phase==='writing')).toHaveLength(1);
  expect(permittedMutations.filter(x=>x.phase==='rollback')).toHaveLength(1);
  expect(rollbackSucceeded).toBe(true);
});
