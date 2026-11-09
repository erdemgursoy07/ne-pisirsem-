// Gidelim – uygulamayı telefonda saklayan katman (servis çalışanı)
// Sayfa: telefondaki hali anında açılır, güncel hali arkada indirilir (yeni sürüm bir sonraki açılışta) → hızlı ve internetsiz açılış
// Simgeler ve yazı tipleri: saklanandan anında
const V = "gidelim-v10";
const API = "https://gidelim-ai.erdemgursoy07.workers.dev";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  // önbellekleri atlayarak en güncel dosyaları al
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== "gidelim-fonts").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  // Yapay zeka ve konum servisleri her zaman canlı
  if (u.hostname.endsWith("workers.dev") || u.hostname.includes("nominatim")) return;
  // Yazı tipleri: saklanandan
  if (u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open("gidelim-fonts").then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req); if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r;
    }));
    return;
  }
  if (u.origin !== location.origin) return;
  // Sayfanın kendisi: telefondaki hali anında aç, güncel hali arkada indirip bir sonraki açılış için sakla
  if (req.mode === "navigate" || u.pathname.endsWith(".html") || u.pathname.endsWith("/")) {
    e.respondWith((async () => {
      const c = await caches.open(V);
      const cached = await c.match(req, { ignoreSearch: true }) || await c.match("./index.html") || await c.match("./");
      const oldText = cached ? await cached.clone().text() : null;
      // GitHub'ın önbelleğini de atla: her kontrolde benzersiz adres
      const fresh = new URL(req.url); fresh.searchParams.set("_v", Date.now().toString(36));
      const net = fetch(fresh.href, { cache: "no-store", credentials: "same-origin" }).then(async r => {
        if (r.ok) {
          const txt = await r.clone().text();
          await c.put(req, r.clone()); await c.put("./index.html", r.clone());
          // Yeni sürüm geldiyse açık sayfaya haber ver, kendini yenilesin
          if (oldText !== null && txt !== oldText) {
            const cs = await clients.matchAll({ type: "window", includeUncontrolled: true });
            cs.forEach(cl => cl.postMessage({ type: "gidelim-update" }));
          }
        }
        return r;
      });
      if (cached) { e.waitUntil(net.catch(() => {})); return cached; }
      return net;
    })());
    return;
  }
  // Diğer dosyalar: saklanandan, arkada güncelle
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

// ---- Bildirimler ----
// Sunucu içeriksiz bir "yeni bir şey var" sinyali yollar; telefon ne olduğunu sunucuya sorup gösterir.
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let items = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch(API + "/db/notifs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        items = ((await r.json()) || {}).items || [];
      }
    } catch {}
    const n = items[0] || { title: "Gidelim", text: "Yeni bir gelişme var" };
    await self.registration.showNotification((n.poll ? "🗳️ " : "") + (n.title || "Gidelim"), { body: n.text, icon: "icon-192.png", badge: "icon-192.png", tag: "g" + (n.id || Date.now()), data: { poll: n.poll || "" } });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const poll = e.notification.data && e.notification.data.poll;
  const url = new URL("./" + (poll ? "#oy-" + poll : "#listem"), self.registration.scope).href;
  e.waitUntil((async () => {
    const cs = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of cs) { try { if ("navigate" in c) await c.navigate(url); return c.focus(); } catch {} }
    return clients.openWindow(url);
  })());
});
