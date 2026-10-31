import {test,expect} from '@playwright/test';
async function harness(page){
 await page.route('**/audit-harness.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><span id="sync-status"></span><main id="workout-list-container"></main>'}));
 await page.route(/https:\/\//,r=>r.abort());
 await page.goto('/audit-harness.html');
 await page.evaluate(async()=>{
  const user={id:'audit-one-device',email:'audit@invalid.example'};
  const payload={athlete:{name:'SYNTHETIC'},history:{years:{}},updatedAt:'2026-10-01T00:00:00.000Z'};
  window.__audit={user,payload,remote:{payload:structuredClone(payload),revision:'2026-10-01T00:00:00.000Z'},writes:0,reads:0,dropAck:false,hold:false};
  window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){
   let changes=null,op='read',filters={};
   return {select(){return this},eq(k,v){filters[k]=v;return this},update(data){op='update';changes=data;return this},insert(data){op='insert';changes=data;return this},
    async maybeSingle(){const a=window.__audit;
     if(op==='read'){a.reads++;return {data:a.remote?{payload:structuredClone(a.remote.payload),updated_at:a.remote.revision}:null,error:null};}
     a.writes++;a.started=true;
     if(a.hold)await new Promise(r=>a.release=r);
     if(op==='update'&&filters.updated_at!==a.remote?.revision)return {data:null,error:null};
     a.remote={payload:structuredClone(changes.payload),revision:changes.updated_at};
     if(a.dropAck)return {data:null,error:{message:'Synthetic lost response AFTER server commit',code:'NETWORK'}};
     return {data:{updated_at:a.remote.revision},error:null};
    }};
  }})};
  window.jspdf={jsPDF:class{}};
  const j=await import('/js/journalStore.js');await j.initializeJournalStorage();
  const {state}=await import('/js/state.js');const s=await import('/js/storage.js');
  state.currentUser=user;state.workoutData=structuredClone(payload);
  s.saveToLocalStorage(state.workoutData,{preserveUpdatedAt:true});s.setCloudRevision(user,window.__audit.remote.revision);await j.flushJournalStorage();
 });
}
test('lost acknowledgement is recovered without a second write or false conflict',async({page})=>{
 await harness(page);const result=await page.evaluate(async()=>{
  const a=window.__audit,j=await import('/js/journalStore.js'),s=await import('/js/storage.js');
  const payload={...a.payload,athlete:{name:'CONFIRMED_SYNTHETIC_EDIT'}};a.dropAck=true;
  j.journalStorage.setItem('workoutApp_data_sync_queue',JSON.stringify([{id:'one-action',ownerId:a.user.id,type:'UPDATE_WORKOUT',timestamp:1,payload}]));await j.flushJournalStorage();
  await s.processSyncQueue();const firstConflict=Boolean(s.getSyncConflict()),same=JSON.stringify(payload)===JSON.stringify(a.remote.payload);
  await s.processSyncQueue();return {firstConflict,identicalPayload:same,conflictAfterRetry:Boolean(s.getSyncConflict()),writes:a.writes,pending:s.hasPendingSync(),badge:document.getElementById('sync-status').textContent};
 });
 expect(result).toEqual({firstConflict:false,identicalPayload:true,conflictAfterRetry:false,writes:1,pending:false,badge:'✓ Cloud'});
 console.log('AUDIT_LOST_ACK',JSON.stringify(result));
});
test('a new edit during slow upload is drained without another user action',async({page})=>{
 await harness(page);
 await page.evaluate(async()=>{
  const a=window.__audit,j=await import('/js/journalStore.js'),s=await import('/js/storage.js');a.hold=true;
  j.journalStorage.setItem('workoutApp_data_sync_queue',JSON.stringify([{id:'A',ownerId:a.user.id,type:'UPDATE_WORKOUT',timestamp:1,payload:a.payload}]));await j.flushJournalStorage();window.__upload=s.processSyncQueue();
 });
 await page.waitForFunction(()=>window.__audit.started);
 await page.evaluate(async()=>{const s=await import('/js/storage.js');await s.saveAndSync({...window.__audit.payload,athlete:{name:'SECOND_SYNTHETIC_EDIT'}});});
 await page.waitForTimeout(1800);
 await page.evaluate(async()=>{window.__audit.hold=false;window.__audit.release();await window.__upload;});
 await page.waitForTimeout(1800);
 const result=await page.evaluate(async()=>{const s=await import('/js/storage.js'),j=await import('/js/journalStore.js');const a=window.__audit;const before={writes:a.writes,pending:s.hasPendingSync(),queue:JSON.parse(j.journalStorage.getItem('workoutApp_data_sync_queue')||'[]').length};await s.processSyncQueue();return {before,after:{writes:a.writes,pending:s.hasPendingSync(),cloudName:a.remote.payload.athlete.name}};});
 expect(result).toEqual({before:{writes:2,pending:false,queue:0},after:{writes:2,pending:false,cloudName:'SECOND_SYNTHETIC_EDIT'}});console.log('AUDIT_STALLED_QUEUE',JSON.stringify(result));
});
test('JSONB property order does not create a conflict',async({page})=>{
 await harness(page);const result=await page.evaluate(async()=>{
  const a=window.__audit,s=await import('/js/storage.js'),j=await import('/js/journalStore.js');s.setCloudRevision(a.user,null);await j.flushJournalStorage();
  a.remote.payload={updatedAt:a.payload.updatedAt,history:a.payload.history,athlete:a.payload.athlete};
  const push=await(await import('/js/sync.js')).pushDataToSupabase(a.user,a.payload);
  return {semanticEqual:a.remote.payload.athlete.name===a.payload.athlete.name&&a.remote.payload.updatedAt===a.payload.updatedAt,jsonEqual:JSON.stringify(a.remote.payload)===JSON.stringify(a.payload),conflict:Boolean(push.conflict),writes:a.writes};
 });
 expect(result).toEqual({semanticEqual:true,jsonEqual:false,conflict:false,writes:0});console.log('AUDIT_JSON_ORDER',JSON.stringify(result));
});
test('actual vendored SDK: default auth refresh with async database callback',async({page})=>{
 await page.route('**/audit-sdk.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated SDK test</title>'}));await page.goto('/audit-sdk.html');
 await page.addScriptTag({url:'/js/vendor/supabase.js'});
 const result=await page.evaluate(async()=>{
  let dbCalls=0,callbacks=0,completed=0,tokenNumber=0;
  const fakeUser={id:'00000000-0000-4000-8000-000000000001',email:'audit@invalid.example',aud:'authenticated',created_at:'2026-01-01T00:00:00Z'};
  const jwt=()=>[btoa(JSON.stringify({alg:'HS256',typ:'JWT'})),btoa(JSON.stringify({sub:fakeUser.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated',seq:tokenNumber})),btoa('synthetic-signature')].join('.');
  const fakeFetch=async(url,options)=>{
   if(String(url).includes('/auth/v1/token')){tokenNumber++;return new Response(JSON.stringify({access_token:jwt(),refresh_token:'synthetic-refresh-'+tokenNumber,expires_in:3600,token_type:'bearer',user:fakeUser}),{status:200,headers:{'content-type':'application/json'}});}
   if(String(url).includes('/rest/v1/')){dbCalls++;return new Response(JSON.stringify([{payload:{synthetic:true},updated_at:'2026-10-01T00:00:00Z'}]),{status:200,headers:{'content-type':'application/json'}});}
   return new Response(JSON.stringify(fakeUser),{status:200,headers:{'content-type':'application/json'}});
  };
  const client=window.supabase.createClient('https://audit.invalid','synthetic-key',{global:{fetch:fakeFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  await client.auth.signInWithPassword({email:fakeUser.email,password:'synthetic-only'});
  client.auth.onAuthStateChange(async(event,session)=>{if(event!=='TOKEN_REFRESHED')return;callbacks++;await client.from('workouts').select('payload,updated_at').maybeSingle();completed++;});
  const outcome=await Promise.race([client.auth.refreshSession().then(r=>r.error?'error':'completed'),new Promise(r=>setTimeout(()=>r('timeout'),2000))]);
  return {outcome,callbacks,completed,dbCalls,usesLock:Boolean(client.auth.lock)};
 });
 expect(result).toEqual({outcome:'completed',callbacks:1,completed:1,dbCalls:1,usesLock:false});console.log('AUDIT_CURRENT_SDK',JSON.stringify(result));
});

test('unconfirmed input is durable without waiting for a debounce timer',async({page})=>{
 await harness(page);
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js'),s=await import('/js/storage.js'),j=await import('/js/journalStore.js');
  state.workoutData={athlete:{},history:{years:{2026:{mesocycles:[{name:'Draft audit',weeks:[{weekNumber:1,days:[{dayNumber:1,exercises:[{name:'Panca Piana con Bilanciere',setsCount:1,reps:'6-8',rpe:8,kgMin:50,kgMax:50,restTime:'90s',sets:[{}],loggedSets:[{weight:'',reps:'',rpe:'',isLocked:false,completed:false}]}]}]}]}]}}}};
  state.currentYear='2026';state.activeMesocycleIndex=0;state.activeWeek=1;state.activeDay=1;
  s.saveToLocalStorage(state.workoutData,{preserveUpdatedAt:true});await j.flushJournalStorage();
  const {renderWorkoutList}=await import('/js/ui.js');renderWorkoutList();await new Promise(r=>setTimeout(r,0));await j.flushJournalStorage();
 });
 await page.locator('.set-kg').first().fill('37');
 const inMemory=await page.evaluate(async()=>{const {state}=await import('/js/state.js');return state.workoutData.history.years[2026].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[0].weight;});
 await page.evaluate(async()=>{await(await import('/js/journalStore.js')).flushJournalStorage();});
 await page.reload();
 const persisted=await page.evaluate(async()=>{const j=await import('/js/journalStore.js');await j.initializeJournalStorage();return JSON.parse(j.journalStorage.getItem('workoutApp_data')).history.years[2026].mesocycles[0].weeks[0].days[0].exercises[0].loggedSets[0].weight;});
 expect(String(inMemory)).toBe('37');expect(String(persisted)).toBe('37');console.log('AUDIT_DRAFT_RESTART',JSON.stringify({inMemory,persisted}));
});

test('lost acknowledgement stays recoverable after a newer local edit compacts the old queue entry',async({page})=>{
 await harness(page);
 const result=await page.evaluate(async()=>{
  const a=window.__audit,s=await import('/js/storage.js'),j=await import('/js/journalStore.js');
  a.dropAck=true;await s.saveAndSync({...a.payload,athlete:{name:'FIRST'}});await s.processSyncQueue();
  a.dropAck=false;await s.saveAndSync({...a.payload,athlete:{name:'SECOND'}});await s.processSyncQueue();
  return {pending:s.hasPendingSync(),conflict:Boolean(s.getSyncConflict()),name:a.remote.payload.athlete.name,writes:a.writes};
 });
 expect(result).toEqual({pending:false,conflict:false,name:'SECOND',writes:2});
});
test('a foreign concurrent revision is preserved, never auto-merged',async({page})=>{
 await harness(page);const result=await page.evaluate(async()=>{
  const a=window.__audit,s=await import('/js/storage.js');
  a.remote={payload:{...a.payload,athlete:{name:'FOREIGN'}},revision:'2026-10-02T00:00:00.000Z'};
  await s.saveAndSync({...a.payload,athlete:{name:'LOCAL'}});await s.processSyncQueue();
  return {pending:s.hasPendingSync(),conflict:Boolean(s.getSyncConflict()),name:a.remote.payload.athlete.name};
 });expect(result).toEqual({pending:true,conflict:true,name:'FOREIGN'});
});
test('legacy diagnostic snapshots are separated losslessly and future decisions contain only series diffs',async({page})=>{
 await harness(page);
 const result=await page.evaluate(async()=>{
  const a=window.__audit,s=await import('/js/storage.js'),j=await import('/js/journalStore.js');
  const legacy=[{at:'2026-10-01',changes:[{before:Array(200).fill({reason:'Synthetic technical snapshot',basedOn:[{weight:80,reps:6}]}),after:Array(200).fill({reason:'Synthetic technical snapshot',basedOn:[{weight:81,reps:6}]})}]}];
  const data={...a.payload,history:{years:{2026:{mesocycles:[{weeks:[],coachAdjustments:legacy}]}}}};
  const rawBytes=JSON.stringify(data).length;
  await s.saveAndSync(data);await j.flushJournalStorage();
  const meso=data.history.years[2026].mesocycles[0],ref=meso.coachArchiveRefs[0];
  const archive=JSON.parse(j.journalStorage.getItem('workoutApp_data_coach_archive_'+a.user.id+'_'+ref.id));
  const queue=JSON.parse(j.journalStorage.getItem('workoutApp_data_sync_queue'));
  return {preserved:JSON.stringify(archive.events)===JSON.stringify(legacy),coreEmpty:meso.coachAdjustments.length===0,refCount:meso.coachArchiveRefs.length,reduction:1-JSON.stringify(queue[0].payload).length/rawBytes};
 });expect(result.preserved).toBe(true);expect(result.coreEmpty).toBe(true);expect(result.refCount).toBe(1);expect(result.reduction).toBeGreaterThan(.95);
});

async function archiveBackend(page){
 await page.evaluate(async()=>{
  const {supabase}=await import('/js/config.js');
  const original=supabase.from.bind(supabase);
  const records=new Map();window.__archives={records,inserts:0,reads:0,loseAck:false};
  supabase.from=table=>{
   if(table!=='workout_coach_archives')return original(table);
   let operation='read',body=null;const filters={};
   const query={select(){return query;},eq(k,v){filters[k]=v;return query;},insert(row){operation='insert';body=row;return query;},maybeSingle(){return query;},abortSignal(){return query;},
    then(resolve,reject){return (async()=>{
     const a=window.__archives;
     if(operation==='insert'){
      a.inserts++;const id=body.user_id+':'+body.archive_id;
      if(records.has(id))return {error:{code:'23505'}};
      records.set(id,structuredClone(body));
      if(a.loseAck){a.loseAck=false;return {error:{message:'Lost archive acknowledgement'}};}
      return {error:null};
     }
     a.reads++;return {data:records.get(filters.user_id+':'+filters.archive_id)||null,error:null};
    })().then(resolve,reject);}
   };return query;
  };
 });
}
test('diagnostic archive uploads once; a lost archive acknowledgement uses its persisted receipt without resending the blob',async({page})=>{
 await harness(page);await archiveBackend(page);
 const result=await page.evaluate(async()=>{
  const a=window.__audit,s=await import('/js/storage.js');window.__archives.loseAck=true;
  const data={...a.payload,history:{years:{2026:{mesocycles:[{weeks:[],coachAdjustments:[{changes:[{before:[{weight:80}],after:[{weight:81}]}]}]}]}}}};
  await s.saveAndSync(data);await s.processSyncQueue();
  const afterFailure={pending:s.hasPendingSync(),writes:a.writes};
  await s.processSyncQueue();
  await s.saveAndSync({...data,athlete:{name:'NEXT_EDIT'}});await s.processSyncQueue();
  return {afterFailure,inserts:window.__archives.inserts,reads:window.__archives.reads,archives:window.__archives.records.size,pending:s.hasPendingSync(),name:a.remote.payload.athlete.name,coreEvents:a.remote.payload.history.years[2026].mesocycles[0].coachAdjustments.length};
 });
 expect(result).toEqual({afterFailure:{pending:true,writes:0},inserts:1,reads:1,archives:1,pending:false,name:'NEXT_EDIT',coreEvents:0});
});
test('full backup includes separated diagnostics and restores them under the original account',async({page})=>{
 await harness(page);await archiveBackend(page);
 await page.evaluate(async()=>{
  const {state}=await import('/js/state.js'),s=await import('/js/storage.js');
  await s.saveAndSync({...window.__audit.payload,history:{years:{2026:{mesocycles:[{weeks:[],coachAdjustments:[{at:'synthetic',changes:[{before:[1,2],after:[2,3]}]}]}]}}}});
  await s.processSyncQueue();
  const j=await import('/js/journalStore.js');
  // Model a second device that has the journal references, but not the archive body.
  for(const k of j.journalStorage.keys())if(k.startsWith('workoutApp_data_coach_archive_'))j.journalStorage.removeItem(k);
  await j.flushJournalStorage();
 });
 const downloading=page.waitForEvent('download');
 await page.evaluate(async()=>{const {state}=await import('/js/state.js');await(await import('/js/fullBackup.js')).downloadFullBackup(state.workoutData);});
 const download=await downloading;const {readFile}=await import('node:fs/promises');
 const backup=JSON.parse(await readFile(await download.path(),'utf8'));
 expect(backup.coachDiagnostics).toHaveLength(1);expect(backup.coachDiagnostics[0].payload.events[0].changes[0]).toEqual({before:[1,2],after:[2,3]});
 expect(backup.data.history.years[2026].mesocycles[0].coachAdjustments).toEqual([]);
 const restored=await page.evaluate(async backup=>{
  const {state}=await import('/js/state.js'),{restoreCoachArchives,loadCoachArchives}=await import('/js/coachArchive.js');
  restoreCoachArchives(backup.coachDiagnostics,state.currentUser);
  return (await loadCoachArchives(backup.data,state.currentUser))[0].payload.events;
 },backup);
 expect(restored).toEqual(backup.coachDiagnostics[0].payload.events);
});
test('ongoing compact diagnostics are moved out of the operational journal before growing without bound',async({page})=>{
 await harness(page);
 const result=await page.evaluate(async()=>{
  const {separateCoachArchives}=await import('/js/coachArchive.js');
  const compact=Array.from({length:60},(_,i)=>({format:2,at:String(i),changes:[{series:[{before:{weight:i},after:{weight:i+1}}]}]}));
  const data={history:{years:{2026:{mesocycles:[{weeks:[],coachAdjustments:compact}]}}}};
  separateCoachArchives(data,window.__audit.user);
  return {retained:data.history.years[2026].mesocycles[0].coachAdjustments.length,refs:data.history.years[2026].mesocycles[0].coachArchiveRefs.length};
 });expect(result).toEqual({retained:5,refs:1});
});
