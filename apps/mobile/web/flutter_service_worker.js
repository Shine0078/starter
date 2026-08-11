// Migration-only worker for clients that still run an older Flutter bootstrap.
// FINVERSE deliberately does not use Flutter's deprecated cache-first service
// worker: sensitive financial screens need fresh auth/API state, and an old
// cached main.dart.js can strand iPhone users on the launch screen. This file
// is kept in the web source so both the API static host and the public Nginx
// host serve the exact same cleanup behavior.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      await self.registration.unregister();
    })(),
  );
});
