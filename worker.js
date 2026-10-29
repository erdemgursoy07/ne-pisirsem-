/*
  Bugün ne pişirsem? yapay zekâ aracısı (Cloudflare Worker)
  Siteden gelen isteği Google Gemini'ye iletir; anahtar burada gizli kalır.

  Cloudflare'de tanımlanacak değişkenler (Settings > Variables and Secrets):
    GEMINI_API_KEY  -> Google AI Studio'dan alınan anahtar (tür: Secret)
    ALLOWED_ORIGIN  -> sitenin adresi, örneğin https://kullaniciadin.github.io (tür: Text)
    GEMINI_MODEL    -> isteğe bağlı; boşsa aşağıdaki model kullanılır
*/
// Sırayla denenecek modeller; biri bulunamazsa sıradakine geçilir.
const MODELS_DEFAULT = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
const MAX_PROMPT = 6000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean);
    const okOrigin = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin && origin ? origin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply({ error: "Yalnızca POST kabul edilir" }, 405, cors);
    if (!okOrigin) return reply({ error: "Bu siteye izin verilmiyor" }, 403, cors);
    if (!env.GEMINI_API_KEY) return reply({ error: "GEMINI_API_KEY tanımlı değil" }, 500, cors);

    let body;
    try { body = await request.json(); } catch { return reply({ error: "Geçersiz istek" }, 400, cors); }
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    if (!prompt || prompt.length > MAX_PROMPT) return reply({ error: "Geçersiz istek" }, 400, cors);

    const models = env.GEMINI_MODEL ? [env.GEMINI_MODEL] : MODELS_DEFAULT;
    let g;
    for (const model of models) {
      try {
        g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: body.json ? { responseMimeType: "application/json" } : {}
          })
        });
      } catch {
        return reply({ error: "Yapay zekâ servisine ulaşılamadı" }, 502, cors);
      }
      if (g.status !== 404) break; // model bulunamadıysa sıradakini dene
    }

    if (!g.ok) {
      let detail = "";
      try { const e = await g.json(); detail = (e && e.error && e.error.message) || ""; } catch {}
      console.log("Gemini hatası", g.status, detail);
      const status = g.status === 429 ? 429 : 502;
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
