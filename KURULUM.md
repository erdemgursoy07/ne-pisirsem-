# Kıyasla – Kurulum Rehberi

Bu rehber, hiç yazılım deneyimi olmadan uygulamanı önce internette yayınlamanı, sonra Google Play ve App Store’a göndermeni anlatır. Adımları sırayla takip et. Ekranlardaki buton adları zamanla değişebilir; bulamazsan benzer adlı butonu ara.

## Klasörde ne var?

- `public/index.html` – Uygulamanın kendisi.
- `public/gizlilik.html` – Gizlilik politikası. Her iki mağaza da bunu zorunlu tutar. İçindeki `[TARİH]` ve `[E-POSTA ADRESİN]` yerlerini kendi bilgilerinle değiştir.
- `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` – Uygulamanın telefona yüklenebilmesini, simgesini ve internetsiz açılmasını sağlar.
- `src/index.js` ve `wrangler.jsonc` – Sunucu kısmı ve Cloudflare ayarları. Gemini anahtarın Cloudflare’de gizli kalır, dosyalarda yer almaz.

## Toplam maliyet

| Ne | Ücret |
|---|---|
| Gemini API (ücretsiz kota) | 0 TL |
| Cloudflare Pages (barındırma) | 0 TL |
| GitHub | 0 TL |
| Google Play geliştirici hesabı | 25 dolar, tek seferlik |
| Apple geliştirici hesabı | 99 dolar, her yıl |

---

## 1. Adım: Gemini API anahtarını al (5 dakika)

1. https://aistudio.google.com adresine Google hesabınla gir.
2. **Get API key** (API anahtarı al) butonuna, sonra **Create API key** butonuna bas.
3. Çıkan uzun metni kopyala ve güvenli bir yere kaydet. Bu anahtarı kimseyle paylaşma.

Önemli: Faturalandırmayı (billing) açma. Açmazsan ücretsiz kotayı aştığında sadece geçici olarak çalışmaz, sana ücret çıkmaz.

## 2. Adım: Dosyaları GitHub’a yükle (10 dakika)

1. https://github.com adresinde ücretsiz hesap aç.
2. Sağ üstteki **+** işaretine, sonra **New repository**’ye bas. Ad olarak `kiyasla` yaz, **Private** seç ve **Create repository** de.
3. Açılan sayfada **uploading an existing file** bağlantısına tıkla.
4. Bu zip dosyasını bilgisayarında aç. İçindeki `public` ve `src` klasörlerini, `wrangler.jsonc` ve `KURULUM.md` dosyalarını Finder’dan (ya da Dosya Gezgini’nden) **klasör olarak** sürükleyip sayfaya bırak. “choose your files” penceresini kullanma; o pencere klasörleri düzleştirir.
5. Alttaki **Commit changes** butonuna bas.

## 3. Adım: Uygulamayı Cloudflare’de yayınla (10 dakika)

1. https://dash.cloudflare.com adresinde ücretsiz hesap aç.
2. Soldaki menüden **Workers & Pages**’e gir, **Create**’e bas ve **Pages** sekmesini seç.
3. **Connect to Git**’i seç, GitHub hesabını bağla ve `kiyasla` deposunu seç.
4. Ayarlar ekranında:
   - **Framework preset:** None
   - **Build command:** boş bırak
   - **Build output directory:** `public`
5. **Environment variables** (ortam değişkenleri) bölümünü aç ve şunu ekle:
   - **Variable name:** `GEMINI_API_KEY`
   - **Value:** 1. adımda aldığın anahtar
   - Varsa **Encrypt** (şifrele) seçeneğini işaretle.
6. **Save and Deploy**’a bas. Bir iki dakika sonra sana `https://kiyasla.pages.dev` (bu ad alınmışsa Cloudflare sonuna birkaç harf ekler) gibi bir adres verilecek.

Bu adresi telefonunda aç ve yapay zekâ kutusunu dene. Çalışıyorsa uygulaman artık internette!

Telefonda hemen kullanmak için: Android’de Chrome menüsünden **Ana ekrana ekle**, iPhone’da Safari’de paylaş butonundan **Ana Ekrana Ekle**.

Sorun çıkarsa: Yapay zekâ “henüz ayarlanmamış” diyorsa anahtar eklenmemiştir. Cloudflare’de projeye gir, **Settings → Variables and Secrets** bölümünden ekle ve **Deployments** sekmesinden yeniden yayınla (Retry deployment).

---

## 4. Adım: Google Play’e gönder

