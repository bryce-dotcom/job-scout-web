// This service worker is deprecated — caching is now handled by the main Vite PWA sw.js.
// This file self-unregisters so existing installations clean themselves up.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.registration.unregister());
