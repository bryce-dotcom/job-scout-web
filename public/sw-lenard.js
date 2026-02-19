const CACHE_NAME = 'lenard-srp-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(['/agent/lenard-az-srp'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/functions/v1/')) return;
  if (e.request.url.includes('api.anthropic.com')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return resp;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