1. https://play.google.com/console adresinden geliştirici hesabı aç (25 dolar). Kimlik doğrulaması birkaç gün sürebilir.
2. https://www.pwabuilder.com adresine git, uygulamanın adresini (`https://....pages.dev`) yaz ve **Start**’a bas.
3. **Package For Stores** butonuna bas, **Android**’i seç ve paketi indir. İndirdiğin zip içinde şunlar olacak:
   - `.aab` uzantılı dosya: Play’e yükleyeceğin uygulama.
   - İmzalama anahtarı (`signing.keystore`) ve şifre bilgileri: **Bunları kesinlikle kaybetme**, güncellemeler için gerekir. Birkaç yere yedekle.
   - `assetlinks.json` dosyası.
4. `assetlinks.json` dosyasını sitene koyman gerekiyor (bu, uygulamanın üstünde tarayıcı çubuğu çıkmasını engeller):
   - GitHub’da deponu aç, **Add file → Create new file**’a bas.
   - Dosya adı kutusuna `public/.well-known/assetlinks.json` yaz.
   - `assetlinks.json` dosyasının içeriğini kopyalayıp yapıştır ve **Commit changes** de. Cloudflare siteyi otomatik güncelleyecek.
5. Play Console’da **Uygulama oluştur**’a bas. Uygulama adı olarak örneğin `Kıyasla: Cihaz Karşılaştır` yazabilirsin (en fazla 30 karakter), dil olarak Türkçe seç.
6. Doldurman gereken bölümler: mağaza girişi (açıklama, ekran görüntüleri, simge), gizlilik politikası adresi (`https://....pages.dev/gizlilik.html`), içerik derecelendirme anketi, veri güvenliği formu (veri toplamadığını, metinlerin yapay zekâ servisine gönderildiğini belirt) ve hedef kitle.
7. `.aab` dosyasını önce **Kapalı test** (Closed testing) bölümüne yükle.

Bilmen gereken: Yeni açılan kişisel hesaplarda Google, uygulamayı herkese açmadan önce en az 12 kişinin 14 gün boyunca kapalı testte uygulamayı denemesini istiyor (bildiğim son kurallar bu yönde, güncel durumu Play Console’da kontrol et). Arkadaşlarını ve aileni test kullanıcısı olarak ekle. 14 gün dolunca **Üretim** (Production) erişimi için başvurabilirsin.

## 5. Adım: App Store’a gönder

Burada dürüst olmam gereken iki engel var:

1. **Mac gerekiyor.** Apple, uygulamaların Xcode adlı programla gönderilmesini istiyor ve Xcode sadece Mac’te çalışıyor. Mac’in yoksa bir arkadaşının Mac’ini kullanabilir ya da saatlik kiralanan bulut Mac hizmetlerinden (örneğin MacinCloud) birini kullanabilirsin.
2. **Reddedilme riski var.** Apple, sadece bir web sitesini gösteren uygulamaları bazen “yeterli işlevi yok” diyerek reddedebiliyor. Uygulamanın internetsiz açılması, yapay zekâ özellikleri ve karşılaştırma araçları şansını artırır, ama garanti değildir.

Adımlar:

1. https://developer.apple.com/programs adresinden Apple Developer Program’a katıl (yıllık 99 dolar).
2. PWABuilder’da **Package For Stores → iOS**’u seç ve paketi indir.
3. Mac’te Xcode’u App Store’dan ücretsiz kur. Paketin içindeki proje dosyasını Xcode ile aç; PWABuilder paketin içinde adım adım iOS rehberi veriyor.
4. Xcode’da **Product → Archive** ile uygulamayı paketle ve **Distribute App** ile App Store Connect’e yükle.
5. https://appstoreconnect.apple.com adresinde açıklama, ekran görüntüleri, gizlilik politikası adresi ve gizlilik bilgilerini doldur ve incelemeye gönder.

Önerim: Önce Google Play ile başla. Daha kolay ve ucuz. App Store’u uygulama oturduktan sonra yaparsın.

---

## Uygulamayı nasıl güncellerim?

GitHub’da `public/index.html` dosyasını değiştirip kaydettiğinde Cloudflare siteyi otomatik günceller. Mağazadaki uygulamalar da bu siteyi gösterdiği için çoğu güncellemede mağazaya yeniden göndermen gerekmez. Değişiklik yaptığında `public/sw.js` dosyasındaki `SURUM = 'v1'` değerini `v2`, `v3` diye artır ki telefonlardaki eski kopya yenilensin.

## Güvenlik notları

- Gemini anahtarını asla `index.html` içine yazma; sadece Cloudflare ayarlarında dursun.
- Uygulaman herkese açık olduğu için başkaları da yapay zekâ özelliğini kullanabilir. Faturalandırma kapalı olduğu sürece bu sana ücret çıkarmaz, en kötü ihtimalle günlük ücretsiz kota dolar.
- Gemini model adı zamanla değişebilir. Yapay zekâ bir gün çalışmayı bırakırsa Cloudflare’de `GEMINI_MODEL` adında bir değişken ekleyip Google AI Studio’da gördüğün güncel model adını yazabilirsin.
