const CACHE_NAME = 'workout-app-v73-unified-coach-notes-20261025';

// Risorse statiche dell'applicazione
const ASSETS_TO_CACHE = [
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
  '/mycoatch/nextExposure.js',
  '/mycoatch/setPrescription.js',
  '/mycoatch/trainingHistory.js',
  '/mycoatch/protocolLoad.js',
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
  '/js/pdfParser.js',
  '/js/pdfTextMapper.js',
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Wait for existing app sessions to close; never replace code mid-workout.
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

  // 1. Authentication, database and storage APIs must behave like real
  // network requests, including real network failures while offline.
  // Do NOT synthesize an HTTP 200 JSON {"error":"offline"} response:
  // that disguises a failed request as a transport success to Supabase SDK.
  if (url.hostname === 'supabase.co' || url.hostname.endsWith('.supabase.co')) {
    return; // No respondWith: the browser propagates the network error.
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
