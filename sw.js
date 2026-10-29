/* Bugün ne pişirsem? çevrimdışı önbellek. Büyük bir güncellemede sürüm numarasını artır (v1 -> v2). */
const CACHE = "pisir-v13";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const save = res => { if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  if (req.mode === "navigate"){
    // Sayfa: önce internetten en güncelini dene, yoksa kayıtlı olanı aç
    e.respondWith(fetch(req).then(save).catch(() => caches.match(req).then(hit => hit || caches.match("./index.html"))));
    return;
  }
  // Simge, yazı tipi vb.: önce kayıtlı olanı kullan
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(save)));
});
