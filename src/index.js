// Cloudflare Workers için sunucu kodu.
// /api/ai adresine gelen istekleri Gemini'ye iletir, diğer her şeyde uygulamanın dosyalarını gösterir.
// Gemini anahtarı Cloudflare ayarlarında GEMINI_API_KEY adıyla gizli değişken olarak durur.
// İstersen GEMINI_MODEL değişkeniyle belirli bir model seçebilirsin.

const MODELLER = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.0-flash'];
// Bu durumlarda sıradaki model denenir: bulunamadı (404), yoğun (503), geçici sunucu hatası (500)
const TEKRAR_DENE = [404, 500, 503];
const MAKS_UZUNLUK = 60000;

// Bu adreslerden gelen istekler kabul edilir (GitHub Pages sürümü için)
const IZINLI_ADRESLER = ['https://erdemgursoy07.github.io'];

function cors(request) {
  const origin = request && request.headers.get('Origin');
  if (!origin || !IZINLI_ADRESLER.includes(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
}

let aktifIstek = null;
function cevap(veri, durum = 200) {
  return new Response(JSON.stringify(veri), {
    status: durum,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(aktifIstek) }
  });
}

async function geminiyeSor(model, anahtar, prompt, json) {
  const generationConfig = { temperature: json ? 0.2 : 0.7, maxOutputTokens: 4096 };
  if (json) generationConfig.responseMimeType = 'application/json';
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': anahtar },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig })
  });
}

async function hataMetni(yanit) {
  try {
    const v = await yanit.json();
    return `Gemini ${yanit.status}: ${(v.error && v.error.message) || 'bilinmeyen hata'}`.slice(0, 300);
  } catch {
    return `Gemini ${yanit.status}`;
  }
}

async function yapayZeka(request, env) {
  // Tarayıcıdan açınca durum kontrolü gösterir
  if (request.method === 'GET') {
    return cevap({ calisiyor: true, anahtar_var: !!env.GEMINI_API_KEY, model: env.GEMINI_MODEL || MODELLER[0] });
  }
  if (request.method !== 'POST') return cevap({ error: 'invalid_request' }, 405);
  if (!env.GEMINI_API_KEY) return cevap({ error: 'not_configured' }, 500);

  let govde;
  try { govde = await request.json(); } catch { return cevap({ error: 'invalid_request' }, 400); }
  const prompt = typeof govde.prompt === 'string' ? govde.prompt : '';
  if (!prompt || prompt.length > MAKS_UZUNLUK) return cevap({ error: 'invalid_request' }, 400);

  const denenecek = env.GEMINI_MODEL ? [env.GEMINI_MODEL, ...MODELLER] : MODELLER;
  let yanit, sonHata = '', sonDurum = 0;
  for (const model of denenecek) {
    try {
      yanit = await geminiyeSor(model, env.GEMINI_API_KEY, prompt, !!govde.json);
    } catch (e) {
      return cevap({ error: 'upstream_error', detail: 'Gemini’ye bağlanılamadı' }, 502);
    }
    if (!TEKRAR_DENE.includes(yanit.status)) break;
    sonDurum = yanit.status;
    sonHata = await hataMetni(yanit);
    yanit = null;
  }
  if (!yanit) {
    if (sonDurum === 503 || sonDurum === 500) return cevap({ error: 'busy', detail: sonHata }, 503);
    return cevap({ error: 'upstream_error', detail: sonHata || 'Uygun model bulunamadı' }, 502);
  }
  if (yanit.status === 429) return cevap({ error: 'rate_limited', detail: await hataMetni(yanit) }, 429);
  if (!yanit.ok) return cevap({ error: 'upstream_error', detail: await hataMetni(yanit) }, 502);

  const veri = await yanit.json();
  const aday = veri.candidates && veri.candidates[0];
  if (!aday || aday.finishReason === 'SAFETY') return cevap({ error: 'refused' }, 422);
  const metin = ((aday.content && aday.content.parts) || []).filter(p => !p.thought).map(p => p.text || '').join('');
  if (!metin) return cevap({ error: 'empty_completion', detail: 'Gemini boş yanıt verdi' }, 502);
  return cevap({ text: metin });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ai') {
      aktifIstek = request;
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
      return yapayZeka(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
