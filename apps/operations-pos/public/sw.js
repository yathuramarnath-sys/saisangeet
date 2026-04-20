// DineX POS — Service Worker v1
// Strategy: cache-first for app shell, network-only for API calls

const CACHE_NAME = "dinex-pos-v1";

// App shell assets to pre-cache on install
const PRECACHE_URLS = ["/", "/index.html"];

// Never cache these — always live
const NETWORK_ONLY = ["/api/", "/socket.io/"];

// ── Install: cache app shell ─────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for assets ─────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API/socket calls — always network
  if (request.method !== "GET") return;
  if (NETWORK_ONLY.some((path) => url.pathname.startsWith(path))) return;
  // Skip cross-origin requests (fonts, CDN)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      // For HTML — network first so we always get latest app shell
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

      // For JS/CSS/images — cache first, fetch+update in background
      if (cached) {
        // Refresh cache in background
        fetch(request).then((fresh) => {
          if (fresh.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(request, fresh));
          }
        });
        return cached;
      }

      // Not cached — fetch and cache
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

// ── Push notifications (future use) ─────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || "DineX POS", {
    body: data.body || "",
    icon: "/icon-pos.svg",
    badge: "/icon-pos.svg",
    tag: data.tag || "dinex-pos"
  });
});
