// Owner-authorized successor to the retirement worker. Never persist community data.
const OFFLINE_CACHE = "anmore-social-offline-v1";
// An exact allowlist, not an asset/app-shell cache. No runtime writes.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const root = new URL("./", self.registration.scope);
  const landing =
    url.origin === root.origin &&
    (url.pathname === root.pathname ||
      url.pathname === root.pathname + "index.html") &&
    (url.search === "" || url.search === "?source=pwa");
  const staticOffline =
    url.href === new URL("offline.html", root).href ||
    url.href === new URL("offline.css", root).href;
  if (
    request.method !== "GET" ||
    (!staticOffline && !(landing && request.mode === "navigate"))
  )
    return;
  event.respondWith(
    (async () => {
      if (staticOffline)
        return (await caches.open(OFFLINE_CACHE)).match(request);
      try {
        return await fetch(request, { cache: "no-store" });
      } catch {
        return (await caches.open(OFFLINE_CACHE)).match("./offline.html");
      }
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (
    event.data?.type === "ACTIVATE_OFFLINE_UPDATE" &&
    event.source?.url &&
    new URL(event.source.url).origin === self.location.origin
  )
    event.waitUntil(self.skipWaiting());
});
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(["./offline.html", "./offline.css"])),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("anmore-social-pwa-") ||
              (key.startsWith("anmore-social-offline-") &&
                key !== OFFLINE_CACHE),
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
