/* Bugün ne pişirsem? çevrimdışı önbellek. Büyük bir güncellemede sürüm numarasını artır. */
const CACHE = "pisir-v70";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && !k.startsWith("pisir-ses")).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Canlı veriler (yapay zekâ, ortak sayaç): hiç önbelleğe alma
  if (url.hostname.endsWith("workers.dev")) return;
  const save = res => { if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  // Vikipedi bilgileri: önce internet, yoksa kayıtlı olan
  if (url.hostname.endsWith("wikipedia.org")) {
    e.respondWith(fetch(req).then(save).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === "navigate") {
    // Sayfayı sunucudan en güncel hâliyle iste (GitHub Pages'in 10 dakikalık önbelleğini atla).
    // İnternet yavaşsa 3 saniye sonra kayıtlı sürümü hemen göster; yenisi arka planda inip bir sonraki açılışa hazır olur.
    const net = fetch(req.url, {cache:"no-cache", credentials:"same-origin"}).then(res => { if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; });
    const cached = () => caches.match(req).then(hit => hit || caches.match("./index.html"));
    e.waitUntil(net.catch(() => {}));
    e.respondWith(new Promise(resolve => {
      let done = false;
      const t = setTimeout(() => { cached().then(hit => { if (hit && !done){ done = true; resolve(hit); } }); }, 3000);
      net.then(res => { if (!done){ done = true; clearTimeout(t); resolve(res); } })
         .catch(() => { clearTimeout(t); cached().then(hit => { if (!done){ done = true; resolve(hit || Response.error()); } }); });
    }));
    return;
  }
  // Görseller, yazı tipleri vb.: önce kayıtlı olan
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(save)));
});
