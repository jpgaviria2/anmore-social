// One-way retirement of the former offline app shell. Do not cache feed or identities.
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("anmore-social-pwa-"))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  ),
);
