# Trendyol Kampanya Otomasyonu

Bu sürüm, başlangıç için çalışan bir iskelet projedir.

## Ne yapar?
- Excel içindeki ürün linklerini okur.
- Her ürün linkini açar.
- Ürün başlığını alır.
- Başlığın başındaki mağaza adını siler. Varsayılan: `The Champ Clothing`
- Verdiğin kampanya linklerine tek tek gider.
- `Daha Önce Eklediklerim` sekmesine geçer.
- Ürün adını aratır.
- Bulduğu görünür satırları seçer.
- `Seçili Ürünleri Kampanyadan Çıkar` butonuna basar.
- Ürün kampanyada bulunamazsa sadece log yazar.
- İş bitince ürün linkini tekrar açar.

## Önemli not
İlk açılışta seller panel için giriş yapman gerekebilir. Tarayıcı profili `user-data` klasöründe tutulur. Böylece tekrar tekrar giriş yapman gerekmez.

## Kurulum
```bash
npm install
npm run install:browsers
npm start
```

Ardından tarayıcıda şu adresi aç:
```bash
http://localhost:3010
```

## Excel formatı
İlk sayfanın ilk sütununda ürün linkleri olmalı.
Başlık satırı olabilir.
Örnek:
- A1 = Links
- A2 ve sonrası = ürün linkleri

## Dikkat
Bu ilk sürümde Trendyol HTML yapısı değişirse bazı locatorlar güncelleme isteyebilir.
En güvenli kullanım için önce 2-3 ürünle test et.

## Geliştirme önerileri
- Test modu ekleme
- Ekran görüntüsü kaydı
- Sonuçları Excel'e yazma
- Kampanya bazlı detay rapor
- Sadece belirli kampanyaları seçme


## Oturum notu
Tarayıcı işlem sonunda artık kapanmaz. Böylece aynı açık seller panel oturumu tekrar kullanılır. Mecbur kalmadıkça tarayıcıyı elle kapatma. Kapatman gerekirse `POST /api/close-browser` çağrısı ile kontrollü kapatabilirsin.
