// Service Worker Salva nella memoria del dispositivo l'HTML, il CSS, tutti i JS e anche le librerie CDN esterne
// gestisce l'uso della webapp quando è offline
const CACHE_NAME = 'homegym-diary-v1';

// File locali e librerie CDN da salvare in cache per l'uso offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './js/state.js',
  './js/storage.js',
  './js/sync.js',
  './js/auth.js',
  './js/config.js',
  './js/helpers.js',
  './js/ui.js',
  './js/csvHandler.js',
  './js/pdfExport.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// 1. Inizializzazione: Salva tutti i file nella cache del dispositivo
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Pulizia vecchie cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. Risposta alle richieste: serve prima dalla Cache, altrimenti usa la Rete
self.addEventListener('fetch', (event) => {
  // Ignora le chiamate API dirette a Supabase (vengono gestite via codice in sync.js)
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // Ritorna il file salvato locale (velocissimo e offline)
      }
      return fetch(event.request).catch(() => {
        // Se si ricarica la pagina ed è offline, forza il ritorno all'index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});