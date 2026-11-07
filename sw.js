const CACHE_NAME = 'workout-app-v104-rope-french-press-20261107';
const APP_VERSION = '1.4.14-20261107';
const META_CACHE = 'workout-app-update-state';

// Risorse statiche dell'applicazione
const ASSETS_TO_CACHE = [
  '/js/headerScroll.js',
  '/js/trainingResumeUI.js',
  '/mycoatch/trainingResume.js',
  '/js/cloudPayload.js',
  '/mycoatch/longProgram.js',
  '/mycoatch/sessionSequence.js',
  '/mycoatch/aiExchange.js',
  '/mycoatch/warmupPlan.js',
  '/mycoatch/equipmentSubstitution.js',
  '/js/warmupUI.js',
  '/mycoatch/dumbbellInventory.js',
  '/js/appUpdates.js',
  '/js/circuitTransition.js',
  '/mycoatch/recoveryContext.js',
  '/mycoatch/repProgression.js',
  '/js/syncPrimitives.js',
  '/js/coachArchive.js',
  '/mycoatch/setReview.js',
  '/mycoatch/seriesClarification.js',
  '/js/seriesReviewUI.js',
  '/js/sessionSkip.js',
  '/js/sessionSkipUI.js',
  '/mycoatch/seriesTechnique.js',
  '/mycoatch/sessionFeedback.js',
  '/js/sessionFeedbackUI.js',
  '/js/exerciseHistoryUI.js',
  '/mycoatch/coachCommunication.js',
  '/js/exerciseCoachUI.js',
  '/mycoatch/generationSchedule.js',
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/css/style.css',
  '/js/main.js',
  '/js/journalTransaction.js',
  '/js/activeExercise.js',
  '/js/importPreview.js',
  '/mycoatch/importIdentity.js',
  '/mycoatch/nextExposure.js',
  '/mycoatch/setPrescription.js',
  '/mycoatch/trainingHistory.js',
  '/mycoatch/protocolLoad.js',
  '/mycoatch/highRepProgression.js',
  '/mycoatch/trainingPlan.js',
  '/mycoatch/limitationsReview.js',
  '/js/analytics.js',
  '/js/vendor/supabase.js',
  '/js/vendor/chart.js',
  '/js/vendor/jspdf.js',
  '/js/config.js',
  '/js/state.js',
  '/js/auth.js',
  '/js/accountManager.js',
  '/js/manual.js',
  '/js/audio.js',
  '/js/bottomSheet.js',
  '/js/theme.js',
  '/js/bannerSviluppo.js',
  '/js/gestures.js',
  '/js/charts.js',
  '/js/storage.js',
  '/js/journalStore.js',
  '/js/historyWindow.js',
  '/mycoatch/planMetadata.js',
  '/mycoatch/prescribedLoad.js',
  '/mycoatch/essentialCoverage.js',
  '/mycoatch/recentEvidence.js',
  '/mycoatch/durationCalibration.js',
  '/mycoatch/crossExposureLoad.js',
  '/mycoatch/closureHandoff.js',
  '/mycoatch/stallResponse.js',
  '/js/sync.js',
  '/js/fullBackup.js',
  '/js/coachPreviewUI.js',
  '/js/mesocyclePdfModel.js',
  '/js/mesocyclePdfCoachReport.js',
  '/js/mesocycle.js',
  '/js/mesocycleClosure.js',
  '/js/mesocycleClosureUI.js',
  '/js/mesocycleReminder.js',
  '/js/pdfExport.js',
  '/js/importer.js',
  '/js/ui.js',
  '/js/workoutEvents.js',
  '/js/exerciseCard.js',
  '/js/setPrefill.js',
  '/js/rpeStepper.js',
  '/js/repsStepper.js',
  '/js/setVolumeComparison.js',
  '/js/futureLoadReviewUI.js',
  '/js/workoutSemantics.js',
  '/js/liveCoachUI.js',
  '/js/weeklyReviewUI.js',
  '/js/sessionTimer.js',
  '/js/historySafety.js',
  '/js/csvHandler.js',
  '/js/timer.js',
  '/js/helpers.js',
  '/js/restPolicy.js',
  '/js/trainingTechniques.js',
  '/js/dropSetUI.js',
  '/js/circuitUI.js',
  '/js/equipmentUI.js',
  '/mycoatch/userPreferences.js',
  '/mycoatch/index.js',
  '/mycoatch/state.js',
  '/mycoatch/autoregulation.js',
  '/mycoatch/engine.js',
  '/mycoatch/sessionSelection.js',
  '/mycoatch/coachGuardrails.js',
  '/mycoatch/recoveryScope.js',
  '/mycoatch/prescriptionPolicy.js',
  '/mycoatch/intensityTechniquePolicy.js',
  '/mycoatch/exercisesDB.js',
  '/mycoatch/exerciseInstructions.js',
  '/mycoatch/exerciseSelection.js',
  '/mycoatch/athleteProfile.js',
  '/mycoatch/profileJournal.js',
  '/mycoatch/reviewDossier.js',
  '/mycoatch/bodyweight.js',
  '/mycoatch/bodyweightProposal.js',
  '/mycoatch/mesocycleAnalysis.js',
  '/mycoatch/calibrationReview.js',
  '/mycoatch/weeklyCoverage.js',
  '/mycoatch/volumeAccounting.js',
  '/mycoatch/muscleCatalog.js',
  '/mycoatch/catalogLookup.js',
  '/mycoatch/muscleWorkReport.js',
  '/js/exerciseLoadSummary.js',
  '/js/exerciseTargetUI.js',
  '/js/sessionMusclesUI.js',
  '/js/muscleWorkUI.js',
  '/mycoatch/exerciseIdentity.js',
  '/mycoatch/mesocycleComparison.js',
  '/mycoatch/macrocyclePlanner.js',
  '/mycoatch/periodizationPolicy.js',
  '/mycoatch/mycoatch-adapter.js',
  '/mycoatch/liveCoach.js',
  '/mycoatch/loadProposal.js',
  '/mycoatch/userDefaults.js',
  '/js/userDefaultsUI.js',
  '/mycoatch/nextSessionReps.js',
  '/mycoatch/barbellInventory.js',
  '/mycoatch/futureLoadReview.js',
  '/mycoatch/sessionReadiness.js',
  '/mycoatch/weeklyReview.js',
  '/mycoatch/liveHistory.js',
  '/mycoatch/historyAnalysis.js',
  '/mycoatch/historyInsights.js',
  '/mycoatch/adaptiveDecisions.js',
  '/mycoatch/progressionPolicy.js',
  '/mycoatch/weeklyVolumeBalancer.js',
  '/mycoatch/groupOptimizer.js',
  '/mycoatch/timeEstimator.js'
];

