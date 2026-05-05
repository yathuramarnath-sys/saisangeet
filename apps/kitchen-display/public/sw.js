// DineX KDS — Service Worker v3
// Strategy: network-first for HTML, stale-while-revalidate for hashed assets.
// Bumping CACHE_NAME forces ALL browsers to clear old caches and reload fresh code.

const CACHE_NAME = "dinex-kds-v3";
const NETWORK_ONLY = ["/api/", "/socket.io/"];

self.addEventListener("install", (event) => {
  // Take over immediately — don't wait for old SW to finish
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  // Delete ALL old caches so browsers immediately get fresh assets
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (NETWORK_ONLY.some((path) => url.pathname.startsWith(path))) return;
  if (url.origin !== self.location.origin) return;

  // Always network-first so new deploys are picked up immediately
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || "DineX KDS", {
    body: data.body || "",
    icon: "/icon-kds.svg",
    badge: "/icon-kds.svg",
    tag: data.tag || "dinex-kds"
  });
});
