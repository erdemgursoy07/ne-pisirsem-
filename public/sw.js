// Uygulamanın internetsiz de açılmasını sağlar. Dosyaları değiştirdiğinde SURUM'u artır.
const SURUM = 'v11';
const DOSYALAR = ['./', './index.html', './gizlilik.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SURUM).then(c => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SURUM).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/api/')) return; // yapay zekâ isteklerine dokunma
  if (url.origin !== location.origin) return;
  // Önce internetten dene (güncel kalsın), olmazsa kayıtlı kopyayı göster
  e.respondWith(
    fetch(e.request).then(res => {
      const kopya = res.clone();
      caches.open(SURUM).then(c => c.put(e.request, kopya));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
