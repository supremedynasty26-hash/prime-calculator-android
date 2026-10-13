const CACHE_PREFIX = 'netcalc-shell-';
const CACHE_VERSION = 'v5e-3';
const SHELL_CACHE = CACHE_PREFIX + CACHE_VERSION;
const APP_SHELL = './';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.add(APP_SHELL)).catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API and AI responses are deliberately never cached.
  if (url.pathname.includes('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then(cache => cache.put(APP_SHELL, copy)).catch(() => undefined);
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(APP_SHELL);
      return cached || new Response('NetCalc is offline and its app shell has not been cached yet. Open the app while online once, then retry.', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }));
    return;
  }
  if (['script','style','worker','font','image'].includes(request.destination)) {
    event.respondWith(caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      });
    }));
  }
});
