/*
  Bugün ne pişirsem? yapay zekâ aracısı (Cloudflare Worker)
  Siteden gelen isteği Google Gemini'ye iletir; anahtar burada gizli kalır.

  Cloudflare'de tanımlanacak değişkenler (Settings > Variables and Secrets):
    GEMINI_API_KEY  -> Google AI Studio'dan alınan anahtar (tür: Secret)
    ALLOWED_ORIGIN  -> sitenin adresi, örneğin https://kullaniciadin.github.io (tür: Text)
    GEMINI_MODEL    -> isteğe bağlı; yazılırsa yalnızca bu model kullanılır
    TTS_VOICE       -> isteğe bağlı; yapay zekâ sesinin adı (varsayılan: Sulafat)
    ADMIN_KEY       -> isteğe bağlı (tür: Secret); site sahibinin her fotoğrafı kaldırabilmesi için gizli anahtar

  Ortak sayaç ve kullanıcı fotoğrafları için (Settings > Bindings > KV namespace):
    SAYAC           -> "pisir-sayac" adlı KV namespace'e bağlanır
*/

// Model listesi Google'dan otomatik alınır; Google bir modeli kaldırınca kendiliğinden güncellenir.
// Hızlı "Lite" modeller her zaman önce denenir.
const FALLBACK = ["gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"];
const TIMEOUT_MS = 15000; // bir model 15 saniyede cevap vermezse sıradakine geç

// Düşünmeyi en aza indiren ayarlar; model birini tanımazsa sıradakine geçilir.
const THINKING_OPTIONS = [
  { thinkingBudget: 0 },          // Gemini 2.5 nesli
  { thinkingLevel: "minimal" },   // yeni nesil modeller
  { thinkingLevel: "low" },
  null                            // hiçbiri kabul edilmezse varsayılan
];
const MAX_PROMPT = 9000;
const API = "https://generativelanguage.googleapis.com/v1beta";

let modelCache = null;
let modelCacheAt = 0;
let ttsCache = null;

