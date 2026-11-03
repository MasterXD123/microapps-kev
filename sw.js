const CACHE_NAME = 'microapps-cache-v2';
const APP_SHELL = [
  './',
  './index.html',
  './apps-registry.json',
  './manifest.json',
  './icon.svg'
];

// Instalar Service Worker y pre-cachear el App Shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('Fallo pre-caching inicial, continuará en runtime:', err);
      });
    })
  );
});

// Activar y limpiar cachés anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia Offline-First: Cache first con fallback de red y guardado dinámico
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Solo gestionar peticiones GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Peticiones de navegación (cargar la app)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('./index.html');
          return fallback || new Response('Offline - MicroApps', {
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
    return;
  }

  // Recursos estáticos y CDNs (Tailwind, Google Fonts, etc.)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // En segundo plano revalidar si hay conexión
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // Si no está en caché, intentar red y cachear
      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || (networkResponse.status !== 200 && networkResponse.type !== 'opaque')) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        })
        .catch(async () => {
          // Si falla red y no hay caché, retornar fallback para recursos específicos
          if (request.destination === 'image') {
            return caches.match('./icon.svg');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
    })
  );
});
