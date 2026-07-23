// Investure service worker — offline shell + cache-first for static + game asset pre-cache
const CACHE = "investure-v5";
const APP_SHELL = ["/", "/login", "/dashboard"];

// Game assets pre-cached at install so Reef and Tongits load instantly on
// repeat visits — same experience as a downloaded native app.
const GAME_ASSETS = [
  // Tongits
  "/tongits/lobby-full.png",
  "/tongits/waiting-room.png",
  "/tongits/seat-occupied.png",
  "/tongits/seat-empty.png",
  "/tongits/action-buttons-4.png",
  "/tongits/action-buttons-5.png",
  "/tongits/table.png",
  "/tongits/victory-popup.png",
  // Color Game
  "/colorgame/bg-full.png",
  "/colorgame/dice/die_face_red.png",
  "/colorgame/dice/die_face_blue.png",
  "/colorgame/dice/die_face_yellow.png",
  "/colorgame/dice/die_face_pink.png",
  "/colorgame/dice/die_face_white.png",
  "/colorgame/dice/die_face_green.png",
  // Reef core
  "/reef/bg-fishing-spots.webp",
  "/reef/hud.webp",
  "/reef/rod.webp",
  "/reef/bobber.webp",
  "/reef/fish-collection.webp",
  "/reef/legendary-catch-bg.webp",
  "/reef/perfect-hook.webp",
  "/reef/treasure-chest.webp",
  "/reef/splash-large.webp",
  "/reef/splash-legendary.webp",
  "/reef/splash-medium.webp",
  "/reef/splash-small.webp",
  // Reef fish — common
  "/reef/fish/common/anchovy.webp",
  "/reef/fish/common/bluegill.webp",
  "/reef/fish/common/carp.webp",
  "/reef/fish/common/catfish.webp",
  "/reef/fish/common/goby.webp",
  "/reef/fish/common/herring.webp",
  "/reef/fish/common/mackerel.webp",
  "/reef/fish/common/milkfish.webp",
  "/reef/fish/common/perch.webp",
  "/reef/fish/common/sardines.webp",
  "/reef/fish/common/snapper.webp",
  "/reef/fish/common/tilapia.webp",
  // Reef fish — uncommon
  "/reef/fish/uncommon/barracuda.webp",
  "/reef/fish/uncommon/butterflyfish.webp",
  "/reef/fish/uncommon/lionfish.webp",
  "/reef/fish/uncommon/pufferfish.webp",
  "/reef/fish/uncommon/red-snapper.webp",
  "/reef/fish/uncommon/salmon.webp",
  "/reef/fish/uncommon/surgeonfish.webp",
  "/reef/fish/uncommon/trout.webp",
  "/reef/fish/uncommon/tuna.webp",
  "/reef/fish/uncommon/yellowtail.webp",
  // Reef fish — rare
  "/reef/fish/rare/angelfish.webp",
  "/reef/fish/rare/arowana.webp",
  "/reef/fish/rare/clownfish.webp",
  "/reef/fish/rare/electric-eel.webp",
  "/reef/fish/rare/flying-fish.webp",
  "/reef/fish/rare/koi.webp",
  "/reef/fish/rare/mandarin-fish.webp",
  "/reef/fish/rare/moorish-idol.webp",
  "/reef/fish/rare/seahorse.webp",
  "/reef/fish/rare/triggerfish.webp",
  // Reef fish — epic
  "/reef/fish/epic/giant-grouper.webp",
  "/reef/fish/epic/giant-octopus.webp",
  "/reef/fish/epic/giant-stingray.webp",
  "/reef/fish/epic/giant-trevally.webp",
  "/reef/fish/epic/marlin.webp",
  "/reef/fish/epic/napoleon-wrasse.webp",
  "/reef/fish/epic/sailfish.webp",
  "/reef/fish/epic/sword-fish.webp",
  // Reef fish — legendary
  "/reef/fish/legendary/coelacanth.webp",
  "/reef/fish/legendary/manta-ray.webp",
  "/reef/fish/legendary/oarfish.webp",
  "/reef/fish/legendary/sunfish-mola-mola.webp",
  "/reef/fish/legendary/whale-shark.webp",
  // Reef fish — mythic
  "/reef/fish/mythic/celestial-whale.webp",
  "/reef/fish/mythic/crystal-koi.webp",
  "/reef/fish/mythic/golden-dragonfish.webp",
  "/reef/fish/mythic/leviathan-eel.webp",
  "/reef/fish/mythic/phantom-shark.webp",
  // Reef fish — divine
  "/reef/fish/divine/ancient-ocean-dragon.webp",
  "/reef/fish/divine/poseidon-s-guardian.webp",
  "/reef/fish/divine/sea-phoenix.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([...APP_SHELL, ...GAME_ASSETS]).catch(() => {
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

  // Cache-first for static assets (images, JS, CSS, game assets)
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
