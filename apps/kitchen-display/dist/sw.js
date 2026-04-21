// DineX KDS — Service Worker v1
// Strategy: cache-first for app shell, network-only for API/socket calls

const CACHE_NAME = "dinex-kds-v1";
const PRECACHE_URLS = ["/", "/index.html"];
const NETWORK_ONLY = ["/api/", "/socket.io/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (NETWORK_ONLY.some((path) => url.pathname.startsWith(path))) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const isHTML = request.headers.get("Accept")?.includes("text/html");

      if (isHTML) {
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, copy));
            }
            return response;
          })
          .catch(() => cached || caches.match("/index.html"));
      }

      if (cached) {
        fetch(request).then((fresh) => {
          if (fresh.ok) caches.open(CACHE_NAME).then((c) => c.put(request, fresh));
        });
        return cached;
      }

      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        }
        return response;
      });
    })
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
