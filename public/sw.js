// AVANT CELL — service worker: app instalável + tolerância a rede ruim.
//
// v2. A v1 servia do cache, para sempre, tudo em /_next/static/ e toda imagem
// de public/. Em produção os arquivos do Next têm hash no nome, mas em
// desenvolvimento não — e as imagens de public/ nunca têm. Resultado: o
// navegador ficava preso a versões antigas da interface (ex.: a logo) mesmo
// com o servidor entregando a nova.
//
// Este arquivo é o único que o navegador sempre confere direto no servidor,
// então é daqui que a correção chega a quem já tem a v1 instalada.
const CACHE = "avantcell-v2";
const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      /* apaga o cache de qualquer versão anterior */
      const chaves = await caches.keys();
      await Promise.all(chaves.filter((k) => k !== CACHE || LOCAL).map((k) => caches.delete(k)));

      if (LOCAL) {
        /* em desenvolvimento não há o que guardar: sai de cena e recarrega as
           abas abertas, para elas pegarem a versão atual do servidor */
        await self.registration.unregister();
        const abas = await self.clients.matchAll({ type: "window" });
        for (const aba of abas) aba.navigate(aba.url).catch(() => {});
        return;
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (e) => {
  if (LOCAL) return; /* nunca intercepta em desenvolvimento */
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  /* Arquivos do build de produção: o nome muda a cada build, então pode vir
     do cache sem risco de ficar desatualizado. */
  if (url.pathname.startsWith("/_next/static/")) {
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

  /* Imagens de public/ (logos, ícones): mesmo nome entre versões. Responde
     com o cache para ser rápido, mas sempre busca a atual no servidor e
     atualiza o cache — a próxima abertura já mostra a nova. */
  if (/\.(png|ico|svg|webp|jpe?g|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        const rede = fetch(e.request)
          .then((res) => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit ?? rede;
      })
    );
    return;
  }

  /* Navegação: network-first, com o cache só como plano B para rede ruim */
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match("/dashboard")))
    );
  }
});
