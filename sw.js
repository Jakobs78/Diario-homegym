const CACHE_NAME = 'workout-app-v50-visible-closure-consents-20261018';

// Risorse statiche dell'applicazione
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/css/style.css',
  '/js/main.js',
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
  '/mycoatch/recentEvidence.js',
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
  '/js/pdfParser.js',
  '/js/pdfTextMapper.js',
  '/js/ui.js',
  '/js/workoutEvents.js',
  '/js/exerciseCard.js',
  '/js/setPrefill.js',
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
  '/mycoatch/exerciseSelection.js',
  '/mycoatch/athleteProfile.js',
  '/mycoatch/calibrationReview.js',
  '/mycoatch/weeklyCoverage.js',
  '/mycoatch/volumeAccounting.js',
  '/mycoatch/exerciseIdentity.js',
  '/mycoatch/mesocycleComparison.js',
  '/mycoatch/macrocyclePlanner.js',
  '/mycoatch/periodizationPolicy.js',
  '/mycoatch/mycoatch-adapter.js',
  '/mycoatch/liveCoach.js',
  '/mycoatch/loadProposal.js',
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          // Only remove old HomeGym caches; never touch other origin caches.
          if (key.startsWith('workout-app-') && key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Escludi le chiamate a Supabase o API esterne dalla cache statica
  if (url.hostname.includes('supabase.co')) {
    // Strategia Network Only o Network First con fallback sui dati locali (LocalStorage/IndexedDB)
    event.respondWith(
      fetch(event.request).catch(() => {
        // Se sei offline e fallisce la chiamata a Supabase, puoi gestire un fallback 
        // o lasciare che l'app gestisca l'errore leggendo dal LocalStorage
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 2. Strategia Cache First per tutte le risorse statiche dell'app
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Opzionale: memorizza dinamicamente nuove risorse fetchate
        return networkResponse;
      }).catch(() => {
        // Fallback generico offline (es. pagina di fallback o index.html per SPA)
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
