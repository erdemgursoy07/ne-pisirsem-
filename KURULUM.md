# Bugün ne pişirsem? Web sürümünü yayınlama

Bu klasördeki dosyalar, uygulamanın ücretsiz yayınlanabilen web sürümüdür. Yapay zekâ özellikleri kapalıdır; uygulama internet olmadan da çalışır ve telefonda ana ekrana eklenebilir.

## GitHub Pages ile ücretsiz yayınlama

1. github.com adresinden ücretsiz bir hesap aç.
2. Sağ üstteki “+” menüsünden “New repository” seç. Adını `ne-pisirsem` koy, “Public” seçili olsun ve oluştur.
3. Açılan sayfada “uploading an existing file” bağlantısına tıkla. Zip dosyasını açıp içindeki dosyaların hepsini (klasörü değil, dosyaları) sürükleyip bırak. Alttaki “Commit changes” butonuna bas.
4. Depo sayfasında “Settings”, ardından soldaki “Pages” bölümüne gir. “Source” kısmında “Deploy from a branch”, “Branch” kısmında `main` ve `/ (root)` seçip “Save” de.
5. Bir iki dakika sonra uygulaman şu adreste yayında olur: `https://KULLANICI-ADIN.github.io/ne-pisirsem/`

GitHub’ın menü adları zamanla değişebilir; takılırsan bana ekran görüntüsü atman yeterli.

## Telefona uygulama gibi kurma

- iPhone: Safari’de adresi aç, “Paylaş” butonuna dokun, “Ana Ekrana Ekle”yi seç.
- Android: Chrome’da adresi aç, sağ üstteki menüden “Uygulamayı yükle” ya da “Ana ekrana ekle”yi seç.

## Güncelleme yapmak

Değişen dosyayı aynı yöntemle yeniden yükle. Büyük bir güncellemede `sw.js` dosyasının ilk satırlarındaki `pisir-v1` yazısını `pisir-v2` yap; böylece telefonlar yeni sürümü hemen alır.

## Yapay zekâ özelliklerini geri açmak

Yapay zekâlı sürüm `yapay-zeka-surumu.html` dosyasında ve Claude’daki yayın linkinde olduğu gibi duruyor. Web sürümünde ise kod silinmedi, sadece kapatıldı: `index.html` içindeki `AI_ENABLED = false` satırı bunu kontrol eder. Claude dışında yapay zekâyı açmak bir yapay zekâ servisine bağlanmayı gerektirir ve bu ücretlidir; o gün geldiğinde birlikte yaparız.
