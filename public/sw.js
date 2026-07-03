// Investure service worker — basic offline shell + cache-first for static
const CACHE = "investure-v3";
const APP_SHELL = ["/", "/login", "/dashboard"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {
        // Pre-cache failures shouldn't block install.
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Skip cross-origin (CoinGecko API, Firebase, fonts CDN)
  if (url.origin !== self.location.origin) return;
  // Skip Next.js dev hot-reload + HMR
  if (url.pathname.startsWith("/_next/webpack-hmr") || url.pathname.startsWith("/__nextjs")) return;

  // Always fetch the PWA manifest + app icons fresh, so an install (and the
  // home-screen icon it generates) always reflects the current branding rather
  // than a stale cached copy. Fall back to cache only when offline.
  if (
    url.pathname === "/manifest.json" ||
    /^\/(icon|apple-touch-icon|favicon)/.test(url.pathname)
  ) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Network-first for navigation requests (HTML pages)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/dashboard")))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((res) => {
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached)
    )
  );
});
