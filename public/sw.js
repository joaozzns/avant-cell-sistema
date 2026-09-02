// AVANT CELL — service worker: app instalável + tolerância a rede ruim.
// Estratégia: network-first para navegação (dados sempre frescos),
// cache-first para assets estáticos do Next.
const CACHE = "avantcell-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // Assets versionados do Next: cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.match(/\.(png|ico|svg|woff2?)$/)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }

  // Navegação: network-first com fallback ao cache (rede ruim no balcão)
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone())).catch(() => {});
          return res.clone();
        })
        .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match("/dashboard")))
    );
  }
});