// Konuşma (seslendirme) modelleri: Google'dan otomatik bulunur
async function getTtsModels(env) {
  if (ttsCache) return ttsCache;
  const fallback = ["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts"];
  try {
    const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error("liste");
    const d = await r.json();
    const names = (d.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => String(m.name || "").replace(/^models\//, ""))
      .filter(n => /tts/.test(n))
      .sort((a, b) => (/flash/.test(b) ? 1 : 0) - (/flash/.test(a) ? 1 : 0));
    ttsCache = names.length ? names.slice(0, 3) : fallback;
  } catch { ttsCache = fallback; }
  return ttsCache;
}

async function sha256(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}

// Yüklenen fotoğrafı yapay zekâyla kontrol et: yemek mi, uygun mu? (true / false / null = kontrol edilemedi)
async function checkPhoto(env, b64, dish) {
  const prompt = `Bu fotoğrafı bir kullanıcı, yemek tarifi uygulamasında "${dish}" tarifinin altına "ben de yaptım" diye yükledi.
Yalnızca şu JSON nesnesini döndür:
{"yemek": fotoğrafta pişmiş ya da hazırlanmış bir yemek, tatlı ya da içecek açıkça görünüyorsa true, değilse false,
 "eslesiyor": fotoğraftaki yemek "${dish}" ile uyumluysa true. Ev yapımı farklılıklar, farklı sunum ya da açı normaldir; ama tamamen farklı bir yemekse (örneğin patlıcan yemeği yerine kabak yemeği, çorba yerine tatlı) false,
 "uygun": çıplaklık, şiddet, kan, nefret sembolü, reklam yazısı, telefon numarası ya da tanınabilir bir kişinin yüzü YOKSA true, varsa false}`;
  for (const model of await getModels(env)) {
    let g;
    try {
      g = await fetch(`${API}/models/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: b64 } }, { text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
    } catch { continue; }
    if ([404, 429, 500, 503].includes(g.status)) continue;
    if (!g.ok) return null;
    const d = await g.json();
    const txt = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map(x => x.text || "").join("");
    try {
      const j = JSON.parse(txt.replace(/```json|```/g, "").trim());
      if (typeof j.yemek !== "boolean" || typeof j.uygun !== "boolean") return null;
      return { yemek: j.yemek, uygun: j.uygun, eslesiyor: j.eslesiyor !== false };
    } catch { return null; }
  }
  return null;
}

async function geminiJSON(env, prompt) {
  for (const model of await getModels(env)) {
    let g;
    try {
      g = await fetch(`${API}/models/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(25000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
    } catch { continue; }
    if ([404, 429, 500, 503].includes(g.status)) continue;
    if (!g.ok) return null;
    const d = await g.json();
    const txt = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map(x => x.text || "").join("");
    try { return JSON.parse(txt.replace(/```json|```/g, "").trim()); } catch { return null; }
  }
  return null;
}
// Fotoğraf + metinle Gemini'den JSON cevap al (modeller sırayla denenir)
async function geminiVisionJSON(env, b64, prompt) {
  for (const model of await getModels(env)) {
    let g;
    try {
      g = await fetch(`${API}/models/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(25000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: b64 } }, { text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
    } catch { continue; }
    if ([404, 429, 500, 503].includes(g.status)) continue;
    if (!g.ok) return null;
    const d = await g.json();
    const txt = ((d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []).map(x => x.text || "").join("");
    try { return JSON.parse(txt.replace(/```json|```/g, "").trim()); } catch { return null; }
  }
  return null;
}
async function sha1(t) {
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function getModels(env) {
  if (env.GEMINI_MODEL) return [env.GEMINI_MODEL];
  if (modelCache && modelCache.length && Date.now() - modelCacheAt < 6 * 3600 * 1000) return modelCache;
  try {
    const r = await fetch(`${API}/models?pageSize=200`, {
      headers: { "x-goog-api-key": env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) throw new Error("liste alınamadı");
    const d = await r.json();
    const names = (d.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => String(m.name || "").replace(/^models\//, ""))
      .filter(n => /flash/.test(n) && !/(image|tts|live|audio|embedding|exp|preview|thinking|vision)/.test(n));
    const version = n => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    const rank = n => (/lite/.test(n) ? 0 : 1);           // önce Lite modeller
    const alias = n => (/-latest$/.test(n) ? 0 : 1);       // aynı türde önce "latest"
    const list = names
      .sort((a, b) => (rank(a) - rank(b)) || (alias(a) - alias(b)) || (version(b) - version(a)))
      .slice(0, 5);
    if (!list.length) throw new Error("uygun model yok");
    modelCache = list;
    modelCacheAt = Date.now();
    return list;
  } catch {
    return FALLBACK;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean);
    const okOrigin = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin && origin ? origin : "null",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);

    // ---- Tarifte hata bildir (yalnızca yönetici okur) ----
    if (url.pathname === "/hata" || url.pathname === "/hata/liste" || url.pathname === "/hata/sil") {
      if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
      if (request.method !== "POST" || !env.SAYAC) return reply({ error: "Desteklenmeyen istek" }, 405, cors);
      let b;
      try { b = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
      const list = (await env.SAYAC.get("hb:list", "json")) || [];
      if (url.pathname === "/hata") {
        const key = typeof b.tarif === "string" ? b.tarif : "";
        const tur = typeof b.tur === "string" ? b.tur.slice(0, 40) : "";
        const metin = typeof b.metin === "string" ? b.metin.trim().slice(0, 300) : "";
        if (!/^b:.{1,80}$/.test(key) || (!tur && !metin)) return reply({ error: "Lütfen hatanın türünü seç ya da kısaca yaz." }, 400, cors);
        list.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), tarif: key, tur, metin });
        await env.SAYAC.put("hb:list", JSON.stringify(list.slice(0, 300)));
        return reply({ ok: true }, 200, cors);
      }
      const isAdmin = typeof b.admin === "string" && env.ADMIN_KEY && b.admin.length >= 8 && b.admin === env.ADMIN_KEY;
      if (!isAdmin) return reply({ error: "Bu bölüm yalnızca yönetici içindir." }, 403, cors);
      if (url.pathname === "/hata/liste") return reply({ liste: list }, 200, { ...cors, "Cache-Control": "no-store" });
      const id = typeof b.id === "string" ? b.id : "";
      await env.SAYAC.put("hb:list", JSON.stringify(list.filter(x => x.id !== id)));
      return reply({ ok: true }, 200, cors);
    }

    // ---- Verilerini taşı: 24 saat geçerli aktarma kodu ----
    if (url.pathname === "/aktar") {
      if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
      if (!env.SAYAC) return reply({ error: "Depo bağlı değil" }, 503, cors);
      if (request.method === "GET") {
        const kod = (url.searchParams.get("kod") || "").toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(kod)) return reply({ error: "Geçersiz kod" }, 400, cors);
        const veri = await env.SAYAC.get("ak:" + kod);
        if (!veri) return reply({ error: "Kod bulunamadı ya da süresi dolmuş." }, 404, { ...cors, "Cache-Control": "no-store" });
        return reply({ veri }, 200, { ...cors, "Cache-Control": "no-store" });
      }
      if (request.method === "POST") {
        let b;
        try { b = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
        const veri = typeof b.veri === "string" ? b.veri : "";
        if (!veri || veri.length > 400000) return reply({ error: "Aktarılacak veri çok büyük ya da boş." }, 400, cors);
        try { JSON.parse(veri); } catch { return reply({ error: "Geçersiz veri" }, 400, cors); }
        const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // karışabilecek harfler (O/0, I/1) yok
        const rnd = crypto.getRandomValues(new Uint8Array(6));
        const kod = [...rnd].map(x => abc[x % abc.length]).join("");
        await env.SAYAC.put("ak:" + kod, veri, { expirationTtl: 86400 });
        return reply({ kod }, 200, cors);
      }
      return reply({ error: "Desteklenmeyen istek" }, 405, cors);
    }

    // ---- Buzdolabı fotoğrafından malzeme tanıma (fotoğraf saklanmaz) ----
    if (url.pathname === "/tani") {
      if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
      if (request.method !== "POST") return reply({ error: "Yalnızca POST kabul edilir" }, 405, cors);
      if (!env.GEMINI_API_KEY) return reply({ error: "Fotoğraf şu an incelenemiyor." }, 503, cors);
      let b;
      try { b = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
      const image = typeof b.image === "string" ? b.image : "";
      if (image.length < 1000 || image.length > 900000 || !/^[A-Za-z0-9+/=]+$/.test(image)) return reply({ error: "Fotoğraf okunamadı, başka bir fotoğraf dene." }, 400, cors);
      const liste = (Array.isArray(b.liste) ? b.liste : []).filter(x => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string" && /^[a-z_]{2,30}$/.test(x[0])).slice(0, 250).map(x => [x[0], x[1].slice(0, 40)]);
      if (!liste.length) return reply({ error: "Geçersiz istek" }, 400, cors);
      const prompt = `Bu bir buzdolabı, dolap, tezgâh ya da market alışverişi fotoğrafı olabilir. Fotoğrafta AÇIKÇA görünen yiyecek malzemelerini bul.
Yalnızca şu listedeki kimlikleri kullan (kimlik: ad): ${liste.map(x => x[0] + ": " + x[1]).join(", ")}
Emin olmadığın hiçbir şeyi ekleme. Listede olmayan ama net görünen yiyecekleri "diger" alanına kısa Türkçe adıyla yaz.
Yalnızca şu JSON'u döndür: {"bulunan": ["kimlik", "..."], "diger": ["ad", "..."]}`;
      const out = await geminiVisionJSON(env, image, prompt);
      if (!out) return reply({ error: "Fotoğraf şu an incelenemiyor, biraz sonra tekrar dene." }, 503, cors);
      const valid = new Set(liste.map(x => x[0]));
      const bulunan = [...new Set((Array.isArray(out.bulunan) ? out.bulunan : []).filter(id => valid.has(id)))].slice(0, 40);
      const diger = (Array.isArray(out.diger) ? out.diger : []).filter(x => typeof x === "string" && x.trim()).map(x => x.trim().slice(0, 30)).slice(0, 12);
      return reply({ bulunan, diger }, 200, cors);
    }

    // ---- Puan ve yorumlar ----
    if (url.pathname === "/yorum" || url.pathname === "/yorum/sil") {
      if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
      if (!env.SAYAC) return reply({ yorumlar: [], error: "Depo bağlı değil" }, 200, cors);
      if (url.pathname === "/yorum" && request.method === "GET") {
        const key = url.searchParams.get("tarif") || "";
        if (!/^b:.{1,80}$/.test(key)) return reply({ error: "Geçersiz tarif" }, 400, cors);
        const list = (await env.SAYAC.get("yo:" + key, "json")) || [];
        return reply({ yorumlar: list.filter(x => !x.g).map(x => ({ id: x.id, s: x.s, m: x.m, t: x.t })) }, 200, { ...cors, "Cache-Control": "no-store" });
      }
      if (request.method !== "POST") return reply({ error: "Desteklenmeyen istek" }, 405, cors);
      let b;
      try { b = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
      const key = typeof b.tarif === "string" ? b.tarif : "";
      if (!/^b:.{1,80}$/.test(key)) return reply({ error: "Geçersiz tarif" }, 400, cors);
      if (url.pathname === "/yorum/sil") {
        const id = typeof b.id === "string" ? b.id : "", token = typeof b.token === "string" ? b.token : "";
        const isAdmin = typeof b.admin === "string" && env.ADMIN_KEY && b.admin.length >= 8 && b.admin === env.ADMIN_KEY;
        const list = (await env.SAYAC.get("yo:" + key, "json")) || [];
        const item = list.find(x => x.id === id);
        if (!item) return reply({ error: "Yorum bulunamadı." }, 404, cors);
        if (!isAdmin && (!item.h || item.h !== await sha256(token))) return reply({ error: "Bu yorumu yalnızca yazan kişi kaldırabilir." }, 403, cors);
        await env.SAYAC.put("yo:" + key, JSON.stringify(list.filter(x => x.id !== id)));
        return reply({ ok: true }, 200, cors);
      }
      const stars = Math.round(Number(b.yildiz));
      const text = typeof b.metin === "string" ? b.metin.trim().slice(0, 300) : "";
      if (!(stars >= 1 && stars <= 5)) return reply({ error: "Lütfen 1 ile 5 arasında yıldız ver." }, 400, cors);
      if (text) {
        if (!env.GEMINI_API_KEY) return reply({ error: "Yorum şu an kontrol edilemiyor." }, 503, cors);
        const v = await geminiJSON(env, `Bir yemek tarifi uygulamasına şu kullanıcı yorumu yazıldı: ${JSON.stringify(text)}
Yalnızca şu JSON'u döndür: {"uygun": yorumda küfür, hakaret, nefret söylemi, cinsellik, reklam, bağlantı, telefon numarası ya da kişisel bilgi YOKSA true, varsa false}`);
        if (!v || typeof v.uygun !== "boolean") return reply({ error: "Yorum şu an kontrol edilemiyor, biraz sonra tekrar dene." }, 503, cors);
        if (!v.uygun) return reply({ error: "Bu yorum paylaşıma uygun görünmüyor. Lütfen kibar ve yemekle ilgili bir yorum yaz." }, 422, cors);
      }
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const token = crypto.randomUUID();
      const list = (await env.SAYAC.get("yo:" + key, "json")) || [];
      list.unshift({ id, s: stars, m: text, t: Date.now(), h: await sha256(token) });
      await env.SAYAC.put("yo:" + key, JSON.stringify(list.slice(0, 100)));
      return reply({ ok: true, id, token }, 200, cors);
    }

    // ---- Şikâyet: 3 şikâyet alan fotoğraf ya da yorum otomatik gizlenir ----
    if (url.pathname === "/sikayet") {
      if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
      if (request.method !== "POST" || !env.SAYAC) return reply({ error: "Desteklenmeyen istek" }, 405, cors);
      let b;
      try { b = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
      const tur = b.tur === "yorum" ? "yorum" : b.tur === "foto" ? "foto" : "";
      const key = typeof b.tarif === "string" ? b.tarif : "", id = typeof b.id === "string" ? b.id : "";
      if (!tur || !/^b:.{1,80}$/.test(key) || !/^[a-z0-9]{6,30}$/.test(id)) return reply({ error: "Geçersiz istek" }, 400, cors);
      const sk = "sk:" + tur + ":" + id;
      const n = (Number(await env.SAYAC.get(sk)) || 0) + 1;
      await env.SAYAC.put(sk, String(n), { expirationTtl: 30 * 86400 });
      let hidden = false;
      if (n >= 3) {
        hidden = true;
        if (tur === "foto") await env.SAYAC.put("fd:" + id, "1", { expirationTtl: 30 * 86400 });
        else {
          const list = (await env.SAYAC.get("yo:" + key, "json")) || [];
          const item = list.find(x => x.id === id);
          if (item) { item.g = 1; await env.SAYAC.put("yo:" + key, JSON.stringify(list)); }
        }
      }
      return reply({ ok: true, gizlendi: hidden }, 200, cors);
    }

    // ---- Kullanıcı fotoğrafları: görsel dosyası (herkese açık) ----
    if (url.pathname === "/foto/img") {
      const id = url.searchParams.get("id") || "";
      if (!env.SAYAC || !/^[a-z0-9]{6,30}$/.test(id)) return new Response("Bulunamadı", { status: 404 });
      const b64 = await env.SAYAC.get("fo:" + id);
      if (!b64) return new Response("Bulunamadı", { status: 404 });
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return new Response(bin, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
    }

    // ---- Kullanıcı fotoğrafları: kendi fotoğrafını kaldır ----
    if (url.pathname === "/foto/sil") {
      if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
      if (request.method !== "POST") return reply({ error: "Yalnızca POST kabul edilir" }, 405, cors);
      if (!env.SAYAC) return reply({ error: "Fotoğraf deposu bağlı değil" }, 500, cors);
      let b;
      try { b = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
      const key = typeof b.tarif === "string" ? b.tarif : "";
      const id = typeof b.id === "string" ? b.id : "";
      const token = typeof b.token === "string" ? b.token : "";
      // Site sahibi ADMIN_KEY ile her fotoğrafı kaldırabilir (uygunsuz fotoğraflar ve eski yüklemeler için)
      const isAdmin = typeof b.admin === "string" && env.ADMIN_KEY && b.admin.length >= 8 && b.admin === env.ADMIN_KEY;
      if (!/^b:.{1,80}$/.test(key) || !/^[a-z0-9]{6,30}$/.test(id) || (!isAdmin && token.length < 20)) return reply({ error: "Geçersiz istek" }, 400, cors);
      // Silme anahtarının özeti fotoğrafla birlikte ayrıca saklanır: liste henüz güncellenmemiş olsa da kaldırılabilir
      const stored = await env.SAYAC.get("fs:" + id);
      const list = (await env.SAYAC.get("fi:" + key, "json")) || [];
      const item = list.find(x => x.id === id);
      const hash = stored || (item && item.s);
      if (!isAdmin && (!hash || hash !== await sha256(token))) return reply({ error: "Bu fotoğrafı yalnızca yükleyen kişi kaldırabilir." }, 403, cors);
      await env.SAYAC.delete("fo:" + id);
      if (stored) await env.SAYAC.delete("fs:" + id);
      await env.SAYAC.put("fd:" + id, "1", { expirationTtl: 3 * 86400 }); // "silindi" işareti: liste henüz güncellenmemişse de gizlenir
      if (item) await env.SAYAC.put("fi:" + key, JSON.stringify(list.filter(x => x.id !== id)));
      return reply({ ok: true }, 200, cors);
    }

    // ---- Kullanıcı fotoğrafları: liste ve yükleme ----
    if (url.pathname === "/foto") {
      if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
      if (!env.SAYAC) return reply({ fotos: [], error: "Fotoğraf deposu bağlı değil" }, 200, cors);
      if (request.method === "GET") {
        const key = url.searchParams.get("tarif") || "";
        if (!/^b:.{1,80}$/.test(key)) return reply({ error: "Geçersiz tarif" }, 400, cors);
        const list = (await env.SAYAC.get("fi:" + key, "json")) || [];
        // Kaldırılmış fotoğrafları ayıkla (silme anahtarı kaydı da silinmiş olanlar) ve listeyi kendiliğinden temizle
        const [alive, gone] = await Promise.all([
          Promise.all(list.map(x => x.s ? env.SAYAC.get("fs:" + x.id) : "eski")),
          Promise.all(list.map(x => env.SAYAC.get("fd:" + x.id)))
        ]);
        const clean = list.filter((x, i) => !gone[i] && (alive[i] || Date.now() - (x.t || 0) < 120000)); // yeni yüklenenler henüz her yere ulaşmamış olabilir
        if (clean.length !== list.length) await env.SAYAC.put("fi:" + key, JSON.stringify(clean)).catch(() => {});
        return reply({ fotos: clean.map(x => ({ id: x.id, t: x.t })) }, 200, { ...cors, "Cache-Control": "no-store" }); // her zaman güncel liste
      }
      if (request.method === "POST") {
        let b;
        try { b = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
        const key = typeof b.tarif === "string" ? b.tarif : "";
        const image = typeof b.image === "string" ? b.image : "";
        if (!/^b:.{1,80}$/.test(key)) return reply({ error: "Geçersiz tarif" }, 400, cors);
        if (image.length < 1000 || image.length > 700000 || !/^[A-Za-z0-9+/=]+$/.test(image)) return reply({ error: "Fotoğraf okunamadı, başka bir fotoğraf dene." }, 400, cors);
        if (!env.GEMINI_API_KEY) return reply({ error: "Fotoğraf şu an kontrol edilemiyor." }, 503, cors);
        const dish = key.slice(2);
        const v = await checkPhoto(env, image, dish);
        if (v === null) return reply({ error: "Fotoğraf şu an kontrol edilemiyor, biraz sonra tekrar dene." }, 503, cors);
        if (!v.uygun) return reply({ error: "Bu fotoğraf paylaşıma uygun görünmüyor." }, 422, cors);
        if (!v.yemek) return reply({ error: "Bu fotoğraf bir yemek fotoğrafı gibi görünmüyor." }, 422, cors);
        if (!v.eslesiyor) return reply({ error: `Bu fotoğraf ${dish} gibi görünmüyor. Lütfen bu tarifle yaptığın yemeğin fotoğrafını yükle.` }, 422, cors);
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const token = crypto.randomUUID(); // fotoğrafı yükleyen kişinin kaldırma anahtarı (yalnızca onun telefonunda saklanır)
        await env.SAYAC.put("fo:" + id, image);
        const list = (await env.SAYAC.get("fi:" + key, "json")) || [];
        const hash = await sha256(token);
        await env.SAYAC.put("fs:" + id, hash);
        list.unshift({ id, t: Date.now(), s: hash });
        await env.SAYAC.put("fi:" + key, JSON.stringify(list.slice(0, 30)));
        return reply({ ok: true, id, token }, 200, cors);
      }
      return reply({ error: "Desteklenmeyen istek" }, 405, cors);
    }

    // ---- İngilizce çeviri: her metin bir kez çevrilir, sonra herkes için hazırdır ----
    if (url.pathname === "/ceviri") {
      if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
      if (request.method !== "POST") return reply({ error: "Yalnızca POST kabul edilir" }, 405, cors);
      let b;
      try { b = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
      const texts = Array.isArray(b.texts) ? b.texts.filter(t => typeof t === "string" && t.trim() && t.length <= 600).slice(0, 30) : [];
      if (!texts.length) return reply({ map: {} }, 200, cors);
      const map = {};
      const keys = await Promise.all(texts.map(t => sha1(t)));
      if (env.SAYAC) {
        const got = await Promise.all(keys.map(k => env.SAYAC.get("ceviri:" + k)));
        got.forEach((v, i) => { if (v) map[texts[i]] = v; });
      }
      const todo = texts.filter(t => map[t] == null);
      if (todo.length && env.GEMINI_API_KEY) {
        const prompt = `You are translating a Turkish home-cooking app into natural, friendly English.
Translate every item of the JSON array below into English.
Rules: keep emojis, numbers, punctuation and quote marks; keep well-known Turkish dish names (Menemen, Lahmacun, Mantı, Baklava, Künefe, Börek, Pide) as they are; use common US cooking terms; never add notes or explanations.
Return ONLY a JSON array of strings with exactly ${todo.length} items, in the same order.

${JSON.stringify(todo)}`;
        const out = await geminiJSON(env, prompt);
        if (Array.isArray(out) && out.length === todo.length) {
          const writes = [];
          todo.forEach((t, i) => {
            if (typeof out[i] === "string" && out[i].trim()) {
              map[t] = out[i];
              if (env.SAYAC) writes.push(env.SAYAC.put("ceviri:" + keys[texts.indexOf(t)], out[i]).catch(() => {}));
            }
          });
          await Promise.all(writes);
        }
      }
      return reply({ map }, 200, cors);
    }

    // ---- Yapay zekâ sesi: pişirme adımlarını doğal bir sesle okur ----
    if (new URL(request.url).pathname === "/ses") {
      if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
      if (request.method !== "POST") return reply({ error: "Yalnızca POST kabul edilir" }, 405, cors);
      if (!env.GEMINI_API_KEY) return reply({ error: "GEMINI_API_KEY tanımlı değil" }, 500, cors);
      let b;
      try { b = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
      const text = typeof b.text === "string" ? b.text.trim() : "";
      if (!text || text.length > 600) return reply({ error: "Geçersiz metin" }, 400, cors);
      const voices = [env.TTS_VOICE || "Sulafat", "Kore"];
      for (const model of await getTtsModels(env)) {
        for (const voiceName of voices) {
          let g;
          try {
            g = await fetch(`${API}/models/${model}:generateContent`, {
              method: "POST",
              signal: AbortSignal.timeout(20000),
              headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
              body: JSON.stringify({
                contents: [{ parts: [{ text: b.lang === "en" ? `Read this aloud like a warm, cheerful friend cooking next to you in the kitchen: relaxed natural pace, a light smile in your voice, short natural pauses between sentences. In English: ${text}` : `Mutfakta yanında duran, gülümseyerek konuşan sıcakkanlı bir arkadaş gibi oku: doğal ve rahat bir hızla, cümleler arasında kısa nefes payları bırakarak, akıcı ve samimi bir sesle. Türkçe: ${text}` }] }],
                generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } }
              })
            });
          } catch { continue; }
          if (g.status === 400) continue;       // bu ses adı ya da ayar desteklenmiyor: sıradakini dene
          if (!g.ok) break;                     // kota doldu ya da model yok: sıradaki modele geç
          const data = await g.json();
          const part = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []).find(p => p.inlineData);
          if (part) return reply({ audio: part.inlineData.data, mime: part.inlineData.mimeType || "audio/L16;rate=24000" }, 200, cors);
        }
      }
      return reply({ error: "Ses şu an oluşturulamadı" }, 503, cors);
    }

    // ---- Ortak sayaç: uygulamada en çok pişirilen tarifler ----
    if (new URL(request.url).pathname === "/sayac") {
      if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
      if (!env.SAYAC) return reply({ top: [], note: "SAYAC bağlı değil" }, 200, cors);
      if (request.method === "GET") {
        const data = (await env.SAYAC.get("sayac", "json")) || {};
        const top = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 30);
        return reply({ top }, 200, { ...cors, "Cache-Control": "max-age=300" });
      }
      if (request.method === "POST") {
        let b;
        try { b = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
        const key = typeof b.key === "string" ? b.key : "";
        if (!/^b:.{1,80}$/.test(key)) return reply({ error: "Geçersiz tarif" }, 400, cors);
        const data = (await env.SAYAC.get("sayac", "json")) || {};
        data[key] = (data[key] || 0) + 1;
        await env.SAYAC.put("sayac", JSON.stringify(data));
        return reply({ ok: true }, 200, cors);
      }
      return reply({ error: "Desteklenmeyen istek" }, 405, cors);
    }

    if (request.method !== "POST") return reply({ error: "Yalnızca POST kabul edilir" }, 405, cors);
    if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
    if (!env.GEMINI_API_KEY) return reply({ error: "GEMINI_API_KEY tanımlı değil" }, 500, cors);

    let body;
    try { body = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    if (!prompt || prompt.length > MAX_PROMPT) return reply({ error: "Geçersiz istek" }, 400, cors);

    const thinkingFor = {}; // her model için kabul edilen düşünme ayarı
    const ask = (model, thinking) => {
      const config = body.json ? { responseMimeType: "application/json" } : {};
      if (thinking) config.thinkingConfig = thinking;
      return fetch(`${API}/models/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: config })
      });
    };

    const models = await getModels(env);
    let g = null;
    for (const model of models) {
      try {
        const started = Date.now();
        for (const thinking of THINKING_OPTIONS) {
          g = await ask(model, thinking);
          if (g.status !== 400) { thinkingFor[model] = thinking; break; } // ayar kabul edildi
        }
        console.log("model", model, "durum", g.status, "süre", Date.now() - started, "ms");
      } catch {
        g = null; // süre doldu ya da ulaşılamadı: sıradaki modeli dene
        continue;
      }
      if (g.status === 404 && modelCache) modelCache = modelCache.filter(m => m !== model); // kaldırılmış modeli unut
      // bulunamadı (404), kota doldu (429) ya da yoğun (500, 503): sıradaki modeli dene
      if (![404, 429, 500, 503].includes(g.status)) break;
    }

    if (!g) return reply({ error: "Yapay zekâ şu an çok yavaş", detail: "Modeller zamanında cevap vermedi, biraz sonra tekrar dene" }, 429, cors);
    if (!g.ok) {
      let detail = "";
      try { const e = await g.json(); detail = (e && e.error && e.error.message) || ""; } catch {}
      console.log("Gemini hatası", g.status, detail);
      const status = [429, 503, 404].includes(g.status) ? 429 : 502;
      return reply({ error: "Yapay zekâ servisi hata verdi", status: g.status, detail: `Google ${g.status}: ${detail}`.slice(0, 300) }, status, cors);
    }

    const data = await g.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map(p => p.text || "").join("");
    if (!text) return reply({ error: "Boş cevap geldi" }, 502, cors);
    return reply({ text }, 200, cors);
  }
};

function reply(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}
