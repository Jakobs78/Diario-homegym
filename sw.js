const CACHE_NAME = 'workout-app-v1';

// Risorse statiche dell'applicazione
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/main.js',
  '/js/ui.js',
  '/js/vector/jspdf.js',
  '/js/vector/chart.js',
  '/js/vector/supabase.js',
  // Aggiungi qui gli altri moduli JS o asset statici essenziali
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
          if (key !== CACHE_NAME) {
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