// Keep each open document on its own static bundle. This also supports old
// clients whose cache-first worker had no update button or message listener.
const isVersionCache=key=>key.startsWith('workout-app-')&&key!==META_CACHE;
const versionCaches=async()=> (await caches.keys()).filter(isVersionCache);
const generation=name=>Number(name.match(/^workout-app-v(\d+)-/)?.[1]||0);
const olderCaches=async()=> (await versionCaches()).filter(name=>generation(name)<generation(CACHE_NAME));
const clientKey=id=>new URL('/__homegym_updates__/client/'+encodeURIComponent(id),self.location.origin).href;
async function pinClient(id,names){
  if(!id)return;
  const meta=await caches.open(META_CACHE);
  await meta.put(clientKey(id),new Response(JSON.stringify({names,at:Date.now()}),{headers:{'Content-Type':'application/json'}}));
}
async function clientCaches(id){
  if(id){
    const record=await (await caches.open(META_CACHE)).match(clientKey(id));
    if(record)return (await record.json()).names;
  }
  // The legacy worker used caches.match across caches in creation order.
  const older=await olderCaches();
  return older.length?older:[CACHE_NAME];
}
async function pruneCaches(){
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const live=new Set(windows.map(client=>client.id)),keep=new Set([CACHE_NAME]);
  const meta=await caches.open(META_CACHE);
  for(const request of await meta.keys()){
    const id=decodeURIComponent(new URL(request.url).pathname.split('/').at(-1));
    const record=await meta.match(request);
    if(!record)continue; // Another worker may have removed a stale pin.
    const data=await record.json();
    // A navigation can have a resultingClientId before clients.matchAll sees it.
    if(live.has(id)||Date.now()-data.at<60000)data.names.forEach(name=>keep.add(name));
    else await meta.delete(request);
  }
  // An older worker can still be finishing an event while a newer one installs.
  // It must never delete a cache belonging to a newer release.
  for(const name of await olderCaches())if(!keep.has(name))await caches.delete(name);
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    // Bypass HTTP caches too, so a new bundle cannot contain old JS files.
    await cache.addAll(ASSETS_TO_CACHE.map(path=>new Request(path,{cache:'reload'})));
    // Activation installs the router; it never reloads an open workout.
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const older=await olderCaches();
    for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){
      const existing=await (await caches.open(META_CACHE)).match(clientKey(client.id));
      if(!existing)await pinClient(client.id,older.length?older:[CACHE_NAME]);
    }
    await self.clients.claim();
    for(const client of await self.clients.matchAll({type:'window'}))
      client.postMessage({type:'APP_UPDATE_READY',version:APP_VERSION});
    await pruneCaches();
  })());
});
self.addEventListener('message',event=>{
  const reply=data=>event.ports?.[0]?.postMessage(data);
  if(event.data?.type==='GET_APP_VERSION')reply({version:APP_VERSION});
  if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting().then(()=>reply({activating:true})));
  if(event.data?.type==='PIN_APP_VERSION')event.waitUntil((async()=>{
    const names=[];
    for(const name of await versionCaches()){
      const config=await (await caches.open(name)).match('/js/config.js');
      const version=config&&(await config.text()).match(/APP_VERSION\s*:\s*['"]([^'"]+)['"]/)?.[1];
      if(version===event.data.version)names.push(name);
    }
    if(names.length&&event.source?.id)await pinClient(event.source.id,names);
    reply({pinned:names.length>0});
    await pruneCaches();
  })());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Network APIs, auth and external origins retain real network semantics.
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  const navigation=event.request.mode==='navigate'&&(url.pathname==='/'||url.pathname==='/index.html');
  if(navigation){
    event.respondWith((async()=>{
      // Do not change the old document's pin until this navigation commits.
      await pinClient(event.resultingClientId,[CACHE_NAME]);
      const shell=await (await caches.open(CACHE_NAME)).match('/index.html');
      return shell||fetch(event.request);
    })());return;
  }
  if(!ASSETS_TO_CACHE.includes(url.pathname))return;
  event.respondWith((async()=>{
    for(const name of await clientCaches(event.clientId)){
      const cached=await (await caches.open(name)).match(event.request);
      if(cached)return cached;
    }
    return fetch(event.request);
  })());
});

